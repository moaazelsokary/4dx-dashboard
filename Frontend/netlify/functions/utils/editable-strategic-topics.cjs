/**
 * Topic role: editable_strategic_topic column stores `||`-delimited codes (e.g. pwd||funding).
 * Single-code values remain valid (no delimiter).
 */
const { STRATEGIC_TOPIC_CODES } = require('./strategic-topics.cjs');

const DELIM = '||';

function parseEditableStrategicTopics(raw) {
  if (raw == null || !String(raw).trim()) return [];
  const parts = String(raw)
    .split(DELIM)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const allowed = new Set(STRATEGIC_TOPIC_CODES);
  const out = [];
  for (const p of parts) {
    if (allowed.has(p) && !out.includes(p)) out.push(p);
  }
  return out;
}

function toEditableStrategicTopicsPipe(codes) {
  if (!Array.isArray(codes)) return null;
  const allowed = new Set(STRATEGIC_TOPIC_CODES);
  const out = [];
  for (const c of codes) {
    const t = String(c || '').trim().toLowerCase();
    if (allowed.has(t) && !out.includes(t)) out.push(t);
  }
  return out.length ? out.join(DELIM) : null;
}

function editableStrategicTopicsFromUser(user) {
  if (!user) return [];
  const v =
    user.editableStrategicTopic ??
    user.editable_strategic_topic ??
    user.EditableStrategicTopic;
  return parseEditableStrategicTopics(v);
}

function userCanWriteStrategicTopic(user, topic) {
  const key = String(topic || '').trim().toLowerCase();
  return editableStrategicTopicsFromUser(user).includes(key);
}

/**
 * Normalize admin API body to pipe string or validation error message.
 * Accepts editable_strategic_topic (string) or editable_strategic_topics (string[]).
 */
function normalizeEditableStrategicTopicInput(body) {
  if (body.editable_strategic_topics !== undefined) {
    if (body.editable_strategic_topics === null) return { value: null };
    if (!Array.isArray(body.editable_strategic_topics)) {
      return { error: 'editable_strategic_topics must be an array of topic codes' };
    }
    const pipe = toEditableStrategicTopicsPipe(body.editable_strategic_topics);
    if (!pipe) {
      return { error: 'editable_strategic_topics must include at least one valid topic code' };
    }
    if (body.editable_strategic_topics.length !== parseEditableStrategicTopics(pipe).length) {
      return { error: `Invalid topic code in editable_strategic_topics. Use: ${STRATEGIC_TOPIC_CODES.join(', ')}` };
    }
    return { value: pipe };
  }
  if (body.editable_strategic_topic !== undefined) {
    if (body.editable_strategic_topic === null || String(body.editable_strategic_topic).trim() === '') {
      return { value: null };
    }
    const pipe = toEditableStrategicTopicsPipe(parseEditableStrategicTopics(body.editable_strategic_topic));
    if (!pipe) {
      return { error: 'Invalid editable_strategic_topic' };
    }
    return { value: pipe };
  }
  return { value: undefined };
}

module.exports = {
  DELIM,
  parseEditableStrategicTopics,
  toEditableStrategicTopicsPipe,
  editableStrategicTopicsFromUser,
  userCanWriteStrategicTopic,
  normalizeEditableStrategicTopicInput,
};
