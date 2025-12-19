require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

const getEnv = (key) => {
  const value = process.env[key];
  return value ? value.trim().replace(/^["']|["']$/g, '') : undefined;
};

// Parse server and port
const serverValue = getEnv('SERVER') || getEnv('VITE_SERVER') || '';
let server, port;
if (serverValue.includes(',')) {
  [server, port] = serverValue.split(',').map(s => s.trim());
  port = parseInt(port) || 1433;
} else {
  server = serverValue;
  port = 1433;
}

const config = {
  server: server,
  port: port,
  database: getEnv('DATABASE') || getEnv('VITE_DATABASE'),
  user: getEnv('UID') || getEnv('VITE_UID') || getEnv('VIE_UID') || getEnv('VITE_USER'),
  password: getEnv('PWD') || getEnv('VITE_PWD'),
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

async function addMETypesToConstraint() {
  let pool;
  try {
    console.log('Connecting to SQL Server...');
    console.log(`Server: ${config.server}${port ? ':' + port : ''}`);
    console.log(`Database: ${config.database}`);
    console.log(`User: ${config.user}`);
    
    if (!config.server || !config.database || !config.user || !config.password) {
      throw new Error('Missing database connection details. Please check your .env.local file.');
    }

    pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server\n');

    // Find and drop existing CHECK constraint
    console.log('Finding existing CHECK constraint on type column...');
    const constraintResult = await pool.request().query(`
      SELECT name 
      FROM sys.check_constraints 
      WHERE parent_object_id = OBJECT_ID('department_objectives') 
      AND parent_column_id = COLUMNPROPERTY(OBJECT_ID('department_objectives'), 'type', 'ColumnId')
    `);
    
    if (constraintResult.recordset.length > 0) {
      const constraintName = constraintResult.recordset[0].name;
      console.log(`✓ Found constraint: ${constraintName}`);
      console.log('Dropping existing constraint...');
      
      await pool.request().query(`
        ALTER TABLE department_objectives
        DROP CONSTRAINT ${constraintName}
      `);
      console.log('✓ Dropped existing constraint\n');
    } else {
      console.log('⚠ No CHECK constraint found\n');
    }

    // Create new constraint allowing M&E and M&E MOV types
    console.log('Creating new constraint allowing M&E and M&E MOV types...');
    try {
      await pool.request().query(`
        ALTER TABLE department_objectives
        ADD CONSTRAINT CK_department_objectives_type 
        CHECK (type IN ('Direct', 'In direct', 'M&E', 'M&E MOV', ''))
      `);
      console.log('✅ Created new CHECK constraint\n');
      console.log('  Allowed types: Direct, In direct, M&E, M&E MOV, or empty string\n');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⚠ Constraint already exists, trying to drop and recreate...');
        try {
          await pool.request().query(`
            ALTER TABLE department_objectives
            DROP CONSTRAINT CK_department_objectives_type
          `);
        } catch (dropError) {
          // Ignore if constraint doesn't exist
        }
        await pool.request().query(`
          ALTER TABLE department_objectives
          ADD CONSTRAINT CK_department_objectives_type 
          CHECK (type IN ('Direct', 'In direct', 'M&E', 'M&E MOV', ''))
        `);
        console.log('✅ Recreated constraint\n');
        console.log('  Allowed types: Direct, In direct, M&E, M&E MOV, or empty string\n');
      } else {
        throw error;
      }
    }

    // Verify the constraint
    console.log('Verifying constraint...');
    const verifyResult = await pool.request().query(`
      SELECT name, definition
      FROM sys.check_constraints
      WHERE parent_object_id = OBJECT_ID('department_objectives')
      AND name = 'CK_department_objectives_type'
    `);

    if (verifyResult.recordset.length > 0) {
      console.log('✅ Constraint verified:');
      console.log(`  Name: ${verifyResult.recordset[0].name}`);
      console.log(`  Definition: ${verifyResult.recordset[0].definition}\n`);
    }

    console.log('✅ Migration completed successfully!');
    console.log('  - Type column now allows: Direct, In direct, M&E, M&E MOV, or empty string\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    if (pool) {
      await pool.close();
    }
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log('✅ Database connection closed');
    }
  }
}

addMETypesToConstraint();

