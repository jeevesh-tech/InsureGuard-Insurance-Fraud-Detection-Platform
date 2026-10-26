import { Check } from 'lucide-react';
import { CLAIM_STEPS, isFinal, needsReview, statusInfo } from '../utils/status';

/** Compact 4-step tracker (horizontal on desktop, vertical on mobile). Used on dashboard cards. */
export default function ClaimProgress({ status }) {
  const current = statusInfo(status).step; // 1..4
  const final = isFinal(status);
  return (
    <ol className="steps" aria-label="Claim progress">
      {CLAIM_STEPS.map((s, i) => {
        const n = i + 1;
        const done = n < current || (n === current && final);
        const active = n === current && !final;
        const rejected = status === 'REJECTED';
        const warn = n === 4 && (needsReview(status) || rejected);
        const title = n === 4 && (final || warn)
          ? (rejected ? 'Rejected' : warn ? 'Additional review' : 'Approved')
          : s.title;
        return (
          <li key={s.key} className={`step ${done ? 'done' : ''} ${active ? 'active' : ''} ${warn ? 'warn' : ''}`}>
            <span className="step-dot">{done ? <Check size={14} strokeWidth={3} /> : n}</span>
            <span className="step-body">
              <b>{title}</b>
              <small>{s.hint}</small>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
