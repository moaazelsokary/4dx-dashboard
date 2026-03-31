#!/usr/bin/env node
/**
 * Run PMS/Odoo sync (for local dev or manual trigger)
 * Usage: node scripts/run-pms-odoo-sync.cjs
 * Loads .env.local from Frontend/ automatically
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { syncPmsOdoo } = require('../netlify/functions/sync-pms-odoo');

syncPmsOdoo()
  .then((r) => {
    console.log('Sync completed:', r);
    process.exit(0);
  })
  .catch((e) => {
    console.error('Sync failed:', e.message || e);
    process.exit(1);
  });
