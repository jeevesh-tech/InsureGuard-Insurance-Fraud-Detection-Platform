export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 8;

export function validateFiles(existing, incoming) {
  const accepted = [];
  const errors = [];
  for (const f of incoming) {
    if (!ALLOWED_TYPES.includes(f.type)) errors.push(`${f.name}: only JPG, PNG, WebP or PDF files are allowed`);
    else if (f.size > MAX_FILE_BYTES) errors.push(`${f.name}: larger than 10 MB`);
    else if (existing.length + accepted.length >= MAX_FILES) errors.push(`Maximum ${MAX_FILES} files per claim`);
    else accepted.push(f);
  }
  return { accepted, errors };
}

export function validateClaimForm(v) {
  const e = {};
  if (!v.type) e.type = 'Select the type of incident';
  if (!v.incidentDate) e.incidentDate = 'Enter the incident date';
  else if (new Date(v.incidentDate) > new Date()) e.incidentDate = 'Date cannot be in the future';
  if (!v.location.trim()) e.location = 'Tell us where it happened';
  if (v.description.trim().length < 20) e.description = 'Please describe what happened (at least 20 characters)';
  if (!(Number(v.estimatedAmount) > 0)) e.estimatedAmount = 'Enter an estimated repair cost';
  return e;
}
