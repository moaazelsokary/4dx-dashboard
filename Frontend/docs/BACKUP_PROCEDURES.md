# Backup Procedures

This document describes how to create, manage, and restore database backups.

## Manual Backup

### Create Backup

```bash
node scripts/backup-database.cjs
```

The backup will be saved to the `backups/` directory with a timestamp.

### List Backups

```bash
node scripts/restore-database.cjs list
```

## Automated Backups

Automated backups are configured via Netlify scheduled functions. Backups run:
- Daily at 2:00 AM UTC
- Weekly on Sundays at 1:00 AM UTC
- Monthly on the 1st at 12:00 AM UTC

## Restore from Backup

### Restore Database

```bash
node scripts/restore-database.cjs <backup-filename>
```

**Warning**: This will replace the current database with the backup. Ensure you have a current backup before restoring.

### Example

```bash
node scripts/restore-database.cjs mydatabase_2025-01-15T10-30-00.bak
```

## Backup Retention

- Daily backups: Retained for 7 days
- Weekly backups: Retained for 4 weeks
- Monthly backups: Retained for 12 months

Old backups are automatically cleaned up based on retention policy.

## Backup Storage

Backups are stored in:
- Local: `Frontend/backups/`
- Cloud: Configure via `BACKUP_STORAGE_URL` environment variable

## Verification

After creating a backup, verify its integrity:

1. Check file size (should be > 0)
2. Verify file timestamp
3. Test restore in a test environment

## Troubleshooting

### Backup Fails

1. Check database connection
2. Verify disk space
3. Check file permissions
4. Review logs for errors

### Restore Fails

1. Verify backup file exists and is readable
2. Check database is not in use
3. Ensure sufficient disk space
4. Verify database name matches

