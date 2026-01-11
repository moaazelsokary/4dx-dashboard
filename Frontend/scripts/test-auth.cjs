require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');
const bcrypt = require('bcryptjs');

// dotenv may not handle spaces around =, so let's trim values
const getEnv = (key) => {
  const value = process.env[key];
  return value ? value.trim().replace(/^["']|["']$/g, '') : undefined;
};

// Parse server and port
const serverValue = getEnv('SERVER') || getEnv('VITE_SERVER') || '';
let server, port;
if (serverValue.includes(',')) {
  [server, port] = serverValue.split(',').map(s => s.trim());
  port = parseInt(port) || 1433;
} else {
  server = serverValue;
  port = 1433;
}

const config = {
  server: server,
  port: port,
  database: getEnv('DATABASE') || getEnv('VITE_DATABASE'),
  user: getEnv('UID') || getEnv('VITE_UID') || getEnv('VIE_UID') || getEnv('VITE_USER'),
  password: getEnv('PWD') || getEnv('VITE_PWD'),
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

async function testAuth() {
  try {
    console.log('Connecting to SQL Server...');
    const pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server\n');

    // Test user credentials
    const testUsername = 'security';
    const testPassword = 'Life@0000';

    console.log(`Testing authentication for user: ${testUsername}`);
    console.log(`Password: ${testPassword}\n`);

    // Query user from database
    const request = pool.request();
    request.input('username', sql.NVarChar, testUsername);
    
    const result = await request.query(`
      SELECT 
        id,
        username,
        password_hash,
        role,
        departments,
        is_active
      FROM users
      WHERE username = @username
    `);

    if (result.recordset.length === 0) {
      console.error('❌ User not found in database');
      await pool.close();
      process.exit(1);
    }

    const user = result.recordset[0];
    console.log('✅ User found in database:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Departments: ${user.departments}`);
    console.log(`   Is Active: ${user.is_active}`);
    console.log(`   Password Hash: ${user.password_hash.substring(0, 20)}...\n`);

    if (!user.is_active) {
      console.error('❌ User is not active');
      await pool.close();
      process.exit(1);
    }

    // Test password verification
    console.log('Testing password verification...');
    const passwordValid = await bcrypt.compare(testPassword, user.password_hash);
    
    if (passwordValid) {
      console.log('✅ Password verification successful!');
    } else {
      console.error('❌ Password verification failed!');
      console.log('\nTrying to rehash the password...');
      
      // Rehash and update
      const saltRounds = 10;
      const newHash = await bcrypt.hash(testPassword, saltRounds);
      
      const updateRequest = pool.request();
      updateRequest.input('username', sql.NVarChar, testUsername);
      updateRequest.input('password_hash', sql.NVarChar, newHash);
      
      await updateRequest.query(`
        UPDATE users 
        SET password_hash = @password_hash,
            updated_at = GETDATE()
        WHERE username = @username
      `);
      
      console.log('✅ Password hash updated in database');
      
      // Test again
      const newPasswordValid = await bcrypt.compare(testPassword, newHash);
      if (newPasswordValid) {
        console.log('✅ Password verification now successful after update!');
      } else {
        console.error('❌ Password verification still failed after update');
      }
    }

    await pool.close();
    console.log('\n✅ Test completed');
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testAuth();
