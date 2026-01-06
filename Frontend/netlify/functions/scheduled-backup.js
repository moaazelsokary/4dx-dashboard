/**
 * Scheduled backup function for Netlify
 * Runs on a schedule to create database backups
 */

const { createBackup } = require('../../scripts/backup-database.cjs');
const logger = require('./utils/logger');

exports.handler = async (event, context) => {
  try {
    logger.info('Scheduled backup started');

    // Verify this is a scheduled event
    if (event.source !== 'aws.events') {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const backupPath = await createBackup();

    logger.info('Scheduled backup completed', { backupPath });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Backup completed successfully',
        backupPath,
      }),
    };
  } catch (error) {
    logger.error('Scheduled backup failed', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Backup failed',
      }),
    };
  }
};

