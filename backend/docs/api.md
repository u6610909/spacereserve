# API reference

Base path for everything below: `/spacereserve/api/v1`.

Auth: `Authorization: Bearer <jwt>` (or the httpOnly `session` cookie `/auth/callback` sets).
Peer endpoints use `x-api-key` instead — see [peer-api.md](peer-api.md).

Every error response has the shape:

```json
{ "error": { "code": "NOT_FOUND", "message": "Room not found" }, "requestId": "..." }
```

Validation errors (400) additionally include `error.details` — the raw Zod issues.

---

## Ops

### `GET /health`

Public. No auth.

```json
{ "status": "ok", "db": "ok", "keyVault": "not_configured", "version": "0.1.0", "uptimeSeconds": 42 }
```

`status` is `"degraded"` (HTTP 503) if either dependency is `"down"`.

---

## Auth

### `GET /auth/login`
Redirects to Microsoft's authorize endpoint (PKCE + `state` in signed cookies). 503 with a clear
message if AD isn't configured yet.

### `GET /auth/callback?code=&state=&mode=`
Exchanges the code, upserts the user by `adObjectId`, issues a JWT.
- Default: sets an httpOnly + Secure (prod) + SameSite=Lax `session` cookie, then `302`s to
  `FRONTEND_URL` if it's configured (the frontend reads the session via `GET /auth/me` after
  landing — no token ever touches the URL). Falls back to returning
  `{ "status": "ok", "user": {...} }` as JSON when `FRONTEND_URL` isn't set.
- `?mode=json`: always returns `{ "token": "..." }` instead, regardless of `FRONTEND_URL`
  (Postman/demo).

### `GET /auth/me`
Requires auth. Returns `{ "user": { "id", "email", "name", "role" } }`.

### `POST /auth/refresh`
Requires auth. Re-issues a fresh token for the same user (1h expiry) — not refresh-token
rotation. Returns `{ "token", "user" }`.

### `POST /auth/dev-login`
**Disabled in production** (404). Body:

```json
{ "email": "staff@spacereserve.dev", "name": "Test Staff", "role": "STAFF" }
```

`name` defaults to `"Dev User"`, `role` defaults to `"STUDENT"`. Upserts a user keyed by
`dev:<email>` and returns `{ "token", "user" }`.

---

## Rooms

### `GET /rooms?capacity=&building=&amenities=&availableFrom=&availableTo=`
Requires auth. `amenities` is comma-separated. `availableFrom`/`availableTo` must be given
together (ISO datetimes) — excludes rooms with an overlapping `CONFIRMED` reservation.

### `GET /rooms/:id`
Requires auth.

### `POST /rooms` — STAFF/ADMIN
```json
{ "name": "CB-301", "building": "CB", "capacity": 20, "amenities": ["projector"], "status": "AVAILABLE" }
```
`amenities` defaults `[]`, `status` defaults `"AVAILABLE"`. Writes an `AuditLog` row.

### `PATCH /rooms/:id` — STAFF/ADMIN
Same shape, all fields optional (at least one required). Audited.

### `PATCH /rooms/:id/status` — STAFF/ADMIN
```json
{ "status": "OUT_OF_ORDER" }
```
Audited.

### `DELETE /rooms/:id` — STAFF/ADMIN
409 if the room has any reservations (cancel/reassign them, or set `OUT_OF_ORDER` instead).
Audited.

---

## Reservations

### `POST /reservations`
```json
{
  "roomId": "uuid",
  "startTime": "2026-09-24T15:00:00+07:00",
  "endTime": "2026-09-24T16:00:00+07:00",
  "purpose": "Study group",
  "attendeeIds": ["uuid", "uuid"]
}
```
Rejects (with the status shown) if: end ≤ start (400), start not in the future (400), duration
> 4h (400), start > 14 days out (400), room is `OUT_OF_ORDER` (409), organizer + attendees >
`room.capacity` (400), or the room already has an overlapping `CONFIRMED` reservation (409 —
checked inside a transaction). Sends a confirmation email to the organizer (never blocks/fails
the booking if that send fails).

### `GET /reservations/mine`
Reservations where the caller is the organizer or an invited attendee.

### `GET /reservations/:id`
Organizer, an invited attendee, or STAFF/ADMIN.

### `DELETE /reservations/:id`
Organizer or STAFF/ADMIN. Sets `status: CANCELLED` (not a hard delete). A STAFF/ADMIN acting on
someone else's reservation writes an `AuditLog` row. Emails the organizer.

### `POST /reservations/:id/override` — STAFF/ADMIN
Sets `status: OVERRIDDEN`. Always audited. Emails the organizer.

### `POST /reservations/:id/check-in`
Organizer only. Window: 15 minutes before `startTime` through `endTime` (409 outside it — this
is deliberately not gated by "future only", which governs creation, not check-in). Looks up
FinderAI for lost items reported near the room:

```json
{ "reservation": {...}, "lostItemNotice": null }
```
`lostItemNotice` is `null` when FinderAI is unreachable/unconfigured, `[]` when reachable with
nothing found, or an array of items otherwise.

### `POST /reservations/:id/attendees`
Organizer only. `{ "userId": "uuid" }`. 400 if it would exceed room capacity, 409 if already
invited.

### `DELETE /reservations/:id/attendees/:userId`
Organizer only.

---

## Search

### `POST /search/natural`
Requires auth, rate-limited 10/min per user. `{ "query": "a room for 4 with a whiteboard tomorrow at 3pm" }`.

```json
{ "rooms": [...], "degraded": false }
```
`degraded: true` means Gemini was unavailable/timed out/returned something invalid and the
response is a plain keyword match instead — never a 500.

---

## Admin

### `GET /admin/audit-logs?limit=` — ADMIN
`limit` defaults 100, max 500. `{ "auditLogs": [{ id, actorId, action, entity, entityId, metadata, createdAt, actor }] }`.

### `GET /admin/stats/utilization` — ADMIN
```json
{
  "rooms": [{ "roomId": "...", "name": "CB-301", "building": "CB", "reservationCount": 3, "totalBookedHours": 7.5 }],
  "totals": { "totalRooms": 10, "totalReservations": 12, "totalBookedHours": 30 }
}
```
Counts `CONFIRMED` and `OVERRIDDEN` reservations; excludes `CANCELLED`.

---

## Peer (external)

See [peer-api.md](peer-api.md) for the full contract with FinderAI.
