// Translates the Claims API (snake_case, database-shaped) into the shapes the UI components already use.
// This is the ONLY place that knows backend field names, so API changes are fixed here and nowhere else.
import { formatCurrency } from '../utils/format';

const titleCase = (s = '') => String(s).toLowerCase().replace(/_/g, ' ').replace(/(^|\s)\w/g, (c) => c.toUpperCase());
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// ---- customer / policy / vehicle -------------------------------------------------------------

export const toCustomer = (c = {}) => ({
  id: c.customer_id,
  customerNumber: c.customer_number,
  name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Customer',
  email: c.email,
  phone: c.phone,
  dateOfBirth: c.date_of_birth,
  address: [c.address_line1, c.city, c.state, c.postal_code].filter(Boolean).join(', '),
});

export const toVehicle = (v) =>
  v && {
    id: v.vehicle_id,
    year: v.model_year,
    make: v.make,
    model: v.model,
    vin: v.vin,
    plate: v.registration_number,
    type: v.vehicle_type ? titleCase(v.vehicle_type) : null,
    estimatedValue: num(v.estimated_value),
  };

export const toPolicy = (p = {}) => ({
  id: p.policy_id,
  policyNumber: p.policy_number,
  plan: `${titleCase(p.policy_type || 'Auto')} policy`,
  status: titleCase(p.status),
  effectiveDate: p.start_date,
  renewalDate: p.end_date,
  premium: num(p.premium_amount),
  premiumPeriod: 'year', // premium_amount covers the policy term (start_date to end_date, one year)
  deductible: num(p.deductible_amount),
  coverageLimit: num(p.coverage_limit),
  coverages:
    p.coverage_limit != null
      ? [{ name: 'Coverage limit', limit: formatCurrency(num(p.coverage_limit)), included: true }]
      : [],
});

// ---- claims ----------------------------------------------------------------------------------

// The API's `status` is the claim's lifecycle state and is used as is (SUBMITTED, DOCUMENT_PROCESSING, VALIDATING,
// FRAUD_ANALYSIS, PROCESSING, ADDITIONAL_REVIEW, FRAUD_REVIEW, APPROVED, REJECTED ...). How each one looks is decided
// in utils/status.js. `fraud_status` (LOW / MEDIUM / HIGH) is the risk result and never changes the lifecycle status.
const STATUS_ALIAS = { RECEIVED: 'SUBMITTED', UNDER_REVIEW: 'UNDER_INVESTIGATION' };

export function mapStatus({ status }) {
  const s = String(status || '').toUpperCase();
  return STATUS_ALIAS[s] || s;
}

// Which of the six timeline steps an event belongs to (first match wins), used for the step timestamps.
// Unmatched events only show in the activity list. Completion rules come before start rules on purpose:
// FRAUD_ANALYSIS_COMPLETED is the risk assessment (step 5), not the start of fraud analysis (step 4).
const STEP_RULES = [
  [/SUBMIT/, 1],
  [/UPLOAD/, 2],
  [/FRAUD.*COMPLET|ASSESS|SCORE/, 5],
  [/FRAUD.*(START|ANALY)/, 4],
  [/DOCUMENT/, 3],
  [/(APPROV|REJECT|REVIEW|INVESTIGAT|JIRA|NOTIF)/, 6],
  [/RISK/, 5],
];
const stepFor = (type = '') => STEP_RULES.find(([re]) => re.test(type.toUpperCase()))?.[1];

const toEvent = (e, i) => ({
  id: `${e.event_type || 'event'}-${i}`,
  code: String(e.event_type || '').toLowerCase().replace(/_/g, '.'),
  at: e.created_at,
  step: stepFor(e.event_type),
  title: e.title,
  detail: e.description,
});

const toEvents = (list = []) =>
  list.map(toEvent).sort((a, b) => new Date(a.at) - new Date(b.at));

const toDocument = (d) => ({
  name: d.file_name || d.name || d.original_file_name || 'document',
  size: Number(d.file_size_bytes ?? d.size ?? 0),
  type: d.content_type || d.type || '',
  documentType: d.document_type,
});

// Backend uses LOW / MEDIUM / HIGH; the *_RISK spellings are legacy preview-mode values.
const FRAUD_LEVEL = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high', LOW_RISK: 'low', MEDIUM_RISK: 'medium', HIGH_RISK: 'high' };

/** Full claim (list item or detail). `ctx.policyNumber` fills the field the claims endpoints don't return. */
export function toClaim(c = {}, { policyNumber } = {}) {
  const assessment = c.fraud_assessment || c.assessment || {};
  const fraudStatus = c.fraud_status || assessment.fraud_status || null;
  return {
    id: c.claim_id,
    claimNumber: c.claim_number,
    policyNumber: c.policy_number || policyNumber || null,
    type: titleCase(c.claim_type),
    incidentDate: c.incident_date,
    location: c.location || null,
    description: c.description || '',
    estimatedAmount: num(c.claim_amount),
    approvedAmount: num(c.approved_amount),
    status: mapStatus(c),
    fraudStatus,
    riskScore: num(c.fraud_score ?? assessment.fraud_score ?? assessment.score),
    riskLevel: FRAUD_LEVEL[fraudStatus] || null,
    createdAt: c.submitted_at || c.reported_date,
    updatedAt: c.updated_at,
    documents: (c.documents || c.claim_documents || []).map(toDocument),
    events: toEvents(c.events || c.claim_events),
  };
}

/** GET /claims/:id/status -> only the fields that change, so it can be merged over an already-loaded claim. */
export const toClaimStatus = (s = {}) => ({
  id: s.claim_id,
  claimNumber: s.claim_number,
  status: mapStatus(s),
  fraudStatus: s.fraud_status || null,
  riskScore: num(s.fraud_score),
  riskLevel: FRAUD_LEVEL[s.fraud_status] || null,
  updatedAt: s.updated_at,
  events: toEvents(s.events),
});

// ---- outgoing --------------------------------------------------------------------------------

// The New Claim form uses friendly types; the API uses enum-style codes. Adjust here if the backend expects others.
const CLAIM_TYPE = { Collision: 'COLLISION' };
const DAMAGE_TYPE = {
  Collision: 'COLLISION',
  Theft: 'THEFT',
  Vandalism: 'VANDALISM',
  'Weather damage': 'WEATHER_DAMAGE',
  'Glass damage': 'GLASS_DAMAGE',
  Other: 'OTHER',
};

export function toClaimPayload(values, vehicleId) {
  // The API has no "location" field yet, so keep it with the description rather than dropping it.
  const description = values.location
    ? `${values.description.trim()}\n\nLocation: ${values.location.trim()}`
    : values.description.trim();
  return {
    claim_type: CLAIM_TYPE[values.type] || 'COMPREHENSIVE',
    incident_date: values.incidentDate,
    claim_amount: Number(values.estimatedAmount),
    description,
    damage_type: DAMAGE_TYPE[values.type] || 'OTHER',
    vehicle_id: vehicleId,
  };
}

export const documentTypeFor = (file) => (file.type === 'application/pdf' ? 'DOCUMENT' : 'PHOTO');
