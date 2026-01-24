# Lock System Enhancement - Separate Monthly Exclusions & Type Restrictions

## 🎯 Changes Summary

### 1. **Separate Monthly Exclusions**

**Before:**
- Single `exclude_monthly` checkbox controlled BOTH monthly target and monthly actual

**After:**
- ✅ `exclude_monthly_target` - Independent control for monthly target
- ✅ `exclude_monthly_actual` - Independent control for monthly actual
- ✅ `exclude_annual_target` - Unchanged (annual target control)

### 2. **Type Restrictions Per Field**

**New Behavior:**

| Field | Can Lock On Types |
|-------|------------------|
| `monthly_actual` | **Direct ONLY** |
| `monthly_target` | **Direct AND In direct** |
| `activity_target` | **Direct AND In direct** |
| `activity` | **Direct AND In direct** |
| `responsible_person` | **Direct AND In direct** |
| `mov` | **Direct AND In direct** |

**Reason:** 
- Monthly actual is based on real execution data which only comes from Direct objectives
- All other fields can have targets/values set for both Direct and In direct types

## 📊 Database Changes

### Migration Script: `migrate-separate-monthly-exclusions.sql`

```sql
-- Step 1: Add new columns
ALTER TABLE field_locks ADD exclude_monthly_target BIT NOT NULL DEFAULT 0;
ALTER TABLE field_locks ADD exclude_monthly_actual BIT NOT NULL DEFAULT 0;

-- Step 2: Migrate data (if exclude_monthly = 1, set both new columns to 1)
UPDATE field_locks 
SET exclude_monthly_target = exclude_monthly,
    exclude_monthly_actual = exclude_monthly
WHERE exclude_monthly = 1;

-- Step 3: Drop old column
ALTER TABLE field_locks DROP COLUMN exclude_monthly;
```

### Updated Schema

```sql
CREATE TABLE field_locks (
  id INT IDENTITY(1,1) PRIMARY KEY,
  lock_type NVARCHAR(50) NOT NULL,
  scope_type NVARCHAR(50) NOT NULL,
  user_ids NVARCHAR(MAX) NULL,
  kpi NVARCHAR(500) NULL,
  department_id INT NULL,
  exclude_monthly_target BIT NOT NULL DEFAULT 0, -- NEW
  exclude_monthly_actual BIT NOT NULL DEFAULT 0, -- NEW
  exclude_annual_target BIT NOT NULL DEFAULT 0,
  is_active BIT NOT NULL DEFAULT 1,
  created_by INT NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
```

## 🔧 Backend Changes

### `config-api.js` - Lock Checking Logic

**Type Check Added:**
```javascript
const objectiveType = deptObjResult.recordset[0].type;
const isDirectType = objectiveType && objectiveType.includes('Direct');

// monthly_actual can ONLY be locked for Direct type objectives
if (fieldType === 'monthly_actual' && !isDirectType) {
  return { is_locked: false };
}
```

**Updated Exclusion Logic:**
```javascript
case 'all_department_objectives':
  if (userMatches) {
    if (fieldType === 'monthly_target') {
      if (lock.exclude_monthly_target === 0) {
        matches = true; // Locked
      }
    } else if (fieldType === 'monthly_actual') {
      if (lock.exclude_monthly_actual === 0) {
        matches = true; // Locked
      }
    } else if (fieldType === 'target') {
      if (lock.exclude_annual_target === 0) {
        matches = true; // Locked
      }
    } else if (fieldType === 'all_fields') {
      matches = true; // Always locked
    }
  }
  break;
```

**Updated API Endpoints:**
- `POST /api/config/locks` - Now accepts `exclude_monthly_target` and `exclude_monthly_actual`
- `PUT /api/config/locks/:id` - Now updates both fields separately
- `POST /api/config/locks/bulk` - Batch operations support new fields

## 🎨 Frontend Changes

### TypeScript Types (`config.ts`)

```typescript
export interface FieldLock {
  id: number;
  lock_type: LockType;
  scope_type: ScopeType;
  user_ids: number[] | null;
  kpi: string | null;
  department_id: number | null;
  exclude_monthly_target: boolean; // NEW
  exclude_monthly_actual: boolean; // NEW
  exclude_annual_target: boolean;
  is_active: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface LockRuleFormData {
  lock_type?: LockType | LockType[];
  scope_type: ScopeType;
  user_ids?: number[];
  kpi?: string;
  department_id?: number;
  exclude_monthly_target?: boolean; // NEW
  exclude_monthly_actual?: boolean; // NEW
  exclude_annual_target?: boolean;
}
```

### UI Components

**LockRuleForm.tsx:**
- Added two separate checkboxes with explanatory labels:
  - ✅ "Exclude Monthly Target (remains unlocked for Direct & In direct types)"
  - ✅ "Exclude Monthly Actual (remains unlocked for Direct type only)"
  - ✅ "Exclude Annual Target (remains unlocked for Direct & In direct types)"

**LockRuleList.tsx:**
- Display format: `All Department Objectives (Users: X, Excluding: Monthly Target, Annual Target)`
- Shows all three exclusions separately in the summary

## 📋 Testing Checklist

### Database Migration
- [ ] Run `migrate-separate-monthly-exclusions.sql` on production database
- [ ] Verify existing locks migrated correctly
- [ ] Confirm old `exclude_monthly` column is dropped

### Lock Creation (Admin/CEO)
- [ ] Create lock with "Exclude Monthly Target" only
- [ ] Create lock with "Exclude Monthly Actual" only
- [ ] Create lock with both exclusions
- [ ] Create lock with all three exclusions
- [ ] Verify lock displays correctly in list

### Lock Behavior - Monthly Actual (Direct Type Only)
- [ ] Lock monthly_actual for Direct objective → ✅ Should be locked
- [ ] Lock monthly_actual for In direct objective → ❌ Should NOT be locked
- [ ] Verify lock icon shows/hides correctly based on type

### Lock Behavior - Monthly Target (Both Types)
- [ ] Lock monthly_target for Direct objective → ✅ Should be locked
- [ ] Lock monthly_target for In direct objective → ✅ Should be locked
- [ ] Verify lock works on both types

### Lock Behavior - Other Fields (Both Types)
- [ ] Lock activity for Direct → ✅ Locked
- [ ] Lock activity for In direct → ✅ Locked
- [ ] Lock responsible_person for both types → ✅ Locked
- [ ] Lock mov for both types → ✅ Locked

### Exclusions Work Correctly
- [ ] Create "All Dept Objectives" lock excluding monthly_target only
  - monthly_target → ❌ Unlocked
  - monthly_actual → ✅ Locked (if Direct)
  - activity, responsible_person, mov → ✅ Locked
  
- [ ] Create "All Dept Objectives" lock excluding monthly_actual only
  - monthly_target → ✅ Locked
  - monthly_actual → ❌ Unlocked
  - activity, responsible_person, mov → ✅ Locked

- [ ] Create lock excluding both monthly fields
  - monthly_target → ❌ Unlocked
  - monthly_actual → ❌ Unlocked
  - activity, responsible_person, mov → ✅ Locked

## 🚀 Deployment Steps

1. **Database Migration** (CRITICAL - Do First!)
   ```sql
   -- Run on production SQL Server
   -- File: Frontend/database/migrate-separate-monthly-exclusions.sql
   ```

2. **Deploy Code Changes**
   ```bash
   git add .
   git commit -m "Enhance lock system: separate monthly exclusions & type restrictions"
   git push
   ```

3. **Verify Deployment**
   - Wait 1-2 minutes for Netlify deployment
   - Hard refresh browser (Ctrl + Shift + R)
   - Login as Admin/CEO
   - Go to Configuration → Lock Management
   - Test creating new locks with separate exclusions

4. **Test Existing Locks**
   - Verify all existing locks migrated correctly
   - Check that old locks show both monthly fields excluded if they had `exclude_monthly = 1`

## ⚠️ Breaking Changes

**None!** 
- Migration script preserves existing lock behavior
- Old locks with `exclude_monthly = 1` now have both `exclude_monthly_target = 1` and `exclude_monthly_actual = 1`
- Frontend is backward compatible

## 📖 User Guide

### For Admins Creating Locks

**Scenario 1: Lock everything except monthly targets**
- ✅ Check "Exclude Monthly Target"
- ❌ Uncheck "Exclude Monthly Actual"
- Result: Users can edit monthly targets but NOT actual values

**Scenario 2: Lock everything except monthly actuals**
- ❌ Uncheck "Exclude Monthly Target"
- ✅ Check "Exclude Monthly Actual"
- Result: Users can edit actual values but NOT targets (useful for data entry only)

**Scenario 3: Lock only objective fields (activity, responsible_person, mov)**
- ✅ Check "Exclude Monthly Target"
- ✅ Check "Exclude Monthly Actual"
- ✅ Check "Exclude Annual Target"
- Result: Only the "other" fields are locked

### Important Notes for Users

**Monthly Actual Behavior:**
- Only Direct type objectives can have locked monthly actuals
- If you change an objective from Direct to In direct, monthly actual locks are automatically bypassed
- This is by design since actual values only come from Direct objectives

**Monthly Target Behavior:**
- Can be locked for BOTH Direct and In direct types
- This allows setting targets for indirect KPIs while preventing changes

## 📝 Files Modified

### Database
- ✅ `Frontend/database/migrate-separate-monthly-exclusions.sql` (NEW)

### Backend
- ✅ `Frontend/netlify/functions/config-api.js`
  - Updated `checkLockStatus()` with type checking
  - Updated create/update/bulk lock endpoints

### Frontend
- ✅ `Frontend/src/types/config.ts`
- ✅ `Frontend/src/components/config/LockRuleForm.tsx`
- ✅ `Frontend/src/components/config/LockRuleList.tsx`

### Documentation
- ✅ `docs/Lock-System-Enhancement.md` (this file)

## 🎉 Benefits

1. **More Granular Control**: Admins can now lock monthly targets independently from actuals
2. **Better Data Integrity**: Monthly actuals properly restricted to Direct objectives only
3. **Flexible Workflows**: Support scenarios like "data entry only" or "planning only"
4. **Type-Aware Locking**: System respects objective type automatically
5. **Backward Compatible**: Existing locks continue to work as expected

---

**Status**: ✅ Ready for deployment  
**Author**: AI Assistant  
**Date**: 2026-01-24  
**Version**: 2.0
