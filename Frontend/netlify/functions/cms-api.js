const sql = require('mssql');
const logger = require('./utils/logger');
const rateLimiter = require('./utils/rate-limiter');
const csrfMiddleware = require('./utils/csrf-middleware');

// Reuse database connection from db.cjs if available
let pool = null;

async function getDbPool() {
  if (pool) return pool;
  
  try {
    const dbModule = require('./db.cjs');
    pool = await dbModule.getPool();
    return pool;
  } catch (error) {
    logger.error('Failed to get database pool', error);
    throw error;
  }
}

// Apply rate limiting and CSRF protection
const handler = rateLimiter('general')(csrfMiddleware(async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    const pool = await getDbPool();
    const { httpMethod, path } = event;
    const body = event.body ? JSON.parse(event.body) : {};

    // Route handling
    if (path.includes('/pages')) {
      return await handlePages(httpMethod, pool, body, path);
    } else if (path.includes('/images')) {
      return await handleImages(httpMethod, pool, body, path);
    } else if (path.includes('/announcements')) {
      return await handleAnnouncements(httpMethod, pool, body, path);
    } else if (path.includes('/menu')) {
      return await handleMenu(httpMethod, pool, body, path);
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ success: false, error: 'Not found' }),
    };
  } catch (error) {
    logger.error('CMS API error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Internal server error' }),
    };
  }
}));

// Pages CRUD
async function handlePages(method, pool, body, path) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (method === 'GET') {
    const request = pool.request();
    const result = await request.query(`
      SELECT id, slug, title, content, meta_description, meta_keywords, 
             is_published, published_at, created_at, updated_at
      FROM cms_pages
      ${path.includes('/published') ? 'WHERE is_published = 1' : ''}
      ORDER BY updated_at DESC
    `);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data: result.recordset }),
    };
  }

  if (method === 'POST') {
    const { slug, title, content, meta_description, meta_keywords, is_published } = body;
    const request = pool.request();
    
    request.input('slug', sql.NVarChar, slug);
    request.input('title', sql.NVarChar, title);
    request.input('content', sql.NVarChar(sql.MAX), content);
    request.input('meta_description', sql.NVarChar, meta_description || null);
    request.input('meta_keywords', sql.NVarChar, meta_keywords || null);
    request.input('is_published', sql.Bit, is_published || false);
    request.input('published_at', sql.DateTime2, is_published ? new Date() : null);

    const result = await request.query(`
      INSERT INTO cms_pages (slug, title, content, meta_description, meta_keywords, is_published, published_at)
      OUTPUT INSERTED.id, INSERTED.slug, INSERTED.title, INSERTED.content, 
             INSERTED.meta_description, INSERTED.meta_keywords, INSERTED.is_published, 
             INSERTED.published_at, INSERTED.created_at, INSERTED.updated_at
      VALUES (@slug, @title, @content, @meta_description, @meta_keywords, @is_published, @published_at)
    `);

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ success: true, data: result.recordset[0] }),
    };
  }

  if (method === 'PUT') {
    const { id, slug, title, content, meta_description, meta_keywords, is_published } = body;
    const request = pool.request();
    
    request.input('id', sql.Int, id);
    request.input('slug', sql.NVarChar, slug);
    request.input('title', sql.NVarChar, title);
    request.input('content', sql.NVarChar(sql.MAX), content);
    request.input('meta_description', sql.NVarChar, meta_description || null);
    request.input('meta_keywords', sql.NVarChar, meta_keywords || null);
    request.input('is_published', sql.Bit, is_published || false);
    request.input('published_at', sql.DateTime2, is_published ? new Date() : null);

    const result = await request.query(`
      UPDATE cms_pages
      SET slug = @slug, title = @title, content = @content,
          meta_description = @meta_description, meta_keywords = @meta_keywords,
          is_published = @is_published, published_at = @published_at,
          updated_at = GETDATE()
      WHERE id = @id
    `);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Page updated' }),
    };
  }

  if (method === 'DELETE') {
    const id = path.split('/').pop();
    const request = pool.request();
    request.input('id', sql.Int, id);

    await request.query('DELETE FROM cms_pages WHERE id = @id');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Page deleted' }),
    };
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ success: false, error: 'Method not allowed' }),
  };
}

// Images CRUD (simplified - full implementation would handle file uploads)
async function handleImages(method, pool, body, path) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (method === 'GET') {
    const request = pool.request();
    const result = await request.query(`
      SELECT id, filename, original_filename, file_path, file_size, 
             mime_type, width, height, alt_text, created_at
      FROM cms_images
      ORDER BY created_at DESC
    `);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data: result.recordset }),
    };
  }

  // POST, PUT, DELETE would be implemented similarly
  return {
    statusCode: 501,
    headers,
    body: JSON.stringify({ success: false, error: 'Not implemented' }),
  };
}

// Announcements CRUD
async function handleAnnouncements(method, pool, body, path) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (method === 'GET') {
    const request = pool.request();
    const result = await request.query(`
      SELECT id, title, content, image_id, link_url, link_text,
             start_date, end_date, is_active, display_order, created_at
      FROM cms_announcements
      WHERE is_active = 1 AND (start_date IS NULL OR start_date <= GETDATE())
            AND (end_date IS NULL OR end_date >= GETDATE())
      ORDER BY display_order, created_at DESC
    `);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data: result.recordset }),
    };
  }

  // POST, PUT, DELETE would be implemented similarly
  return {
    statusCode: 501,
    headers,
    body: JSON.stringify({ success: false, error: 'Not implemented' }),
  };
}

// Menu items CRUD
async function handleMenu(method, pool, body, path) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (method === 'GET') {
    const request = pool.request();
    const result = await request.query(`
      SELECT id, label, url, icon, parent_id, display_order, is_active, target_blank
      FROM cms_menu_items
      WHERE is_active = 1
      ORDER BY display_order, label
    `);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data: result.recordset }),
    };
  }

  // POST, PUT, DELETE would be implemented similarly
  return {
    statusCode: 501,
    headers,
    body: JSON.stringify({ success: false, error: 'Not implemented' }),
  };
}

exports.handler = handler;

