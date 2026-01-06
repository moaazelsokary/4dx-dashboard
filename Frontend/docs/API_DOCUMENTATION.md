# API Documentation

This document describes all API endpoints available in the application.

## Base URL

- **Development**: `http://localhost:3000/api`
- **Production**: `/.netlify/functions`

## Authentication

Most endpoints require authentication via JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

## Endpoints

### Authentication

#### POST `/auth-api`
Sign in and get authentication token.

**Request:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "username": "string",
    "role": "string",
    "departments": ["string"]
  },
  "token": "string"
}
```

### WIG API

#### GET `/wig-api/main-objectives`
Get all main plan objectives.

**Response:**
```json
{
  "success": true,
  "data": [...]
}
```

#### POST `/wig-api/main-objectives`
Create a new main plan objective.

**Request:**
```json
{
  "targetNum": "string",
  "description": "string",
  ...
}
```

### CMS API

#### GET `/cms-api/pages`
Get all CMS pages.

#### POST `/cms-api/pages`
Create a new CMS page.

#### PUT `/cms-api/pages`
Update a CMS page.

#### DELETE `/cms-api/pages/:id`
Delete a CMS page.

## Rate Limiting

- **Login endpoints**: 5 requests per 15 minutes
- **General API**: 100 requests per minute
- **Export endpoints**: 10 requests per hour

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset time

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Error message"
}
```

Status codes:
- `200`: Success
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `429`: Too Many Requests
- `500`: Internal Server Error

