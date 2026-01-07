# Backup Troubleshooting Guide

This guide helps troubleshoot common issues with database backups and restores.

## Common Backup Issues

### Issue 1: Backup Script Fails with Connection Error

**Symptoms:**
- Error: `ETIMEOUT` or `ECONNREFUSED`
- Script cannot connect to database

**Solutions:**
1. **Check Database Server Status**
   - Verify SQL Server is running
   - Check if the server is accessible from your network

2. **Verify Connection String**
   - Check environment variables: `SERVER`, `DATABASE`, `UID`, `DB_PASSWORD`
   - Ensure server address is correct (IP or hostname)
   - Verify port is correct (default: 1433)

3. **Check Firewall Settings**
   - Ensure SQL Server port (1433) is open
   - Check if your IP is whitelisted on SQL Server firewall
   - For Azure SQL, check firewall rules in Azure Portal

4. **Verify Credentials**
   - Ensure username and password are correct
   - Check if password contains special characters that need encoding
   - Verify user has backup permissions

**Example Fix:**
```bash
# Check if SQL Server is accessible
telnet your-server-address 1433

# Test connection with sqlcmd
sqlcmd -S your-server -U your-username -P your-password
```

### Issue 2: Backup File Not Created

**Symptoms:**
- Script runs without error but no backup file is created
- Backup file is empty or corrupted

**Solutions:**
1. **Check File Permissions**
   - Ensure the backup directory exists
   - Verify write permissions on the backup directory
   - Check disk space availability

2. **Verify Backup Path**
   - Ensure backup path is valid and accessible
   - Check if path uses correct format (Windows vs Linux)
   - Verify network path is accessible if using network storage

3. **Check SQL Server Permissions**
   - User must have `BACKUP DATABASE` permission
   - Verify user has access to the backup location

**Example Fix:**
```sql
-- Grant backup permission
GRANT BACKUP DATABASE TO your-username;

-- Check backup location permissions
EXEC xp_cmdshell 'dir C:\Backups'
```

### Issue 3: Backup File Too Large

**Symptoms:**
- Backup file is unexpectedly large
- Backup takes too long to complete

**Solutions:**
1. **Use Compression**
   - Enable backup compression in SQL Server
   - Use `WITH COMPRESSION` option

2. **Exclude Unnecessary Data**
   - Backup only essential tables
   - Consider differential backups for large databases

3. **Optimize Database**
   - Remove unused data
   - Archive old records
   - Rebuild indexes

**Example:**
```sql
-- Compressed backup
BACKUP DATABASE YourDatabase
TO DISK = 'C:\Backups\YourDatabase.bak'
WITH COMPRESSION;
```

### Issue 4: Backup Timeout

**Symptoms:**
- Backup script times out
- Connection lost during backup

**Solutions:**
1. **Increase Timeout Settings**
   - Set longer timeout in connection string
   - Increase `requestTimeout` in SQL connection config

2. **Use Asynchronous Backup**
   - Run backup in background
   - Use SQL Server Agent for scheduled backups

3. **Check Network Stability**
   - Ensure stable network connection
   - Consider local backup if network is unreliable

## Common Restore Issues

### Issue 1: Restore Fails with "Database in Use"

**Symptoms:**
- Error: "Database is in use and cannot be restored"
- Cannot restore because database is open

**Solutions:**
1. **Close Active Connections**
   ```sql
   -- Kill all connections to database
   ALTER DATABASE YourDatabase SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
   
   -- Restore database
   RESTORE DATABASE YourDatabase FROM DISK = 'C:\Backups\YourDatabase.bak';
   
   -- Set back to multi-user
   ALTER DATABASE YourDatabase SET MULTI_USER;
   ```

2. **Use WITH REPLACE Option**
   ```sql
   RESTORE DATABASE YourDatabase
   FROM DISK = 'C:\Backups\YourDatabase.bak'
   WITH REPLACE;
   ```

### Issue 2: Restore Fails with "File Not Found"

**Symptoms:**
- Error: "Backup file not found"
- Cannot locate backup file

**Solutions:**
1. **Verify File Path**
   - Check if backup file exists at specified path
   - Verify file permissions
   - Ensure path uses correct format

2. **Check File Location**
   - Verify backup file was created successfully
   - Check if file was moved or deleted
   - Ensure network path is accessible

3. **Use Full Path**
   - Always use absolute paths
   - Avoid relative paths in restore commands

### Issue 3: Restore Fails with "Version Mismatch"

**Symptoms:**
- Error: "Backup was created on a different version"
- Cannot restore backup from newer/older SQL Server version

**Solutions:**
1. **Check SQL Server Versions**
   - Verify source and target SQL Server versions
   - SQL Server backups are generally forward-compatible within major versions

2. **Use Compatible Backup Format**
   - Export to BACPAC for cross-version compatibility
   - Use SQL Server Import/Export Wizard

3. **Upgrade SQL Server**
   - Upgrade target server to match or exceed source version
   - Use SQL Server Migration Assistant if needed

### Issue 4: Restore Fails with "Insufficient Space"

**Symptoms:**
- Error: "Insufficient disk space"
- Restore cannot complete due to space constraints

**Solutions:**
1. **Check Disk Space**
   - Verify available disk space on target server
   - Ensure enough space for database files

2. **Move Database Files**
   - Specify different file locations during restore
   - Use `WITH MOVE` option to relocate files

**Example:**
```sql
RESTORE DATABASE YourDatabase
FROM DISK = 'C:\Backups\YourDatabase.bak'
WITH MOVE 'YourDatabase' TO 'D:\Data\YourDatabase.mdf',
     MOVE 'YourDatabase_Log' TO 'D:\Logs\YourDatabase_Log.ldf';
```

## General Troubleshooting Steps

1. **Check Logs**
   - Review SQL Server error logs
   - Check application logs for detailed error messages
   - Review backup script output

2. **Verify Permissions**
   - Ensure user has necessary permissions
   - Check file system permissions
   - Verify SQL Server service account permissions

3. **Test Connection**
   - Test database connection before backup/restore
   - Verify network connectivity
   - Check firewall rules

4. **Check Database State**
   - Verify database is in correct state
   - Check for corruption
   - Ensure database is not in suspect mode

## Error Message Solutions

### "Login failed for user"
- **Cause:** Invalid credentials or user doesn't exist
- **Solution:** Verify username and password, check user exists in SQL Server

### "Cannot open backup device"
- **Cause:** File path doesn't exist or no permissions
- **Solution:** Create directory, check permissions, verify path

### "The media family on device is incorrectly formed"
- **Cause:** Backup file is corrupted or incomplete
- **Solution:** Recreate backup, verify backup file integrity

### "The backup set holds a backup of a database other than the existing database"
- **Cause:** Trying to restore backup of different database
- **Solution:** Use `WITH REPLACE` option or restore to different database name

## Best Practices

1. **Regular Backups**
   - Schedule daily backups
   - Keep multiple backup copies
   - Test restore procedures regularly

2. **Backup Verification**
   - Verify backup files after creation
   - Test restore on test environment
   - Document backup and restore procedures

3. **Monitoring**
   - Monitor backup job success/failure
   - Set up alerts for backup failures
   - Track backup file sizes and durations

4. **Documentation**
   - Document backup procedures
   - Keep record of backup locations
   - Maintain restore procedures

## Getting Help

If issues persist:
1. Check SQL Server error logs: `C:\Program Files\Microsoft SQL Server\MSSQL*.MSSQLSERVER\MSSQL\Log\`
2. Review application logs for detailed error messages
3. Contact database administrator
4. Check Microsoft SQL Server documentation

