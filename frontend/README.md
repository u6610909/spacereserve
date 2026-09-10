# SpaceReserve — frontend

React + Vite + TypeScript app on top of the [backend API](../backend/). Not part of the
CSX4110 grading rubric — built for students to actually use.

## Stack

- React Router (`basename="/spacereserve"`)
- TanStack Query for data fetching/caching — booking/cancel/check-in all need to invalidate
  both the reservations list and room availability, and the search/filter UI wants debounced,
  cancelable requests; a hand-rolled `useEffect` fetch tends to get that subtly wrong.
- Tailwind CSS (`@tailwindcss/vite`)
- A thin `apiFetch<T>()` wrapper ([src/api/client.ts](src/api/client.ts)) underneath TanStack
  Query — prefixes `/spacereserve/api/v1`, parses the backend's `{error:{code,message,details}}`
  shape into a typed `ApiError`.

## Auth: cookie-only, same-origin everywhere

No JWT ever touches frontend JS or storage. The backend's `session` cookie (httpOnly) is the
only source of truth; `AuthContext` calls `GET /auth/me` on mount to hydrate `{user, role}`.

This only works because the frontend and backend are **same-origin** in both places:

- **Dev**: `vite.config.ts` proxies `/spacereserve/api` → `http://localhost:4000`, scoped to
  the API path only (not the whole `/spacereserve` prefix — the frontend's own routes live
  there too, via `base: '/spacereserve/'`).
- **Prod**: Nginx serves the built app at `/spacereserve/` and proxies `/spacereserve/api/` to
  the backend on the same host — see [backend/nginx/spacereserve.conf](../backend/nginx/spacereserve.conf)
  (needs a second location block added once this is actually deployed — not done yet, see
  backend README's Deployment section).

`/auth/login` → Microsoft → `/auth/callback` sets the cookie and redirects to `FRONTEND_URL`
(a backend env var — see `backend/.env.example`); the frontend then just calls `/auth/me`.
`/auth/dev-login` (hidden outside dev via `import.meta.env.DEV`, and 404s in backend production
regardless) sets the same cookie for testing without a real Entra tenant.

## Local setup

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173/spacereserve/ — proxies API calls to :4000
```

Needs the backend running too (`cd ../backend && npm run dev`) with `FRONTEND_URL` set in its
`.env` to `http://localhost:5173/spacereserve/`.

## Pages

| Page | Route | Who |
|---|---|---|
| Sign in | `/sign-in` | anyone |
| Browse rooms (filters + natural-language search) | `/rooms` | any signed-in role |
| Room detail + booking + attendee invite | `/rooms/:id` | any signed-in role |
| My reservations (cancel, check-in) | `/reservations` | any signed-in role |
| Manage rooms (create/edit/status/delete) | `/manage/rooms` | STAFF, ADMIN |
| Admin dashboard (audit log, utilization) | `/admin` | ADMIN |

Role-gating in the router (`RequireRole`) is a UX nicety only — it hides pages a role can't
use so nobody navigates into a broken screen. The backend's `requireRole` middleware is the
actual enforcement boundary.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b && vite build` → `dist/` |
| `npm run lint` | oxlint |
| `npm run preview` | Serve the production build locally |
