# MEAL — Data Validation (website)

## Overview

The **MEAL** page (`/meal`) includes a **Data Validation** tab. Users upload an Excel sheet and receive an immediate validation report. **Files and reports are not saved** in the application database or file storage.

Other tabs (M&E Tools, Reports, Learning) are placeholders for future work.

## Who can access

- **CEO**, **Admin**, or role **M&E**
- Users with an explicit allowed route `/meal` in Configuration

Assign the **M&E** role in Configuration → Users when onboarding M&E staff.

## Architecture

1. React uploads the file to `/.netlify/functions/meal-validate-api/validate` (JWT required).
2. Netlify function checks role and forwards multipart data to the Python service (`MEAL_VALIDATION_API_URL`).
3. Python runs `validate_volunteer_upload` and returns JSON.
4. The UI shows Arabic/English messages and optional issues table; users can download a `.txt` report client-side.

See [meal-validation/README.md](../../meal-validation/README.md) for Python setup and deployment.

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `MEAL_VALIDATION_API_URL` | Netlify + `Frontend/.env.local` | Python API base URL |
| `MEAL_VALIDATION_API_KEY` | Netlify + Python + `.env.local` | Shared secret header |
| `MEAL_MAX_UPLOAD_BYTES` | Optional | Max upload size (default 25 MB) |

## Local development checklist

1. In `Frontend/`: `npm run proxies` (includes MEAL Python API on port **8090**; first run auto-installs deps).
2. In another terminal: `npm run dev`.
3. Sign in as CEO, Admin, or M&E and open **MEAL** → **Data Validation**.

Requires **Python 3.11+** on the machine (Windows: `py -3` launcher). First `proxies` start may take a minute while the venv is created.

If you see **503**, restart `npm run proxies` and check [http://127.0.0.1:8090/health](http://127.0.0.1:8090/health).

## Limits

- Accepted types: `.xlsx`, `.xls`
- Default max size: 25 MB (`MEAL_MAX_UPLOAD_BYTES`)
- No upload history in the UI or backend
