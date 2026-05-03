/**
 * Shape returned by metrics-api GET (Netlify + clients expect derivedDefinitions).
 */

const { loadMetricsBundleFromPool: loadRaw } = require('./monthly-fill-from-cache.cjs');

async function loadMetricsBundleFromPool(pool) {
  const bundle = await loadRaw(pool);
  const derivedDefs = bundle.derivedDefs || [];
  return {
    pms: bundle.pms,
    odoo: bundle.odoo,
    derived: bundle.derived,
    derivedDefinitions: derivedDefs.map(d => ({
      id: d.id,
      projectName: d.project_name,
      source: d.source,
      definition: typeof d.definition === 'string' ? JSON.parse(d.definition || '[]') : d.definition,
    })),
    lastUpdated: bundle.lastUpdated,
  };
}

module.exports = { loadMetricsBundleFromPool };
