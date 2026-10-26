import { ArrowDown, Info, Lock } from 'lucide-react';
import { USE_MOCK } from '../services/config';

// Presentation aid: the target Google Cloud design behind every claim.

const MAIN_FLOW = [
  { name: 'Browser', note: 'This React app', tag: 'Client' },
  { name: 'Cloud Load Balancer', note: 'Routes /, /api and /ws', tag: 'Edge' },
  { name: 'Cloud Run Frontend', note: 'Serves the static build', tag: 'Serving' },
  { name: 'Cloud Run Claims API', note: 'Auth, claims, signed upload URLs, WebSocket', tag: 'Serving' },
  { name: 'Cloud SQL PostgreSQL', note: 'Claims and policies', tag: 'Data' },
  { name: 'Memorystore Redis', note: 'Sessions, cache, live-update fan-out', tag: 'Data' },
  { name: 'Cloud Storage', note: 'Accident photos and PDFs', tag: 'Data' },
  { name: 'Pub/Sub', note: 'claim.submitted event', tag: 'Messaging' },
  { name: 'Claim Worker', note: 'Processes uploaded documents', tag: 'Worker' },
  { name: 'Document AI', note: 'Extracts text and fields', tag: 'AI' },
  { name: 'Fraud Worker', note: 'Builds features, requests a prediction', tag: 'Worker' },
  { name: 'Vertex AI', note: 'Fraud risk model', tag: 'AI' },
  { name: 'Fraud Assessment', note: 'Risk score and level', tag: 'Result', highlight: true },
];

const ANALYTICS_FLOW = [
  { name: 'Events', note: 'Claim and status events', tag: 'Stream' },
  { name: 'Dataflow', note: 'Stream processing', tag: 'Pipeline' },
  { name: 'BigQuery', note: 'Analytics warehouse', tag: 'Warehouse' },
  { name: 'Snowflake', note: 'Downstream reporting', tag: 'Warehouse' },
];

const MAP = [
  ['Sign in', 'POST /api/auth/login', 'Claims API → session in Redis'],
  ['Submit claim', 'POST /api/claims', 'Claims API → PostgreSQL → Pub/Sub'],
  ['Upload photos', 'POST /api/claims/:id/upload-url, then PUT to the signed URL', 'Claims API signs the URL → Browser → Cloud Storage'],
  ['Live status', USE_MOCK ? 'WebSocket /ws' : 'GET /api/claims/:id/status (polling)', USE_MOCK ? 'Redis → Claims API → Browser' : 'Claims API → PostgreSQL (WebSocket planned)'],
  ['Additional review', 'status = FRAUD_REVIEW','Pub/Sub → Notification Worker → Email + Jira'],
];

function Node({ name, note, tag, highlight }) {
  return (
    <div className={`flow-node ${highlight ? 'highlight' : ''}`}>
      <span className="flow-tag">{tag}</span>
      <b>{name}</b>
      <small>{note}</small>
    </div>
  );
}

const Arrow = () => <div className="flow-arrow" aria-hidden="true"><ArrowDown size={16} /></div>;

function Chain({ nodes }) {
  return nodes.map((n, i) => (
    <div className="flow-step" key={n.name}>
      <Node {...n} />
      {i < nodes.length - 1 && <Arrow />}
    </div>
  ));
}

export default function Architecture() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>InsureGuard — Target Google Cloud Architecture</h1>
          <p className="note">
            <Info size={15} />{' '}
            {USE_MOCK
              ? 'Target architecture — backend services are currently simulated in demo mode.'
              : 'Target architecture — this app talks to the live Claims API on Cloud Run. Live status uses REST polling until the WebSocket service is added.'}
          </p>
        </div>
      </div>

      <section className="card flow">
        <h3>Claim processing flow</h3>
        <Chain nodes={MAIN_FLOW} />

        <Arrow />
        <div className="flow-branch">
          <div className="branch-col">
            <span className="branch-label">Every result</span>
            <Node name="WebSocket" note="Pushes the new status" tag="Realtime" />
            <Arrow />
            <Node name="Customer" note="Sees the update instantly" tag="Client" />
          </div>
          <div className="branch-col">
            <span className="branch-label warn">FRAUD_REVIEW</span>
            <Node name="Notification Worker" note="Triggered through Pub/Sub" tag="Worker" />
            <Arrow />
            <div className="branch-split">
              <Node name="Admin Email" note="Alerts the claims team" tag="Notify" />
              <Node name="Jira" note="Creates a review ticket" tag="Notify" />
            </div>
          </div>
        </div>
      </section>

      <section className="card flow">
        <h3>Analytics pipeline</h3>
        <Chain nodes={ANALYTICS_FLOW} />
      </section>

      <section className="card">
        <h3>From click to cloud</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>User action</th><th>Frontend call</th><th>Backend path</th></tr></thead>
            <tbody>
              {MAP.map(([a, b, c]) => (
                <tr key={a}><td><b>{a}</b></td><td className="mono">{b}</td><td>{c}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card security">
        <h3><Lock size={18} /> Security boundary</h3>
        <p className="muted">
          The browser only holds a short-lived session token. Database, Redis, Jira, email and Vertex AI credentials stay
          server-side (Cloud Run service accounts and Secret Manager) and never reach this app. Uploads go straight to
          Cloud Storage through single-use signed URLs.
        </p>
      </section>
    </>
  );
}
