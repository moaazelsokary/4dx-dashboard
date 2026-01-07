# Test Data Setup Guide

This guide explains how to set up test data for development and testing.

## Overview

Test data is essential for:
- Development and debugging
- Testing features
- Demonstrating functionality
- Training users

## Database Test Data

### Users

Create test users with different roles:

```sql
-- Admin user
INSERT INTO users (username, password_hash, role, is_active)
VALUES ('admin', '$2a$10$...', 'Admin', 1);

-- Editor user
INSERT INTO users (username, password_hash, role, is_active)
VALUES ('editor', '$2a$10$...', 'Editor', 1);

-- Viewer user
INSERT INTO users (username, password_hash, role, is_active)
VALUES ('viewer', '$2a$10$...', 'Viewer', 1);

-- Department user
INSERT INTO users (username, password_hash, role, departments, is_active)
VALUES ('dept_user', '$2a$10$...', 'department', '["HR", "Finance"]', 1);
```

**Default Password**: `test123` (hash with bcrypt)

### Main Plan Objectives

```sql
INSERT INTO main_plan_objectives (kpi, annual_target, pillar, objective, target)
VALUES 
  ('KPI 1', 100, 'Strategic Themes', 'Objective 1', 'Target 1'),
  ('KPI 2', 200, 'Contributors', 'Objective 2', 'Target 2');
```

### Department Objectives

```sql
INSERT INTO department_objectives (kpi, activity, type, activity_target, department_id, main_objective_id)
VALUES 
  ('KPI 1', 'Activity 1', 'Direct', 50, 1, 1),
  ('KPI 2', 'Activity 2', 'In direct', 75, 2, 2);
```

### CMS Test Data

```sql
-- Test Page
INSERT INTO cms_pages (slug, title, content, is_published)
VALUES ('test-page', 'Test Page', '<p>This is a test page.</p>', 1);

-- Test Announcement
INSERT INTO cms_announcements (title, content, is_active, priority)
VALUES ('Test Announcement', 'This is a test announcement.', 1, 5);

-- Test Menu Item
INSERT INTO cms_menu_items (label, url, display_order, is_active)
VALUES ('Test Link', '/test-page', 1, 1);
```

## Test Data Scripts

### Automated Setup

Create a script to set up all test data:

```javascript
// scripts/setup-test-data.cjs
const sql = require('mssql');
const bcrypt = require('bcryptjs');

async function setupTestData() {
  // Connect to database
  // Create test users
  // Create test objectives
  // Create test CMS content
}
```

### Running Test Data Setup

```bash
npm run setup-test-data
```

## Test Data Best Practices

1. **Isolation**: Use separate test database or clear data between tests
2. **Consistency**: Use the same test data across environments
3. **Realism**: Make test data realistic but clearly identifiable as test data
4. **Cleanup**: Always clean up test data after tests complete

## Sample Test Data Files

### users-test-data.json
```json
{
  "users": [
    {
      "username": "admin",
      "password": "test123",
      "role": "Admin"
    },
    {
      "username": "editor",
      "password": "test123",
      "role": "Editor"
    }
  ]
}
```

### objectives-test-data.json
```json
{
  "mainObjectives": [
    {
      "kpi": "Test KPI 1",
      "annual_target": 100,
      "pillar": "Strategic Themes"
    }
  ],
  "departmentObjectives": [
    {
      "kpi": "Test KPI 1",
      "activity": "Test Activity",
      "type": "Direct",
      "activity_target": 50
    }
  ]
}
```

## Environment-Specific Test Data

### Development
- Full test dataset
- Realistic but simplified data
- Easy to reset

### Staging
- Production-like data
- Anonymized real data
- Full dataset

### Testing
- Minimal dataset
- Edge cases included
- Fast to set up/tear down

## Test Data Maintenance

1. **Version Control**: Keep test data scripts in version control
2. **Documentation**: Document what each test data set is for
3. **Updates**: Update test data when schema changes
4. **Validation**: Validate test data matches current schema

## Troubleshooting

### Issue: Test data not loading
- Check database connection
- Verify SQL scripts are correct
- Check user permissions

### Issue: Test data conflicts
- Use unique identifiers
- Clear existing data first
- Use transactions for atomic operations

## Next Steps

1. Create test data scripts
2. Document test data structure
3. Set up automated test data loading
4. Create test data cleanup scripts

