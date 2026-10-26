import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Send } from 'lucide-react';
import { api } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import FileDropzone from '../components/FileDropzone';
import { validateClaimForm } from '../utils/validation';

const TYPES = ['Collision', 'Theft', 'Vandalism', 'Weather damage', 'Glass damage', 'Other'];
const today = () => new Date().toISOString().slice(0, 10);

// Module-level so its identity is stable and inputs keep focus while typing.
const Field = ({ error, label, hint, children }) => (
  <label className={`field ${error ? 'has-error' : ''}`}>
    <span>{label}</span>
    {children}
    {error ? <em>{error}</em> : hint ? <small>{hint}</small> : null}
  </label>
);

export default function NewClaim() {
  const navigate = useNavigate();
  const { data: policy } = useAsync(() => api.getPolicy(), []);
  const { data: vehicle } = useAsync(() => api.getVehicle(), []);
  const [values, setValues] = useState({ type: '', incidentDate: today(), location: '', description: '', estimatedAmount: '' });
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [progress, setProgress] = useState('');

  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = validateClaimForm(values);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setSubmitError('');
    try {
      const claim = await api.createClaim(values, files, {
        onProgress: ({ done, total }) => total && setProgress(`Uploading files (${Math.min(done + 1, total)} of ${total})…`),
      });
      navigate(`/claims/${claim.id}`, { state: { justSubmitted: true, uploadErrors: claim.uploadErrors } });
    } catch (err) {
      setSubmitError(err.message);
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>File a new claim</h1>
          <p className="muted">
            {policy && vehicle ? `${policy.policyNumber} · ${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Tell us what happened.'}
          </p>
        </div>
      </div>

      <form className="card form" onSubmit={submit} noValidate>
        <h3>1 · What happened</h3>
        <div className="form-grid">
          <Field error={errors.type} label="Type of incident">
            <select value={values.type} onChange={set('type')}>
              <option value="">Select…</option>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field error={errors.incidentDate} label="Date of incident">
            <input type="date" max={today()} value={values.incidentDate} onChange={set('incidentDate')} />
          </Field>
          <Field error={errors.location} label="Where did it happen?">
            <input value={values.location} onChange={set('location')} placeholder="Street, city" />
          </Field>
          <Field error={errors.estimatedAmount} label="Estimated repair cost (USD)">
            <input type="number" min="0" inputMode="decimal" value={values.estimatedAmount} onChange={set('estimatedAmount')} placeholder="e.g. 2400" />
          </Field>
        </div>
        <Field error={errors.description} label="Describe the incident" hint="Include who was involved, road conditions, and the damage you can see.">
          <textarea rows={5} value={values.description} onChange={set('description')} />
        </Field>

        <h3>2 · Photos and documents</h3>
        <p className="muted">Clear photos of the damage and any police report help us process your claim faster.</p>
        <FileDropzone files={files} onChange={setFiles} />

        {submitError && <div className="alert alert-error" role="alert">{submitError}</div>}

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? <><Loader2 size={16} className="spin" /> {progress || 'Submitting…'}</> : <><Send size={16} /> Submit claim</>}
          </button>
        </div>
      </form>
    </>
  );
}
