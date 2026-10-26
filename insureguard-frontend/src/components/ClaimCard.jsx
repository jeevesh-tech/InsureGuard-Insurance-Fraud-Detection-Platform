import { Link } from 'react-router-dom';
import { ChevronRight, Paperclip } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { formatCurrency, formatDate } from '../utils/format';

export default function ClaimCard({ claim }) {
  return (
    <Link to={`/claims/${claim.id}`} className="claim-card">
      <div className="claim-card-main">
        <div className="claim-card-top">
          <b>{claim.type}</b>
          <span className="muted">{claim.claimNumber || claim.id}</span>
        </div>
        <p className="claim-card-desc">{claim.description}</p>
        <div className="claim-card-meta">
          <span>{formatDate(claim.incidentDate)}</span>
          <span>{formatCurrency(claim.estimatedAmount)}</span>
          {claim.documents?.length > 0 && <span><Paperclip size={12} /> {claim.documents.length}</span>}
        </div>
      </div>
      <StatusBadge status={claim.status} />
      <ChevronRight size={18} className="muted chev" />
    </Link>
  );
}
