# Where `pms_odoo_cache` Gets Its Data

The table **`pms_odoo_cache`** is **only** filled by the Netlify function **`sync-pms-odoo`**. Nothing else writes to this table.

## Data flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SOURCE 1: PMS SQL Server                                                    │
│  Env: PMS_SERVER, PMS_DATABASE, PMS_UID, PMS_PWD                             │
│  Query: dbo.Metrics + dbo.Projects + dbo.MetricValues                        │
│  → ProjectName, MetricName, MonthYear, Target, Actual                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  sync-pms-odoo (Netlify function)                                            │
│  1. Fetch from PMS (above)                                                   │
│  2. Fetch from Odoo (below)                                                  │
│  3. DELETE FROM pms_odoo_cache                                                │
│  4. INSERT PMS rows (source='pms')                                           │
│  5. INSERT Odoo rows (source='odoo')                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                        ▲
┌─────────────────────────────────────────────────────────────────────────────┐
│  SOURCE 2: Odoo API                                                          │
│  Env: ODOO_TOKEN                                                             │
│  URL: https://lifemakers.odoo.com/powerbi/sql (POST, JSON-RPC)               │
│  → Project, Month, ServicesCreated, ServicesDone                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Cache database (where the table lives):** Same as your main app DB.  
Env: `SERVER`, `DATABASE`, `DB_USER` (or `UID`), `DB_PASSWORD` (or `PWD`).  
The table must exist: run **`migrate-pms-odoo-cache.sql`** on that database first.

## When does the sync run?

| Trigger | How |
|--------|-----|
| **Schedule** | Every 10 min (production only), via `netlify.toml`: `[functions."sync-pms-odoo"] schedule = "*/10 * * * *"` |
| **Manual** | Admin/CEO clicks **Refresh** on the PMS & Odoo Metrics page → POST `/.netlify/functions/metrics-api/refresh` → calls `syncPmsOdoo()` in the background |

## If the table stays empty

1. **Table created?**  
   Run `migrate-pms-odoo-cache.sql` on the **same** database used by `SERVER` / `DATABASE` (DataWarehouse).

2. **Sync running?**  
   - Production: check Netlify → Functions → `sync-pms-odoo` → Logs.  
   - Manual: log in as Admin/CEO, open **PMS & Odoo Metrics**, click **Refresh**, then check function logs again.

3. **Env for sync:**  
   - **Cache DB:** `SERVER`, `DATABASE`, `DB_USER` or `UID`, `DB_PASSWORD` or `PWD`.  
   - **PMS:** `PMS_SERVER`, `PMS_DATABASE`, `PMS_UID`, `PMS_PWD`.  
   - **Odoo:** `ODOO_TOKEN`.  
   If PMS or Odoo fails, the other source can still fill the table (partial data).

4. **30s limit:**  
   Scheduled functions time out after 30s. If PMS or Odoo is slow, the run may not finish; check logs for timeouts.
