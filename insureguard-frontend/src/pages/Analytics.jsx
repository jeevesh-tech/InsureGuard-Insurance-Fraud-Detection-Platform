import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert, FileText, DollarSign, Activity } from 'lucide-react';
import { api } from '../services/api';
import { Loading, ErrorState } from '../components/States';
import { formatCurrency } from '../utils/format';

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getAnalyticsSummary();
      setData(result);
    } catch (err) {
      setError(err.message || 'Unable to load analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState error={error} onRetry={load} />;
  if (!data) return null;

  const metrics = [
    { label: 'Total claims', value: data.claims.total_claims, Icon: FileText },
    { label: 'Total claimed amount', value: formatCurrency(Number(data.claims.total_claimed_amount)), Icon: DollarSign },
    { label: 'High-risk assessments', value: data.fraud_assessments.high_risk_claims, Icon: ShieldAlert },
    { label: 'Claims assessed', value: data.fraud_assessments.assessed_claims, Icon: Activity },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Fraud Analytics</h1>
          <p className="muted">Live claims and fraud assessment summary.</p>
        </div>
        <button className="btn btn-primary" onClick={load} disabled={loading}>
          <RefreshCw size={16} /> {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <p role="alert">{error}</p>}

      <div className="grid grid-2">
        {metrics.map(({ label, value, Icon }) => (
          <section className="card" key={label}>
            <div className="card-row">
              <span className="eyebrow">{label}</span>
              <Icon size={20} />
            </div>
            <h2>{value}</h2>
          </section>
        ))}
      </div>

      <div className="grid grid-2 section-head">
        <section className="card">
          <h2>Claims by status</h2>
          {data.claims_by_status.map((item) => (
            <div className="card-row" key={item.status}>
              <span>{item.status.replaceAll('_', ' ')}</span>
              <strong>{item.claim_count}</strong>
            </div>
          ))}
        </section>

        <section className="card">
          <h2>Claims by fraud status</h2>
          {data.claims_by_fraud_status.map((item) => (
            <div className="card-row" key={item.fraud_status}>
              <span>{item.fraud_status.replaceAll('_', ' ')}</span>
              <strong>{item.claim_count}</strong>
            </div>
          ))}
        </section>
      </div>

      <section className="card">
        <h2>Fraud assessment summary</h2>
        <div className="card-row">
          <span>Review decisions</span>
          <strong>{data.fraud_assessments.review_decisions}</strong>
        </div>
        <div className="card-row">
          <span>Average fraud score</span>
          <strong>{Number(data.fraud_assessments.average_fraud_score).toFixed(2)}</strong>
        </div>
      </section>
    </>
  );
}