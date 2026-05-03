/**
 * Normalize strategic_department_objectives rows from mssql — column names can vary by casing.
 */
function normalizeStrategicDbRow(row) {
  if (!row || typeof row !== 'object') return row;
  const lowerMap = {};
  for (const k of Object.keys(row)) {
    lowerMap[k.toLowerCase()] = row[k];
  }
  const pick = (name) => {
    const v = lowerMap[name.toLowerCase()];
    return v !== undefined ? v : undefined;
  };
  return {
    ...row,
    meeting_notes: pick('meeting_notes') ?? row.meeting_notes,
    me_e: pick('me_e') ?? row.me_e,
    active: pick('active') ?? row.active,
    notes: pick('notes') ?? row.notes,
    definition: pick('definition') ?? row.definition,
    measurement_aspect: pick('measurement_aspect') ?? row.measurement_aspect,
  };
}

module.exports = { normalizeStrategicDbRow };
