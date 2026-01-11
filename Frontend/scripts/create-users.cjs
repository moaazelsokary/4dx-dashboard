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

// Default users to create
const defaultUsers = [
  {
    username: 'CEO',
    password: 'Life@2025',
    role: 'CEO',
    departments: JSON.stringify(['all']),
  },
  {
    username: 'admin',
    password: 'Life@2025',
    role: 'CEO',
    departments: JSON.stringify(['all']),
  },
  {
    username: 'hr',
    password: 'Life@0000',
    role: 'department',
    departments: JSON.stringify(['hr']),
  },
  {
    username: 'it',
    password: 'Life@0000',
    role: 'department',
    departments: JSON.stringify(['it']),
  },
  {
    username: 'operations',
    password: 'Life@0000',
    role: 'department',
    departments: JSON.stringify(['operations']),
  },
  {
    username: 'communication',
    password: 'Life@0000',
    role: 'department',
    departments: JSON.stringify(['communication']),
  },
  {
    username: 'dfr',
    password: 'Life@0000',
    role: 'department',
    departments: JSON.stringify(['dfr']),
  },
  {
    username: 'case',
    password: 'Life@0000',
    role: 'department',
    departments: JSON.stringify(['case']),
  },
  {
    username: 'bdm',
    password: 'Life@0000',
    role: 'department',
    departments: JSON.stringify(['bdm']),
  },
  {
    username: 'security',
    password: 'Life@0000',
    role: 'department',
    departments: JSON.stringify(['security']),
  },
  {
    username: 'procurement',
    password: 'Life@0000',
    role: 'department',
    departments: JSON.stringify(['procurement']),
  },
  {
    username: 'offices',
    password: 'Life@0000',
    role: 'department',
    departments: JSON.stringify(['offices']),
  },
  {
    username: 'community',
    password: 'Life@0000',
    role: 'department',
    departments: JSON.stringify(['community']),
  },
  {
    username: 'volunteers',
    password: 'Life@0000',
    role: 'department',
    departments: JSON.stringify(['volunteers']),
  },
  {
    username: 'finance',
    password: 'Life@0000',
    role: 'department',
    departments: JSON.stringify(['finance']),
  },
  {
    username: 'administrative',
    password: 'Life@0000',
    role: 'department',
    departments: JSON.stringify(['administrative']),
  },
  {
    username: 'project',
    password: 'Life@0000',
    role: 'project',
    departments: JSON.stringify(['project']),
  },
];

async function createUsers() {
  try {
    console.log('Connecting to SQL Server...');
    console.log('Server:', config.server);
    console.log('Database:', config.database);
    console.log('User:', config.user);
    
    if (!config.server || !config.database || !config.user || !config.password) {
      throw new Error('Missing database connection details. Please check your .env.local file.');
    }

    const pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server\n');

    // Ensure users table exists
    console.log('Checking users table...');
    const tableCheck = await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
      BEGIN
        CREATE TABLE users (
          id INT IDENTITY(1,1) PRIMARY KEY,
          username NVARCHAR(100) NOT NULL UNIQUE,
          password_hash NVARCHAR(255) NOT NULL,
          role NVARCHAR(50) NOT NULL DEFAULT 'Viewer',
          departments NVARCHAR(MAX),
          is_active BIT NOT NULL DEFAULT 1,
          created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
          updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
          last_login DATETIME2 NULL,
          failed_login_attempts INT NOT NULL DEFAULT 0,
          locked_until DATETIME2 NULL
        );
        CREATE INDEX IX_users_username ON users(username);
        CREATE INDEX IX_users_role ON users(role);
        PRINT 'Users table created';
      END
    `);
    console.log('✅ Users table ready\n');

    // Create or update users
    for (const user of defaultUsers) {
      try {
        // Hash the password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(user.password, saltRounds);

        // Check if user exists
        const checkRequest = pool.request();
        checkRequest.input('username', sql.NVarChar, user.username);
        const existingUser = await checkRequest.query(`
          SELECT id FROM users WHERE username = @username
        `);

        if (existingUser.recordset.length > 0) {
          // Update existing user
          const updateRequest = pool.request();
          updateRequest.input('username', sql.NVarChar, user.username);
          updateRequest.input('password_hash', sql.NVarChar, passwordHash);
          updateRequest.input('role', sql.NVarChar, user.role);
          updateRequest.input('departments', sql.NVarChar, user.departments);
          
          await updateRequest.query(`
            UPDATE users 
            SET password_hash = @password_hash,
                role = @role,
                departments = @departments,
                is_active = 1,
                updated_at = GETDATE()
            WHERE username = @username
          `);
          console.log(`✅ Updated user: ${user.username} (${user.role})`);
        } else {
          // Insert new user
          const insertRequest = pool.request();
          insertRequest.input('username', sql.NVarChar, user.username);
          insertRequest.input('password_hash', sql.NVarChar, passwordHash);
          insertRequest.input('role', sql.NVarChar, user.role);
          insertRequest.input('departments', sql.NVarChar, user.departments);
          
          await insertRequest.query(`
            INSERT INTO users (username, password_hash, role, departments, is_active)
            VALUES (@username, @password_hash, @role, @departments, 1)
          `);
          console.log(`✅ Created user: ${user.username} (${user.role})`);
        }
      } catch (error) {
        console.error(`❌ Error processing user ${user.username}:`, error.message);
      }
    }

    console.log('\n✅ All users processed successfully!');
    console.log('\nYou can now sign in with:');
    console.log('  - CEO/admin: Life@2025');
    console.log('  - All other users: Life@0000');
    
    await pool.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

createUsers();
