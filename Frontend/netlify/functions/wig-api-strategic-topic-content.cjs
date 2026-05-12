/**
 * Strategic topic "Content Folder" — files per pillar (volunteers, refugees, …).
 * Read: CEO, Admin, department, topic.
 * Write (upload/replace/delete): CEO, Admin, or topic user whose editable pillar matches the row's strategic_topic.
 */

const sql = require('mssql');

const STRATEGIC_TOPICS = ['volunteers', 'refugees', 'returnees', 'relief', 'awareness'];
const MAX_FILE_BYTES = 24 * 1024 * 1024; // 24 MB (keep below typical proxy limits)

function normalizeRole(user) {
  if (!user) return '';
  return String(user.role || user.Role || '')
    .trim()
    .toLowerCase();
}

function isCeoOrAdmin(user) {
  const r = normalizeRole(user);
  return r === 'ceo' || r === 'admin';
}

function editableStrategicTopicFromUser(user) {
  if (!user) return null;
  const v =
    user.editableStrategicTopic ??
    user.editable_strategic_topic ??
    user.EditableStrategicTopic;
  if (v == null || !String(v).trim()) return null;
  return String(v).trim().toLowerCase();
}

async function enrichTopicRoleUserFromDb(pool, user) {
  if (!user) return user;
  if (normalizeRole(user) !== 'topic') return user;
  if (editableStrategicTopicFromUser(user)) return user;
  const uid = user.userId ?? user.id ?? user.user_id;
  const idNum = parseInt(String(uid ?? ''), 10);
  if (!Number.isFinite(idNum) || idNum <= 0) return user;
  try {
    const request = pool.request();
    request.input('id', sql.Int, idNum);
    const r = await request.query('SELECT editable_strategic_topic FROM users WHERE id = @id');
    const row = r.recordset?.[0];
    if (!row) return user;
    const raw =
      row.editable_strategic_topic ??
      row.Editable_Strategic_Topic ??
      row.editableStrategicTopic;
    const t = String(raw ?? '').trim().toLowerCase();
    if (!t) return user;
    return { ...user, editableStrategicTopic: t };
  } catch {
    return user;
  }
}

function validateStrategicTopic(topic) {
  const t = String(topic || '').trim().toLowerCase();
  if (!STRATEGIC_TOPICS.includes(t)) {
    const err = new Error(`Invalid strategic_topic. Must be one of: ${STRATEGIC_TOPICS.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  return t;
}

function assertAuthenticated(user) {
  if (!user) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }
}

/** List / download: strategic topic pages are readable by CEO, Admin, department, topic. */
function assertCanReadStrategicTopicContent(user) {
  assertAuthenticated(user);
  const r = normalizeRole(user);
  if (isCeoOrAdmin(user) || r === 'department' || r === 'topic') return;
  const err = new Error('Insufficient permissions');
  err.statusCode = 403;
  throw err;
}

function assertCanWriteStrategicTopicContent(user, strategicTopicKey) {
  assertAuthenticated(user);
  if (isCeoOrAdmin(user)) return;
  const key = String(strategicTopicKey || '').trim().toLowerCase();
  const r = normalizeRole(user);
  if (r === 'topic') {
    const home = editableStrategicTopicFromUser(user);
    if (home && home === key) return;
  }
  const err = new Error('You can only modify files for your assigned strategic topic');
  err.statusCode = 403;
  throw err;
}

function mapRowMeta(row) {
  if (!row) return null;
  return {
    id: row.id,
    strategic_topic: row.strategic_topic,
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

async function listStrategicTopicContent(pool, strategicTopic, user) {
  assertCanReadStrategicTopicContent(user);
  const topic = validateStrategicTopic(strategicTopic);
  const request = pool.request();
  request.input('topic', sql.NVarChar, topic);
  const result = await request.query(`
    SELECT
      id, strategic_topic, display_name, description, original_file_name, mime_type, file_size_bytes,
      created_at, created_by_username, updated_at, updated_by_username
    FROM strategic_topic_content_files
    WHERE strategic_topic = @topic
    ORDER BY updated_at DESC, id DESC
  `);
  return (result.recordset || []).map(mapRowMeta);
}

async function fetchRowMeta(pool, id) {
  const request = pool.request();
  request.input('id', sql.Int, id);
  const r = await request.query(`
    SELECT
      id, strategic_topic, display_name, description, original_file_name, mime_type, file_size_bytes,
      created_at, created_by_username, updated_at, updated_by_username
    FROM strategic_topic_content_files WHERE id = @id
  `);
  return r.recordset?.[0] || null;
}

async function fetchRowWithBlob(pool, id) {
  const request = pool.request();
  request.input('id', sql.Int, id);
  const r = await request.query(`SELECT * FROM strategic_topic_content_files WHERE id = @id`);
  return r.recordset?.[0] || null;
}

async function getStrategicTopicContentDownload(pool, id, user) {
  assertCanReadStrategicTopicContent(user);
  const row = await fetchRowWithBlob(pool, id);
  if (!row) {
    const err = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }
  const blob =
    row.file_data ?? row.File_Data ?? row.file_Data;
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

async function createStrategicTopicContent(pool, body, user) {
  user = await enrichTopicRoleUserFromDb(pool, user);
  const topic = validateStrategicTopic(body.strategic_topic);
  assertCanWriteStrategicTopicContent(user, topic);

  const displayName = String(body.display_name || '').trim();
  if (!displayName) {
    const err = new Error('display_name is required');
    err.statusCode = 400;
    throw err;
  }
  const description = body.description != null ? String(body.description).trim() || null : null;
  const originalName = String(body.original_file_name || '').trim();
  if (!originalName) {
    const err = new Error('original_file_name is required');
    err.statusCode = 400;
    throw err;
  }
  const mimeType = body.mime_type != null ? String(body.mime_type).trim() || null : null;
  const buf = decodeBase64FilePayload(body.file_base64);
  const audit = userAuditFields(user);

  const request = pool.request();
  request.input('strategic_topic', sql.NVarChar, topic);
  request.input('display_name', sql.NVarChar, displayName);
  request.input('description', sql.NVarChar(sql.MAX), description);
  request.input('original_file_name', sql.NVarChar, originalName);
  request.input('mime_type', sql.NVarChar, mimeType);
  request.input('file_data', sql.VarBinary(sql.MAX), buf);
  request.input('file_size_bytes', sql.Int, buf.length);
  request.input('created_by_user_id', sql.Int, audit.userId);
  request.input('created_by_username', sql.NVarChar, audit.username);
  request.input('updated_by_user_id', sql.Int, audit.userId);
  request.input('updated_by_username', sql.NVarChar, audit.username);

  const ins = await request.query(`
    INSERT INTO strategic_topic_content_files (
      strategic_topic, display_name, description, original_file_name, mime_type,
      file_data, file_size_bytes,
      created_by_user_id, created_by_username, updated_by_user_id, updated_by_username
    )
    OUTPUT INSERTED.id
    VALUES (
      @strategic_topic, @display_name, @description, @original_file_name, @mime_type,
      @file_data, @file_size_bytes,
      @created_by_user_id, @created_by_username, @updated_by_user_id, @updated_by_username
    )
  `);
  const newId = ins.recordset[0]?.id;
  return mapRowMeta(await fetchRowMeta(pool, newId));
}

async function updateStrategicTopicContent(pool, id, body, user) {
  user = await enrichTopicRoleUserFromDb(pool, user);
  const existing = await fetchRowWithBlob(pool, id);
  if (!existing) {
    const err = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }
  const topicKey = String(existing.strategic_topic || '').trim().toLowerCase();
  assertCanWriteStrategicTopicContent(user, topicKey);

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

  if (body.file_base64 != null && body.file_base64 !== '') {
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
    UPDATE strategic_topic_content_files
    SET ${updates.join(', ')}
    WHERE id = @id
  `);

  return mapRowMeta(await fetchRowMeta(pool, id));
}

async function deleteStrategicTopicContent(pool, id, user) {
  user = await enrichTopicRoleUserFromDb(pool, user);
  const existing = await fetchRowMeta(pool, id);
  if (!existing) {
    const err = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }
  const topicKey = String(existing.strategic_topic || '').trim().toLowerCase();
  assertCanWriteStrategicTopicContent(user, topicKey);

  const request = pool.request();
  request.input('id', sql.Int, id);
  await request.query(`DELETE FROM strategic_topic_content_files WHERE id = @id`);
  return { success: true };
}

module.exports = {
  STRATEGIC_TOPICS,
  listStrategicTopicContent,
  getStrategicTopicContentDownload,
  createStrategicTopicContent,
  updateStrategicTopicContent,
  deleteStrategicTopicContent,
};
