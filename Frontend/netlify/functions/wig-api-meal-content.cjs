/**
 * MEAL content library — nested folders + files per tab (tools, reports, learning).
 * Read: canAccessMeal (CEO, Admin, M&E, or explicit /meal route).
 * Write: CEO, Admin, M&E only.
 */

const sql = require('mssql');
const { canAccessMeal, isMealRole } = require('./utils/meal-access.cjs');

const MEAL_CATEGORIES = ['tools', 'reports', 'learning'];
const MAX_FILE_BYTES = 24 * 1024 * 1024;

function assertAuthenticated(user) {
  if (!user) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }
}

function assertCanReadMealContent(user) {
  assertAuthenticated(user);
  if (!canAccessMeal(user)) {
    const err = new Error('Insufficient permissions');
    err.statusCode = 403;
    throw err;
  }
}

function assertCanWriteMealContent(user) {
  assertAuthenticated(user);
  if (!isMealRole(user.role)) {
    const err = new Error('Only CEO, Admin, or M&E can modify MEAL content');
    err.statusCode = 403;
    throw err;
  }
}

function validateCategory(category) {
  const c = String(category || '').trim().toLowerCase();
  if (!MEAL_CATEGORIES.includes(c)) {
    const err = new Error(`Invalid category. Must be one of: ${MEAL_CATEGORIES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  return c;
}

function parseParentId(raw) {
  if (raw === undefined || raw === null || raw === '' || raw === 'null') return null;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) {
    const err = new Error('Invalid parent_id');
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function mapRowMeta(row) {
  if (!row) return null;
  return {
    id: row.id,
    category: row.category,
    parent_id: row.parent_id ?? null,
    item_type: row.item_type,
    display_name: row.display_name,
    description: row.description,
    original_file_name: row.original_file_name,
    mime_type: row.mime_type,
    file_size_bytes: row.file_size_bytes,
    created_at: row.created_at,
    created_by_username: row.created_by_username,
    updated_at: row.updated_at,
    updated_by_username: row.updated_by_username,
  };
}

function decodeBase64FilePayload(raw) {
  if (raw == null || raw === '') {
    const err = new Error('file_base64 is required');
    err.statusCode = 400;
    throw err;
  }
  let buf;
  try {
    buf = Buffer.from(String(raw), 'base64');
  } catch {
    const err = new Error('Invalid file_base64');
    err.statusCode = 400;
    throw err;
  }
  if (!buf.length) {
    const err = new Error('Empty file');
    err.statusCode = 400;
    throw err;
  }
  if (buf.length > MAX_FILE_BYTES) {
    const err = new Error(`File too large (max ${MAX_FILE_BYTES} bytes)`);
    err.statusCode = 400;
    throw err;
  }
  return buf;
}

function userAuditFields(user) {
  const uid = user.userId ?? user.id ?? user.user_id;
  const idNum = parseInt(String(uid ?? ''), 10);
  const username = user.username ? String(user.username) : null;
  return {
    userId: Number.isFinite(idNum) ? idNum : null,
    username: username || null,
  };
}

async function fetchRowMeta(pool, id) {
  const request = pool.request();
  request.input('id', sql.Int, id);
  const r = await request.query(`
    SELECT
      id, category, parent_id, item_type, display_name, description,
      original_file_name, mime_type, file_size_bytes,
      created_at, created_by_username, updated_at, updated_by_username
    FROM meal_content_items WHERE id = @id
  `);
  return r.recordset?.[0] || null;
}

async function fetchRowWithBlob(pool, id) {
  const request = pool.request();
  request.input('id', sql.Int, id);
  const r = await request.query(`SELECT * FROM meal_content_items WHERE id = @id`);
  return r.recordset?.[0] || null;
}

async function assertParentValid(pool, category, parentId) {
  if (parentId == null) return;
  const request = pool.request();
  request.input('id', sql.Int, parentId);
  request.input('category', sql.NVarChar, category);
  const r = await request.query(`
    SELECT id, item_type, category FROM meal_content_items WHERE id = @id
  `);
  const parent = r.recordset?.[0];
  if (!parent) {
    const err = new Error('Parent folder not found');
    err.statusCode = 404;
    throw err;
  }
  if (String(parent.category).toLowerCase() !== category) {
    const err = new Error('Parent folder belongs to a different category');
    err.statusCode = 400;
    throw err;
  }
  if (String(parent.item_type).toLowerCase() !== 'folder') {
    const err = new Error('parent_id must reference a folder');
    err.statusCode = 400;
    throw err;
  }
}

async function listMealContent(pool, category, parentId, user) {
  const cat = validateCategory(category);
  assertCanReadMealContent(user);
  await assertParentValid(pool, cat, parentId);

  const request = pool.request();
  request.input('category', sql.NVarChar, cat);
  if (parentId == null) {
    const result = await request.query(`
      SELECT
        id, category, parent_id, item_type, display_name, description,
        original_file_name, mime_type, file_size_bytes,
        created_at, created_by_username, updated_at, updated_by_username
      FROM meal_content_items
      WHERE category = @category AND parent_id IS NULL
      ORDER BY
        CASE WHEN item_type = 'folder' THEN 0 ELSE 1 END,
        display_name ASC,
        updated_at DESC,
        id DESC
    `);
    return (result.recordset || []).map(mapRowMeta);
  }

  request.input('parent_id', sql.Int, parentId);
  const result = await request.query(`
    SELECT
      id, category, parent_id, item_type, display_name, description,
      original_file_name, mime_type, file_size_bytes,
      created_at, created_by_username, updated_at, updated_by_username
    FROM meal_content_items
    WHERE category = @category AND parent_id = @parent_id
    ORDER BY
      CASE WHEN item_type = 'folder' THEN 0 ELSE 1 END,
      display_name ASC,
      updated_at DESC,
      id DESC
  `);
  return (result.recordset || []).map(mapRowMeta);
}

async function getMealContentDownload(pool, id, user) {
  const row = await fetchRowWithBlob(pool, id);
  if (!row) {
    const err = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }
  if (String(row.item_type).toLowerCase() !== 'file') {
    const err = new Error('Not a file');
    err.statusCode = 400;
    throw err;
  }
  assertCanReadMealContent(user);
  const blob = row.file_data ?? row.File_Data;
  if (!blob) {
    const err = new Error('File payload missing');
    err.statusCode = 500;
    throw err;
  }
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  const filename = String(row.original_file_name || `file-${id}`).replace(/"/g, '');
  const mime = row.mime_type ? String(row.mime_type) : 'application/octet-stream';
  return { buffer: buf, filename, mime };
}

async function createMealContent(pool, body, user) {
  assertCanWriteMealContent(user);
  const category = validateCategory(body.category);
  const parentId = body.parent_id != null ? parseParentId(body.parent_id) : null;
  await assertParentValid(pool, category, parentId);

  const itemType = String(body.item_type || 'file').trim().toLowerCase();
  if (itemType !== 'folder' && itemType !== 'file') {
    const err = new Error('item_type must be folder or file');
    err.statusCode = 400;
    throw err;
  }

  const displayName = String(body.display_name || '').trim();
  if (!displayName) {
    const err = new Error('display_name is required');
    err.statusCode = 400;
    throw err;
  }
  const description = body.description != null ? String(body.description).trim() || null : null;
  const audit = userAuditFields(user);

  const request = pool.request();
  request.input('category', sql.NVarChar, category);
  request.input('parent_id', sql.Int, parentId);
  request.input('item_type', sql.NVarChar, itemType);
  request.input('display_name', sql.NVarChar, displayName);
  request.input('description', sql.NVarChar(sql.MAX), description);
  request.input('created_by_user_id', sql.Int, audit.userId);
  request.input('created_by_username', sql.NVarChar, audit.username);
  request.input('updated_by_user_id', sql.Int, audit.userId);
  request.input('updated_by_username', sql.NVarChar, audit.username);

  if (itemType === 'folder') {
    const ins = await request.query(`
      INSERT INTO meal_content_items (
        category, parent_id, item_type, display_name, description,
        created_by_user_id, created_by_username, updated_by_user_id, updated_by_username
      )
      OUTPUT INSERTED.id
      VALUES (
        @category, @parent_id, @item_type, @display_name, @description,
        @created_by_user_id, @created_by_username, @updated_by_user_id, @updated_by_username
      )
    `);
    const newId = ins.recordset[0]?.id;
    return mapRowMeta(await fetchRowMeta(pool, newId));
  }

  const originalName = String(body.original_file_name || '').trim();
  if (!originalName) {
    const err = new Error('original_file_name is required');
    err.statusCode = 400;
    throw err;
  }
  const mimeType = body.mime_type != null ? String(body.mime_type).trim() || null : null;
  const buf = decodeBase64FilePayload(body.file_base64);
  request.input('original_file_name', sql.NVarChar, originalName);
  request.input('mime_type', sql.NVarChar, mimeType);
  request.input('file_data', sql.VarBinary(sql.MAX), buf);
  request.input('file_size_bytes', sql.Int, buf.length);

  const ins = await request.query(`
    INSERT INTO meal_content_items (
      category, parent_id, item_type, display_name, description,
      original_file_name, mime_type, file_data, file_size_bytes,
      created_by_user_id, created_by_username, updated_by_user_id, updated_by_username
    )
    OUTPUT INSERTED.id
    VALUES (
      @category, @parent_id, @item_type, @display_name, @description,
      @original_file_name, @mime_type, @file_data, @file_size_bytes,
      @created_by_user_id, @created_by_username, @updated_by_user_id, @updated_by_username
    )
  `);
  const newId = ins.recordset[0]?.id;
  return mapRowMeta(await fetchRowMeta(pool, newId));
}

async function getFolderDescendantIds(pool, folderId) {
  const r = await pool.request().query(`
    SELECT id, parent_id FROM meal_content_items WHERE item_type = 'folder'
  `);
  const byParent = {};
  for (const row of r.recordset || []) {
    const pid = row.parent_id ?? 'root';
    if (!byParent[pid]) byParent[pid] = [];
    byParent[pid].push(row.id);
  }
  const out = new Set();
  const stack = [folderId];
  while (stack.length) {
    const id = stack.pop();
    for (const child of byParent[id] || []) {
      if (!out.has(child)) {
        out.add(child);
        stack.push(child);
      }
    }
  }
  return out;
}

async function listMealContentFolders(pool, category, user) {
  const cat = validateCategory(category);
  assertCanReadMealContent(user);
  const request = pool.request();
  request.input('category', sql.NVarChar, cat);
  const result = await request.query(`
    SELECT id, parent_id, display_name
    FROM meal_content_items
    WHERE category = @category AND item_type = 'folder'
    ORDER BY display_name ASC, id ASC
  `);
  const rows = result.recordset || [];
  const byId = new Map(rows.map((row) => [row.id, row]));

  function pathFor(id) {
    const parts = [];
    let cur = byId.get(id);
    const seen = new Set();
    while (cur) {
      if (seen.has(cur.id)) break;
      seen.add(cur.id);
      parts.unshift(cur.display_name);
      cur = cur.parent_id ? byId.get(cur.parent_id) : null;
    }
    return parts.join(' / ');
  }

  return rows.map((row) => ({
    id: row.id,
    parent_id: row.parent_id ?? null,
    display_name: row.display_name,
    path: pathFor(row.id),
  }));
}

function normalizeParentId(value) {
  if (value === undefined || value === null || value === '' || value === 'null') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function updateMealContent(pool, id, body, user) {
  assertCanWriteMealContent(user);
  const existing = await fetchRowWithBlob(pool, id);
  if (!existing) {
    const err = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }

  const itemType = String(existing.item_type).toLowerCase();
  const updates = [];
  const request = pool.request();
  request.input('id', sql.Int, id);
  const audit = userAuditFields(user);

  if (body.display_name !== undefined) {
    const dn = String(body.display_name || '').trim();
    if (!dn) {
      const err = new Error('display_name cannot be empty');
      err.statusCode = 400;
      throw err;
    }
    request.input('display_name', sql.NVarChar, dn);
    updates.push('display_name = @display_name');
  }
  if (body.description !== undefined) {
    const d = body.description == null ? null : String(body.description).trim() || null;
    request.input('description', sql.NVarChar(sql.MAX), d);
    updates.push('description = @description');
  }

  if (body.parent_id !== undefined) {
    const category = String(existing.category).toLowerCase();
    const newParent = normalizeParentId(body.parent_id);
    await assertParentValid(pool, category, newParent);

    if (itemType === 'folder') {
      if (newParent === id) {
        const err = new Error('Cannot move a folder into itself');
        err.statusCode = 400;
        throw err;
      }
      const descendants = await getFolderDescendantIds(pool, id);
      if (newParent != null && descendants.has(newParent)) {
        const err = new Error('Cannot move a folder into one of its subfolders');
        err.statusCode = 400;
        throw err;
      }
    }

    const currentParent = normalizeParentId(existing.parent_id);
    if (currentParent === newParent) {
      return mapRowMeta(await fetchRowMeta(pool, id));
    }

    if (newParent == null) {
      updates.push('parent_id = NULL');
    } else {
      request.input('parent_id', sql.Int, newParent);
      updates.push('parent_id = @parent_id');
    }
  }

  if (itemType === 'file' && body.file_base64 != null && body.file_base64 !== '') {
    const buf = decodeBase64FilePayload(body.file_base64);
    let orig = body.original_file_name != null ? String(body.original_file_name).trim() : '';
    if (!orig) orig = String(existing.original_file_name || 'file');
    const mimeType =
      body.mime_type != null ? String(body.mime_type).trim() || null : existing.mime_type || null;
    request.input('file_data', sql.VarBinary(sql.MAX), buf);
    request.input('file_size_bytes', sql.Int, buf.length);
    request.input('original_file_name', sql.NVarChar, orig);
    request.input('mime_type', sql.NVarChar, mimeType);
    updates.push('file_data = @file_data');
    updates.push('file_size_bytes = @file_size_bytes');
    updates.push('original_file_name = @original_file_name');
    updates.push('mime_type = @mime_type');
  }

  if (updates.length === 0) {
    const err = new Error('No fields to update');
    err.statusCode = 400;
    throw err;
  }

  request.input('updated_by_user_id', sql.Int, audit.userId);
  request.input('updated_by_username', sql.NVarChar, audit.username);
  updates.push('updated_at = SYSUTCDATETIME()');
  updates.push('updated_by_user_id = @updated_by_user_id');
  updates.push('updated_by_username = @updated_by_username');

  await request.query(`
    UPDATE meal_content_items
    SET ${updates.join(', ')}
    WHERE id = @id
  `);

  return mapRowMeta(await fetchRowMeta(pool, id));
}

async function deleteMealContent(pool, id, user) {
  assertCanWriteMealContent(user);
  const existing = await fetchRowMeta(pool, id);
  if (!existing) {
    const err = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }

  if (String(existing.item_type).toLowerCase() === 'folder') {
    const childReq = pool.request();
    childReq.input('parent_id', sql.Int, id);
    const childRes = await childReq.query(`
      SELECT COUNT(*) AS cnt FROM meal_content_items WHERE parent_id = @parent_id
    `);
    const cnt = childRes.recordset?.[0]?.cnt ?? 0;
    if (cnt > 0) {
      const err = new Error('Folder is not empty. Delete or move items inside it first.');
      err.statusCode = 400;
      throw err;
    }
  }

  const request = pool.request();
  request.input('id', sql.Int, id);
  await request.query(`DELETE FROM meal_content_items WHERE id = @id`);
  return { success: true };
}

/** Breadcrumb path from root to folder (for navigation UI). */
async function getMealContentBreadcrumb(pool, category, folderId, user) {
  const cat = validateCategory(category);
  assertCanReadMealContent(user);
  if (folderId == null) return [];

  const crumbs = [];
  let currentId = folderId;
  const seen = new Set();

  while (currentId != null) {
    if (seen.has(currentId)) break;
    seen.add(currentId);
    const row = await fetchRowMeta(pool, currentId);
    if (!row || String(row.category).toLowerCase() !== cat) break;
    if (String(row.item_type).toLowerCase() !== 'folder') break;
    crumbs.unshift({ id: row.id, display_name: row.display_name });
    currentId = row.parent_id;
  }

  return crumbs;
}

module.exports = {
  MEAL_CATEGORIES,
  MAX_FILE_BYTES,
  listMealContent,
  listMealContentFolders,
  getMealContentDownload,
  createMealContent,
  updateMealContent,
  deleteMealContent,
  getMealContentBreadcrumb,
};
