# Lock Rule User Matching Fix

## Issue
Lock rules with `user_scope === 'specific'` were not affecting users because the lock checking logic was matching by **department** instead of checking if the **current user** (the one trying to edit) is in the locked users list.

## Root Cause
In `config-api.js`, the `checkLockStatus` function was using department-based matching logic (checking if the objective's department matches the departments of locked users) instead of directly checking if the current user ID is in the locked users list.

## Fixes Applied

### 1. Fixed User Matching in `config-api.js` (Main Fix)
**File:** `Frontend/netlify/functions/config-api.js`
**Lines:** 172-192

**Before:**
- When `user_scope === 'specific'`, the code was:
  1. Getting departments of locked users
  2. Checking if the objective's department matches those departments
  3. This meant ANY user in those departments would be affected, not just the specific locked users

**After:**
- When `user_scope === 'specific'`, the code now:
  1. Parses the `user_ids` JSON array from the lock
  2. Directly checks if the current `userId` (the user trying to edit) is in that array
  3. This correctly locks fields only for the specific users in the lock rule

**Code Change:**
```javascript
// OLD (incorrect - department matching):
const userResult = await pool.request().query(`
  SELECT id, departments FROM users WHERE id IN (${userIdsStr})
`);
// ... complex department matching logic ...

// NEW (correct - direct user ID matching):
const userIds = JSON.parse(lock.user_ids);
if (Array.isArray(userIds) && userIds.length > 0) {
  userMatches = userIds.includes(Number(userId));
}
```

### 2. Fixed Inconsistency in `wig-api.js`
**File:** `Frontend/netlify/functions/wig-api.js`
**Line:** 817

**Before:**
- When `user_scope === 'none'`, it set `userMatches = false` (would never match)

**After:**
- When `user_scope === 'none'`, it sets `userMatches = true` (skips user filter, matches all users)
- This is consistent with the UI label "No Users (skip user filter)" and with `config-api.js`

## Testing Instructions

### 1. Test User-Specific Lock
1. Log in as an Admin/CEO user
2. Go to Configuration → Lock Rules
3. Create a new lock rule:
   - **User Scope:** Specific Users
   - **Select:** A specific user (e.g., "testuser")
   - **KPI Scope:** All
   - **Objective Scope:** All
   - **Lock Fields:** Check "Annual Target"
4. Save the lock rule
5. Log out and log in as the locked user ("testuser")
6. Try to edit an annual target field
7. **Expected:** The field should be locked (read-only, lock icon visible)
8. Log in as a different user
9. Try to edit the same field
10. **Expected:** The field should NOT be locked (editable)

### 2. Test "No Users" Scope
1. Create a lock rule with:
   - **User Scope:** No Users (skip user filter)
   - **KPI Scope:** All
   - **Objective Scope:** All
   - **Lock Fields:** Check "Monthly Target"
2. **Expected:** The lock should apply to ALL users (since user filter is skipped)

### 3. Verify Database
Run this SQL query to verify locks are saved correctly:
```sql
SELECT 
  id,
  scope_type,
  user_scope,
  user_ids,
  kpi_scope,
  kpi_ids,
  objective_scope,
  objective_ids,
  lock_annual_target,
  lock_monthly_target,
  lock_monthly_actual,
  is_active
FROM field_locks
WHERE is_active = 1
ORDER BY created_at DESC
```

Verify:
- `user_scope` is 'specific', 'all', or 'none'
- `user_ids` is a valid JSON array when `user_scope = 'specific'` (e.g., `[1, 2, 3]`)
- Field lock flags are set correctly (1 = locked, 0 = not locked)

## Files Changed
1. `Frontend/netlify/functions/config-api.js` - Fixed user matching logic
2. `Frontend/netlify/functions/wig-api.js` - Fixed 'none' scope handling

## Deployment
After deploying to Netlify:
1. The fix will be active immediately
2. Existing lock rules will work correctly with the new logic
3. No database migration needed (data structure unchanged)

## Verification Checklist
- [x] Code fix applied to `config-api.js`
- [x] Code fix applied to `wig-api.js`
- [ ] Tested in browser with specific user lock
- [ ] Tested in browser with "all users" lock
- [ ] Tested in browser with "no users" lock
- [ ] Verified database has correct lock data
- [ ] Deployed to Netlify
- [ ] Verified production behavior

## Notes
- The fix maintains backward compatibility with existing lock rules
- Legacy scope types (specific_users, department_kpi, etc.) are unaffected
- The fix only affects hierarchical scope type locks with `user_scope === 'specific'`
