#!/usr/bin/env node

/**
 * Script to apply RASCI sync triggers to the database
 */

require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

// Get environment variables
const getEnv = (key) => {
  const value = process.env[key];
  return value ? value.trim().replace(/^["']|["']$/g, '') : undefined;
};

const serverValue = getEnv('SERVER') || getEnv('VITE_SERVER') || '';
let server, port;
if (serverValue.includes(',')) {
  [server, port] = serverValue.split(',').map(s => s.trim());
  port = parseInt(port) || 1433;
} else {
  server = serverValue;
  port = 1433;
}

// Get password
let password = getEnv('DB_PASSWORD') || getEnv('VITE_PWD') || getEnv('PWD');
if (password && password.startsWith('/') && password.includes('/')) {
  password = getEnv('DB_PASSWORD') || getEnv('VITE_PWD');
}
if (password && password.includes('%')) {
  try {
    password = decodeURIComponent(password);
  } catch (e) {}
}
if (password && ((password.startsWith('"') && password.endsWith('"')) ||
    (password.startsWith("'") && password.endsWith("'")))) {
  password = password.slice(1, -1);
}

const config = {
  server: server,
  port: port,
  database: getEnv('DATABASE') || getEnv('VITE_DATABASE'),
  user: getEnv('UID') || getEnv('VITE_UID') || getEnv('VIE_UID') || getEnv('VITE_USER'),
  password: password,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

async function applyTriggers() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    console.log('Applying RASCI sync triggers...\n');
    
    // Drop existing triggers if they exist
    console.log('Dropping existing triggers if they exist...');
    try {
      await pool.request().query(`
        IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TR_main_plan_objectives_insert_rasci]') AND type = 'TR')
        BEGIN
            DROP TRIGGER [dbo].[TR_main_plan_objectives_insert_rasci];
        END;
      `);
      await pool.request().query(`
        IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TR_main_plan_objectives_delete_rasci]') AND type = 'TR')
        BEGIN
            DROP TRIGGER [dbo].[TR_main_plan_objectives_delete_rasci];
        END;
      `);
      await pool.request().query(`
        IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TR_main_plan_objectives_update_rasci]') AND type = 'TR')
        BEGIN
            DROP TRIGGER [dbo].[TR_main_plan_objectives_update_rasci];
        END;
      `);
      console.log('✓ Dropped existing triggers\n');
    } catch (error) {
      console.log(`⚠ Error dropping triggers: ${error.message}\n`);
    }

    // Create INSERT trigger
    console.log('Creating INSERT trigger...');
    await pool.request().query(`
      CREATE TRIGGER [dbo].[TR_main_plan_objectives_insert_rasci]
      ON [dbo].[main_plan_objectives]
      AFTER INSERT
      AS
      BEGIN
          SET NOCOUNT ON;
          
          INSERT INTO [dbo].[rasci_metrics] (kpi, department, responsible, accountable, supportive, consulted, informed, created_at, updated_at)
          SELECT 
              i.kpi,
              d.name,
              0,
              0,
              0,
              0,
              0,
              GETDATE(),
              GETDATE()
          FROM inserted i
          CROSS JOIN [dbo].[departments] d
          WHERE NOT EXISTS (
              SELECT 1 
              FROM [dbo].[rasci_metrics] rm 
              WHERE rm.kpi = i.kpi AND rm.department = d.name
          );
      END;
    `);
    console.log('✓ INSERT trigger created');

    // Create DELETE trigger
    console.log('Creating DELETE trigger...');
    await pool.request().query(`
      CREATE TRIGGER [dbo].[TR_main_plan_objectives_delete_rasci]
      ON [dbo].[main_plan_objectives]
      AFTER DELETE
      AS
      BEGIN
          SET NOCOUNT ON;
          
          DELETE FROM [dbo].[rasci_metrics]
          WHERE kpi IN (SELECT kpi FROM deleted);
      END;
    `);
    console.log('✓ DELETE trigger created');

    // Create UPDATE trigger
    console.log('Creating UPDATE trigger...');
    await pool.request().query(`
      CREATE TRIGGER [dbo].[TR_main_plan_objectives_update_rasci]
      ON [dbo].[main_plan_objectives]
      AFTER UPDATE
      AS
      BEGIN
          SET NOCOUNT ON;
          
          -- Only process if KPI name actually changed
          IF UPDATE(kpi)
          BEGIN
              BEGIN TRY
                  -- Update all RASCI entries with the new KPI name where KPI changed
                  UPDATE rm
                  SET rm.kpi = i.kpi,
                      rm.updated_at = GETDATE()
                  FROM [dbo].[rasci_metrics] rm
                  INNER JOIN deleted d ON rm.kpi = d.kpi
                  INNER JOIN inserted i ON d.id = i.id
                  WHERE d.kpi <> i.kpi;
                  
                  -- For departments that don't have entries for the new KPI, create blank entries
                  INSERT INTO [dbo].[rasci_metrics] (kpi, department, responsible, accountable, supportive, consulted, informed, created_at, updated_at)
                  SELECT 
                      i.kpi,
                      d.name,
                      0,
                      0,
                      0,
                      0,
                      0,
                      GETDATE(),
                      GETDATE()
                  FROM inserted i
                  CROSS JOIN [dbo].[departments] d
                  WHERE NOT EXISTS (
                      SELECT 1 
                      FROM [dbo].[rasci_metrics] rm 
                      WHERE rm.kpi = i.kpi AND rm.department = d.name
                  )
                  AND EXISTS (
                      SELECT 1 
                      FROM deleted d2 
                      WHERE d2.id = i.id AND d2.kpi <> i.kpi
                  );
              END TRY
              BEGIN CATCH
                  -- Log error but don't fail the update
                  -- The trigger should not prevent the main update from succeeding
                  PRINT 'Error in RASCI update trigger: ' + ERROR_MESSAGE();
              END CATCH
          END;
      END;
    `);
    console.log('✓ UPDATE trigger created');

    console.log('\n✓ RASCI sync triggers applied successfully!');
    console.log('\nThe triggers will now:');
    console.log('  - Automatically create blank RASCI entries for all departments when a new KPI is added');
    console.log('  - Automatically remove all RASCI entries when a KPI is deleted');
    console.log('  - Automatically update RASCI entries when a KPI name is changed');

  } catch (error) {
    console.error('✗ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log('\n✓ Database connection closed');
    }
  }
}

applyTriggers();

