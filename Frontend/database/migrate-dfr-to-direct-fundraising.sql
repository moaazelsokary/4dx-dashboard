-- Migration script to update DFR to Direct Fundraising / Resource Mobilization
-- Run this script to update existing data

-- Update departments table
UPDATE [dbo].[departments]
SET [name] = 'Direct Fundraising / Resource Mobilization'
WHERE [code] = 'dfr' AND [name] = 'DFR';

-- Update rasci_metrics table - merge any duplicate records first
-- First, update all DFR records to use the full name
UPDATE [dbo].[rasci_metrics]
SET [department] = 'Direct Fundraising / Resource Mobilization'
WHERE [department] = 'DFR';

-- If there are duplicates (both DFR and Direct Fundraising / Resource Mobilization for same KPI),
-- we need to merge them. This query shows duplicates:
-- SELECT kpi, department, COUNT(*) as count
-- FROM rasci_metrics
-- WHERE department IN ('DFR', 'Direct Fundraising / Resource Mobilization')
-- GROUP BY kpi, department
-- HAVING COUNT(*) > 0;

-- For any KPIs that have both DFR and Direct Fundraising / Resource Mobilization,
-- we'll keep the one with more roles assigned (or the most recent one)
-- This is a complex merge - you may need to review duplicates manually

-- After migration, verify with:
-- SELECT DISTINCT department FROM rasci_metrics WHERE department LIKE '%Fundraising%' OR department = 'DFR';
-- Should only show 'Direct Fundraising / Resource Mobilization'

