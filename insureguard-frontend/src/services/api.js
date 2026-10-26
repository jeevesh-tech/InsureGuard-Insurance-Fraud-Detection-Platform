// Claims API client. Every component talks to this file only.
//
// Real mode (VITE_USE_MOCK=false) calls the Cloud Run API at VITE_API_BASE_URL:
//   POST /api/auth/login                       { email }                    -> { token, customer }
//   GET  /api/customer?customer_id=
//   GET  /api/policy?customer_id=              -> policy with nested vehicle
//   GET  /api/claims?customer_id=
//   POST /api/claims                           (x-customer-id)
//   GET  /api/claims/:id                       (x-customer-id)
//   GET  /api/claims/:id/status                (x-customer-id)
//   POST /api/claims/:id/upload-url            (x-customer-id) -> signed Cloud Storage URL
// Backend field names are translated in ./adapters.js. Mock mode uses ../mock instead.
//
// Nothing secret lives here: the browser only knows the API URL and the signed-in customer's id.
import { API_BASE_URL, USE_MOCK } from './config';
import { mockApi } from '../mock/mockServer';
import {
  documentTypeFor, toClaim, toClaimPayload, toClaimStatus, toCustomer, toPolicy, toVehicle,
} from './adapters';

// Separate keys per mode so a leftover preview session (fake customer id) is never sent to the real API.
const MODE = USE_MOCK ? 'mock' : 'live';
const TOKEN_KEY = `insureguard.${MODE}.token`;
const USER_KEY = `insureguard.${MODE}.user`;

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** The signed-in customer. `user.id` is the customer id sent to the API. */
export const userStore = {
  get: () => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } },
  set: (u) => localStorage.setItem(USER_KEY, JSON.stringify(u)),
  clear: () => localStorage.removeItem(USER_KEY),
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const FALLBACK = {
  400: 'Some of the information was not accepted. Please check it and try again.',
  401: 'Your session has expired. Please sign in again.',
  404: 'We could not find what you were looking for.',
  500: 'Something went wrong on our side. Please try again in a moment.',
};

function messageFor(status, body) {
  // Show the API's own message for client errors; keep server errors generic (no technical detail for users).
  const apiMessage = typeof body?.error === 'string' ? body.error : typeof body?.message === 'string' ? body.message : '';
  if (status < 500 && apiMessage) return apiMessage;
  return FALLBACK[status] || (status >= 500 ? FALLBACK[500] : `Request failed (${status}).`);
}

const customerId = () => userStore.get()?.id;

async function request(path, { method = 'GET', body, query, scoped = true } = {}) {
  const id = customerId();
  if (scoped && !id) throw new ApiError(FALLBACK[401], 401);

  const qs = new URLSearchParams(query || {}).toString();
  const url = `${API_BASE_URL}${path}${qs ? `?${qs}` : ''}`;
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (scoped) headers['x-customer-id'] = id;

  let res;
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('We could not reach InsureGuard. Check your connection and try again.', 0);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && scoped) {
      tokenStore.clear();
      window.dispatchEvent(new Event('insureguard:unauthorized'));
    }
    throw new ApiError(messageFor(res.status, data), res.status);
  }
  return data;
}

// Dashboard and New Claim ask for policy and vehicle together; share one in-flight request.
let policyInflight = null;
const fetchPolicy = () => {
  if (!policyInflight) {
    policyInflight = request('/api/policy', { query: { customer_id: customerId() } })
      .finally(() => { policyInflight = null; });
  }
  return policyInflight;
};

/** Best effort: the claims endpoints do not return the policy number, so borrow it from the policy. */
const policyNumber = () => fetchPolicy().then((p) => p.policy_number).catch(() => null);

async function uploadDocument(claimId, file) {
  const meta = await request(`/api/claims/${encodeURIComponent(claimId)}/upload-url`, {
    method: 'POST',
    body: {
      file_name: file.name,
      content_type: file.type,
      document_type: documentTypeFor(file),
      file_size_bytes: file.size,
    },
  });
  const url = meta.upload_url || meta.signed_url || meta.signedUrl || meta.uploadUrl || meta.url;
  if (!url) throw new Error('No upload link was returned');
  const method = String(meta.method || meta.http_method || 'PUT').toUpperCase();
  const contentType = meta.content_type || meta.headers?.['Content-Type'] || meta.headers?.['content-type'] || file.type;

  // Straight to Cloud Storage with the signed URL. The file never passes through Cloud Run.
  let res;
  try {
    res = await fetch(url, { method, headers: { 'Content-Type': contentType }, body: file });
  } catch {
    throw new Error('Upload was blocked or interrupted');
  }
  if (!res.ok) throw new Error(`Storage rejected the file (${res.status})`);
}

const real = {
  async login(email) {
    const res = await request('/api/auth/login', { method: 'POST', body: { email }, scoped: false });
    return { token: res.token, user: toCustomer(res.customer) };
  },
  async getCustomer() {
    return toCustomer(await request('/api/customer', { query: { customer_id: customerId() } }));
  },
  async getPolicy() { return toPolicy(await fetchPolicy()); },
  async getVehicle() { return toVehicle((await fetchPolicy()).vehicle) || null; },

  async listClaims() {
    const [list, number] = await Promise.all([
      request('/api/claims', { query: { customer_id: customerId() } }),
      policyNumber(),
    ]);
    return list
      .map((c) => toClaim(c, { policyNumber: number }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async getClaim(id) {
    const path = `/api/claims/${encodeURIComponent(id)}`;
    const [detail, status, number] = await Promise.all([
      request(path),
      request(`${path}/status`).catch(() => null), // events come from here if the detail response has none
      policyNumber(),
    ]);
    const claim = toClaim(detail.claim || detail, { policyNumber: number });
    if (status) {
      const s = toClaimStatus(status);
      if (!claim.events.length) claim.events = s.events;
      if (claim.riskScore == null) claim.riskScore = s.riskScore;
    }
    return claim;
  },

  async getClaimStatus(id) {
    return toClaimStatus(await request(`/api/claims/${encodeURIComponent(id)}/status`));
  },

  /** Creates the claim, then uploads each file to its signed URL. Upload failures do not lose the claim. */
  async createClaim(values, files = [], { onProgress } = {}) {
    const policy = await fetchPolicy();
    const created = await request('/api/claims', {
      method: 'POST',
      body: toClaimPayload(values, policy.vehicle?.vehicle_id),
    });
    const raw = created.claim || created;
    if (!raw.claim_id) throw new ApiError('The claim was not created. Please try again.', 500);

    const uploadErrors = [];
    for (let i = 0; i < files.length; i++) {
      onProgress?.({ done: i, total: files.length });
      try {
        await uploadDocument(raw.claim_id, files[i]);
      } catch (err) {
        uploadErrors.push({ name: files[i].name, message: err.message });
      }
    }
    onProgress?.({ done: files.length, total: files.length });
    return { ...toClaim(raw, { policyNumber: policy.policy_number }), uploadErrors };
  },
};

if (USE_MOCK) {
  mockApi.getAnalyticsSummary = async () => {
    throw new Error('Analytics is available only in live mode.');
  };
} else {
  real.getAnalyticsSummary = async () =>
    request('/api/analytics/summary', { scoped: false });
}

export const api = USE_MOCK ? mockApi : real;
