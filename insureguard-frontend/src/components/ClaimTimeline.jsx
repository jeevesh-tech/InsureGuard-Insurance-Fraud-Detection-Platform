import { Check, Cloud, Loader2, ShieldAlert } from 'lucide-react';
import { TIMELINE_STEPS, needsReview, timelineProgress } from '../utils/status';
import { formatTime } from '../utils/format';

/** Six-step processing timeline. `showTech` adds the cloud path behind each step (demo mode). */
export default function ClaimTimeline({ claim, showTech = false }) {
  const { done, active, warn } = timelineProgress(claim);
  const reviewed = needsReview(claim.status);
  const rejected = claim.status === 'REJECTED';

  // Time the step happened = first event tagged with that step.
  const stamp = (n) => claim.events.find((e) => e.step === n)?.at;
  // Step 6 has two outcomes: "approved" vs "passed to the claims team".
  const outcome = claim.events.find((e) => e.step === 6);

  return (
    <ol className="timeline">
      {TIMELINE_STEPS.map((s) => {
        const isDone = s.n <= done && s.n !== warn;
        const isActive = s.n === active && s.n !== warn;
        const isWarn = s.n === warn;
        // The decision step may have no event of its own; the claim's last update is when it reached that state.
        const time = stamp(s.n) || (s.n === 6 && (isWarn || done >= 6) ? claim.updatedAt : null);
        const title = s.n === 6 && claim.status === 'APPROVED' ? 'Claim approved'
          : s.n === 6 && rejected ? 'Claim rejected'
          : s.n === 6 && reviewed ? 'Additional review required'
          : s.title;
        const hint = s.n === 6 && rejected
          ? (outcome?.detail || 'Your claim was not approved. We will contact you with the details.')
          : s.n === 6 && reviewed
          ? (outcome?.detail || 'A claims specialist is reviewing your claim.')
          : s.n === 6 && claim.status === 'APPROVED' ? (outcome?.detail || 'Your payout is being scheduled.')
          : s.hint;
        const tech = s.n === 6 && reviewed ? s.reviewTech : s.tech;
        return (
          <li key={s.n} className={`tl-item ${isDone ? 'done' : ''} ${isActive ? 'active' : ''} ${isWarn ? 'warn' : ''}`}>
            <span className="tl-dot">
              {isDone ? <Check size={14} strokeWidth={3} />
                : isWarn ? <ShieldAlert size={14} />
                : isActive ? <Loader2 size={14} className="spin" />
                : s.n}
            </span>
            <div className="tl-body">
              <div className="tl-head">
                <b>{title}</b>
                {time && (isDone || isWarn || isActive) && <time>{formatTime(time)}</time>}
              </div>
              <p>{hint}</p>
              {showTech && (
                <span className="chip chip-cloud"><Cloud size={12} /> {tech}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
