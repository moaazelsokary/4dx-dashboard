# Environment Setup Guide

This guide explains how to set up development, staging, and production environments.

## Development Environment

### Prerequisites

- Node.js 18+ and npm
- SQL Server database access
- Azure AD credentials (for SharePoint/OneDrive)

### Setup Steps

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env.local` file:
   ```bash
   cp .env.example .env.local
   ```

4. Set environment variables in `.env.local`:
   - Database connection details
   - SharePoint/OneDrive credentials
   - API keys

5. Initialize database:
   ```bash
   npm run init-db
   ```

6. Start development server:
   ```bash
   npm run dev
   ```

## Staging Environment

Staging environment is automatically created on Netlify for pull requests.

### Configuration

1. Set environment variables in Netlify dashboard
2. Use staging database
3. Configure staging-specific API keys

## Production Environment

### Configuration

1. Set all environment variables in Netlify dashboard
2. Use production database
3. Configure production API keys
4. Enable HTTPS
5. Set up monitoring and alerts

### Environment Variables

See `.env.example` for required variables.

## Environment Differences

| Feature | Development | Staging | Production |
|---------|------------|---------|------------|
| Database | Local/Dev DB | Staging DB | Production DB |
| Logging | Console | Structured | Structured + Monitoring |
| Error Tracking | Disabled | Enabled | Enabled |
| Debug Mode | Enabled | Disabled | Disabled |

