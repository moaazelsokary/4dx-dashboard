-- Grant UPDATE and INSERT on department_monthly_data to the app login.
-- Run this as a user with db_owner or permission-grant rights (e.g. 'sa' or the DB admin).
--
-- Replace YourAppLogin with the actual SQL Server login name used by the app
-- (same as UID / VITE_UID in Netlify env, or the database user name if using SQL auth).
--
-- Example: if UID is "datawarehouse_user", run:
--   EXECUTE AS USER = 'datawarehouse_user';  -- or use the login name in GRANT below
--
-- For SQL Server login (most common for Netlify):
--   Replace YourAppLogin with the login name (e.g. the value of UID in env).

USE [DataWarehouse];
GO

-- Option A: Grant to a SQL Server login (replace YourAppLogin with your UID value)
-- CREATE USER YourAppLogin FROM LOGIN YourAppLogin;  -- only if user does not exist
GRANT SELECT, INSERT, UPDATE ON dbo.department_monthly_data TO YourAppLogin;
GO

-- Option B: If the app uses a database user that already exists (e.g. dbo or a named user),
-- grant to that user instead:
-- GRANT SELECT, INSERT, UPDATE ON dbo.department_monthly_data TO [your_db_user_name];
-- GO

PRINT 'Granted SELECT, INSERT, UPDATE on dbo.department_monthly_data. Replace YourAppLogin with your app login name if you see an error.';
