import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, FileText, Headset, ImageIcon, PartyPopper } from 'lucide-react';
import { useClaim } from '../hooks/useClaims';
import ClaimTimeline from '../components/ClaimTimeline';
import ActivityFeed from '../components/ActivityFeed';
import StatusBadge from '../components/StatusBadge';
import LiveIndicator from '../components/LiveIndicator';
import { ErrorState, Loading } from '../components/States';
import { formatBytes, formatCurrency, formatDate } from '../utils/format';
import { needsReview } from '../utils/status';

// Neutral wording for the backend's fraud_status values.
const REVIEW_LABEL = {
  PENDING: 'In progress',
  LOW: 'Completed, no concerns',
  MEDIUM: 'Completed, some extra checks',
  HIGH: 'Additional review required',
  LOW_RISK: 'Completed, no concerns',
  MEDIUM_RISK: 'Completed, some extra checks',
  HIGH_RISK: 'Additional review required',
};

export default function ClaimDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { claim, loading, error, reload, justUpdated } = useClaim(id);

  if (loading && !claim) return <Loading label="Loading claim…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!claim) return null;

  return (
    <>
      <Link to="/claims" className="back"><ArrowLeft size={16} /> All claims</Link>
      <div className="page-head">
        <div>
          <h1>{claim.type} claim</h1>
          <p className="muted">{claim.claimNumber || claim.id} · Filed {formatDate(claim.createdAt)}</p>
        </div>
        <StatusBadge status={claim.status} />
      </div>

      {location.state?.justSubmitted && claim.status === 'SUBMITTED' && (
        <div className="alert alert-success"><PartyPopper size={18} /> Thanks, your claim was submitted. Keep this page open to see updates as they happen.</div>
      )}

      {location.state?.uploadErrors?.length > 0 && (
        <div className="alert alert-warn" role="alert">
          <FileText size={18} />
          <div>
            <b>Your claim was submitted, but {location.state.uploadErrors.length === 1 ? 'one file' : `${location.state.uploadErrors.length} files`} could not be uploaded.</b>
            <p>{location.state.uploadErrors.map((e) => e.name).join(', ')}. Please contact us to send {location.state.uploadErrors.length === 1 ? 'it' : 'them'}.</p>
          </div>
        </div>
      )}

      <section className={`card ${justUpdated ? 'flash' : ''}`}>
        <div className="card-row">
          <h3>Live claim updates</h3>
          <LiveIndicator />
        </div>
        <div className="live-status">
          <StatusBadge status={claim.status} />
        </div>
      </section>

      {needsReview(claim.status) && (
        <div className="alert alert-warn review-banner" role="status">
          <Headset size={22} />
          <div>
            <b>Additional Review Required</b>
            <p>Your claim requires additional review by our claims team. This does not mean your claim has been denied.</p>
            <p>We will email you within 2 business days. You do not need to do anything right now, but keep your photos and receipts handy.</p>
          </div>
        </div>
      )}
      {claim.status === 'APPROVED' && (
        <div className="alert alert-success" role="status">
          <CheckCircle2 size={22} />
          <div><b>Your claim is approved</b><p>Your payout will be sent to your account on file within 3–5 business days.</p></div>
        </div>
      )}

      <section className="card">
        <h3>Claim processing timeline</h3>
        <ClaimTimeline claim={claim} />
      </section>

      <div className="grid grid-2 grid-wide-left">
        <section className="card">
          <h3>Claim details</h3>
          <dl className="kv">
            {claim.policyNumber && <div><dt>Policy</dt><dd className="mono">{claim.policyNumber}</dd></div>}
            <div><dt>Incident date</dt><dd>{formatDate(claim.incidentDate)}</dd></div>
            {claim.location && <div><dt>Location</dt><dd>{claim.location}</dd></div>}
            <div><dt>Estimated cost</dt><dd>{formatCurrency(claim.estimatedAmount)}</dd></div>
            {claim.approvedAmount != null && <div><dt>Approved amount</dt><dd>{formatCurrency(claim.approvedAmount)}</dd></div>}
            {claim.fraudStatus && <div><dt>Automated review</dt><dd>{REVIEW_LABEL[claim.fraudStatus] || claim.fraudStatus}</dd></div>}
            {claim.riskScore != null && <div><dt>Risk score</dt><dd>{claim.riskScore} / 100</dd></div>}
          </dl>
          <p className="desc">{claim.description}</p>
        </section>

        <div className="stack">
          <section className="card">
            <h3>Documents ({claim.documents.length})</h3>
            {claim.documents.length === 0 ? <p className="muted">No documents uploaded.</p> : (
              <ul className="file-list">
                {claim.documents.map((d, i) => (
                  <li key={`${d.name}-${i}`}>
                    {d.type === 'application/pdf' ? <FileText size={18} /> : <ImageIcon size={18} />}
                    <span className="file-name">{d.name}</span>
                    {d.size > 0 && <small>{formatBytes(d.size)}</small>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h3>Activity</h3>
            <ActivityFeed events={claim.events} />
          </section>
        </div>
      </div>
    </>
  );
}
