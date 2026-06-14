/**
 * MEAL Data Validation — auth + in-process Node validation engine.
 * Optional MEAL_VALIDATION_API_URL forwards to external Python (legacy).
 */

const rateLimiter = require('./utils/rate-limiter');
const authMiddleware = require('./utils/auth-middleware');
const logger = require('./utils/logger');
const { canAccessMeal } = require('./utils/meal-access.cjs');
const { parseMultipart } = require('./utils/meal-multipart.cjs');
const { validateVolunteerUpload } = require('./utils/meal/validate.cjs');

const MAX_BYTES = Number(process.env.MEAL_MAX_UPLOAD_BYTES || 25 * 1024 * 1024);
const UPSTREAM = (process.env.MEAL_VALIDATION_API_URL || '').replace(/\/$/, '');
const API_KEY = (process.env.MEAL_VALIDATION_API_KEY || '').trim();

function jsonHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...extra,
  };
}

async function forwardToPython({ fileBuffer, fileName, fileMime, sheetName, validateMode }) {
  const boundary = `----meal${Date.now()}${Math.random().toString(36).slice(2)}`;
  const parts = [];

  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName.replace(/"/g, '')}"\r\nContent-Type: ${fileMime}\r\n\r\n`
  );
  const headerPart = Buffer.from(parts.join(''), 'utf8');
  const mode = String(validateMode || 'both').trim() || 'both';
  let footer = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="validate_mode"\r\n\r\n${mode}\r\n`;
  if (sheetName) {
    footer += `--${boundary}\r\nContent-Disposition: form-data; name="sheet_name"\r\n\r\n${sheetName}\r\n`;
  }
  footer += `--${boundary}--\r\n`;
  const body = Buffer.concat([headerPart, fileBuffer, Buffer.from(footer, 'utf8')]);

  const headers = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': String(body.length),
  };
  if (API_KEY) headers['X-Meal-Api-Key'] = API_KEY;

  const res = await fetch(`${UPSTREAM}/api/meal/validate`, {
    method: 'POST',
    headers,
    body,
  });

  const text = await res.text();
  return {
    statusCode: res.status,
    headers: jsonHeaders(),
    body: text,
  };
}

function validateInProcess({ fileBuffer, sheetName, validateMode }) {
  const result = validateVolunteerUpload(fileBuffer, {
    sheetName: sheetName || undefined,
    validateMode: validateMode || 'both',
  });
  return {
    statusCode: 200,
    headers: jsonHeaders(),
    body: JSON.stringify(result),
  };
}

const handler = rateLimiter('general')(
  authMiddleware({
    optional: false,
    resource: 'wig',
    action: 'read',
  })(async (event) => {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: jsonHeaders(), body: '' };
    }

    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: jsonHeaders(),
        body: JSON.stringify({ ok: false, error: 'Method not allowed' }),
      };
    }

    const user = event.user || {};
    if (!canAccessMeal(user)) {
      return {
        statusCode: 403,
        headers: jsonHeaders(),
        body: JSON.stringify({ ok: false, error: 'MEAL access required (CEO, Admin, or M&E role)' }),
      };
    }

    try {
      const parsed = await parseMultipart(event);
      if (parsed.fileBuffer.length > MAX_BYTES) {
        return {
          statusCode: 413,
          headers: jsonHeaders(),
          body: JSON.stringify({
            ok: false,
            error: `File exceeds ${Math.floor(MAX_BYTES / (1024 * 1024))} MB limit`,
          }),
        };
      }

      const lower = (parsed.fileName || '').toLowerCase();
      if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
        return {
          statusCode: 422,
          headers: jsonHeaders(),
          body: JSON.stringify({ ok: false, error: 'Only .xlsx or .xls files are supported' }),
        };
      }

      logger.info('MEAL validate request', {
        userId: user.userId ?? user.id,
        username: user.username,
        fileName: parsed.fileName,
        bytes: parsed.fileBuffer.length,
        engine: UPSTREAM ? 'python-proxy' : 'node',
      });

      if (UPSTREAM) {
        return await forwardToPython(parsed);
      }

      try {
        return validateInProcess(parsed);
      } catch (engineErr) {
        logger.error('MEAL validate engine error', { message: engineErr?.message });
        return {
          statusCode: 422,
          headers: jsonHeaders(),
          body: JSON.stringify({
            ok: false,
            error: `Validation failed: ${engineErr?.message || 'unknown error'}`,
          }),
        };
      }
    } catch (err) {
      logger.error('MEAL validate error', { message: err?.message });
      return {
        statusCode: 400,
        headers: jsonHeaders(),
        body: JSON.stringify({ ok: false, error: err?.message || 'Invalid upload' }),
      };
    }
  })
);

exports.handler = handler;
