import { Link } from 'react-router-dom';
import { ArrowRight, Car, FilePlus2, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useClaims } from '../hooks/useClaims';
import { useAuth } from '../hooks/useAuth';
import ClaimCard from '../components/ClaimCard';
import ClaimProgress from '../components/ClaimProgress';
import StatusBadge from '../components/StatusBadge';
import { Empty, ErrorState, Loading } from '../components/States';
import { formatCurrency, formatDate } from '../utils/format';
import { isFinal, needsReview } from '../utils/status';

export default function Dashboard() {
  const { user } = useAuth();
  const policy = useAsync(() => api.getPolicy(), []);
  const vehicle = useAsync(() => api.getVehicle(), []);
  const { claims, loading, error, reload } = useClaims();

  const active = claims.find((c) => !isFinal(c.status)) || claims.find((c) => needsReview(c.status));
  const p = policy.data;
  const v = vehicle.data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Good to see you, {user.name.split(' ')[0]}</h1>
          <p className="muted">Here is everything about your coverage and claims.</p>
        </div>
        <Link to="/claims/new" className="btn btn-primary"><FilePlus2 size={18} /> File a claim</Link>
      </div>

      {active && (
        <Link to={`/claims/${active.id}`} className="card active-claim">
          <div className="card-row">
            <div>
              <span className="eyebrow">{needsReview(active.status) ? 'Under review' : 'Claim in progress'}</span>
              <h3>{active.type} claim · {active.claimNumber || active.id}</h3>
            </div>
            <StatusBadge status={active.status} />
          </div>
          <ClaimProgress status={active.status} />
          <span className="link-arrow">View claim details <ArrowRight size={16} /></span>
        </Link>
      )}

      <div className="grid grid-2">
        <section className="card policy-card">
          <div className="card-row">
            <span className="eyebrow light">Auto policy</span>
            <span className="badge badge-success">{p?.status || '…'}</span>
          </div>
          {policy.loading ? <Loading /> : policy.error ? <ErrorState error={policy.error} onRetry={policy.reload} /> : (
            <>
              <h2>{p.plan}</h2>
              <p className="policy-no">{p.policyNumber}</p>
              <dl className="kv kv-light">
                <div><dt>Premium</dt><dd>{formatCurrency(p.premium)}/{p.premiumPeriod}</dd></div>
                <div><dt>Deductible</dt><dd>{formatCurrency(p.deductible)}</dd></div>
                <div><dt>Renews</dt><dd>{formatDate(p.renewalDate)}</dd></div>
              </dl>
              <Link to="/policy" className="link-arrow light">View coverage <ArrowRight size={16} /></Link>
            </>
          )}
        </section>

        <section className="card">
          <div className="card-row">
            <span className="eyebrow"><Car size={14} /> Insured vehicle</span>
          </div>
          {vehicle.loading ? <Loading /> : vehicle.error ? <ErrorState error={vehicle.error} onRetry={vehicle.reload} /> : !v ? (
            <Empty>No vehicle is linked to this policy.</Empty>
          ) : (
            <>
              <h2>{v.year} {v.make} {v.model}</h2>
              <p className="muted">{[v.color, v.plate && `Plate ${v.plate}`].filter(Boolean).join(' · ')}</p>
              <dl className="kv">
                <div><dt>VIN</dt><dd className="mono">{v.vin}</dd></div>
                {v.mileage != null && <div><dt>Mileage</dt><dd>{v.mileage.toLocaleString()} mi</dd></div>}
                {v.estimatedValue != null && <div><dt>Estimated value</dt><dd>{formatCurrency(v.estimatedValue)}</dd></div>}
              </dl>
              <p className="trust"><ShieldCheck size={16} /> Insured under policy {p?.policyNumber}.</p>
            </>
          )}
        </section>
      </div>

      <div className="section-head">
        <h2>Recent claims</h2>
        <Link to="/claims" className="link-arrow">See all <ArrowRight size={16} /></Link>
      </div>
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : claims.length === 0 ? (
        <Empty>No claims yet. If something happens, we are here to help.</Empty>
      ) : (
        <div className="stack">{claims.slice(0, 3).map((c) => <ClaimCard key={c.id} claim={c} />)}</div>
      )}
    </>
  );
}
