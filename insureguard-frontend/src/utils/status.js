// Single source of truth for how claim statuses are presented. Keys are the Claims API's `status` values
// (services/adapters.js passes them through unchanged); `step` places the claim on the 4-step tracker.
// HIGH_RISK is a legacy value that only the preview-mode simulator emits.
export const CLAIM_STATUS = {
  SUBMITTED: { label: 'Received', tone: 'info', step: 1 },
  DOCUMENT_PROCESSING: { label: 'Reading documents', tone: 'info', step: 2 },
  VALIDATING: { label: 'Validating details', tone: 'info', step: 2 },
  FRAUD_ANALYSIS: { label: 'Risk assessment', tone: 'info', step: 3 },
  PROCESSING: { label: 'Processing claim', tone: 'info', step: 4 },
  ADDITIONAL_REVIEW: { label: 'Additional review required', tone: 'warn', step: 4 },
  FRAUD_REVIEW: { label: 'Fraud review required', tone: 'warn', step: 4 },
  HIGH_RISK: { label: 'Additional review required', tone: 'warn', step: 4 },
  UNDER_INVESTIGATION: { label: 'Under review', tone: 'warn', step: 4 },
  APPROVED: { label: 'Approved', tone: 'success', step: 4 },
  REJECTED: { label: 'Rejected', tone: 'danger', step: 4 },
};

// Compact 4-step tracker (dashboard cards).
export const CLAIM_STEPS = [
  { key: 'SUBMITTED', title: 'Claim received', hint: 'Saved and queued for processing' },
  { key: 'DOCUMENT_PROCESSING', title: 'Documents checked', hint: 'Photos and PDFs are read automatically' },
  { key: 'FRAUD_ANALYSIS', title: 'Risk assessment', hint: 'Automated consistency checks' },
  { key: 'DECISION', title: 'Decision', hint: 'Approval or specialist review' },
];

// Detailed 6-step processing timeline (claim details page).
// `tech` is the cloud path behind the step; `reviewTech` replaces it when the claim is routed to review.
export const TIMELINE_STEPS = [
  { n: 1, title: 'Claim submitted', hint: 'Your claim was saved.', tech: 'Cloud Run Claims API → PostgreSQL' },
  { n: 2, title: 'Documents uploaded', hint: 'Photos and PDFs were stored securely.', tech: 'Browser → Cloud Storage (signed URL) → Pub/Sub' },
  { n: 3, title: 'Documents processed', hint: 'Text and details were read from your files.', tech: 'Cloud Storage → Document AI' },
  { n: 4, title: 'Fraud analysis', hint: 'Automated consistency checks are run.', tech: 'Redis + PostgreSQL → Fraud Worker' },
  { n: 5, title: 'Risk assessment', hint: 'The results are scored by our model.', tech: 'Fraud Worker → Vertex AI' },
  {
    n: 6,
    title: 'Final review',
    hint: 'We approve your claim or pass it to a claims specialist.',
    tech: 'Claim Worker → PostgreSQL',
    reviewTech: 'Pub/Sub → Notification Worker → Email + Jira',
  },
];
export const CUSTOMER_UPDATE_TECH = 'WebSocket → Browser';

// Automated processing is over: approved, rejected, or handed to a person for review. (HIGH_RISK is the
// legacy preview-mode status that still moves on to UNDER_INVESTIGATION, so it is not final.)
const FINAL = ['APPROVED', 'REJECTED', 'ADDITIONAL_REVIEW', 'FRAUD_REVIEW', 'UNDER_INVESTIGATION'];
const REVIEW = ['ADDITIONAL_REVIEW', 'FRAUD_REVIEW', 'HIGH_RISK', 'UNDER_INVESTIGATION'];

export const isFinal = (status) => FINAL.includes(status);
export const needsReview = (status) => REVIEW.includes(status);

const prettify = (s = '') => s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

// Unknown statuses from the backend still render readably ("Under review") instead of raw codes.
export const statusInfo = (status) => CLAIM_STATUS[status] || { label: prettify(status), tone: 'info', step: 1 };

/**
 * Where the 6-step timeline stands for a claim.
 * done = number of completed steps; active = step currently running (or null); warn = step shown as "needs review".
 * The claim's status is authoritative; events only supply timestamps.
 */
export function timelineProgress({ status }) {
  switch (status) {
    case 'SUBMITTED': return { done: 1, active: 2, warn: null };
    case 'DOCUMENT_PROCESSING':
    case 'VALIDATING': return { done: 2, active: 3, warn: null };
    case 'FRAUD_ANALYSIS': return { done: 4, active: 5, warn: null };
    case 'PROCESSING': return { done: 5, active: 6, warn: null };
    case 'ADDITIONAL_REVIEW':
    case 'FRAUD_REVIEW':
    case 'HIGH_RISK':
    case 'UNDER_INVESTIGATION':
    case 'REJECTED': return { done: 5, active: null, warn: 6 };
    case 'APPROVED': return { done: 6, active: null, warn: null };
    default: return { done: 0, active: 1, warn: null };
  }
}
