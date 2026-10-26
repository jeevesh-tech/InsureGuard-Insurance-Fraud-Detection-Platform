export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

// Origin of the Claims API (Cloud Run), e.g. https://insureguard-api-xxxx.run.app. Empty = same origin.
// Paths in api.js already start with /api, so do not add it here.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

// WebSocket endpoint. Leave empty until the backend exposes one; the app then polls REST status instead.
export const WS_URL = import.meta.env.VITE_WS_URL || '';
