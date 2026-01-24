# Lock System Debugging Guide

## 🔍 Step-by-Step Debugging

### Step 1: Check the Lock in Database

Open browser console (F12) and run this in the Console tab to see your lock details:

```javascript
fetch('/.netlify/functions/config-api/locks', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token'),
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(data => {
  console.log('All Active Locks:', data);
  data.data.forEach(lock => {
    console.log(`Lock ID ${lock.id}:`, {
      lock_type: lock.lock_type,
      scope_type: lock.scope_type,
      user_ids: lock.user_ids,
      exclude_monthly: lock.exclude_monthly,
      exclude_annual_target: lock.exclude_annual_target,
      is_active: lock.is_active
    });
  });
});
```

**What to check:**
- ✅ `scope_type` should be `'all_department_objectives'`
- ✅ `lock_type` should be `'all_department_objectives'`
- ✅ `user_ids` should be an array like `[5]` (the user ID)
- ✅ `exclude_monthly` should be `1` (true)
- ✅ `exclude_annual_target` should be `1` (true)
- ✅ `is_active` should be `1` (true)

### Step 2: Check User ID

Run this to see what user ID you're logged in as:

```javascript
const userData = JSON.parse(localStorage.getItem('user'));
console.log('Current User:', {
  userId: userData.userId,
  username: userData.username,
  role: userData.role
});
```

**Important**: The `userId` here MUST match one of the IDs in the lock's `user_ids` array!

### Step 3: Open Edit Modal and Check Console

1. Go to Department Objectives page
2. Find a **Direct** type objective
3. Click **Edit** button
4. Open Console (F12)

**Look for these messages:**

#### ✅ Good Messages (Lock is Working):
```
[ObjectiveFormModal] Computed objective type: {
  open: true,
  objectiveId: 123,
  rawType: "Direct",
  finalType: "Direct"
}

[Lock Check] Checking all_fields for objective 123
[Lock Check] Result for all_fields: {
  is_locked: true,
  lock_reason: "Locked by All Department Objectives"
}

[Lock Check] Hook state for all_fields: {
  enabled: true,
  isLocked: true
}
```

#### ❌ Bad Messages (Lock NOT Working):

**Problem 1: Wrong Type**
```
[ObjectiveFormModal] Computed objective type: {
  finalType: "In direct"  ← Not "Direct"!
}
```
**Solution**: Locks only work on 'Direct' type objectives

**Problem 2: Lock Check Not Running**
```
[Lock Check] Hook state for all_fields: {
  enabled: false  ← Should be true!
}
```
**Solution**: The `useMemo` didn't compute type correctly

**Problem 3: Lock Not Found**
```
[Lock Check] Result for all_fields: {
  is_locked: false  ← Should be true!
}
```
**Solution**: Check if user_ids in lock matches your userId

### Step 4: Test Backend Directly

Run this to test the lock check API directly:

```javascript
// Replace 123 with your actual objective ID
const objectiveId = 123;

fetch(`/.netlify/functions/config-api/locks/check?field_type=all_fields&department_objective_id=${objectiveId}`, {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token'),
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(data => {
  console.log('Backend Lock Check Result:', data);
});
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "is_locked": true,
    "lock_reason": "Locked by All Department Objectives",
    "lock_id": 1,
    "scope_type": "all_department_objectives"
  }
}
```

## 🐛 Common Issues and Fixes

### Issue 1: User ID Mismatch

**Symptom**: Lock exists but not working
**Cause**: The user_ids in the lock don't match the logged-in user

**How to Fix:**
1. Check current user ID: `JSON.parse(localStorage.getItem('user')).userId`
2. Check lock user_ids: See Step 1 above
3. If they don't match:
   - Delete the old lock
   - Create new lock with correct user ID

**To find correct user ID:**
```javascript
fetch('/.netlify/functions/config-api/users', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token')
  }
})
.then(r => r.json())
.then(data => {
  console.log('All Users:', data.data);
  const caseUser = data.data.find(u => u.username === 'case');
  console.log('Case User ID:', caseUser?.id);
});
```

### Issue 2: Wrong Objective Type

**Symptom**: Locks only work on some objectives, not others
**Cause**: Only 'Direct' type objectives can be locked

**How to Check:**
In the objectives table, check the "Type" column. Only rows with "Direct" should be lockable.

### Issue 3: Cache Issue

**Symptom**: Lock was created but changes not showing
**Cause**: Browser cache

**How to Fix:**
1. Hard refresh: `Ctrl + Shift + R`
2. Clear browser cache completely
3. Close and reopen browser

### Issue 4: Lock Not Active

**Symptom**: Lock exists but not working
**Cause**: `is_active = 0`

**How to Check:**
```javascript
// See Step 1 - check if is_active: 1
```

## 📋 Full Diagnostic Checklist

Run through this checklist and send me the results:

```javascript
// === FULL DIAGNOSTIC ===
(async () => {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user'));
  
  console.log('=== USER INFO ===');
  console.log('User ID:', user.userId);
  console.log('Username:', user.username);
  console.log('Role:', user.role);
  
  console.log('\n=== LOCKS ===');
  const locks = await fetch('/.netlify/functions/config-api/locks', {
    headers: { 'Authorization': 'Bearer ' + token }
  }).then(r => r.json());
  
  locks.data.forEach(lock => {
    console.log(`Lock ${lock.id}:`, {
      scope: lock.scope_type,
      users: lock.user_ids,
      excludeMonthly: lock.exclude_monthly,
      excludeTarget: lock.exclude_annual_target,
      active: lock.is_active,
      matchesMe: lock.user_ids?.includes(user.userId)
    });
  });
  
  console.log('\n=== TEST OBJECTIVE ===');
  console.log('Now click Edit on a Direct objective and check the console logs above');
})();
```

## 📸 What to Send Me

If still not working, send me:

1. **Screenshot of lock details** from Configuration page
2. **Screenshot of console output** from the Full Diagnostic script above
3. **Screenshot of console logs** when opening edit modal
4. **Tell me**: What is your username? What objective ID are you testing?

I'll be able to pinpoint the exact issue from these details!
