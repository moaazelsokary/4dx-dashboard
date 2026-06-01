/**
 * WIG strategic-topic API access — aligns with frontend route overrides (Viewer, case worker).
 */

const { STRATEGIC_TOPIC_CODES, TOPIC_BASE_PATH } = require('./strategic-topics.cjs');

const REFUGEES_CASE_STORY_PATH = '/main-plan/refugees/case-story';

function normalizeRole(user) {
  return String(user?.role || user?.Role || '')
    .trim()
    .toLowerCase();
}

function getAllowedRoutes(user) {
  const raw = user?.allowedRoutes ?? user?.allowed_routes;
  if (raw == null) return null;
  return Array.isArray(raw) ? raw : null;
}

function hasAppPath(user, path) {
  const routes = getAllowedRoutes(user);
  if (routes === null) return false;
  const base = String(path || '').split('?')[0];
  return routes.some((r) => {
    const p = String(r || '').split('?')[0];
    return p === base || p.startsWith(`${base}/`);
  });
}

function editableStrategicTopicFromUser(user) {
  const v = user?.editableStrategicTopic ?? user?.editable_strategic_topic ?? user?.EditableStrategicTopic;
  if (v == null || !String(v).trim()) return null;
  return String(v).trim().toLowerCase();
}

/**
 * May call GET strategic-topic-kpi-rows, strategic-topic-content, monthly data read, etc.
 */
function canReadStrategicTopicApi(user, topic) {
  if (!user) return false;
  const topicNorm = String(topic || '').trim().toLowerCase();
  if (!STRATEGIC_TOPIC_CODES.includes(topicNorm)) return false;

  const r = normalizeRole(user);
  if (r === 'ceo' || r === 'admin' || r === 'department') return true;

  /** Topic role: read all strategic topic pillars; write is limited in row handlers. */
  if (r === 'topic') {
    return true;
  }

  const base = TOPIC_BASE_PATH[topicNorm];
  if (!base) return false;

  if (r === 'viewer' || r === 'project') {
    return hasAppPath(user, base);
  }

  if (r === 'case worker') {
    if (topicNorm !== 'refugees') return false;
    return hasAppPath(user, base) || hasAppPath(user, REFUGEES_CASE_STORY_PATH);
  }

  return false;
}

/** CEO / Admin / department / topic may mutate KPI rows (handlers apply finer rules). */
function canWriteStrategicTopicKpi(user) {
  const r = normalizeRole(user);
  return r === 'ceo' || r === 'admin' || r === 'department' || r === 'topic';
}

module.exports = {
  STRATEGIC_TOPIC_CODES,
  TOPIC_BASE_PATH,
  canReadStrategicTopicApi,
  canWriteStrategicTopicKpi,
};
