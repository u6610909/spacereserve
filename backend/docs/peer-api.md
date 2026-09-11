# Peer API — Finder Portal (FinderAI)

Partner: **Finder Portal (FinderAI)**, campus Lost & Found. This document is what we hand them
directly — see also docs/architecture.md for the URL.

## We expose: active booking lookup

**Purpose:** when FinderAI logs a found item in a room, they call this to learn who had that room
booked at that instant, so they can notify the likely owner.

```
GET https://spacereserve.malaysiawest.cloudapp.azure.com/spacereserve/api/v1/external/bookings/active-at?room=<room name>&at=<ISO 8601 datetime>
x-api-key: <key we issue to FinderAI>
```

- `room` — the room's `name` (e.g. `Library Room 4B`), URL-encoded.
- `at` — an ISO 8601 datetime, e.g. `2026-09-20T14:00:00+07:00`.

**Response — someone had it booked:**
```json
{
  "room": "Library Room 4B",
  "at": "2026-09-20T14:00:00+07:00",
  "reservation": {
    "id": "b2e1...",
    "startTime": "2026-09-20T13:00:00.000Z",
    "endTime": "2026-09-20T15:00:00.000Z",
    "organizer": { "name": "Ratchanon P.", "email": "ratchanon@au.edu" },
    "attendeeCount": 3
  }
}
```

**Response — nobody had it (or the room name doesn't match one of ours):**
```json
{ "room": "Library Room 4B", "at": "2026-09-20T14:00:00+07:00", "reservation": null }
```

We deliberately don't distinguish "room not found" from "room free" — an unknown room name still
gets `reservation: null` rather than a 404, so a caller can't probe our room list via this
endpoint.

**Auth:** `x-api-key` header. We generate a 32-byte random hex key and store only its SHA-256 hash
in the `ApiKey` table (`backend/src/lib/apiKey.ts`); the raw key is never logged or committed.
Missing or wrong key → `401`. Not FinderAI-specific — the Admin dashboard's Peer API section
(`POST /admin/peer-keys`, ADMIN-only) issues a key for any partner name against this same
endpoint, so onboarding a second or third team never needs a code change or a seed-script run.

**Rate limit:** 60 requests/minute per key.

**Data minimization:** only the organizer's name/email and an attendee count — no attendee
identities, no purpose, no room capacity/amenities.

Implementation: [src/modules/external/](../src/modules/external/), guarded by
[src/middleware/requireApiKey.ts](../src/middleware/requireApiKey.ts).

---

## We consume: item lookup by location

**Purpose:** on check-in (`POST /reservations/:id/check-in`), we ask FinderAI whether any lost
items have been reported near the room recently, so the organizer sees a heads-up immediately.

**Contract received from FinderAI 12 Sep:**

```
GET https://thanadon-bad2026.koreacentral.cloudapp.azure.com/project/api/items/by-location?location=<room name>&since=<ISO 8601, optional>
x-api-key: <key FinderAI issued us>
```

- `location` — a free-text room/location name (their example: `CL Lounge 2nd Floor`), URL-encoded.
  We pass `reservation.room.name`, not our internal room id.
- `since` — optional ISO 8601 datetime; we always send `now - 24h` so a busy room's whole history
  doesn't bury a recent find.

**Their response:**

```json
{
  "success": true,
  "location": "CL Lounge 2nd Floor",
  "items": [
    {
      "id": "c7b2a9e1-8842-4f30-b3e1-9214a1c50012",
      "title": "Black Leather Wallet",
      "description": "Found a black leather wallet containing student card and cash near the couch.",
      "category": "Wallets & Bags",
      "location": "CL Lounge 2nd Floor",
      "createdAt": "2026-08-13T09:30:00.000Z"
    }
  ]
}
```

`LostItemNotice` in `backend/src/integrations/finderai.ts` mirrors these field names exactly
(`id`/`title`/`description`/`category`/`location`/`createdAt`) — no invented shape.

Authenticated with `SpaceReserve-FinderAIApiKey` from Key Vault (`FINDERAI_API_KEY` in dev); the
base URL is `FINDERAI_BASE_URL` (non-secret, their own public domain).

**Resilience, unchanged by the real client landing:**

- 3-second timeout per call
- 60-second cache per room name
- Circuit breaker: opens for 60s after 3 consecutive failures
- On any failure/timeout/open circuit/`success: false`: check-in still succeeds, with
  `lostItemNotice: null`
- Falls back to `MockFinderAiClient` (always `[]`) when either `FINDERAI_API_KEY` or
  `FINDERAI_BASE_URL` is unset — same "degrade before real credentials exist" pattern as
  Gemini/ACS.

## Recording other partners we plan to consume

`PeerIntegration` (`GET`/`POST /admin/peer-integrations`, `DELETE /admin/peer-integrations/:id`,
all ADMIN-only) is bookkeeping, not a generic caller — every partner's response shape is
different, so actually calling one still means a real integration module like
`src/integrations/finderai.ts`. It just keeps each partner's name / base URL / issued key in one
place instead of scattered across chat history, since a class project ends up talking to more
than one other team's API over the semester. The stored key is masked to its last 4 characters
in every response — it's a real credential at rest (unlike `ApiKey`, we have to keep the raw
value usable to call them later, not just compare a hash), so this table is ADMIN-only end to
end.

## Key exchange — done, 12 Sep

Each side generated a key for the other (`openssl rand -hex 32`), shared it over a private
channel (not committed, not logged), and stores only its SHA-256 hash.

- **Their key, for us calling them:** in Key Vault as `SpaceReserve-FinderAIApiKey`
  (`FINDERAI_API_KEY` in dev).
- **Our key, for them calling us:** `seed.ts` inserts FinderAI's `ApiKey` row from
  `PEER_API_KEY_HASH` (mirrors `SpaceReserve-PeerApiKeyHash` in Key Vault) on a fresh database —
  the live row is set directly rather than by re-seeding prod, since re-seeding also wipes and
  regenerates the room inventory. If `PEER_API_KEY_HASH` is unset, `seed.ts` generates and prints
  a one-time dev key instead, so local development still works without the real one.
