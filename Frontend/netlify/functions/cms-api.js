const sql = require('mssql');
const logger = require('./utils/logger');
const rateLimiter = require('./utils/rate-limiter');
const csrfMiddleware = require('./utils/csrf-middleware');
const authMiddleware = require('./utils/auth-middleware');

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

// Apply rate limiting, CSRF protection, and auth middleware
// GET requests: optional auth (public read access)
// POST/PUT/DELETE: required auth with Admin/Editor role
const handler = rateLimiter('general')(
  csrfMiddleware(
    authMiddleware({
      optional: true, // Allow GET requests without auth
      resource: 'cms',
      requiredRoles: [], // Check permissions instead of roles
    })(
      async (event, context) => {
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

    // Check authentication and permissions for write operations
    if (['POST', 'PUT', 'DELETE'].includes(httpMethod)) {
      if (!event.user) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Authentication required',
            message: 'Please sign in to perform this action',
          }),
        };
      }
      
      // Check permissions - Admin and Editor can modify CMS content
      const userRole = event.user.role || '';
      if (!['Admin', 'Editor', 'CEO'].includes(userRole)) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Insufficient permissions',
            message: 'You must be an Admin or Editor to modify CMS content',
          }),
        };
      }
      
      // Editor cannot delete (only Admin and CEO can)
      if (httpMethod === 'DELETE' && userRole === 'Editor') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Insufficient permissions',
            message: 'Editors cannot delete content. Only Admins can delete.',
          }),
        };
      }
    }

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
    })
  )
);

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
             mime_type, width, height, alt_text, url, created_at
      FROM cms_images
      ORDER BY created_at DESC
    `);

    // Map file_path to url if url is not set
    const mappedData = result.recordset.map(img => ({
      ...img,
      url: img.url || img.file_path || `/uploads/${img.filename}`,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data: mappedData }),
    };
  }

  if (method === 'POST') {
    // Image upload would be handled via multipart/form-data
    // For now, return a placeholder - full implementation would handle file upload
    return {
      statusCode: 501,
      headers,
      body: JSON.stringify({ success: false, error: 'Image upload not fully implemented. Use file upload endpoint.' }),
    };
  }

  if (method === 'DELETE') {
    const id = path.split('/').pop();
    const request = pool.request();
    request.input('id', sql.Int, id);

    await request.query('DELETE FROM cms_images WHERE id = @id');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Image deleted' }),
    };
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ success: false, error: 'Method not allowed' }),
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
    // For admin, show all announcements. For public, filter by active and date
    const isAdmin = path.includes('/admin');
    const query = isAdmin
      ? `SELECT id, title, content, image_id, link_url, link_text,
                start_date, end_date, is_active, priority, display_order, created_at, updated_at
         FROM cms_announcements
         ORDER BY display_order, created_at DESC`
      : `SELECT id, title, content, image_id, link_url, link_text,
                start_date, end_date, is_active, priority, display_order, created_at
         FROM cms_announcements
         WHERE is_active = 1 AND (start_date IS NULL OR start_date <= GETDATE())
               AND (end_date IS NULL OR end_date >= GETDATE())
         ORDER BY priority DESC, display_order, created_at DESC`;

    const result = await request.query(query);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data: result.recordset }),
    };
  }

  if (method === 'POST') {
    const { title, content, image_id, link_url, link_text, start_date, end_date, is_active, priority, display_order } = body;
    const request = pool.request();
    
    request.input('title', sql.NVarChar, title);
    request.input('content', sql.NVarChar(sql.MAX), content);
    request.input('image_id', sql.Int, image_id || null);
    request.input('link_url', sql.NVarChar, link_url || null);
    request.input('link_text', sql.NVarChar, link_text || null);
    request.input('start_date', sql.DateTime2, start_date ? new Date(start_date) : null);
    request.input('end_date', sql.DateTime2, end_date ? new Date(end_date) : null);
    request.input('is_active', sql.Bit, is_active ?? true);
    request.input('priority', sql.Int, priority || 0);
    request.input('display_order', sql.Int, display_order || 0);

    const result = await request.query(`
      INSERT INTO cms_announcements (title, content, image_id, link_url, link_text, start_date, end_date, is_active, priority, display_order)
      OUTPUT INSERTED.id, INSERTED.title, INSERTED.content, INSERTED.image_id, INSERTED.link_url, INSERTED.link_text,
             INSERTED.start_date, INSERTED.end_date, INSERTED.is_active, INSERTED.priority, INSERTED.display_order,
             INSERTED.created_at, INSERTED.updated_at
      VALUES (@title, @content, @image_id, @link_url, @link_text, @start_date, @end_date, @is_active, @priority, @display_order)
    `);

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ success: true, data: result.recordset[0] }),
    };
  }

  if (method === 'PUT') {
    const id = path.split('/').pop();
    const { title, content, image_id, link_url, link_text, start_date, end_date, is_active, priority, display_order } = body;
    const request = pool.request();
    
    request.input('id', sql.Int, id);
    request.input('title', sql.NVarChar, title);
    request.input('content', sql.NVarChar(sql.MAX), content);
    request.input('image_id', sql.Int, image_id || null);
    request.input('link_url', sql.NVarChar, link_url || null);
    request.input('link_text', sql.NVarChar, link_text || null);
    request.input('start_date', sql.DateTime2, start_date ? new Date(start_date) : null);
    request.input('end_date', sql.DateTime2, end_date ? new Date(end_date) : null);
    request.input('is_active', sql.Bit, is_active ?? true);
    request.input('priority', sql.Int, priority || 0);
    request.input('display_order', sql.Int, display_order || 0);

    await request.query(`
      UPDATE cms_announcements
      SET title = @title, content = @content, image_id = @image_id,
          link_url = @link_url, link_text = @link_text,
          start_date = @start_date, end_date = @end_date,
          is_active = @is_active, priority = @priority, display_order = @display_order,
          updated_at = GETDATE()
      WHERE id = @id
    `);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Announcement updated' }),
    };
  }

  if (method === 'DELETE') {
    const id = path.split('/').pop();
    const request = pool.request();
    request.input('id', sql.Int, id);

    await request.query('DELETE FROM cms_announcements WHERE id = @id');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Announcement deleted' }),
    };
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ success: false, error: 'Method not allowed' }),
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
    // For admin, show all items. For public, filter by active
    const isAdmin = path.includes('/admin');
    const query = isAdmin
      ? `SELECT id, label, url, icon, parent_id, display_order, is_active, target_blank
         FROM cms_menu_items
         ORDER BY display_order, label`
      : `SELECT id, label, url, icon, parent_id, display_order, is_active, target_blank
         FROM cms_menu_items
         WHERE is_active = 1
         ORDER BY display_order, label`;

    const result = await request.query(query);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data: result.recordset }),
    };
  }

  if (method === 'POST') {
    const { label, url, icon, parent_id, display_order, is_active, target_blank } = body;
    const request = pool.request();
    
    request.input('label', sql.NVarChar, label);
    request.input('url', sql.NVarChar, url);
    request.input('icon', sql.NVarChar, icon || null);
    request.input('parent_id', sql.Int, parent_id || null);
    request.input('display_order', sql.Int, display_order || 0);
    request.input('is_active', sql.Bit, is_active ?? true);
    request.input('target_blank', sql.Bit, target_blank || false);

    const result = await request.query(`
      INSERT INTO cms_menu_items (label, url, icon, parent_id, display_order, is_active, target_blank)
      OUTPUT INSERTED.id, INSERTED.label, INSERTED.url, INSERTED.icon, INSERTED.parent_id,
             INSERTED.display_order, INSERTED.is_active, INSERTED.target_blank
      VALUES (@label, @url, @icon, @parent_id, @display_order, @is_active, @target_blank)
    `);

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ success: true, data: result.recordset[0] }),
    };
  }

  if (method === 'PUT') {
    const id = path.split('/').pop();
    const { label, url, icon, parent_id, display_order, is_active, target_blank } = body;
    const request = pool.request();
    
    request.input('id', sql.Int, id);
    request.input('label', sql.NVarChar, label);
    request.input('url', sql.NVarChar, url);
    request.input('icon', sql.NVarChar, icon || null);
    request.input('parent_id', sql.Int, parent_id || null);
    request.input('display_order', sql.Int, display_order || 0);
    request.input('is_active', sql.Bit, is_active ?? true);
    request.input('target_blank', sql.Bit, target_blank || false);

    await request.query(`
      UPDATE cms_menu_items
      SET label = @label, url = @url, icon = @icon, parent_id = @parent_id,
          display_order = @display_order, is_active = @is_active, target_blank = @target_blank
      WHERE id = @id
    `);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Menu item updated' }),
    };
  }

  if (method === 'DELETE') {
    const id = path.split('/').pop();
    const request = pool.request();
    request.input('id', sql.Int, id);

    await request.query('DELETE FROM cms_menu_items WHERE id = @id');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Menu item deleted' }),
    };
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ success: false, error: 'Method not allowed' }),
  };
}

exports.handler = handler;

