# Full Browser Console Debug Script

Run this COMPLETE script in the browser console while logged in as user "case" on https://lifemakers.netlify.app/department-objectives

## Complete Diagnostic Script

```javascript
(async function() {
  console.log('🔍 FULL LOCK DIAGNOSTIC TEST\n');
  console.log('='.repeat(60));
  
  // Step 1: Check Current User
  const userData = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');
  
  console.log('\n📋 STEP 1: Current User Info');
  console.log('User Data:', userData);
  console.log('User ID:', userData?.userId || userData?.id);
  console.log('Username:', userData?.username);
  console.log('Has Token:', !!token);
  
  // Decode JWT
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      console.log('\nJWT Payload:', payload);
      console.log('JWT User ID (userId):', payload.userId);
      console.log('JWT User ID (id):', payload.id);
    } catch (e) {
      console.error('Error decoding JWT:', e);
    }
  }
  
  // Step 2: Get All Locks
  console.log('\n📋 STEP 2: Fetching All Active Locks');
  const locksResponse = await fetch('/.netlify/functions/config-api/locks', {
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    }
  });
  const locksData = await locksResponse.json();
  console.log('Locks Response:', locksData);
  
  if (locksData.success && locksData.data) {
    locksData.data.forEach(lock => {
      console.log(`\nLock ID ${lock.id}:`, {
        scope_type: lock.scope_type,
        user_scope: lock.user_scope,
        user_ids: lock.user_ids,
        lock_annual_target: lock.lock_annual_target,
        lock_monthly_target: lock.lock_monthly_target,
        lock_all_other_fields: lock.lock_all_other_fields,
        is_active: lock.is_active
      });
      
      // Check if current user matches
      if (lock.user_scope === 'specific' && lock.user_ids) {
        const userIds = Array.isArray(lock.user_ids) ? lock.user_ids : JSON.parse(lock.user_ids);
        const currentUserId = userData?.userId || userData?.id;
        const matches = userIds.includes(Number(currentUserId));
        console.log(`  → User Match: ${matches ? '✅ YES' : '❌ NO'} (current: ${currentUserId}, locked: ${JSON.stringify(userIds)})`);
      }
    });
  }
  
  // Step 3: Test Lock Check API Directly
  console.log('\n📋 STEP 3: Testing Lock Check API');
  const testObjectiveIds = [1, 12, 485]; // Test multiple objectives
  
  for (const objId of testObjectiveIds) {
    console.log(`\n--- Testing Objective ID: ${objId} ---`);
    
    // Test target field
    const targetResponse = await fetch(`/.netlify/functions/config-api/locks/check?field_type=target&department_objective_id=${objId}`, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    });
    const targetData = await targetResponse.json();
    console.log(`Target Field Check:`, targetData);
    if (targetData.success) {
      console.log(`  → Is Locked: ${targetData.data.is_locked ? '🔒 YES' : '🔓 NO'}`);
      if (targetData.data.is_locked) {
        console.log(`  → Reason: ${targetData.data.lock_reason}`);
        console.log(`  → Lock ID: ${targetData.data.lock_id}`);
      }
    }
    
    // Test all_fields
    const allFieldsResponse = await fetch(`/.netlify/functions/config-api/locks/check?field_type=all_fields&department_objective_id=${objId}`, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    });
    const allFieldsData = await allFieldsResponse.json();
    console.log(`All Fields Check:`, allFieldsData);
    if (allFieldsData.success) {
      console.log(`  → Is Locked: ${allFieldsData.data.is_locked ? '🔒 YES' : '🔓 NO'}`);
      if (allFieldsData.data.is_locked) {
        console.log(`  → Reason: ${allFieldsData.data.lock_reason}`);
        console.log(`  → Lock ID: ${allFieldsData.data.lock_id}`);
      }
    }
  }
  
  // Step 4: Check Netlify Function Logs URL
  console.log('\n📋 STEP 4: Next Steps');
  console.log('1. Check Netlify Function Logs:');
  console.log('   Go to: Netlify Dashboard → Functions → config-api → Logs');
  console.log('   Look for messages starting with:');
  console.log('   - [Config API] User object normalized:');
  console.log('   - [Lock Check API] Request received:');
  console.log('   - [Lock Check] User scope check:');
  console.log('\n2. Verify Deployment:');
  console.log('   Check if commit 1609a43 is deployed');
  console.log('   If not, wait for deployment or trigger redeploy');
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Diagnostic Complete!');
})();
```

## Quick One-Liner Test

If you just want to see what the API returns for a specific objective:

```javascript
// Replace 485 with any objective ID
fetch('/.netlify/functions/config-api/locks/check?field_type=target&department_objective_id=485', {
  headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
}).then(r => r.json()).then(d => console.log('Result:', d));
```
