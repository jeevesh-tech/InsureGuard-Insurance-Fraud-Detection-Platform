export const demoUser = {
  id: 'cust-1001',
  name: 'Alex Morgan',
  email: 'alex.morgan@example.com',
  phone: '(415) 555-0148',
  memberSince: '2021-03-12',
};

export const demoPolicy = {
  policyNumber: 'AUTO-482913',
  plan: 'Comprehensive Plus',
  status: 'Active',
  effectiveDate: '2026-03-12',
  renewalDate: '2027-03-12',
  premium: 148.5,
  premiumPeriod: 'month',
  deductible: 500,
  coverages: [
    { name: 'Collision', limit: '$50,000', included: true },
    { name: 'Comprehensive (theft, fire, weather)', limit: '$50,000', included: true },
    { name: 'Liability – bodily injury', limit: '$100,000 / $300,000', included: true },
    { name: 'Liability – property damage', limit: '$100,000', included: true },
    { name: 'Uninsured motorist', limit: '$100,000', included: true },
    { name: 'Rental car reimbursement', limit: '$40 / day', included: true },
    { name: 'Roadside assistance', limit: '24/7', included: false },
  ],
};

export const demoVehicle = {
  year: 2022,
  make: 'Toyota',
  model: 'RAV4 Hybrid XLE',
  color: 'Magnetic Gray',
  vin: '2T3RWRFV8NW123456',
  plate: '8KLM402',
  mileage: 28450,
  garaged: 'San Jose, CA',
};

const at = (daysAgo, h, m, s = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, s, 0);
  return d.toISOString();
};

// Event shape (same as the real API should return): { id, code, at, step?, title?, detail?, tech? }
const ev = (n, code, when, extra = {}) => ({ id: `e${n}`, code, at: when, ...extra });

export const seedClaims = [
  {
    id: 'CLM-240718',
    policyNumber: 'AUTO-482913',
    type: 'Collision',
    incidentDate: at(34, 0, 0).slice(0, 10),
    location: 'Highway 101 N, Mountain View, CA',
    description: 'Rear-ended at a traffic light. Bumper and tail light damaged. Other driver exchanged insurance details.',
    estimatedAmount: 2350,
    status: 'APPROVED',
    riskLevel: 'low',
    riskScore: 14,
    createdAt: at(33, 9, 12),
    documents: [{ name: 'rear-bumper.jpg', size: 2400000, type: 'image/jpeg' }],
    events: [
      ev(1, 'claim.submitted', at(33, 9, 12, 0), { step: 1, title: 'Claim received', tech: 'Cloud Run Claims API → PostgreSQL' }),
      ev(2, 'documents.uploaded', at(33, 9, 12, 2), { step: 2, title: 'Documents uploaded', tech: 'Cloud Storage → Pub/Sub' }),
      ev(3, 'documents.processing', at(33, 9, 12, 4), { tech: 'Claim Worker' }),
      ev(4, 'document.extracted', at(33, 9, 12, 9), { step: 3, title: 'Documents processed', tech: 'Document AI' }),
      ev(5, 'fraud.analysis.started', at(33, 9, 12, 12), { step: 4, title: 'Checks started', tech: 'Fraud Worker' }),
      ev(6, 'vertex.prediction.completed', at(33, 9, 12, 16), { step: 5, title: 'Risk assessment complete', tech: 'Vertex AI' }),
      ev(7, 'fraud.low-risk', at(33, 9, 12, 17)),
      ev(8, 'claim.approved', at(33, 9, 12, 18), { step: 6, title: 'Claim approved', detail: 'Payout of $1,850 (after deductible) scheduled.', tech: 'Claim Worker → PostgreSQL' }),
      ev(9, 'websocket.status.updated', at(33, 9, 12, 18), { tech: 'WebSocket → Browser' }),
    ],
  },
  {
    id: 'CLM-240733',
    policyNumber: 'AUTO-482913',
    type: 'Theft',
    incidentDate: at(9, 0, 0).slice(0, 10),
    location: 'Downtown parking garage, San Jose, CA',
    description: 'Catalytic converter stolen while the vehicle was parked overnight. No witnesses and no CCTV footage available.',
    estimatedAmount: 12400,
    status: 'UNDER_INVESTIGATION',
    riskLevel: 'high',
    riskScore: 78,
    createdAt: at(8, 14, 2),
    documents: [{ name: 'police-report.pdf', size: 540000, type: 'application/pdf' }],
    events: [
      ev(1, 'claim.submitted', at(8, 14, 2, 0), { step: 1, title: 'Claim received', tech: 'Cloud Run Claims API → PostgreSQL' }),
      ev(2, 'documents.uploaded', at(8, 14, 2, 2), { step: 2, title: 'Documents uploaded', tech: 'Cloud Storage → Pub/Sub' }),
      ev(3, 'documents.processing', at(8, 14, 2, 4), { tech: 'Claim Worker' }),
      ev(4, 'document.extracted', at(8, 14, 2, 9), { step: 3, title: 'Documents processed', tech: 'Document AI' }),
      ev(5, 'fraud.analysis.started', at(8, 14, 2, 12), { step: 4, title: 'Checks started', tech: 'Fraud Worker' }),
      ev(6, 'vertex.prediction.completed', at(8, 14, 2, 16), { step: 5, title: 'Risk assessment complete', tech: 'Vertex AI' }),
      ev(7, 'fraud.high-risk', at(8, 14, 2, 17), { title: 'Additional review required', tech: 'Fraud Worker' }),
      ev(8, 'websocket.status.updated', at(8, 14, 2, 17), { tech: 'WebSocket → Browser' }),
      ev(9, 'notification.queued', at(8, 14, 2, 19), { tech: 'Pub/Sub → Notification Worker' }),
      ev(10, 'email.sent', at(8, 14, 2, 20), { tech: 'Notification Worker → Admin Email' }),
      ev(11, 'jira.ticket.created', at(8, 14, 2, 21), { step: 6, title: 'Passed to claims team', detail: 'Case INS-1042 assigned to a claims specialist.', tech: 'Notification Worker → Jira' }),
      ev(12, 'websocket.status.updated', at(8, 14, 2, 21), { tech: 'WebSocket → Browser' }),
    ],
  },
];
