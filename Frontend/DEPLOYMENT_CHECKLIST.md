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

### 4. Netlify Functions
All functions are in `netlify/functions/`:
- ✅ `wig-api.js` - WIG plan API endpoints
- ✅ `get_excel_data_from_onedrive_url.js` - OneDrive Excel data fetcher
- ✅ `sharepoint-proxy.js` - SharePoint API proxy
- ✅ `auth-api.js` - User authentication API (database-based)
- ✅ `test.js` - Test function
- ✅ `db.cjs` - Database connection module

### 5. Deployment Steps

1. **Set Environment Variables in Netlify:**
   - Go to Netlify Dashboard → Your Site → Site Settings → Environment Variables
   - Add all required variables listed above
   - **Important:** Variables for Netlify Functions should NOT have `VITE_` prefix
   - Variables for frontend build should have `VITE_` prefix

2. **Deploy:**
   - Push to your connected Git repository, OR
   - Use Netlify CLI: `netlify deploy --prod`
   - Or drag & drop the `dist` folder in Netlify Dashboard

3. **Verify Deployment:**
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
     - `/.netlify/functions/test`

### 6. Post-Deployment Verification

- [ ] Site loads correctly
- [ ] Sign-in works
- [ ] Navigation works for all user roles
- [ ] Database connections work (WIG API)
- [ ] OneDrive data loading works
- [ ] Power BI dashboards load (if configured)
- [ ] All routes redirect correctly (SPA routing)

### 7. Important Notes

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

### 8. Troubleshooting

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

## 🚀 Ready to Deploy!

All code is ready. Just set the environment variables in Netlify Dashboard and deploy!

