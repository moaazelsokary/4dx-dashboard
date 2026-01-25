#!/usr/bin/env node
/**
 * Check Objective Types - Verify which objectives are Direct type
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const sql = require('mssql');

const serverValue = process.env.SERVER || process.env.VITE_SERVER || '';
let server, port;
if (serverValue.includes(',')) {
  [server, port] = serverValue.split(',').map(s => s.trim());
  port = parseInt(port) || 1433;
} else {
  server = serverValue;
  port = 1433;
}

let password = process.env.DB_PASSWORD || process.env.VITE_PWD || process.env.PWD;
if (password && password.startsWith('/')) {
  password = process.env.DB_PASSWORD || process.env.VITE_PWD;
}
if (password && (password.includes('%'))) {
  try {
    password = decodeURIComponent(password);
  } catch (e) {}
}
if ((password && password.startsWith('"') && password.endsWith('"')) || 
    (password && password.startsWith("'") && password.endsWith("'"))) {
  password = password.slice(1, -1);
}
if (password) {
  password = password.trim();
}

const config = {
  server: server,
  port: port,
  database: process.env.DATABASE || process.env.VITE_DATABASE,
  user: process.env.DB_USER || process.env.UID || process.env.VITE_UID || process.env.VIE_UID,
  password: password,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    requestTimeout: 60000,
    connectionTimeout: 30000,
  },
};

async function checkObjectives() {
  let pool;
  try {
    pool = await sql.connect(config);
    
    // Check objectives 1, 12, and 485
    const result = await pool.request().query(`
      SELECT id, kpi, type, activity, department_id
      FROM department_objectives
      WHERE id IN (1, 12, 485)
      ORDER BY id
    `);
    
    console.log('Objective Types Check:\n');
    result.recordset.forEach(obj => {
      const hasDirect = obj.type && obj.type.includes('Direct');
      console.log(`ID: ${obj.id}`);
      console.log(`  Type: ${obj.type}`);
      console.log(`  Has Direct: ${hasDirect ? '✅ YES' : '❌ NO'}`);
      console.log(`  KPI: ${obj.kpi}`);
      console.log(`  Activity: ${obj.activity?.substring(0, 50)}...`);
      console.log('');
    });
    
    await pool.close();
  } catch (error) {
    console.error('Error:', error.message);
    if (pool) await pool.close();
  }
}

checkObjectives();
