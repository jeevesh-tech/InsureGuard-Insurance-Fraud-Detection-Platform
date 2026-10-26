// Real-time claim updates behind one function: connectToClaimUpdates(claimId, callback).
//
//   mock mode                      : in-memory event bus from mockServer (no network)
//   real mode, VITE_WS_URL empty   : REST polling of the Claims API (the backend has no WebSocket yet)
//   real mode, VITE_WS_URL set     : WebSocket. Server pushes { "type": "CLAIM_UPDATED", "claim": { ... } }
//
// Callbacks receive a claim, or for polling a status patch, which the hooks merge over the loaded claim.
// Components never poll or open sockets themselves. They use connectToClaimUpdates() through hooks/useClaims.js.
import { USE_MOCK, WS_URL } from './config';
import { mockRealtime } from '../mock/mockServer';
import { api, tokenStore } from './api';
import { isFinal } from '../utils/status';

export const TRANSPORT = USE_MOCK ? 'mock' : WS_URL ? 'websocket' : 'polling';

const stateListeners = new Set();
let state = TRANSPORT === 'websocket' ? 'connecting' : 'connected';
const setState = (s) => {
  if (s === state) return;
  state = s;
  stateListeners.forEach((fn) => fn(s));
};

// ---- polling ---------------------------------------------------------------------------------

const POLL_ACTIVE_MS = 5000;
const POLL_FINISHED_MS = 20000;

function startPolling(claimId, callback) {
  let stopped = false;
  let timer;

  const tick = async () => {
    if (stopped) return;
    let delay = POLL_ACTIVE_MS;
    if (document.visibilityState !== 'hidden') {
      try {
        if (claimId) {
          const patch = await api.getClaimStatus(claimId);
          if (!stopped) callback(patch);
          delay = isFinal(patch.status) ? POLL_FINISHED_MS : POLL_ACTIVE_MS;
        } else {
          const claims = await api.listClaims();
          if (!stopped) claims.forEach(callback);
          delay = claims.every((c) => isFinal(c.status)) ? POLL_FINISHED_MS : POLL_ACTIVE_MS * 2;
        }
        setState('connected');
      } catch {
        setState('reconnecting');
        delay = POLL_FINISHED_MS / 2;
      }
    }
    if (!stopped) timer = setTimeout(tick, delay);
  };

  // The page has just loaded this data over REST, so the first poll can wait.
  timer = setTimeout(tick, POLL_ACTIVE_MS);
  return () => { stopped = true; clearTimeout(timer); };
}

// ---- WebSocket (used only when VITE_WS_URL is set) -------------------------------------------

const subscribers = new Set(); // { claimId: string | null, callback }
let socket = null;
let retry = 0;

function openSocket() {
  if (socket) return;
  // Session token only. No cloud credentials ever reach the browser.
  socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(tokenStore.get() || '')}`);
  socket.onopen = () => { retry = 0; setState('connected'); };
  socket.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type !== 'CLAIM_UPDATED') return;
      subscribers.forEach((s) => {
        if (!s.claimId || s.claimId === msg.claim.id) s.callback(msg.claim);
      });
    } catch { /* ignore malformed frames */ }
  };
  socket.onclose = () => {
    socket = null;
    if (!subscribers.size) return;
    setState('reconnecting');
    setTimeout(openSocket, Math.min(1000 * 2 ** retry++, 15000));
  };
}

function connectWebSocket(claimId, callback) {
  const sub = { claimId, callback };
  subscribers.add(sub);
  openSocket();
  return () => {
    subscribers.delete(sub);
    if (!subscribers.size && socket) { const s = socket; socket = null; s.close(); }
  };
}

// ---- public API ------------------------------------------------------------------------------

/**
 * Receive updates for one claim (pass a claimId) or for all of the customer's claims (pass null).
 * Returns a disconnect function.
 */
export function connectToClaimUpdates(claimId, callback) {
  if (TRANSPORT === 'mock') {
    return mockRealtime.subscribe((claim) => {
      if (!claimId || claim.id === claimId) callback(claim);
    });
  }
  return TRANSPORT === 'websocket' ? connectWebSocket(claimId, callback) : startPolling(claimId, callback);
}

/** Observe connection state: 'connected' | 'connecting' | 'reconnecting'. Returns an unsubscribe function. */
export function onConnectionStateChange(fn) {
  stateListeners.add(fn);
  fn(state);
  return () => stateListeners.delete(fn);
}
