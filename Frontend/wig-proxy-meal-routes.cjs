/**
 * MEAL content folder routes — mounted from wig-proxy.cjs
 */
const mealContent = require('./netlify/functions/wig-api-meal-content.cjs');
const mealLearningPoints = require('./netlify/functions/wig-api-meal-learning-points.cjs');
const { canAccessMeal } = require('./netlify/functions/utils/meal-access.cjs');

function getAuthorizationHeader(req) {
  if (!req.headers) return null;
  const direct = req.headers.authorization || req.headers.Authorization;
  if (direct) return direct;
  const key = Object.keys(req.headers).find((k) => k.toLowerCase() === 'authorization');
  return key ? req.headers[key] : null;
}

function wigUserFromJwt(req, jwt) {
  const authHeader = getAuthorizationHeader(req);
  if (!authHeader) return null;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  if (!token) return null;
  const { collectJwtSecrets } = require('./netlify/functions/utils/jwt-secrets.cjs');
  const secrets = collectJwtSecrets();
  for (const secret of secrets) {
    try {
      return jwt.verify(token, secret);
    } catch {
      /* try next */
    }
  }
  return null;
}

function sendMealContentStatus(res, error) {
  const code = error.statusCode || 500;
  return res.status(code).json({ error: error.message || 'Request failed' });
}

module.exports = function registerMealWigRoutes(app, { jwt, getPool, setNoCacheHeaders, handleError }) {
  app.get('/api/wig/meal-content', async (req, res) => {
    try {
      setNoCacheHeaders(res);
      const user = wigUserFromJwt(req, jwt);
      if (!user) return res.status(401).json({ error: 'Authentication required' });
      if (!canAccessMeal(user)) return res.status(403).json({ error: 'Insufficient permissions' });
      const category = req.query.category;
      if (!category) return res.status(400).json({ error: 'category query parameter is required' });
      const parentRaw = req.query.parent_id;
      const parentId =
        parentRaw === undefined || parentRaw === null || parentRaw === '' || parentRaw === 'null'
          ? null
          : parseInt(String(parentRaw), 10);
      if (parentId != null && Number.isNaN(parentId)) {
        return res.status(400).json({ error: 'Invalid parent_id' });
      }
      const pool = await getPool();
      const rows = await mealContent.listMealContent(pool, category, parentId, user);
      res.json(rows);
    } catch (error) {
      if (error.statusCode) return sendMealContentStatus(res, error);
      handleError(res, error, 'Error listing MEAL content');
    }
  });

  app.get('/api/wig/meal-content/breadcrumb', async (req, res) => {
    try {
      setNoCacheHeaders(res);
      const user = wigUserFromJwt(req, jwt);
      if (!user) return res.status(401).json({ error: 'Authentication required' });
      if (!canAccessMeal(user)) return res.status(403).json({ error: 'Insufficient permissions' });
      const category = req.query.category;
      const folderId = parseInt(String(req.query.folder_id ?? ''), 10);
      if (!category) return res.status(400).json({ error: 'category is required' });
      if (!Number.isFinite(folderId) || folderId <= 0) {
        return res.status(400).json({ error: 'folder_id is required' });
      }
      const pool = await getPool();
      const crumbs = await mealContent.getMealContentBreadcrumb(pool, category, folderId, user);
      res.json(crumbs);
    } catch (error) {
      if (error.statusCode) return sendMealContentStatus(res, error);
      handleError(res, error, 'Error loading MEAL breadcrumb');
    }
  });

  app.get('/api/wig/meal-content/folders', async (req, res) => {
    try {
      setNoCacheHeaders(res);
      const user = wigUserFromJwt(req, jwt);
      if (!user) return res.status(401).json({ error: 'Authentication required' });
      if (!canAccessMeal(user)) return res.status(403).json({ error: 'Insufficient permissions' });
      const category = req.query.category;
      if (!category) return res.status(400).json({ error: 'category query parameter is required' });
      const pool = await getPool();
      const rows = await mealContent.listMealContentFolders(pool, category, user);
      res.json(rows);
    } catch (error) {
      if (error.statusCode) return sendMealContentStatus(res, error);
      handleError(res, error, 'Error listing MEAL folders');
    }
  });

  app.get('/api/wig/meal-content/:id/download', async (req, res) => {
    try {
      setNoCacheHeaders(res);
      const user = wigUserFromJwt(req, jwt);
      if (!user) return res.status(401).json({ error: 'Authentication required' });
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const pool = await getPool();
      const bin = await mealContent.getMealContentDownload(pool, id, user);
      const fname = encodeURIComponent(bin.filename);
      res.setHeader('Content-Type', bin.mime);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fname}`);
      res.send(bin.buffer);
    } catch (error) {
      if (error.statusCode) return sendMealContentStatus(res, error);
      handleError(res, error, 'Error downloading MEAL file');
    }
  });

  app.post('/api/wig/meal-content', async (req, res) => {
    try {
      const user = wigUserFromJwt(req, jwt);
      if (!user) return res.status(401).json({ error: 'Authentication required' });
      const pool = await getPool();
      const row = await mealContent.createMealContent(pool, req.body, user);
      res.json(row);
    } catch (error) {
      if (error.statusCode) return sendMealContentStatus(res, error);
      handleError(res, error, 'Error creating MEAL content');
    }
  });

  app.put('/api/wig/meal-content/:id', async (req, res) => {
    try {
      const user = wigUserFromJwt(req, jwt);
      if (!user) return res.status(401).json({ error: 'Authentication required' });
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const pool = await getPool();
      const row = await mealContent.updateMealContent(pool, id, req.body, user);
      res.json(row);
    } catch (error) {
      if (error.statusCode) return sendMealContentStatus(res, error);
      handleError(res, error, 'Error updating MEAL content');
    }
  });

  app.delete('/api/wig/meal-content/:id', async (req, res) => {
    try {
      const user = wigUserFromJwt(req, jwt);
      if (!user) return res.status(401).json({ error: 'Authentication required' });
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const pool = await getPool();
      const result = await mealContent.deleteMealContent(pool, id, user);
      res.json(result);
    } catch (error) {
      if (error.statusCode) return sendMealContentStatus(res, error);
      handleError(res, error, 'Error deleting MEAL content');
    }
  });

  app.get('/api/wig/meal-learning-points', async (req, res) => {
    try {
      setNoCacheHeaders(res);
      const user = wigUserFromJwt(req, jwt);
      if (!user) return res.status(401).json({ error: 'Authentication required' });
      const pool = await getPool();
      const rows = await mealLearningPoints.listMealLearningPoints(pool, user);
      res.json(rows);
    } catch (error) {
      if (error.statusCode) return sendMealContentStatus(res, error);
      handleError(res, error, 'Error listing learning points');
    }
  });

  app.post('/api/wig/meal-learning-points/update-order', async (req, res) => {
    try {
      const user = wigUserFromJwt(req, jwt);
      if (!user) return res.status(401).json({ error: 'Authentication required' });
      const pool = await getPool();
      const result = await mealLearningPoints.updateMealLearningPointsOrder(pool, req.body, user);
      res.json(result);
    } catch (error) {
      if (error.statusCode) return sendMealContentStatus(res, error);
      handleError(res, error, 'Error updating learning points order');
    }
  });

  app.post('/api/wig/meal-learning-points', async (req, res) => {
    try {
      const user = wigUserFromJwt(req, jwt);
      if (!user) return res.status(401).json({ error: 'Authentication required' });
      const pool = await getPool();
      const row = await mealLearningPoints.createMealLearningPoint(pool, req.body, user);
      res.json(row);
    } catch (error) {
      if (error.statusCode) return sendMealContentStatus(res, error);
      handleError(res, error, 'Error creating learning point');
    }
  });

  app.put('/api/wig/meal-learning-points/:id', async (req, res) => {
    try {
      const user = wigUserFromJwt(req, jwt);
      if (!user) return res.status(401).json({ error: 'Authentication required' });
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const pool = await getPool();
      const row = await mealLearningPoints.updateMealLearningPoint(pool, id, req.body, user);
      res.json(row);
    } catch (error) {
      if (error.statusCode) return sendMealContentStatus(res, error);
      handleError(res, error, 'Error updating learning point');
    }
  });

  app.delete('/api/wig/meal-learning-points/:id', async (req, res) => {
    try {
      const user = wigUserFromJwt(req, jwt);
      if (!user) return res.status(401).json({ error: 'Authentication required' });
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const pool = await getPool();
      const result = await mealLearningPoints.deleteMealLearningPoint(pool, id, user);
      res.json(result);
    } catch (error) {
      if (error.statusCode) return sendMealContentStatus(res, error);
      handleError(res, error, 'Error deleting learning point');
    }
  });
};
