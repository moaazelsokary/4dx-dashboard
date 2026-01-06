/**
 * Database backup script
 * Creates automated backups of SQL Server database
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
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '30');

async function createBackup() {
  try {
    console.log('Connecting to database...');
    const pool = await sql.connect(config);
    
    const dbName = config.database;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `${dbName}_${timestamp}.bak`;
    const backupPath = path.join(BACKUP_DIR, backupFileName);

    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    console.log(`Creating backup: ${backupPath}`);

    // Create backup using SQL Server BACKUP command
    const request = pool.request();
    await request.query(`
      BACKUP DATABASE [${dbName}]
      TO DISK = '${backupPath}'
      WITH FORMAT, INIT, NAME = '${dbName} Full Backup', SKIP, NOREWIND, NOUNLOAD, STATS = 10
    `);

    console.log('Backup created successfully');

    // Clean up old backups
    await cleanupOldBackups();

    await pool.close();
    return backupPath;
  } catch (error) {
    console.error('Backup failed:', error);
    throw error;
  }
}

async function cleanupOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const retentionMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (file.endsWith('.bak')) {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtimeMs > retentionMs) {
          console.log(`Deleting old backup: ${file}`);
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch (error) {
    console.error('Cleanup failed:', error);
  }
}

// Run if called directly
if (require.main === module) {
  createBackup()
    .then((backupPath) => {
      console.log(`Backup completed: ${backupPath}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Backup script failed:', error);
      process.exit(1);
    });
}

module.exports = { createBackup, cleanupOldBackups };

