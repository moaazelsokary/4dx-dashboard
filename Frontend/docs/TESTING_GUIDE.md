# Testing Guide

This guide explains how to run and write tests for the application.

## Running Tests

### Unit Tests

```bash
npm run test:unit
```

### E2E Tests

```bash
npm run test:e2e
```

### All Tests

```bash
npm run test
```

### Test Coverage

```bash
npm run test:coverage
```

## Writing Tests

### Unit Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MyComponent from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### E2E Test Example

```typescript
import { test, expect } from '@playwright/test';

test('user can sign in', async ({ page }) => {
  await page.goto('/');
  await page.fill('[name="username"]', 'testuser');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/dashboard');
});
```

## Test Structure

```
src/__tests__/
  ├── components/     # Component tests
  ├── pages/          # Page tests
  ├── services/       # Service tests
  ├── utils/          # Utility tests
  ├── e2e/            # E2E tests
  └── fixtures/       # Test data
```

## Best Practices

1. Write tests before fixing bugs
2. Test user behavior, not implementation
3. Keep tests independent
4. Use descriptive test names
5. Mock external dependencies
6. Clean up after tests

## Coverage Goals

- **Unit tests**: 80% coverage
- **E2E tests**: Critical user flows
- **Integration tests**: API endpoints

