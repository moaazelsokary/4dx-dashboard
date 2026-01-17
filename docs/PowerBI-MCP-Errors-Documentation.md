# Power BI Modeling MCP - Error Documentation

## Common Errors and Troubleshooting Guide

This document provides a comprehensive guide to common errors encountered when using the Power BI Modeling MCP server and how to resolve them.

---

## Connection Errors

### Error: Connection Failed - Server Not Found

**Error Message:**
```
Connection failed: Unable to connect to server
```

**Possible Causes:**
- Power BI Desktop is not running
- Power BI Desktop instance is using a different port
- Firewall is blocking the connection
- XMLA endpoint is not enabled in Power BI Desktop

**Solutions:**
1. **Verify Power BI Desktop is Running**
   - Ensure Power BI Desktop is open with your `.pbix` file loaded
   - Check that the file has been saved at least once

2. **Enable XMLA Endpoints**
   - In Power BI Desktop, go to: `File` → `Options and settings` → `Options`
   - Navigate to: `Global` → `Security`
   - Enable: `Allow localhost connections to this instance`
   - Or enable: `Allow external connections` (for production scenarios)

3. **List Local Instances**
   ```json
   {
     "operation": "ListLocalInstances"
   }
   ```
   This will show all available Power BI Desktop instances with their ports.

4. **Check Port Number**
   - Power BI Desktop dynamically assigns ports
   - Use `ListLocalInstances` to get the correct port
   - Default port range: varies (typically 2383-23999 or higher)

---

### Error: Authentication Failed

**Error Message:**
```
Authentication failed or access denied
```

**Possible Causes:**
- Incorrect credentials
- Windows authentication issues
- Power BI Desktop security settings

**Solutions:**
1. **Use Localhost Connection**
   - For local Power BI Desktop, use `localhost:PORT`
   - No authentication required for localhost connections

2. **Check Power BI Desktop Settings**
   - Verify XMLA endpoint is enabled (see above)
   - Ensure "Allow localhost connections" is enabled

3. **For Fabric/Cloud Connections**
   - Ensure you have appropriate permissions
   - May require Azure AD authentication
   - Check workspace access permissions

---

### Error: Database Not Found

**Error Message:**
```
Database '[name]' not found
```

**Possible Causes:**
- Database name is incorrect
- Database is not loaded in Power BI Desktop
- Connection string is missing `Initial Catalog`

**Solutions:**
1. **Verify Database Name**
   - Use `ListConnections` to see connected databases
   - The database name is typically a GUID for Power BI Desktop files

2. **Connect Without Specifying Database**
   - Let the connection auto-detect the database
   - Power BI Desktop files have one database per file

3. **Check Connection String**
   ```json
   {
     "operation": "Connect",
     "dataSource": "localhost:PORT",
     "initialCatalog": "optional-database-name"
   }
   ```

---

## Model Operation Errors

### Error: Table Not Found

**Error Message:**
```
Table '[tableName]' not found in model
```

**Possible Causes:**
- Table name is incorrect (case-sensitive)
- Table doesn't exist in the model
- Typo in table name

**Solutions:**
1. **List All Tables**
   ```json
   {
     "operation": "List",
     "connectionName": "your-connection-name"
   }
   ```

2. **Verify Table Name**
   - Table names are case-sensitive
   - Use exact name as returned by List operation
   - Check for leading/trailing spaces

3. **Check Table Visibility**
   - Hidden tables still exist but may not appear in some lists
   - Use full model export to see all tables

---

### Error: Measure Already Exists

**Error Message:**
```
Measure '[measureName]' already exists in table '[tableName]'
```

**Possible Causes:**
- Attempting to create a measure with a duplicate name
- Measure exists in a different table (if using same name)

**Solutions:**
1. **Check Existing Measures**
   ```json
   {
     "operation": "List",
     "connectionName": "your-connection-name"
   }
   ```

2. **Rename the Measure**
   - Use a unique name for your new measure
   - Consider adding a suffix or prefix

3. **Update Instead of Create**
   - Use `Update` operation instead of `Create`
   - Or delete the existing measure first

---

### Error: Invalid DAX Expression

**Error Message:**
```
SemanticError: [error details]
SyntaxError: [error details]
```

**Possible Causes:**
- Syntax error in DAX expression
- Column/table references are incorrect
- Missing functions or parameters

**Solutions:**
1. **Validate DAX Syntax**
   - Test DAX in Power BI Desktop DAX editor first
   - Check for missing parentheses, commas, or quotes

2. **Verify Column/Table Names**
   - Ensure table and column names are correct
   - Use single quotes for table/column names with spaces: `'Table Name'[Column Name]`

3. **Check Function Syntax**
   - Verify function names and parameters
   - Check DAX function documentation

4. **Use Validate Operation**
   ```json
   {
     "operation": "Validate",
     "connectionName": "your-connection-name",
     "query": "YOUR DAX QUERY"
   }
   ```

---

### Error: Column Not Found

**Error Message:**
```
Column '[columnName]' not found in table '[tableName]'
```

**Possible Causes:**
- Column name is incorrect
- Column is hidden
- Column is in a different table

**Solutions:**
1. **List Columns in Table**
   ```json
   {
     "operation": "List",
     "connectionName": "your-connection-name",
     "tableName": "your-table-name"
   }
   ```

2. **Check Column Name**
   - Column names are case-sensitive
   - Verify exact spelling and capitalization
   - Check for special characters or spaces

---

## Relationship Errors

### Error: Relationship Already Exists

**Error Message:**
```
Relationship '[relationshipName]' already exists
```

**Possible Causes:**
- Duplicate relationship name
- Similar relationship exists between same tables

**Solutions:**
1. **List Existing Relationships**
   ```json
   {
     "operation": "List",
     "connectionName": "your-connection-name"
   }
   ```

2. **Use Unique Name**
   - Name relationships uniquely
   - Or use `Update` instead of `Create`

---

### Error: Invalid Relationship Definition

**Error Message:**
```
Invalid relationship definition: [details]
```

**Possible Causes:**
- Invalid cardinality
- Column types don't match
- Column doesn't exist in referenced table

**Solutions:**
1. **Verify Column Types**
   - Both columns must be same data type
   - Common types: Int64, String, DateTime

2. **Check Cardinality**
   - Valid values: `One`, `Many`
   - `One` to `Many` or `Many` to `One` relationships

3. **Verify Column Existence**
   - Both columns must exist in their respective tables
   - Check column names are correct

---

## Transaction Errors

### Error: Transaction Not Active

**Error Message:**
```
No active transaction found
```

**Possible Causes:**
- Attempting to commit/rollback without active transaction
- Transaction expired or was closed

**Solutions:**
1. **Begin Transaction First**
   ```json
   {
     "operation": "Begin",
     "connectionName": "your-connection-name"
   }
   ```

2. **Check Transaction Status**
   ```json
   {
     "operation": "GetStatus",
     "connectionName": "your-connection-name",
     "transactionId": "transaction-id"
   }
   ```

---

## DAX Query Errors

### Error: Query Timeout

**Error Message:**
```
Query execution timeout
```

**Possible Causes:**
- Query is too complex
- Large dataset processing
- Default timeout exceeded

**Solutions:**
1. **Increase Timeout**
   ```json
   {
     "operation": "Execute",
     "connectionName": "your-connection-name",
     "query": "YOUR DAX QUERY",
     "timeoutSeconds": 300
   }
   ```

2. **Optimize Query**
   - Simplify DAX expression
   - Reduce data volume with filters
   - Use more efficient functions

---

### Error: Query Execution Failed

**Error Message:**
```
Query execution failed: [error details]
```

**Possible Causes:**
- DAX syntax errors
- Missing tables/columns
- Model inconsistency

**Solutions:**
1. **Validate Query First**
   ```json
   {
     "operation": "Validate",
     "connectionName": "your-connection-name",
     "query": "YOUR DAX QUERY"
   }
   ```

2. **Check Model State**
   - Verify all referenced tables/columns exist
   - Check for model errors in Power BI Desktop

---

## General Error Patterns

### Error: Operation Not Supported

**Error Message:**
```
Operation '[operationName]' is not supported
```

**Possible Causes:**
- Operation not available for current connection type
- Power BI Desktop limitations
- Feature not enabled

**Solutions:**
1. **Check Operation Support**
   - Some operations only work with Fabric/cloud connections
   - Power BI Desktop has limited XMLA support

2. **Review Documentation**
   - Check which operations are supported for your connection type
   - Use `Help` operation for operation details

---

### Error: Invalid Connection Name

**Error Message:**
```
Connection '[connectionName]' not found
```

**Possible Causes:**
- Connection doesn't exist
- Connection was closed/disconnected
- Typo in connection name

**Solutions:**
1. **List All Connections**
   ```json
   {
     "operation": "ListConnections"
   }
   ```

2. **Reconnect if Needed**
   - Connection may have expired
   - Reconnect to create new connection

---

## Error Response Format

All errors from the MCP server follow this format:

```json
{
  "success": false,
  "message": "Error description",
  "operation": "OperationName",
  "error": {
    "code": "ErrorCode",
    "message": "Detailed error message",
    "details": {}
  }
}
```

## Best Practices for Error Handling

1. **Always Check Success Flag**
   - Verify `success: true` before processing results
   - Handle errors gracefully

2. **Use Validate Operations**
   - Validate DAX before executing
   - Check object existence before creating

3. **Handle Timeouts**
   - Set appropriate timeout values
   - Implement retry logic for transient failures

4. **Log Errors**
   - Capture full error responses
   - Include operation context in logs

5. **Test in Power BI Desktop First**
   - Verify operations work in UI
   - Then replicate via MCP

---

## Getting Help

### Use Help Operation

For any operation, get help:

```json
{
  "operation": "Help",
  "connectionName": "your-connection-name"
}
```

### Common Help Operations

- `table_operations` → `Help`
- `measure_operations` → `Help`
- `column_operations` → `Help`
- `relationship_operations` → `Help`
- `connection_operations` → `Help`

---

*Documentation generated: 2026-01-17*
*Based on Power BI Modeling MCP Server*