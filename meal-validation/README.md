# MEAL Data Validation

Stateless validation for volunteer/cases+services Excel uploads. **Production uses the built-in Node engine** inside the Netlify function (`meal-validate-api.js`); no separate Python host is required.

The Python FastAPI service in this folder is **deprecated** but kept as reference and for optional parity checks.

## How it runs (production & local dev)

1. Browser uploads `.xlsx` / `.xls` to `/.netlify/functions/meal-validate-api/validate`
2. Netlify function (or `auth-proxy.cjs` in local dev) authenticates the user (CEO, Admin, M&E)
3. **Node engine** (`Frontend/netlify/functions/utils/meal/validate.cjs`) parses the workbook and returns JSON (`ok`, `errors_count`, `messages_ar`, `messages_en`, `issues`, …)

No file is stored server-side.

## Local development

From `Frontend/`:

```bash
npm run proxies   # auth-proxy includes MEAL validate (no Python needed)
npm run dev
```

Open `/meal` and upload a spreadsheet.

### Optional: legacy Python API

If you set `MEAL_VALIDATION_API_URL` (e.g. `http://127.0.0.1:8090`), the proxy forwards to Python instead of the Node engine.

```bash
cd meal-validation
py -3 -m venv .venv
.venv\Scripts\pip install -r requirements.txt
set PORT=8090
python -m uvicorn app.main:app --host 127.0.0.1 --port 8090
```

## Parity check (Node engine)

```bash
node meal-validation/parity-check.cjs path/to/upload.xlsx
```

Prints `errors_count`, issue codes, and a preview of the English report.

## Engine location & version

| Item | Path |
|------|------|
| Node engine | `Frontend/netlify/functions/utils/meal/validate.cjs` |
| Column schema | `Frontend/netlify/functions/utils/meal/volunteer_validation_schema.json` |
| Column aliases | `Frontend/netlify/functions/utils/meal/column_aliases.json` |
| API handler | `Frontend/netlify/functions/meal-validate-api.js` |

`engine_version` in the JSON response identifies which validator ran (e.g. `2026-06-08-node-port-v1`).

## Updating validation rules

1. Edit schema/aliases JSON under `Frontend/netlify/functions/utils/meal/`
2. Adjust logic in `validate.cjs`, `schema.cjs`, or `splitSheet.cjs`
3. Redeploy the site (Netlify rebuild deploys the function automatically)

To sync from an external Python source, copy updated vendor files into `meal-validation/vendor/` for reference, then port changes into the Node modules.

## API contract

`POST /.netlify/functions/meal-validate-api/validate`

- `multipart/form-data`
- `file` (required): `.xlsx` or `.xls`
- `validate_mode` (optional): `both` | `cases` | `services`
- `sheet_name` (optional)

Response: JSON validation report (same shape as before).

## Access control

- Roles: **CEO**, **Admin**, **M&E**
- Or per-user `allowedRoutes` including `/meal`

## Environment variables (optional)

| Variable | Description |
|----------|-------------|
| `MEAL_VALIDATION_API_URL` | If set, forward to external Python API instead of Node engine |
| `MEAL_VALIDATION_API_KEY` | Shared secret when using external Python |
| `MEAL_MAX_UPLOAD_BYTES` | Max upload size (default 25 MB) |
