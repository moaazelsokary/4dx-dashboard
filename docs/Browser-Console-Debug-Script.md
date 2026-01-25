# Browser Console Debug Script for Lock Rules

Run this in the browser console (F12) on https://lifemakers.netlify.app/department-objectives while logged in as user "case":

## Step 1: Check Current User ID

```javascript
// Get current user from localStorage
const userData = JSON.parse(localStorage.getItem('user'));
const token = localStorage.getItem('token');

console.log('=== CURRENT USER INFO ===');
console.log('User Data:', userData);
console.log('User ID from localStorage:', userData?.userId || userData?.id);
console.log('Username:', userData?.username);
console.log('Role:', userData?.role);

// Decode JWT token to see what's inside
if (token) {
  try {
    const tokenParts = token.split('.');
    const payload = JSON.parse(atob(tokenParts[1]));
    console.log('\n=== JWT TOKEN PAYLOAD ===');
    console.log('Decoded Token:', payload);
    console.log('User ID in Token (userId):', payload.userId);
    console.log('User ID in Token (id):', payload.id);
  } catch (e) {
    console.error('Error decoding token:', e);
  }
}
```

## Step 2: Check Lock Rules in Database

```javascript
// Fetch all active locks
fetch('/.netlify/functions/config-api/locks', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token'),
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(data => {
  console.log('\n=== ALL ACTIVE LOCKS ===');
  if (data.success && data.data) {
    data.data.forEach(lock => {
      console.log(`\nLock ID: ${lock.id}`);
      console.log('  Scope Type:', lock.scope_type);
      console.log('  User Scope:', lock.user_scope);
      console.log('  User IDs:', lock.user_ids, '(type:', typeof lock.user_ids, ')');
      console.log('  KPI Scope:', lock.kpi_scope);
      console.log('  Objective Scope:', lock.objective_scope);
      console.log('  Lock Annual Target:', lock.lock_annual_target);
      console.log('  Lock Monthly Target:', lock.lock_monthly_target);
      console.log('  Lock All Other Fields:', lock.lock_all_other_fields);
      console.log('  Is Active:', lock.is_active);
      
      // Check if current user is in locked users
      if (lock.user_scope === 'specific' && lock.user_ids) {
        try {
          const userIds = Array.isArray(lock.user_ids) ? lock.user_ids : JSON.parse(lock.user_ids);
          const currentUserId = userData?.userId || userData?.id;
          const matches = userIds.includes(Number(currentUserId));
          console.log('  ✅ User Match:', matches ? 'YES' : 'NO', `(current: ${currentUserId}, locked: ${JSON.stringify(userIds)})`);
        } catch (e) {
          console.log('  ❌ Error parsing user_ids:', e);
        }
      }
    });
  } else {
    console.error('Failed to fetch locks:', data);
  }
})
.catch(err => console.error('Error fetching locks:', err));
```

## Step 3: Test Lock Check API Directly

```javascript
// Replace 485 with an actual objective ID from the page
const objectiveId = 485; // Change this to a real objective ID

console.log('\n=== TESTING LOCK CHECK API ===');
console.log('Testing objective ID:', objectiveId);

// Test different field types
const fieldTypes = ['target', 'monthly_target', 'monthly_actual', 'all_fields'];

fieldTypes.forEach(fieldType => {
  fetch(`/.netlify/functions/config-api/locks/check?field_type=${fieldType}&department_objective_id=${objectiveId}`, {
    headers: {
      'Authorization': 'Bearer ' + localStorage.getItem('token'),
      'Content-Type': 'application/json'
    }
  })
  .then(r => r.json())
  .then(data => {
    console.log(`\n${fieldType}:`, data);
    if (data.success && data.data) {
      console.log(`  Is Locked: ${data.data.is_locked ? '🔒 YES' : '🔓 NO'}`);
      if (data.data.is_locked) {
        console.log(`  Reason: ${data.data.lock_reason}`);
        console.log(`  Lock ID: ${data.data.lock_id}`);
      }
    }
  })
  .catch(err => console.error(`Error checking ${fieldType}:`, err));
});
```

## Step 4: Check Netlify Function Logs

The backend should be logging debug information. Check Netlify function logs in the Netlify dashboard to see:
- What user ID is being received
- What lock rules are being checked
- Why the lock check is passing or failing

Look for log messages like:
- `[Lock Check] Processing hierarchical lock: id=11, user_scope=specific, user_ids=[8], current_user_id=...`
- `[Lock Check] User scope check: lock_id=11, current_user_id=..., locked_user_ids=[8], matches=...`

## Common Issues to Check:

1. **User ID Mismatch**: 
   - JWT token has `userId: 8` but the code expects `user.id`
   - Solution: The code normalizes this (line 447-448 in config-api.js), but verify it's working

2. **Deployment Not Complete**:
   - Check Netlify deployment status
   - The fix might not be deployed yet

3. **Cache Issue**:
   - Hard refresh the page (Ctrl+Shift+R)
   - Clear browser cache

4. **Lock Rule Not Active**:
   - Verify `is_active = 1` in database
   - Verify lock rule ID 11 exists and is active
