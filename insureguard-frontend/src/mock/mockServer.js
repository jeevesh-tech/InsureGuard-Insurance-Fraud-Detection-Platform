// In-browser stand-in for the Claims API + Pub/Sub workers + WebSocket push.
// It exists only for demo mode (VITE_USE_MOCK=true). It holds no credentials and calls no cloud service.
//
// The `events` it produces use the same shape and codes the real backend should emit:
//   { id, code, at, step?, title?, detail?, tech? }
import { demoUser, demoPolicy, demoVehicle, seedClaims } from './data';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (x) => JSON.parse(JSON.stringify(x));

const claims = clone(seedClaims);
const listeners = new Set(); // (claim) => void
const runs = new Map(); // claimId -> run number, lets a replay cancel the previous pipeline

const emit = (claim) => listeners.forEach((fn) => fn(clone(claim)));

export const mockRealtime = {
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

// Delays between stages, in ms.
const DELAYS = { toDocs: 1500, toValidating: 3000, toFraud: 2000, toPrediction: 3500, toDecision: 1200, toInvestigation: 2200 };

function addEvent(claim, code, extra = {}) {
  claim.events.push({ id: `e${claim.events.length + 1}`, code, at: new Date().toISOString(), ...extra });
}

// Very rough heuristic standing in for the Vertex AI fraud model.
function scoreClaim(c) {
  let score = 10;
  const reasons = [];
  if (c.estimatedAmount > 10000) { score += 40; reasons.push('high claim value'); }
  else if (c.estimatedAmount > 5000) { score += 20; reasons.push('above-average claim value'); }
  if (/total loss|stolen|theft|fire|no witness/i.test(c.description)) { score += 25; reasons.push('sensitive wording'); }
  const delayDays = (Date.now() - new Date(c.incidentDate)) / 86400000;
  if (delayDays > 14) { score += 15; reasons.push('late reporting'); }
  if (c.documents.length === 0) { score += 15; reasons.push('no supporting documents'); }
  return { score: Math.min(score, 99), reasons };
}

function recordSubmission(claim) {
  claim.status = 'SUBMITTED';
  addEvent(claim, 'claim.submitted', { step: 1, title: 'Claim received', tech: 'Cloud Run Claims API → PostgreSQL' });
  addEvent(claim, 'documents.uploaded', {
    step: 2,
    title: 'Documents uploaded',
    detail: `${claim.documents.length} file(s) stored.`,
    tech: 'Cloud Storage → Pub/Sub',
  });
}

// Walks one claim through SUBMITTED → … → APPROVED | HIGH_RISK → UNDER_INVESTIGATION.
// `forceHigh` makes the outcome deterministic for demos.
async function runPipeline(claim, { forceHigh = false } = {}) {
  const run = (runs.get(claim.id) || 0) + 1;
  runs.set(claim.id, run);
  // Wait, then continue only if this run is still the current one.
  const step = async (ms) => { await wait(ms); return runs.get(claim.id) === run; };

  if (!(await step(DELAYS.toDocs))) return;
  claim.status = 'DOCUMENT_PROCESSING';
  addEvent(claim, 'documents.processing', { tech: 'Claim Worker' });
  emit(claim);

  if (!(await step(DELAYS.toValidating))) return;
  addEvent(claim, 'document.extracted', {
    step: 3,
    title: 'Documents processed',
    detail: claim.documents.length ? 'Text and image details were read successfully.' : 'No documents were provided.',
    tech: 'Cloud Storage → Document AI',
  });
  claim.status = 'VALIDATING';
  addEvent(claim, 'claim.validating', { tech: 'Claim Worker → PostgreSQL' });
  emit(claim);

  if (!(await step(DELAYS.toFraud))) return;
  claim.status = 'FRAUD_ANALYSIS';
  addEvent(claim, 'fraud.analysis.started', { step: 4, title: 'Checks started', tech: 'Redis + PostgreSQL → Fraud Worker' });
  emit(claim);

  if (!(await step(DELAYS.toPrediction))) return;
  const scored = scoreClaim(claim);
  const score = forceHigh ? Math.max(scored.score, 82) : scored.score;
  claim.riskScore = score;
  claim.riskLevel = score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low';
  addEvent(claim, 'vertex.prediction.completed', { step: 5, title: 'Risk assessment complete', tech: 'Fraud Worker → Vertex AI' });
  emit(claim);

  if (!(await step(DELAYS.toDecision))) return;
  if (score < 60) {
    addEvent(claim, 'fraud.low-risk', { tech: 'Fraud Worker' });
    claim.status = 'APPROVED';
    addEvent(claim, 'claim.approved', {
      step: 6,
      title: 'Claim approved',
      detail: 'Your payout is being scheduled.',
      tech: 'Claim Worker → PostgreSQL',
    });
    addEvent(claim, 'websocket.status.updated', { tech: 'WebSocket → Browser' });
    emit(claim);
    return;
  }

  claim.status = 'HIGH_RISK';
  addEvent(claim, 'fraud.high-risk', { title: 'Additional review required', tech: 'Fraud Worker' });
  addEvent(claim, 'websocket.status.updated', { tech: 'WebSocket → Browser' });
  emit(claim);

  if (!(await step(DELAYS.toInvestigation))) return;
  const ticket = `INS-${1000 + Math.floor(Math.random() * 900)}`;
  claim.status = 'UNDER_INVESTIGATION';
  addEvent(claim, 'notification.queued', { tech: 'Pub/Sub → Notification Worker' });
  addEvent(claim, 'email.sent', { tech: 'Notification Worker → Admin Email' });
  addEvent(claim, 'jira.ticket.created', {
    step: 6,
    title: 'Passed to claims team',
    detail: `Case ${ticket} assigned to a claims specialist.`,
    tech: 'Notification Worker → Jira',
  });
  addEvent(claim, 'websocket.status.updated', { tech: 'WebSocket → Browser' });
  emit(claim);
}

const SIMULATION_SAMPLE = {
  type: 'Theft',
  incidentDate: new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10),
  location: 'Airport long-term parking, San Jose, CA',
  description: 'Vehicle was broken into overnight and the catalytic converter was stolen. No witnesses.',
  estimatedAmount: 11800,
};

function buildClaim(payload, files) {
  return {
    id: `CLM-${240800 + claims.length + Math.floor(Math.random() * 90)}`,
    policyNumber: demoPolicy.policyNumber,
    ...payload,
    estimatedAmount: Number(payload.estimatedAmount),
    status: 'SUBMITTED',
    riskLevel: null,
    riskScore: null,
    createdAt: new Date().toISOString(),
    documents: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
    events: [],
  };
}

export const mockApi = {
  async login(email, password) {
    await wait(700);
    if (!email || !password) throw new Error('Enter your email and password');
    return { token: 'mock-token', user: { ...demoUser, email } };
  },
  async getCustomer() { await wait(150); return clone(demoUser); },
  async getPolicy() { await wait(350); return clone(demoPolicy); },
  async getVehicle() { await wait(250); return clone(demoVehicle); },
  async listClaims() {
    await wait(350);
    return clone([...claims].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  },
  async getClaim(id) {
    await wait(250);
    const c = claims.find((x) => x.id === id);
    if (!c) throw new Error('Claim not found');
    return clone(c);
  },
  // Real flow: POST /claims -> API stores row in PostgreSQL, returns signed upload URLs -> browser PUTs files to
  // Cloud Storage -> API publishes a Pub/Sub message. Here we collapse that into one call.
  async createClaim(payload, files = [], options = {}) {
    await wait(900);
    const claim = buildClaim(payload, files);
    recordSubmission(claim);
    claims.push(claim);
    runPipeline(claim, options);
    return clone(claim);
  },
};

// Demo-only controls (not part of the real API contract). Used through services/demo.js.
export const mockSimulation = {
  /** Creates a sample claim that is guaranteed to end in HIGH_RISK → UNDER_INVESTIGATION. */
  async startNew() {
    return mockApi.createClaim(SIMULATION_SAMPLE, [{ name: 'police-report.pdf', size: 480000, type: 'application/pdf' }], { forceHigh: true });
  },
  /** Resets an existing claim and replays the full pipeline with a HIGH_RISK outcome. */
  replay(id) {
    const claim = claims.find((x) => x.id === id);
    if (!claim) throw new Error('Claim not found');
    claim.events = [];
    claim.riskScore = null;
    claim.riskLevel = null;
    recordSubmission(claim);
    emit(claim);
    runPipeline(claim, { forceHigh: true });
  },
};
