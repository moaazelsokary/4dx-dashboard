/**
 * Strategic topic codes — shared by WIG APIs and user-accounts-crud.
 * Keep in sync with Frontend/src/config/strategicTopics.ts
 */

const STRATEGIC_TOPIC_CODES = [
  'volunteers',
  'refugees',
  'returnees',
  'relief',
  'awareness',
  'pwd',
  'funding',
  'community',
];

const TOPIC_BASE_PATH = {
  volunteers: '/main-plan/volunteers',
  refugees: '/main-plan/refugees',
  returnees: '/main-plan/returnees',
  relief: '/main-plan/relief',
  awareness: '/main-plan/awareness',
  pwd: '/main-plan/pwd',
  funding: '/main-plan/funding',
  community: '/main-plan/community',
};

const STRATEGIC_TOPIC_ROUTE_PATHS = [
  '/main-plan/volunteers',
  '/main-plan/refugees',
  '/main-plan/refugees/case-story',
  '/main-plan/returnees',
  '/main-plan/relief',
  '/main-plan/awareness',
  '/main-plan/pwd',
  '/main-plan/funding',
  '/main-plan/community',
];

const TOPIC_CODES_LIST = STRATEGIC_TOPIC_CODES.join(' | ');

module.exports = {
  STRATEGIC_TOPIC_CODES,
  STRATEGIC_TOPICS: STRATEGIC_TOPIC_CODES,
  TOPIC_BASE_PATH,
  STRATEGIC_TOPIC_ROUTE_PATHS,
  EDITABLE_STRATEGIC_TOPIC_CODES: new Set(STRATEGIC_TOPIC_CODES),
  TOPIC_CODES_LIST,
};
