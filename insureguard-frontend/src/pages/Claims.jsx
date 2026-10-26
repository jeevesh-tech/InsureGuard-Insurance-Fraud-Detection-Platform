import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FilePlus2 } from 'lucide-react';
import { useClaims } from '../hooks/useClaims';
import ClaimCard from '../components/ClaimCard';
import { Empty, ErrorState, Loading } from '../components/States';
import { isFinal, needsReview } from '../utils/status';

const FILTERS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'progress', label: 'In progress', test: (c) => !isFinal(c.status) && !needsReview(c.status) },
  { key: 'review', label: 'Needs review', test: (c) => needsReview(c.status) },
  { key: 'approved', label: 'Approved', test: (c) => c.status === 'APPROVED' },
];

export default function Claims() {
  const { claims, loading, error, reload } = useClaims();
  const [filter, setFilter] = useState('all');
  const shown = claims.filter(FILTERS.find((f) => f.key === filter).test);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My claims</h1>
          <p className="muted">Track every claim and see changes as they happen.</p>
        </div>
        <Link to="/claims/new" className="btn btn-primary"><FilePlus2 size={18} /> New claim</Link>
      </div>

      <div className="tabs" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} className={filter === f.key ? 'active' : ''} onClick={() => setFilter(f.key)}>
            {f.label} <span>{claims.filter(f.test).length}</span>
          </button>
        ))}
      </div>

      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : shown.length === 0 ? (
        <Empty>No claims in this view.</Empty>
      ) : (
        <div className="stack">{shown.map((c) => <ClaimCard key={c.id} claim={c} />)}</div>
      )}
    </>
  );
}
