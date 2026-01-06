# Restore Procedures

This document describes how to restore the database from a backup.

## Prerequisites

1. Backup file must exist and be accessible
2. Database connection must be available
3. Sufficient disk space for restore
4. Database should be taken offline (if possible)

## Restore Steps

### 1. List Available Backups

```bash
node scripts/restore-database.cjs list
```

### 2. Select Backup

Choose the most recent backup or a specific backup based on your needs.

### 3. Create Current Backup (Safety)

Before restoring, create a backup of the current state:

```bash
node scripts/backup-database.cjs
```

### 4. Restore Database

```bash
node scripts/restore-database.cjs <backup-filename>
```

### 5. Verify Restore

1. Check database connection
2. Verify data integrity
3. Test critical functionality
4. Review logs for errors

## Recovery Time Objectives (RTO)

- **Target RTO**: 4 hours
- **Maximum RTO**: 24 hours

## Recovery Point Objectives (RPO)

- **Target RPO**: 24 hours (daily backups)
- **Maximum RPO**: 7 days (weekly backups)

## Emergency Restore

In case of emergency:

1. Stop application services
2. Create current backup (if possible)
3. Restore from most recent backup
4. Verify restore
5. Restart services
6. Monitor for issues

## Testing Restores

Regular restore testing is recommended:

1. Use test environment
2. Restore from production backup
3. Verify data integrity
4. Test application functionality
5. Document results

## Troubleshooting

### Restore Fails - Database in Use

1. Stop application services
2. Set database to single-user mode
3. Retry restore
4. Set database back to multi-user mode

### Restore Fails - Insufficient Space

1. Free up disk space
2. Delete old backups if needed
3. Retry restore

### Data Mismatch After Restore

1. Verify correct backup file was used
2. Check backup file integrity
3. Review restore logs
4. Contact database administrator

