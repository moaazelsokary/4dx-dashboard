/**
 * Odoo SQL extracts for refugees read model (used by sync pipeline).
 */

const REFUGEES_CASES_SQL = `
SELECT
    cases.id AS ID,
    cases.id AS res_case_id,
    NULL AS Parent_Name,
    'Case' AS Reciever_Type,
    CASE
        WHEN cases.national_id IS NOT NULL THEN cases.national_id
        WHEN cases.personal_identification_number IS NOT NULL THEN cases.personal_identification_number
        ELSE cases.file_number
    END AS Case_id,
    partner.complete_name AS Name,
    NULL AS relation_type,
    cases.personal_identification_number AS Personal_Number,
    cases.file_number AS File_Number,
    CASE
        WHEN nationality = 'egyptian' THEN 'Egyptian'
        ELSE OtherNationality.name ->> 'en_US'
    END AS Nationality,
    cases.age AS Age,
    cases.gender AS Gender,
    partner.phone AS Phone,
    partner.mobile AS Mobile,
    social.name AS Social_status,
    cases.number_of_family AS Number_of_family,
    eduction.name AS Education,
    form.name AS Form,
    cases.case_code AS Case_Code,
    CAST(cases.family_visit_date AS DATE) AS Family_Visit_Date,
    STRING_AGG(team.name ->> 'en_US', ', ') AS Teams,
    (country.name ->> 'en_US') AS Country,
    state.name AS Government,
    (zone.name ->> 'en_US') AS Zone,
    (city.name ->> 'en_US') AS City,
    partner.street AS Street,
    partner.street2 AS Street2,
    cases.state AS Status,
    cases.on_going AS On_Going_Case,
    OtherNationality.name ->> 'en_US' AS Other_Nationality,
    cases.create_date AS Create_Date
FROM
    res_case cases
    LEFT JOIN crm_team_res_case_rel Bridge_teams ON cases.id = Bridge_teams.res_case_id
    LEFT JOIN crm_team team ON Bridge_teams.crm_team_id = team.id
    LEFT JOIN form_type form ON cases.form_type = form.id
    LEFT JOIN education_type eduction ON cases.education_type_id = eduction.id
    LEFT JOIN social_status social ON cases.social_status_id = social.id
    LEFT JOIN res_city city ON cases.city_id = city.id
    LEFT JOIN res_partner partner ON cases.partner_id = partner.id
    LEFT JOIN res_country country ON partner.country_id = country.id
    LEFT JOIN res_country_state state ON partner.state_id = state.id
    LEFT JOIN res_country_zone zone ON partner.zone_id = zone.id
    LEFT JOIN res_country OtherNationality ON cases.other_nationality::text = OtherNationality.id::text
    LEFT JOIN res_country Nationality ON cases.nationality::text = Nationality.id::text
WHERE
    cases.nationality = 'other' AND partner.active = 'TRUE'
GROUP BY
    cases.id,
    cases.personal_identification_number,
    cases.national_id,
    cases.file_number,
    partner.complete_name,
    cases.age,
    cases.gender,
    partner.phone,
    partner.mobile,
    social.name,
    cases.number_of_family,
    eduction.name,
    form.name,
    cases.case_code,
    cases.family_visit_date,
    country.name,
    state.name,
    zone.name,
    city.name,
    partner.street,
    partner.street2,
    cases.state,
    nationality,
    OtherNationality.name,
    cases.on_going,
    cases.create_date

UNION

SELECT
    family.id AS ID,
    cases.id AS res_case_id,
    partner.complete_name AS Parent_Name,
    'Dependant' AS Reciever_Type,
    CASE
        WHEN family.national_id IS NOT NULL THEN family.national_id
        WHEN family.personal_identification_number IS NOT NULL THEN family.personal_identification_number
        ELSE family.file_number
    END AS Case_id,
    family.name AS Name,
    relation.name AS relation_type,
    family.personal_identification_number AS Personal_Number,
    family.file_number AS File_Number,
    CASE
        WHEN nationality.name ->> 'en_US' IS NULL THEN Other_nationality.name ->> 'en_US'
    END AS Nationality,
    family.age AS Age,
    family.gender AS Gender,
    partner.phone AS Phone,
    partner.mobile AS Mobile,
    social.name AS Social_status,
    cases.number_of_family AS Number_of_family,
    education.name AS Education,
    form.name AS Form,
    cases.case_code AS Case_Code,
    CAST(cases.family_visit_date AS DATE) AS Family_Visit_Date,
    STRING_AGG(team.name ->> 'en_US', ', ') AS Teams,
    (country.name ->> 'en_US') AS Country,
    state.name AS Government,
    (zone.name ->> 'en_US') AS Zone,
    (city.name ->> 'en_US') AS City,
    partner.street AS Street,
    partner.street2 AS Street2,
    cases.state AS Status,
    cases.on_going AS On_Going_Case,
    Other_nationality.name ->> 'en_US' AS Other_Nationality,
    family.create_date AS Create_Date
FROM
    family_relation family
    LEFT JOIN education_type education ON family.education_type_id = education.id
    LEFT JOIN family_relation_type relation ON family.family_relation_type_id = relation.id
    LEFT JOIN res_country nationality ON family.nationality::text = nationality.id::text
    LEFT JOIN res_country Other_nationality ON family.other_nationality::text = Other_nationality.id::text
    LEFT JOIN social_status social ON family.social_status_id = social.id
    LEFT JOIN case_implementation ON family.id = case_implementation.family_relation_id
    LEFT JOIN res_case cases ON cases.id = family.case_id
    LEFT JOIN crm_team_res_case_rel Bridge_teams ON cases.id = Bridge_teams.res_case_id
    LEFT JOIN crm_team team ON Bridge_teams.crm_team_id = team.id
    LEFT JOIN form_type form ON cases.form_type = form.id
    LEFT JOIN res_city city ON cases.city_id = city.id
    LEFT JOIN res_partner partner ON cases.partner_id = partner.id
    LEFT JOIN res_country_zone zone ON partner.zone_id = zone.id
    LEFT JOIN res_country country ON partner.country_id = country.id
    LEFT JOIN res_country_state state ON partner.state_id = state.id
WHERE
    cases.nationality = 'other' AND family.active = 'TRUE'
GROUP BY
    family.id,
    cases.id,
    partner.complete_name,
    family.national_id,
    family.personal_identification_number,
    family.file_number,
    family.name,
    relation.name,
    family.age,
    family.gender,
    partner.phone,
    partner.mobile,
    social.name,
    cases.number_of_family,
    education.name,
    form.name,
    cases.case_code,
    cases.family_visit_date,
    country.name,
    state.name,
    zone.name,
    city.name,
    partner.street,
    partner.street2,
    cases.state,
    nationality.name,
    Other_nationality.name,
    cases.on_going,
    family.create_date
`;

const SERVICES_SQL = `
SELECT
    Case_implementation.id AS Service_id,
    res_case.id AS Case_id,
    family_relation_id AS Dependant_id,
    category.complete_name AS Category,
    template.name ->> 'en_US' AS Product,
    Case_implementation.quantity AS quantity,
    Case_implementation.state AS Feedback,
    Case_implementation.expected_date AS Expected_Date,
    Case_implementation.actual_date AS Actual_Date,
    Case_implementation.service_last_updated_on AS Service_Last_Updated_On,
    Case_implementation.implementation_receiver AS Reciever,
    Case_implementation.implementation_state AS Implementation_State,
    Case_implementation.actual_amount AS Actual_Amount,
    Case_implementation.create_date AS Create_date,
    Case_implementation.funding_done_date AS Funding_done_date,
    Case_implementation.done_date AS Done_date,
    Case_implementation.batch_number AS batch_number,
    Case_implementation.total_approved_needs_amount AS total_approved_needs_amount,
    Case_implementation.total_collected_amount AS total_collected_amount,
    Case_implementation.different_total_amount AS different_total_amount,
    Case_implementation.remaining_balance AS remaining_balance,
    Case_implementation.unit_price AS unit_price,
    Case_implementation.notes AS Notes,
    reason.name AS Reason,
    Case_implementation.implementation_receiver AS Receiver,
    source_of_fund.name ->> 'en_US' AS Source_of_fund
FROM public.case_implementation Case_implementation
INNER JOIN res_case ON Case_implementation.case_id = res_case.id
LEFT JOIN product_product product ON Case_implementation.product_id = product.id
LEFT JOIN product_template template ON product.product_tmpl_id = template.id
LEFT JOIN product_category category ON Case_implementation.product_category_id = category.id
LEFT JOIN case_implementation_reason reason ON Case_implementation.reason_id = reason.id
LEFT JOIN source_of_fund ON Case_implementation.source_of_fund_id = source_of_fund.id
WHERE res_case.nationality = 'other' AND Case_implementation.active = 'TRUE'
`;

const EXECUTION_TEAMS_SQL = `
SELECT Case_implementation.id AS service_ID,
       implementation_teams.name AS Excusion_Team
FROM public.case_implementation Case_implementation
INNER JOIN res_case ON Case_implementation.case_id = res_case.id
INNER JOIN case_implementation_implementation_teams_rel
    ON Case_implementation.id = case_implementation_implementation_teams_rel.case_implementation_id
INNER JOIN implementation_teams
    ON implementation_teams.id = case_implementation_implementation_teams_rel.implementation_teams_id
WHERE res_case.nationality = 'other'
  AND Case_implementation.active = 'TRUE'
  AND implementation_teams.name NOT IN (
    'Cairo القاهره',
    'Giza الجيزه',
    'Qalyubia القليوبيه',
    'Alexandria الاسكندريه',
    'Suez السويس',
    'Port Said بورسعيد',
    'Damietta دمياط',
    'Al Sharqia الشرقيه',
    'Matrouh مطروح',
    'New Valley الوادي الجديد',
    'Red Sea البحر الاحمر',
    'North Sinai شمال سيناء',
    'Asyut اسيوط',
    'Luxor الاقصر',
    'Beheira البحيره',
    'Dakahlia الدقهليه',
    'Faiyum الفيوم',
    'Minya المنيا',
    'Beni Suef بني سويف',
    'Sohag سوهاج',
    'Qena قنا',
    'Monufia المنوفيه',
    'Aswan اسوان',
    'Ismailia الاسماعيليه',
    'South Sinai جنوب سيناء',
    'Gharbia الغربيه',
    'Kafr el-Sheikh كفر الشيخ'
)
`;

/** Quick Odoo probes — used when a full extract returns 0 rows. */
const PROBE_CASES_BASE_SQL = `
SELECT COUNT(*) AS cnt
FROM res_case cases
WHERE cases.nationality = 'other';
`;

const PROBE_CASES_ACTIVE_SQL = `
SELECT COUNT(*) AS cnt
FROM res_case cases
LEFT JOIN res_partner partner ON cases.partner_id = partner.id
WHERE cases.nationality = 'other' AND partner.active = 'TRUE';
`;

const PROBE_SERVICES_ACTIVE_SQL = `
SELECT COUNT(*) AS cnt
FROM case_implementation ci
INNER JOIN res_case ON ci.case_id = res_case.id
WHERE res_case.nationality = 'other'
  AND ci.active = 'TRUE';
`;

async function syncRefugeesBeneficiariesSnapshot(logger) {
  const { getPool } = require('../db.cjs');
  const { runReadModelSync } = require('./refugees-beneficiaries-sync-pipeline.cjs');
  const pool = await getPool();
  return runReadModelSync(pool, logger, {});
}

module.exports = {
  syncRefugeesBeneficiariesSnapshot,
  REFUGEES_CASES_SQL,
  SERVICES_SQL,
  EXECUTION_TEAMS_SQL,
  PROBE_CASES_BASE_SQL,
  PROBE_CASES_ACTIVE_SQL,
  PROBE_SERVICES_ACTIVE_SQL,
};
