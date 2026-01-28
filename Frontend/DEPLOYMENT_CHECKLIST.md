# Netlify Deployment Checklist

## ✅ Pre-Deployment Checklist

### 1. Code Status
- [x] No linter errors
- [x] All navigation components updated
- [x] All pages working correctly
- [x] Database tables created
- [x] Netlify functions configured

### 2. Build Configuration
- [x] `netlify.toml` configured
- [x] Build command: `npm run build`
- [x] Publish directory: `dist`
- [x] Functions directory: `netlify/functions`
- [x] Redirects configured for SPA routing

### 3. Environment Variables Required in Netlify Dashboard

#### For Database Connection (WIG API Functions & Auth API)
Set these in Netlify Dashboard → Site Settings → Environment Variables:

- `SERVER` or `VITE_SERVER` - SQL Server address (e.g., `server,1433`)
- `DATABASE` or `VITE_DATABASE` - Database name
- `UID` or `VITE_UID` or `VIE_UID` - Database username
- `PWD` or `VITE_PWD` - Database password
- `JWT_SECRET` or `VITE_JWT_SECRET` - Secret key for JWT token generation (use a strong random string in production)

#### For OneDrive/SharePoint Integration
- `CLIENT_ID` - Microsoft Azure App Client ID
- `CLIENT_SECRET` - Microsoft Azure App Client Secret
- `TENANT_ID` - Microsoft Azure Tenant ID

#### For Frontend (Build-time variables - must start with VITE_)
- `VITE_MAPBOX_ACCESS_TOKEN` - Mapbox access token (optional, has fallback)
- `VITE_SHAREPOINT_CLIENT_ID` - SharePoint Client ID (if using SharePoint features)
- `VITE_SHAREPOINT_CLIENT_SECRET` - SharePoint Client Secret
- `VITE_SHAREPOINT_TENANT_ID` - SharePoint Tenant ID

#### For Power BI Dashboards (Optional)
- `VITE_Volunteers` - Power BI embed URL
- `VITE_Humanitarian_Aid` - Power BI embed URL
- `VITE_Sawa` - Power BI embed URL
- `VITE_FRONTEX` - Power BI embed URL

#### For PMS/Odoo Integration (NEW)
- `PMS_SERVER` or `VITE_PMS_SERVER` - PMS SQL Server address (e.g., `74.235.174.170`)
- `PMS_DATABASE` or `VITE_PMS_DATABASE` - PMS database name (e.g., `LM_PMS`)
- `PMS_UID` or `VITE_PMS_UID` - PMS database username
- `PMS_PWD` or `VITE_PMS_PWD` - PMS database password
- `ODOO_TOKEN` or `VITE_Odoo_Token` - Odoo Power BI SQL API token (server-side only, never expose to frontend)

### 4. Netlify Functions
All functions are in `netlify/functions/`:
- ✅ `wig-api.js` - WIG plan API endpoints
- ✅ `get_excel_data_from_onedrive_url.js` - OneDrive Excel data fetcher
- ✅ `sharepoint-proxy.js` - SharePoint API proxy
- ✅ `auth-api.js` - User authentication API (database-based)
- ✅ `config-api.js` - Configuration API (locks, logs, permissions, mappings)
- ✅ `metrics-api.js` - Fast read API for PMS/Odoo combined data (reads from cache)
- ✅ `sync-pms-odoo.js` - Scheduled sync function (runs every 5-10 minutes)
- ✅ `scheduled-backup.js` - Scheduled backup function
- ✅ `test.js` - Test function
- ✅ `db.cjs` - Database connection module

### 4a. Scheduled Functions Configuration
The schedule is defined in `netlify.toml`: `[functions."sync-pms-odoo"] schedule = "*/10 * * * *"` (every 10 minutes).
- **sync-pms-odoo** fetches data from PMS and Odoo and writes to `pms_odoo_cache` table.
- Runs only on **production** deploys (not branch/deploy previews). Has a **30-second** execution limit.

### 5. Database Migrations
Run these SQL migrations on your DataWarehouse database:
- `database/migrate-pms-odoo-cache.sql` - Creates `pms_odoo_cache` table
- `database/migrate-objective-data-source-mapping.sql` - Creates `objective_data_source_mapping` table
- `database/migrate-objective-data-source-mapping-target-source.sql` - Adds `target_source` column (PMS | Manual)
- `database/migrate-objective-data-source-mapping-actual-manual.sql` - Allows `actual_source` = Manual

### 6. Deployment Steps

1. **Set Environment Variables in Netlify:**
   - Go to Netlify Dashboard → Your Site → Site Settings → Environment Variables
   - Add all required variables listed above (including new PMS/Odoo variables)
   - **Important:** Variables for Netlify Functions should NOT have `VITE_` prefix
   - Variables for frontend build should have `VITE_` prefix
   - **PMS/Odoo variables:** Use `PMS_SERVER`, `PMS_DATABASE`, `PMS_UID`, `PMS_PWD`, `ODOO_TOKEN` (no VITE_ prefix for server-side functions)

2. **Configure Scheduled Function:**
   - Go to Netlify Dashboard → Site Settings → Functions → Scheduled Functions
   - Add new scheduled function: `sync-pms-odoo`
   - Schedule: `rate(10 minutes)` or `cron(0 */10 * * * *)`
   - This will automatically sync PMS and Odoo data every 10 minutes

3. **Deploy:**
   - Push to your connected Git repository, OR
   - Use Netlify CLI: `netlify deploy --prod`
   - Or drag & drop the `dist` folder in Netlify Dashboard

4. **Verify Deployment:**
   - Check build logs for errors
   - Test all pages:
     - Sign-in page
     - Main Plan Objectives (CEO)
     - Department Objectives
     - Projects Summary
     - Projects Details
     - Power BI Dashboards
   - Test API endpoints:
     - `/.netlify/functions/wig-api/main-objectives`
     - `/.netlify/functions/auth-api` (POST with username/password)
     - `/.netlify/functions/metrics-api` (GET - should return cached PMS/Odoo data)
     - `/.netlify/functions/config-api/mappings` (GET - should return objective mappings)
     - `/.netlify/functions/test`
   - Test new pages:
     - `/pms-odoo-metrics` - Combined PMS/Odoo metrics table
     - `/admin/configuration` → "DataSource Mapping" tab

### 7. Post-Deployment Verification

- [ ] Site loads correctly
- [ ] Sign-in works
- [ ] Navigation works for all user roles
- [ ] Database connections work (WIG API)
- [ ] OneDrive data loading works
- [ ] Power BI dashboards load (if configured)
- [ ] All routes redirect correctly (SPA routing)
- [ ] PMS/Odoo metrics page loads (`/pms-odoo-metrics`)
- [ ] DataSource mapping tab works in Configuration page
- [ ] Scheduled sync function runs successfully (check function logs)

### 8. Important Notes

⚠️ **Environment Variables:**
- Netlify Functions use `process.env.VARIABLE_NAME` (no VITE_ prefix)
- Frontend code uses `import.meta.env.VITE_VARIABLE_NAME` (must have VITE_ prefix)
- Set both versions if needed (e.g., `SERVER` for functions, `VITE_SERVER` for frontend)

⚠️ **Database Connection:**
- The `db.cjs` file checks for both `SERVER` and `VITE_SERVER`
- Set `SERVER` in Netlify environment variables for functions
- Format: `server,port` or just `server` (defaults to port 1433)

⚠️ **Build Output:**
- Build creates `dist/` folder
- Make sure `netlify.toml` points to `dist` as publish directory

### 9. Troubleshooting

If deployment fails:
1. Check build logs in Netlify Dashboard
2. Verify all environment variables are set
3. Check function logs for runtime errors
4. Verify database connection strings are correct
5. Check CORS settings if API calls fail

If functions don't work:
1. Check function logs in Netlify Dashboard
2. Verify environment variables are set (without VITE_ prefix)
3. Test function directly: `/.netlify/functions/test`

**No data in `pms_odoo_cache` table:**
1. **Run the migration** – Execute `Frontend/database/migrate-pms-odoo-cache.sql` on the **DataWarehouse** database (same DB as other functions). If the table doesn't exist, the sync will fail with a clear error.
2. **Cache DB connection** – The sync uses the same env as other functions: `SERVER`, `DATABASE`, `DB_USER` (or `UID`), `DB_PASSWORD` (or `PWD`). Ensure these are set in Netlify.
3. **PMS / Odoo env** – Set `PMS_SERVER`, `PMS_DATABASE`, `PMS_UID`, `PMS_PWD` for PMS; `ODOO_TOKEN` for Odoo. If one source fails, the other is still written (partial cache).
4. **30-second limit** – Netlify scheduled functions have a 30s execution limit. If PMS or Odoo is slow, the sync may time out before writing. Check function logs; consider reducing data or optimizing queries.
5. **Manual sync** – As Admin/CEO, POST to `/.netlify/functions/metrics-api/refresh` to trigger a sync, then check function logs for `sync-pms-odoo` or metrics-api errors.
6. **Schedule in `netlify.toml`** – The sync runs every 10 minutes via `[functions."sync-pms-odoo"] schedule = "*/10 * * * *"`. Scheduled functions run only on **production** deploys, not branch deploys.

## 🚀 Ready to Deploy!

All code is ready. Just set the environment variables in Netlify Dashboard and deploy!

