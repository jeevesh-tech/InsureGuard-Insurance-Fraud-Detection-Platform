import { Check, Minus } from 'lucide-react';
import { api } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { ErrorState, Loading } from '../components/States';
import { formatCurrency, formatDate } from '../utils/format';

export default function Policy() {
  const policy = useAsync(() => api.getPolicy(), []);
  const vehicle = useAsync(() => api.getVehicle(), []);

  if (policy.loading || vehicle.loading) return <Loading label="Loading your policy…" />;
  if (policy.error || vehicle.error) return <ErrorState error={policy.error || vehicle.error} onRetry={() => { policy.reload(); vehicle.reload(); }} />;
  const p = policy.data;
  const v = vehicle.data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My policy</h1>
          <p className="muted">{p.plan} · {p.policyNumber}</p>
        </div>
        <span className="badge badge-success">{p.status}</span>
      </div>

      <div className="grid grid-2">
        <section className="card">
          <h3>Policy details</h3>
          <dl className="kv">
            <div><dt>Policy number</dt><dd className="mono">{p.policyNumber}</dd></div>
            <div><dt>Effective</dt><dd>{formatDate(p.effectiveDate)}</dd></div>
            <div><dt>Renewal</dt><dd>{formatDate(p.renewalDate)}</dd></div>
            <div><dt>Premium</dt><dd>{formatCurrency(p.premium)} / {p.premiumPeriod}</dd></div>
            <div><dt>Deductible</dt><dd>{formatCurrency(p.deductible)}</dd></div>
          </dl>
        </section>

        <section className="card">
          <h3>Vehicle</h3>
          {v ? (
            <>
              <div className="vehicle-hero">{v.year} {v.make} {v.model}</div>
              <dl className="kv">
                {v.color && <div><dt>Color</dt><dd>{v.color}</dd></div>}
                <div><dt>VIN</dt><dd className="mono">{v.vin}</dd></div>
                {v.plate && <div><dt>Plate</dt><dd>{v.plate}</dd></div>}
                {v.type && <div><dt>Type</dt><dd>{v.type}</dd></div>}
                {v.estimatedValue != null && <div><dt>Estimated value</dt><dd>{formatCurrency(v.estimatedValue)}</dd></div>}
                {v.mileage != null && <div><dt>Mileage</dt><dd>{v.mileage.toLocaleString()} mi</dd></div>}
                {v.garaged && <div><dt>Garaged</dt><dd>{v.garaged}</dd></div>}
              </dl>
            </>
          ) : (
            <p className="muted">No vehicle is linked to this policy.</p>
          )}
        </section>
      </div>

      <section className="card">
        <h3>Coverage</h3>
        <ul className="coverage">
          {p.coverages.map((c) => (
            <li key={c.name} className={c.included ? '' : 'off'}>
              <span className="cov-icon">{c.included ? <Check size={14} strokeWidth={3} /> : <Minus size={14} />}</span>
              <span className="cov-name">{c.name}</span>
              <span className="cov-limit">{c.included ? c.limit : 'Not included'}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
