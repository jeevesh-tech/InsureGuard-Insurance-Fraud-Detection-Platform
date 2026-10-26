import { CheckCircle2, Loader2, ShieldAlert, XCircle } from 'lucide-react';
import { isFinal, needsReview, statusInfo } from '../utils/status';

export default function StatusBadge({ status }) {
  const info = statusInfo(status);
  const Icon = status === 'APPROVED' ? CheckCircle2 : status === 'REJECTED' ? XCircle : needsReview(status) ? ShieldAlert : Loader2;
  const spinning = !isFinal(status) && !needsReview(status);
  return (
    <span className={`badge badge-${info.tone}`}>
      <Icon size={14} className={spinning ? 'spin' : ''} />
      {info.label}
    </span>
  );
}
