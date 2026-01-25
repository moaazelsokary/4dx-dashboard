# Browser Console - Authentication Check Script

Run this FIRST to check if you're properly authenticated:

```javascript
// Step 1: Check if you're logged in
console.log('=== AUTHENTICATION CHECK ===\n');

const userData = localStorage.getItem('user');
const token = localStorage.getItem('token');

console.log('1. User Data in localStorage:', userData ? '✅ Found' : '❌ Missing');
console.log('2. Token in localStorage:', token ? '✅ Found' : '❌ Missing');

if (userData) {
  try {
    const user = JSON.parse(userData);
    console.log('\nUser Info:');
    console.log('  Username:', user.username);
    console.log('  User ID:', user.userId || user.id);
    console.log('  Role:', user.role);
  } catch (e) {
    console.error('Error parsing user data:', e);
  }
}

if (token) {
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      console.log('\nJWT Token Info:');
      console.log('  User ID (userId):', payload.userId);
      console.log('  User ID (id):', payload.id);
      console.log('  Username:', payload.username);
      console.log('  Role:', payload.role);
      console.log('  Expires:', payload.exp ? new Date(payload.exp * 1000).toLocaleString() : 'Unknown');
      
      // Check if expired
      if (payload.exp) {
        const isExpired = Date.now() > payload.exp * 1000;
        console.log('  Status:', isExpired ? '❌ EXPIRED' : '✅ Valid');
      }
      
      // Compare with lock rule
      console.log('\n=== LOCK RULE CHECK ===');
      console.log('Lock rule expects user ID: 8');
      console.log('Your JWT has user ID:', payload.userId || payload.id);
      console.log('Match:', (payload.userId === 8 || payload.id === 8) ? '✅ YES' : '❌ NO');
    } else {
      console.error('Invalid token format (should have 3 parts separated by dots)');
    }
  } catch (e) {
    console.error('Error decoding token:', e);
  }
} else {
  console.error('\n❌ No token found! You need to log in first.');
  console.log('Go to: https://lifemakers.netlify.app/ and sign in as user "case"');
}
```

## If Token is Missing or Expired:

1. **Sign out and sign back in:**
   - Click "Sign Out" button
   - Go to the login page
   - Sign in as user "case" with the correct password

2. **Clear localStorage and reload:**
```javascript
// Clear everything and reload
localStorage.clear();
sessionStorage.clear();
location.reload();
```

## After Authentication is Fixed:

Run the lock check test again:

```javascript
// Test lock check API
fetch('/.netlify/functions/config-api/locks/check?field_type=target&department_objective_id=12', {
  headers: { 
    'Authorization': 'Bearer ' + localStorage.getItem('token'),
    'Content-Type': 'application/json'
  }
})
.then(r => {
  console.log('Response Status:', r.status);
  if (!r.ok) {
    return r.json().then(err => {
      console.error('API Error:', err);
      throw new Error(err.error || 'Request failed');
    });
  }
  return r.json();
})
.then(d => {
  console.log('\n=== FULL API RESPONSE ===');
  console.log(JSON.stringify(d, null, 2));
  if (d.data?._debug) {
    console.log('\n=== DEBUG INFO ===');
    console.log('User ID Used:', d.data._debug.user_id_used);
    console.log('Objective ID:', d.data._debug.objective_id);
    console.log('Field Type:', d.data._debug.field_type);
  }
  console.log('\n=== LOCK STATUS ===');
  console.log('Is Locked:', d.data?.is_locked ? '🔒 YES' : '🔓 NO');
  if (d.data?.is_locked) {
    console.log('Reason:', d.data.lock_reason);
    console.log('Lock ID:', d.data.lock_id);
  } else {
    console.log('Why not locked? Check the debug info above.');
  }
})
.catch(err => {
  console.error('Error:', err);
});
```
