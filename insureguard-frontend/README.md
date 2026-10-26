# InsureGuard – Frontend

React + Vite customer portal for an auto-insurance claims and fraud-detection platform.
It talks to the Claims API on Cloud Run, or runs on built-in sample data with no backend.

## Run

```bash
npm install
npm run dev              # http://localhost:5173
npm run build            # static output in dist/
```

## Configuration (`.env`, public values only)

```
VITE_USE_MOCK=false
VITE_API_BASE_URL=https://insureguard-api-1097867841772.us-west1.run.app
```

| Variable | Meaning |
| --- | --- |
| `VITE_USE_MOCK` | `false` = real Claims API. `true` = sample data in the browser (Alex Morgan, simulated processing). |
| `VITE_API_BASE_URL` | Origin of the Claims API. Do not add `/api`. Empty = same origin (Load Balancer setup). |
| `VITE_WS_URL` | Leave empty. With no WebSocket on the backend the app polls claim status every few seconds. |

Vite copies `VITE_*` values into the browser bundle, so never put passwords, keys or tokens in `.env`.
Restart `npm run dev` after editing it.

## How it connects

Components call hooks, hooks call `services/api.js` and `services/websocket.js`. Nothing else makes network calls.

| UI | Call |
| --- | --- |
| Sign in | `POST /api/auth/login` `{ email }` (demo login: no password) |
| Profile | `GET /api/customer?customer_id=` |
| Home, My policy | `GET /api/policy?customer_id=` (policy with nested vehicle) |
| Claims | `GET /api/claims?customer_id=` |
| New claim | `POST /api/claims` with `x-customer-id` |
| Claim details | `GET /api/claims/:id` and `/status` with `x-customer-id` |
| Live status | polls `GET /api/claims/:id/status` every 5 s while open (20 s once finished); pauses in a hidden tab |
| Fraud Analytics (`/analytics`, live mode only) | `GET /api/analytics/summary` |
| Photos and PDFs | `POST /api/claims/:id/upload-url`, then the browser `PUT`s the file to the returned signed Cloud Storage URL |

The customer id comes from the signed-in session (`userStore` in `api.js`). Backend field names are translated to the UI's
shapes in `services/adapters.js`, the only file that knows them. Errors use the API's `{ "error": "..." }` message for
4xx responses and a generic message for network and 5xx failures.

### Things to know about the API mapping

- **Status:** the backend `status` plus `fraud_status` map to the UI lifecycle in `adapters.js` (`PROCESSING` + `PENDING` shows as "Reading documents", `HIGH_RISK` as "Additional review required"). Unknown statuses show a readable label.
- **New claim form:** friendly types map to `claim_type` and `damage_type` codes in `adapters.js`. The API has no location field, so the location is appended to the description.
- **Upload:** `document_type` is sent as `PHOTO` or `DOCUMENT`. The signed URL's response field names are read defensively (`upload_url`, `signed_url`, `url`, ...). The bucket's CORS rules must allow `PUT` from the app's origin.
- **Dates:** date-only values (incident, policy start and end) are shown as calendar dates in UTC so they never shift a day.

## Structure

```
src/
  components/   reusable UI
  pages/        Login, Dashboard, Policy, Claims, NewClaim, ClaimDetail, Analytics, Architecture (/architecture, not in the menu)
  layouts/      AppLayout (sidebar on desktop, tab bar on mobile, auth guard)
  services/     api.js (REST client), adapters.js (API <-> UI shapes), websocket.js (live updates), config.js
  hooks/        useAuth, useAsync, useClaims / useClaim
  mock/         sample data and in-browser pipeline simulator (used only when VITE_USE_MOCK=true)
  utils/        status lifecycle, formatting, validation
```
