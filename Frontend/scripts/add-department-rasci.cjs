#!/usr/bin/env node

/**
 * Script to add RASCI assignments for specific departments
 */

require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

// Get environment variables
const getEnv = (key) => {
  const value = process.env[key];
  return value ? value.trim().replace(/^["']|["']$/g, '') : undefined;
};

const serverValue = getEnv('SERVER') || getEnv('VITE_SERVER') || '';
let server, port;
if (serverValue.includes(',')) {
  [server, port] = serverValue.split(',').map(s => s.trim());
  port = parseInt(port) || 1433;
} else {
  server = serverValue;
  port = 1433;
}

// Get password
let password = getEnv('DB_PASSWORD') || getEnv('VITE_PWD') || getEnv('PWD');
if (password && password.startsWith('/') && password.includes('/')) {
  password = getEnv('DB_PASSWORD') || getEnv('VITE_PWD');
}
if (password && password.includes('%')) {
  try {
    password = decodeURIComponent(password);
  } catch (e) {}
}
if (password && ((password.startsWith('"') && password.endsWith('"')) ||
    (password.startsWith("'") && password.endsWith("'")))) {
  password = password.slice(1, -1);
}

const config = {
  server: server,
  port: port,
  database: getEnv('DATABASE') || getEnv('VITE_DATABASE'),
  user: getEnv('UID') || getEnv('VITE_UID') || getEnv('VIE_UID') || getEnv('VITE_USER'),
  password: password,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

// Parse RASCI value
function parseRASCI(value) {
  if (!value || value.trim() === '') {
    return { responsible: false, accountable: false, supportive: false, consulted: false, informed: false };
  }
  
  const cleaned = value.trim().toUpperCase();
  const rasciLetters = cleaned.match(/[RASCI]/g) || [];
  
  return {
    responsible: rasciLetters.includes('R'),
    accountable: rasciLetters.includes('A'),
    supportive: rasciLetters.includes('S'),
    consulted: rasciLetters.includes('C'),
    informed: rasciLetters.includes('I'),
  };
}

// Department name mapping
const DEPARTMENT_MAP = {
  'Procurement & Supply Chain': 'Procurement',
  'Operations / Program Implementation': 'Operations',
  'Finance': 'Finance',
  'Administration & Legal Affairs': 'Administration',
};

// Procurement & Supply Chain assignments
const procurementAssignments = [
  { kpi: '1.1.3', rasci: 'R' },
  { kpi: '1.2.2', rasci: 'R' },
  { kpi: '1.3.1', rasci: 'R' },
  { kpi: '1.3.2', rasci: 'R' },
  { kpi: '1.4.3', rasci: 'R' },
  { kpi: '1.5.1', rasci: 'S' },
  { kpi: '1.5.3', rasci: 'S' },
  { kpi: '3.1.1', rasci: 'R' },
  { kpi: '3.1.3', rasci: 'A, R' },
  { kpi: '5.1.4', rasci: 'R' },
  { kpi: '7.1.1', rasci: 'R' },
  { kpi: '7.1.3', rasci: 'A, R' },
  { kpi: '7.1.4', rasci: 'A, R' },
  { kpi: '7.1.5', rasci: 'S' },
  { kpi: '7.1.6', rasci: 'S' },
  { kpi: '8.1.1', rasci: 'R' },
  { kpi: '8.1.2', rasci: 'R' },
  { kpi: '8.1.3', rasci: 'R' },
];

// Operations / Program Implementation assignments
const operationsAssignments = [
  { kpi: '1.1.1', rasci: 'R' },
  { kpi: '1.1.2', rasci: 'R' },
  { kpi: '1.1.3', rasci: 'R' },
  { kpi: '1.1.4', rasci: 'R' },
  { kpi: '1.1.5', rasci: 'R' },
  { kpi: '1.2.1', rasci: 'R' },
  { kpi: '1.2.2', rasci: 'R' },
  { kpi: '1.3.1', rasci: 'R' },
  { kpi: '1.3.2', rasci: 'R' },
  { kpi: '1.3.5', rasci: 'R' },
  { kpi: '1.4.1', rasci: 'A, R' },
  { kpi: '1.4.2', rasci: 'R' },
  { kpi: '1.4.3', rasci: 'A, R' },
  { kpi: '2.1.1', rasci: 'A, R' },
  { kpi: '2.1.2', rasci: 'A, R' },
  { kpi: '2.1.3', rasci: 'A, R' },
  { kpi: '2.1.4', rasci: 'A, R' },
  { kpi: '2.1.5', rasci: 'A, R' },
  { kpi: '3.1.3', rasci: 'A, R' },
  { kpi: '4.1.1', rasci: 'A, R' },
  { kpi: '4.1.2', rasci: 'A, R' },
  { kpi: '4.1.3', rasci: 'A, R' },
  { kpi: '4.1.4', rasci: 'A, R' },
  { kpi: '4.1.5', rasci: 'A, R' },
  { kpi: '4.1.7', rasci: 'A, R' },
  { kpi: '4.1.8', rasci: 'A, R' },
  { kpi: '5.1.1', rasci: 'A, R' },
  { kpi: '5.1.3', rasci: 'A, R' },
  { kpi: '5.1.4', rasci: 'A, R' },
  { kpi: '5.1.5', rasci: 'A, R' },
  { kpi: '5.1.7', rasci: 'R' },
  { kpi: '5.1.8', rasci: 'A, R' },
  { kpi: '5.1.9', rasci: 'R, A' },
  { kpi: '5.2.1', rasci: 'A, R' },
  { kpi: '5.2.2', rasci: 'A, R' },
  { kpi: '5.2.3', rasci: 'A' },
  { kpi: '5.2.5', rasci: 'A, R' },
  { kpi: '5.2.7', rasci: 'A, R' },
  { kpi: '5.2.8', rasci: 'R' },
  { kpi: '5.2.9', rasci: 'R' },
  { kpi: '5.2.10', rasci: 'A, R' },
  { kpi: '5.3.1', rasci: 'A, R' },
  { kpi: '5.3.2', rasci: 'A, R' },
  { kpi: '5.3.3', rasci: 'A, R' },
  { kpi: '5.3.4', rasci: 'A, R' },
  { kpi: '5.3.6', rasci: 'A, R' },
  { kpi: '5.3.7', rasci: 'A, R' },
  { kpi: '5.3.8', rasci: 'A, R' },
  { kpi: '5.3.9', rasci: 'A, R' },
  { kpi: '6.1.1', rasci: 'A, R' },
  { kpi: '6.1.2', rasci: 'A, R' },
  { kpi: '6.1.3', rasci: 'A, R' },
  { kpi: '6.1.5', rasci: 'A, R' },
  { kpi: '6.1.6', rasci: 'S' },
  { kpi: '6.1.7', rasci: 'S' },
  { kpi: '7.1.1', rasci: 'R' },
  { kpi: '7.1.4', rasci: 'A, R' },
  { kpi: '8.1.1', rasci: 'R' },
  { kpi: '8.1.2', rasci: 'R' },
  { kpi: '8.1.3', rasci: 'R' },
];

// Finance assignments
const financeAssignments = [
  { kpi: '1.2.2', rasci: 'R' },
  { kpi: '2.1.1', rasci: 'S' },
  { kpi: '2.1.2', rasci: 'S' },
  { kpi: '3.1.3', rasci: 'R' },
  { kpi: '4.1.2', rasci: 'S' },
  { kpi: '4.1.3', rasci: 'S' },
  { kpi: '4.1.5', rasci: 'S' },
  { kpi: '4.1.7', rasci: 'S' },
  { kpi: '4.1.8', rasci: 'S, I' },
  { kpi: '5.1.1', rasci: 'S' },
  { kpi: '5.1.3', rasci: 'S' },
  { kpi: '5.1.4', rasci: 'S' },
  { kpi: '5.1.5', rasci: 'S' },
  { kpi: '6.1.4', rasci: 'A, R' },
  { kpi: '7.1.1', rasci: 'A, R' },
  { kpi: '7.1.2', rasci: 'S, I' },
  { kpi: '7.1.3', rasci: 'A, R' },
  { kpi: '7.1.4', rasci: 'A, R' },
  { kpi: '8.1.1', rasci: 'R' },
  { kpi: '8.1.2', rasci: 'R' },
  { kpi: '8.1.3', rasci: 'R' },
];

// Administration & Legal Affairs assignments
const administrationAssignments = [
  { kpi: '1.1.1', rasci: 'S' },
  { kpi: '1.1.2', rasci: 'S' },
  { kpi: '1.1.3', rasci: 'S' },
  { kpi: '1.1.4', rasci: 'S' },
  { kpi: '1.1.5', rasci: 'S' },
  { kpi: '1.3.1', rasci: 'S' },
  { kpi: '1.3.2', rasci: 'S' },
  { kpi: '1.3.6', rasci: 'S' },
  { kpi: '2.1.1', rasci: 'S' },
  { kpi: '2.1.2', rasci: 'S' },
  { kpi: '2.1.3', rasci: 'S' },
  { kpi: '2.1.4', rasci: 'S' },
  { kpi: '3.1.3', rasci: 'A, R' },
  { kpi: '4.1.1', rasci: 'R' },
  { kpi: '4.1.2', rasci: 'R' },
  { kpi: '4.1.3', rasci: 'R' },
  { kpi: '4.1.4', rasci: 'R' },
  { kpi: '4.1.5', rasci: 'A, R' },
  { kpi: '4.1.7', rasci: 'S' },
  { kpi: '5.1.1', rasci: 'S' },
  { kpi: '5.1.3', rasci: 'S' },
  { kpi: '5.1.8', rasci: 'S' },
  { kpi: '5.1.9', rasci: 'S' },
  { kpi: '5.2.9', rasci: 'S' },
  { kpi: '5.2.10', rasci: 'S' },
  { kpi: '5.3.8', rasci: 'S' },
  { kpi: '5.3.9', rasci: 'S' },
  { kpi: '6.1.1', rasci: 'S' },
  { kpi: '6.1.2', rasci: 'S' },
  { kpi: '6.1.3', rasci: 'S' },
  { kpi: '6.1.4', rasci: 'S' },
  { kpi: '6.1.5', rasci: 'S' },
  { kpi: '6.1.6', rasci: 'S' },
  { kpi: '6.1.7', rasci: 'S' },
  { kpi: '7.1.3', rasci: 'A, R' },
  { kpi: '7.1.4', rasci: 'A, R' },
  { kpi: '8.1.1', rasci: 'R' },
  { kpi: '8.1.2', rasci: 'R' },
  { kpi: '9.1.1', rasci: 'A, R, C' },
  { kpi: '9.1.2', rasci: 'A, R, C' },
];

// Information Technology (IT) assignments
const itAssignments = [
  { kpi: '1.1.1', rasci: 'S' },
  { kpi: '1.1.2', rasci: 'S' },
  { kpi: '1.1.3', rasci: 'S' },
  { kpi: '1.1.4', rasci: 'S' },
  { kpi: '1.1.5', rasci: 'S' },
  { kpi: '1.2.1', rasci: 'S' },
  { kpi: '1.2.2', rasci: 'S' },
  { kpi: '1.3.1', rasci: 'S' },
  { kpi: '1.3.2', rasci: 'S' },
  { kpi: '1.3.4', rasci: 'S' },
  { kpi: '1.3.5', rasci: 'R, S' },
  { kpi: '1.4.1', rasci: 'S' },
  { kpi: '1.5.4', rasci: 'S' },
  { kpi: '1.5.6', rasci: 'S' },
  { kpi: '2.1.3', rasci: 'S' },
  { kpi: '3.1.3', rasci: 'A, R' },
  { kpi: '4.1.5', rasci: 'S' },
  { kpi: '7.1.1', rasci: 'R' },
  { kpi: '7.1.3', rasci: 'A, R' },
  { kpi: '7.1.4', rasci: 'A, R' },
  { kpi: '7.1.5', rasci: 'S' },
  { kpi: '7.1.6', rasci: 'S' },
  { kpi: '8.1.1', rasci: 'R, A' },
  { kpi: '8.1.2', rasci: 'A, R' },
  { kpi: '8.1.3', rasci: 'A, R' },
  { kpi: '8.1.4', rasci: 'A, R' },
];

// Communication assignments
const communicationAssignments = [
  { kpi: '1.1.1', rasci: 'S' },
  { kpi: '1.1.2', rasci: 'S' },
  { kpi: '1.1.3', rasci: 'R' },
  { kpi: '1.1.4', rasci: 'S' },
  { kpi: '1.1.5', rasci: 'S' },
  { kpi: '1.2.2', rasci: 'R' },
  { kpi: '1.3.1', rasci: 'R' },
  { kpi: '1.3.2', rasci: 'R' },
  { kpi: '1.3.3', rasci: 'R' },
  { kpi: '1.3.5', rasci: 'S' },
  { kpi: '1.4.1', rasci: 'S' },
  { kpi: '1.4.2', rasci: 'R' },
  { kpi: '1.5.1', rasci: 'S' },
  { kpi: '1.5.3', rasci: 'S' },
  { kpi: '1.5.8', rasci: 'R' },
  { kpi: '1.5.9', rasci: 'R' },
  { kpi: '1.5.10', rasci: 'R' },
  { kpi: '1.5.11', rasci: 'R' },
  { kpi: '2.1.3', rasci: 'S' },
  { kpi: '2.1.4', rasci: 'S' },
  { kpi: '3.1.1', rasci: 'A, R' },
  { kpi: '3.1.2', rasci: 'A, R' },
  { kpi: '3.1.3', rasci: 'A, R' },
  { kpi: '4.1.1', rasci: 'S' },
  { kpi: '4.1.2', rasci: 'S' },
  { kpi: '4.1.3', rasci: 'S' },
  { kpi: '4.1.4', rasci: 'S' },
  { kpi: '4.1.5', rasci: 'S' },
  { kpi: '4.1.6', rasci: 'S' },
  { kpi: '4.1.7', rasci: 'S' },
  { kpi: '4.1.8', rasci: 'S' },
  { kpi: '5.1.1', rasci: 'A, R' },
  { kpi: '5.1.8', rasci: 'S' },
  { kpi: '5.1.9', rasci: 'R' },
  { kpi: '5.2.1', rasci: 'A, R' },
  { kpi: '5.2.3', rasci: 'R' },
  { kpi: '5.2.9', rasci: 'R' },
  { kpi: '5.2.10', rasci: 'R' },
  { kpi: '5.3.1', rasci: 'S' },
  { kpi: '5.3.2', rasci: 'S' },
  { kpi: '5.3.3', rasci: 'S' },
  { kpi: '5.3.4', rasci: 'S' },
  { kpi: '5.3.8', rasci: 'S, R' },
  { kpi: '5.3.9', rasci: 'S, R' },
  { kpi: '6.1.1', rasci: 'S' },
  { kpi: '6.1.2', rasci: 'S' },
  { kpi: '6.1.3', rasci: 'S' },
  { kpi: '6.1.4', rasci: 'S' },
  { kpi: '6.1.5', rasci: 'S' },
  { kpi: '6.1.6', rasci: 'S' },
  { kpi: '6.1.7', rasci: 'S' },
  { kpi: '7.1.3', rasci: 'A, R' },
  { kpi: '7.1.4', rasci: 'A, R' },
  { kpi: '7.1.5', rasci: 'S' },
  { kpi: '7.1.6', rasci: 'S' },
  { kpi: '8.1.1', rasci: 'R' },
  { kpi: '8.1.2', rasci: 'R' },
  { kpi: '8.1.3', rasci: 'R' },
];

// Direct Fundraising / Resource Mobilization assignments
const dfrAssignments = [
  { kpi: '1.1.1', rasci: 'R' },
  { kpi: '1.1.2', rasci: 'R' },
  { kpi: '1.1.3', rasci: 'R' },
  { kpi: '1.1.4', rasci: 'R' },
  { kpi: '1.1.5', rasci: 'R' },
  { kpi: '1.2.2', rasci: 'R' },
  { kpi: '1.3.1', rasci: 'R' },
  { kpi: '1.3.2', rasci: 'R' },
  { kpi: '1.4.1', rasci: 'R' },
  { kpi: '2.1.1', rasci: 'A, R' },
  { kpi: '2.1.3', rasci: 'R' },
  { kpi: '2.1.4', rasci: 'R' },
  { kpi: '3.1.1', rasci: 'R' },
  { kpi: '3.1.3', rasci: 'A, R' },
  { kpi: '4.1.1', rasci: 'R, A' },
  { kpi: '4.1.2', rasci: 'S' },
  { kpi: '4.1.3', rasci: 'R' },
  { kpi: '4.1.7', rasci: 'R' },
  { kpi: '4.1.8', rasci: 'A, R' },
  { kpi: '5.2.5', rasci: 'A, R' },
  { kpi: '6.1.1', rasci: 'A, R' },
  { kpi: '6.1.2', rasci: 'A, R' },
  { kpi: '6.1.3', rasci: 'A, R' },
  { kpi: '6.1.4', rasci: 'A, R' },
  { kpi: '6.1.5', rasci: 'A, R' },
  { kpi: '6.1.6', rasci: 'A, R' },
  { kpi: '6.1.7', rasci: 'A, R' },
  { kpi: '7.1.1', rasci: 'A, R' },
  { kpi: '7.1.4', rasci: 'R' },
  { kpi: '8.1.1', rasci: 'A, R' },
  { kpi: '8.1.2', rasci: 'R' },
  { kpi: '8.1.3', rasci: 'R' },
];

// Monitoring, Evaluation & Learning (MEL) assignments
const melAssignments = [
  { kpi: '1.1.1', rasci: 'I' },
  { kpi: '1.1.2', rasci: 'I' },
  { kpi: '1.1.3', rasci: 'I' },
  { kpi: '1.1.4', rasci: 'I' },
  { kpi: '1.1.5', rasci: 'S' },
  { kpi: '1.2.1', rasci: 'I, S' },
  { kpi: '1.2.2', rasci: 'R' },
  { kpi: '1.2.3', rasci: 'I, S' },
  { kpi: '1.3.1', rasci: 'I, S' },
  { kpi: '1.3.2', rasci: 'I, S' },
  { kpi: '1.3.3', rasci: 'I, S' },
  { kpi: '1.3.4', rasci: 'I, S' },
  { kpi: '1.3.5', rasci: 'I, S' },
  { kpi: '1.4.1', rasci: 'I' },
  { kpi: '1.4.2', rasci: 'I, S, R' },
  { kpi: '1.4.3', rasci: 'S, I' },
  { kpi: '1.5.1', rasci: 'I, S' },
  { kpi: '1.5.3', rasci: 'I, S' },
  { kpi: '1.5.4', rasci: 'A, S' },
  { kpi: '1.5.6', rasci: 'I, S' },
  { kpi: '1.5.7', rasci: 'I, S' },
  { kpi: '1.5.8', rasci: 'I, S' },
  { kpi: '1.5.9', rasci: 'I, S' },
  { kpi: '1.5.10', rasci: 'I, S' },
  { kpi: '1.5.11', rasci: 'I, S' },
  { kpi: '2.1.1', rasci: 'I, S' },
  { kpi: '2.1.2', rasci: 'I, S' },
  { kpi: '2.1.3', rasci: 'I, S' },
  { kpi: '2.1.4', rasci: 'I, S' },
  { kpi: '2.1.5', rasci: 'I, S' },
  { kpi: '3.1.1', rasci: 'S' },
  { kpi: '3.1.2', rasci: 'S' },
  { kpi: '3.1.3', rasci: 'S' },
  { kpi: '4.1.1', rasci: 'I, S' },
  { kpi: '4.1.2', rasci: 'I, S' },
  { kpi: '4.1.3', rasci: 'I, S' },
  { kpi: '4.1.4', rasci: 'I, S' },
  { kpi: '4.1.5', rasci: 'I, S' },
  { kpi: '4.1.6', rasci: 'I, S' },
  { kpi: '4.1.7', rasci: 'I, S' },
  { kpi: '4.1.8', rasci: 'I, S' },
  { kpi: '5.1.3', rasci: 'A, R' },
  { kpi: '5.1.6', rasci: 'I, S' },
  { kpi: '5.2.1', rasci: 'I, S' },
  { kpi: '5.2.2', rasci: 'I, S' },
  { kpi: '5.2.3', rasci: 'I, S' },
  { kpi: '5.2.4', rasci: 'I, S' },
  { kpi: '5.2.5', rasci: 'I, S' },
  { kpi: '5.2.6', rasci: 'I, S' },
  { kpi: '5.2.7', rasci: 'I, S' },
  { kpi: '5.2.8', rasci: 'I, S' },
  { kpi: '5.2.9', rasci: 'I' },
  { kpi: '5.2.10', rasci: 'I' },
  { kpi: '5.3.1', rasci: 'I, S' },
  { kpi: '5.3.2', rasci: 'I, S' },
  { kpi: '5.3.3', rasci: 'I, S' },
  { kpi: '5.3.4', rasci: 'I, S' },
  { kpi: '5.3.6', rasci: 'I, S' },
  { kpi: '5.3.7', rasci: 'I, S' },
  { kpi: '5.3.8', rasci: 'I, S' },
  { kpi: '5.3.9', rasci: 'I, S' },
  { kpi: '6.1.1', rasci: 'R' },
  { kpi: '6.1.2', rasci: 'R' },
  { kpi: '6.1.3', rasci: 'I, S' },
  { kpi: '6.1.4', rasci: 'I, S' },
  { kpi: '6.1.5', rasci: 'I, S' },
  { kpi: '6.1.6', rasci: 'I, S' },
  { kpi: '6.1.7', rasci: 'I, S' },
  { kpi: '7.1.3', rasci: 'I, S' },
  { kpi: '7.1.4', rasci: 'I, S' },
  { kpi: '7.1.5', rasci: 'I, S' },
  { kpi: '7.1.6', rasci: 'I, S' },
  { kpi: '8.1.1', rasci: 'I, S' },
  { kpi: '8.1.2', rasci: 'I, S' },
  { kpi: '8.1.3', rasci: 'I, S' },
  { kpi: '8.1.4', rasci: 'A, R' },
  { kpi: '9.1.1', rasci: 'I, S, A, R' },
  { kpi: '9.1.2', rasci: 'I, S, A, R' },
];

// Case Management assignments
const caseManagementAssignments = [
  { kpi: '1.1.1', rasci: 'R' },
  { kpi: '1.1.2', rasci: 'R' },
  { kpi: '1.1.3', rasci: 'R' },
  { kpi: '1.1.4', rasci: 'R' },
  { kpi: '1.1.5', rasci: 'R' },
  { kpi: '1.2.2', rasci: 'R' },
  { kpi: '1.3.1', rasci: 'R' },
  { kpi: '1.3.2', rasci: 'R' },
  { kpi: '1.4.1', rasci: 'A, R' },
  { kpi: '1.4.3', rasci: 'A, R' },
  { kpi: '2.1.3', rasci: 'R' },
  { kpi: '2.1.4', rasci: 'R' },
  { kpi: '3.1.1', rasci: 'R' },
  { kpi: '3.1.3', rasci: 'A, R' },
  { kpi: '5.1.3', rasci: 'A, R' },
  { kpi: '5.1.5', rasci: 'A, R' },
  { kpi: '5.1.7', rasci: 'R' },
  { kpi: '5.1.8', rasci: 'A, R' },
  { kpi: '5.1.9', rasci: 'A, R' },
  { kpi: '7.1.3', rasci: 'A, R' },
  { kpi: '7.1.4', rasci: 'A, R' },
  { kpi: '8.1.1', rasci: 'R' },
  { kpi: '8.1.2', rasci: 'R' },
];

// Business Development assignments
const businessDevelopmentAssignments = [
  { kpi: '3.1.3', rasci: 'A, R' },
  { kpi: '6.1.4', rasci: 'A, R' },
  { kpi: '7.1.4', rasci: 'A, R' },
  { kpi: '8.1.1', rasci: 'R' },
  { kpi: '8.1.2', rasci: 'R' },
];

// Volunteer Management assignments
const volunteerManagementAssignments = [
  { kpi: '1.1.1', rasci: 'A, R' },
  { kpi: '1.1.2', rasci: 'A, R' },
  { kpi: '1.1.3', rasci: 'A, R' },
  { kpi: '1.1.4', rasci: 'A, R' },
  { kpi: '1.1.5', rasci: 'A, R' },
  { kpi: '1.2.1', rasci: 'A, R' },
  { kpi: '1.2.2', rasci: 'A, R' },
  { kpi: '1.2.3', rasci: 'A, R' },
  { kpi: '1.3.1', rasci: 'A, R' },
  { kpi: '1.3.2', rasci: 'A, R' },
  { kpi: '1.3.3', rasci: 'A, R' },
  { kpi: '1.3.4', rasci: 'A, R' },
  { kpi: '1.3.5', rasci: 'A, R' },
  { kpi: '1.3.6', rasci: 'A, R' },
  { kpi: '1.3.7', rasci: 'A, R' },
  { kpi: '1.4.1', rasci: 'A, R' },
  { kpi: '1.4.2', rasci: 'A, R' },
  { kpi: '1.4.3', rasci: 'A, R' },
  { kpi: '1.5.1', rasci: 'A, R' },
  { kpi: '1.5.3', rasci: 'A, R' },
  { kpi: '1.5.4', rasci: 'A, R' },
  { kpi: '1.5.6', rasci: 'A, R' },
  { kpi: '1.5.7', rasci: 'A, R' },
  { kpi: '1.5.8', rasci: 'A, R' },
  { kpi: '1.5.9', rasci: 'A, R' },
  { kpi: '1.5.10', rasci: 'A, R' },
  { kpi: '1.5.11', rasci: 'A, R' },
  { kpi: '2.1.5', rasci: 'A, R' },
  { kpi: '3.1.1', rasci: 'A, R' },
  { kpi: '3.1.3', rasci: 'A, R' },
  { kpi: '5.1.7', rasci: 'A, R' },
  { kpi: '5.2.1', rasci: 'A, R' },
  { kpi: '5.2.7', rasci: 'A, R' },
  { kpi: '5.2.8', rasci: 'A, R' },
  { kpi: '5.3.1', rasci: 'A, R' },
  { kpi: '5.3.2', rasci: 'A, R' },
  { kpi: '5.3.3', rasci: 'A, R' },
  { kpi: '5.3.4', rasci: 'A, R' },
  { kpi: '5.3.7', rasci: 'A, R' },
  { kpi: '6.1.2', rasci: 'R' },
  { kpi: '6.1.3', rasci: 'R' },
  { kpi: '6.1.6', rasci: 'R' },
  { kpi: '6.1.7', rasci: 'A, R' },
  { kpi: '7.1.4', rasci: 'A, R' },
  { kpi: '8.1.1', rasci: 'S' },
  { kpi: '8.1.2', rasci: 'R' },
  { kpi: '8.1.3', rasci: 'R' },
];

// LMF Community assignments
const lmfCommunityAssignments = [
  { kpi: '1.1.2', rasci: 'R' },
  { kpi: '1.1.3', rasci: 'R' },
  { kpi: '1.2.2', rasci: 'R' },
  { kpi: '1.3.1', rasci: 'R' },
  { kpi: '1.3.2', rasci: 'R' },
  { kpi: '1.3.5', rasci: 'R' },
  { kpi: '1.4.2', rasci: 'R' },
  { kpi: '1.5.1', rasci: 'R' },
  { kpi: '1.5.3', rasci: 'R' },
  { kpi: '1.5.4', rasci: 'R' },
  { kpi: '1.5.6', rasci: 'R' },
  { kpi: '1.5.7', rasci: 'R' },
  { kpi: '1.5.8', rasci: 'R' },
  { kpi: '1.5.9', rasci: 'R' },
  { kpi: '1.5.10', rasci: 'R' },
  { kpi: '1.5.11', rasci: 'R' },
  { kpi: '3.1.1', rasci: 'R' },
  { kpi: '3.1.2', rasci: 'R' },
  { kpi: '5.2.3', rasci: 'R' },
  { kpi: '7.1.3', rasci: 'A, R' },
  { kpi: '7.1.4', rasci: 'S' },
  { kpi: '7.1.5', rasci: 'S' },
  { kpi: '7.1.6', rasci: 'R' },
  { kpi: '8.1.1', rasci: 'R' },
  { kpi: '8.1.2', rasci: 'R' },
];

// Security assignments
const securityAssignments = [
  { kpi: '1.1.2', rasci: 'S' },
  { kpi: '1.3.1', rasci: 'S' },
  { kpi: '1.5.1', rasci: 'S' },
  { kpi: '1.5.4', rasci: 'S' },
  { kpi: '7.1.3', rasci: 'A, R' },
  { kpi: '7.1.4', rasci: 'R' },
  { kpi: '8.1.1', rasci: 'R' },
  { kpi: '8.1.2', rasci: 'R' },
];

// Offices&P assignments
const officesAssignments = [
  { kpi: '1.1.1', rasci: 'R' },
  { kpi: '1.1.2', rasci: 'A, R' },
  { kpi: '1.1.3', rasci: 'A, R' },
  { kpi: '1.1.4', rasci: 'A, R' },
  { kpi: '1.1.5', rasci: 'A, R' },
  { kpi: '1.2.1', rasci: 'R, A' },
  { kpi: '1.2.2', rasci: 'R, A' },
  { kpi: '1.2.3', rasci: 'R, A' },
  { kpi: '1.3.1', rasci: 'A, R' },
  { kpi: '1.3.2', rasci: 'A, R' },
  { kpi: '1.3.3', rasci: 'R' },
  { kpi: '1.3.4', rasci: 'A, R' },
  { kpi: '1.3.5', rasci: 'R' },
  { kpi: '1.3.6', rasci: 'A, R' },
  { kpi: '1.4.1', rasci: 'R' },
  { kpi: '1.4.2', rasci: 'R' },
  { kpi: '1.4.3', rasci: 'A, R' },
  { kpi: '1.5.6', rasci: 'A, R' },
  { kpi: '1.5.7', rasci: 'A, R' },
  { kpi: '2.1.3', rasci: 'R' },
  { kpi: '2.1.4', rasci: 'A, R' },
  { kpi: '2.1.5', rasci: 'R' },
  { kpi: '3.1.1', rasci: 'A, R' },
  { kpi: '3.1.3', rasci: 'A, R' },
  { kpi: '4.1.1', rasci: 'R' },
  { kpi: '4.1.3', rasci: 'R, A' },
  { kpi: '4.1.5', rasci: 'R' },
  { kpi: '4.1.6', rasci: 'A, R' },
  { kpi: '5.1.7', rasci: 'A, R' },
  { kpi: '5.2.1', rasci: 'A, R' },
  { kpi: '5.2.7', rasci: 'A, R' },
  { kpi: '5.2.8', rasci: 'A, R' },
  { kpi: '5.3.1', rasci: 'A, R' },
  { kpi: '5.3.2', rasci: 'A, R' },
  { kpi: '5.3.3', rasci: 'R' },
  { kpi: '5.3.4', rasci: 'R' },
  { kpi: '5.3.7', rasci: 'R' },
  { kpi: '6.1.2', rasci: 'A, R' },
  { kpi: '6.1.3', rasci: 'A, R' },
  { kpi: '6.1.5', rasci: 'R' },
  { kpi: '6.1.6', rasci: 'R' },
  { kpi: '6.1.7', rasci: 'R' },
  { kpi: '7.1.3', rasci: 'A, R' },
  { kpi: '7.1.4', rasci: 'A, R' },
  { kpi: '8.1.1', rasci: 'R' },
  { kpi: '8.1.2', rasci: 'R' },
];

// SiS assignments
const sisAssignments = [
  { kpi: '1.2.1', rasci: 'S, C' },
  { kpi: '1.2.2', rasci: 'S, C' },
  { kpi: '1.2.3', rasci: 'R' },
  { kpi: '2.1.2', rasci: 'C, S' },
  { kpi: '3.1.1', rasci: 'S' },
  { kpi: '3.1.3', rasci: 'R' },
  { kpi: '4.1.4', rasci: 'C, S' },
  { kpi: '4.1.5', rasci: 'C, S' },
  { kpi: '4.1.6', rasci: 'S' },
  { kpi: '7.1.1', rasci: 'S, I' },
  { kpi: '7.1.3', rasci: 'S' },
  { kpi: '7.1.4', rasci: 'S' },
  { kpi: '7.1.5', rasci: 'A, R' },
  { kpi: '7.1.6', rasci: 'A, R' },
  { kpi: '8.1.1', rasci: 'C, S' },
];

async function addDepartmentRASCI() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Get all KPIs from main_plan_objectives to match by KPI number
    console.log('Loading KPIs from database...');
    const kpiRequest = pool.request();
    const kpis = await kpiRequest.query('SELECT id, kpi FROM main_plan_objectives ORDER BY kpi');
    const kpiMap = new Map();
    kpis.recordset.forEach(row => {
      const kpiNum = row.kpi.split(/\s/)[0];
      kpiMap.set(kpiNum, row.kpi);
    });
    console.log(`✓ Loaded ${kpiMap.size} KPIs from database\n`);

    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let errors = [];

    // Process Procurement & Supply Chain
    console.log('Processing Procurement & Supply Chain...\n');
    const procurementDept = 'Procurement';
    for (const assignment of procurementAssignments) {
      const result = await processAssignment(assignment, procurementDept, kpiMap, pool);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    // Process Operations / Program Implementation
    console.log('\nProcessing Operations / Program Implementation...\n');
    const operationsDept = 'Operations';
    for (const assignment of operationsAssignments) {
      const result = await processAssignment(assignment, operationsDept, kpiMap, pool);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    // Process Finance
    console.log('\nProcessing Finance...\n');
    const financeDept = 'Finance';
    for (const assignment of financeAssignments) {
      const result = await processAssignment(assignment, financeDept, kpiMap, pool);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    // Process Administration & Legal Affairs
    console.log('\nProcessing Administration & Legal Affairs...\n');
    const administrationDept = 'Administration';
    for (const assignment of administrationAssignments) {
      const result = await processAssignment(assignment, administrationDept, kpiMap, pool);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    // Process Information Technology (IT)
    console.log('\nProcessing Information Technology (IT)...\n');
    const itDept = 'Information Technology';
    for (const assignment of itAssignments) {
      const result = await processAssignment(assignment, itDept, kpiMap, pool);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    // Process Communication
    console.log('\nProcessing Communication...\n');
    const communicationDept = 'Communication';
    for (const assignment of communicationAssignments) {
      const result = await processAssignment(assignment, communicationDept, kpiMap, pool);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    // Process Direct Fundraising / Resource Mobilization
    console.log('\nProcessing Direct Fundraising / Resource Mobilization...\n');
    const dfrDept = 'Direct Fundraising / Resource Mobilization';
    for (const assignment of dfrAssignments) {
      const result = await processAssignment(assignment, dfrDept, kpiMap, pool);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    // Process Monitoring, Evaluation & Learning (MEL)
    console.log('\nProcessing Monitoring, Evaluation & Learning (MEL)...\n');
    const melDept = 'Monitoring, Evaluation & Learning (MEL)';
    for (const assignment of melAssignments) {
      const result = await processAssignment(assignment, melDept, kpiMap, pool);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    // Process Case Management
    console.log('\nProcessing Case Management...\n');
    const caseDept = 'Case Management';
    for (const assignment of caseManagementAssignments) {
      const result = await processAssignment(assignment, caseDept, kpiMap, pool);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    // Process Business Development
    console.log('\nProcessing Business Development...\n');
    const bdDept = 'Business Development';
    for (const assignment of businessDevelopmentAssignments) {
      const result = await processAssignment(assignment, bdDept, kpiMap, pool);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    // Process Volunteer Management
    console.log('\nProcessing Volunteer Management...\n');
    const vmDept = 'Volunteer Management';
    for (const assignment of volunteerManagementAssignments) {
      const result = await processAssignment(assignment, vmDept, kpiMap, pool);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    // Process LMF Community
    console.log('\nProcessing LMF Community...\n');
    const lmfDept = 'Community';
    for (const assignment of lmfCommunityAssignments) {
      const result = await processAssignment(assignment, lmfDept, kpiMap, pool);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    // Process Security
    console.log('\nProcessing Security...\n');
    const securityDept = 'Security';
    for (const assignment of securityAssignments) {
      const result = await processAssignment(assignment, securityDept, kpiMap, pool);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    // Process Offices&P
    console.log('\nProcessing Offices&P...\n');
    const officesDept = 'Offices&P';
    for (const assignment of officesAssignments) {
      const result = await processAssignment(assignment, officesDept, kpiMap, pool);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    // Process SiS
    console.log('\nProcessing SiS...\n');
    const sisDept = 'SiS';
    for (const assignment of sisAssignments) {
      const result = await processAssignment(assignment, sisDept, kpiMap, pool);
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      if (result.error) errors.push(result.error);
    }

    console.log(`\n✓ Completed!`);
    console.log(`  - Inserted: ${totalInserted} records`);
    console.log(`  - Updated: ${totalUpdated} records`);
    console.log(`  - Skipped: ${totalSkipped} records`);
    if (errors.length > 0) {
      console.log(`  - Errors: ${errors.length}`);
      errors.forEach(err => console.log(`    ${err}`));
    }

  } catch (error) {
    console.error('❌ Failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log('\n✓ Database connection closed');
    }
  }
}

async function processAssignment(assignment, departmentName, kpiMap, pool) {
  const fullKPI = kpiMap.get(assignment.kpi);
  if (!fullKPI) {
    console.log(`⚠ Skipping KPI ${assignment.kpi} - not found in database`);
    return { inserted: 0, updated: 0, skipped: 1, error: null };
  }

  const rasci = parseRASCI(assignment.rasci);
  
  try {
    // Check if record already exists
    const checkRequest = pool.request();
    checkRequest.input('kpi', sql.NVarChar, fullKPI);
    checkRequest.input('department', sql.NVarChar, departmentName);
    const existing = await checkRequest.query(
      'SELECT * FROM rasci_metrics WHERE kpi = @kpi AND department = @department'
    );

    if (existing.recordset && existing.recordset.length > 0) {
      // Update existing record
      const updateRequest = pool.request();
      updateRequest.input('kpi', sql.NVarChar, fullKPI);
      updateRequest.input('department', sql.NVarChar, departmentName);
      updateRequest.input('responsible', sql.Bit, rasci.responsible);
      updateRequest.input('accountable', sql.Bit, rasci.accountable);
      updateRequest.input('supportive', sql.Bit, rasci.supportive);
      updateRequest.input('consulted', sql.Bit, rasci.consulted);
      updateRequest.input('informed', sql.Bit, rasci.informed);

      await updateRequest.query(`
        UPDATE rasci_metrics
        SET 
          responsible = @responsible,
          accountable = @accountable,
          supportive = @supportive,
          consulted = @consulted,
          informed = @informed
        WHERE kpi = @kpi AND department = @department
      `);
      console.log(`✓ Updated: ${departmentName} - ${assignment.kpi} - ${assignment.rasci}`);
      return { inserted: 0, updated: 1, skipped: 0, error: null };
    } else {
      // Insert new record
      const insertRequest = pool.request();
      insertRequest.input('kpi', sql.NVarChar, fullKPI);
      insertRequest.input('department', sql.NVarChar, departmentName);
      insertRequest.input('responsible', sql.Bit, rasci.responsible);
      insertRequest.input('accountable', sql.Bit, rasci.accountable);
      insertRequest.input('supportive', sql.Bit, rasci.supportive);
      insertRequest.input('consulted', sql.Bit, rasci.consulted);
      insertRequest.input('informed', sql.Bit, rasci.informed);

      await insertRequest.query(`
        INSERT INTO rasci_metrics (kpi, department, responsible, accountable, supportive, consulted, informed)
        VALUES (@kpi, @department, @responsible, @accountable, @supportive, @consulted, @informed)
      `);
      console.log(`✓ Inserted: ${departmentName} - ${assignment.kpi} - ${assignment.rasci}`);
      return { inserted: 1, updated: 0, skipped: 0, error: null };
    }
  } catch (error) {
    const errorMsg = `${departmentName} - KPI ${assignment.kpi}: ${error.message}`;
    console.error(`❌ Error: ${errorMsg}`);
    return { inserted: 0, updated: 0, skipped: 0, error: errorMsg };
  }
}

addDepartmentRASCI().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

