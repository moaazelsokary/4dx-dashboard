/**
 * Database restore script
 * Restores database from backup file
 */

const sql = require('mssql');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration
const config = {
  user: process.env.UID || process.env.VITE_UID || process.env.VIE_UID,
  password: process.env.DB_PASSWORD || process.env.VITE_PWD || process.env.PWD,
  server: process.env.SERVER || process.env.VITE_SERVER || '',
  database: process.env.DATABASE || process.env.VITE_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true,
  },
};

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../backups');

async function restoreDatabase(backupFileName) {
  try {
    const backupPath = path.join(BACKUP_DIR, backupFileName);

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    console.log('Connecting to database...');
    const pool = await sql.connect(config);
    
    const dbName = config.database;

    console.log(`Restoring database from: ${backupPath}`);

    // Set database to single user mode
    await pool.request().query(`ALTER DATABASE [${dbName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE`);

    // Restore database
    const request = pool.request();
    await request.query(`
      RESTORE DATABASE [${dbName}]
      FROM DISK = '${backupPath}'
      WITH REPLACE, RECOVERY
    `);

    // Set database back to multi-user mode
    await pool.request().query(`ALTER DATABASE [${dbName}] SET MULTI_USER`);

    console.log('Database restored successfully');

    await pool.close();
  } catch (error) {
    console.error('Restore failed:', error);
    throw error;
  }
}

// List available backups
function listBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      console.log('No backup directory found');
      return [];
    }

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.endsWith('.bak'))
      .map(file => {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          size: stats.size,
          created: stats.mtime,
        };
      })
      .sort((a, b) => b.created - a.created);

    return files;
  } catch (error) {
    console.error('Failed to list backups:', error);
    return [];
  }
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'list') {
    const backups = listBackups();
    console.log('Available backups:');
    backups.forEach(backup => {
      console.log(`  ${backup.filename} (${(backup.size / 1024 / 1024).toFixed(2)} MB, ${backup.created})`);
    });
  } else if (args[0]) {
    restoreDatabase(args[0])
      .then(() => {
        console.log('Restore completed successfully');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Restore failed:', error);
        process.exit(1);
      });
  } else {
    console.log('Usage:');
    console.log('  node restore-database.cjs list                    - List available backups');
    console.log('  node restore-database.cjs <backup-filename>      - Restore from backup');
    process.exit(1);
  }
}

module.exports = { restoreDatabase, listBackups };

