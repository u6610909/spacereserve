# Peer API — Finder Portal (FinderAI)

Partner: **Finder Portal (FinderAI)**, campus Lost & Found. This document is what we hand them
directly — see also CLAUDE.md's "Settled design decisions" for the URL.

## We expose: active booking lookup

**Purpose:** when FinderAI logs a found item in a room, they call this to learn who had that room
booked at that instant, so they can notify the likely owner.

```
GET https://ratchanon-bad2026.eastasia.cloudapp.azure.com/spacereserve/api/v1/external/bookings/active-at?room=<room name>&at=<ISO 8601 datetime>
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

**Auth:** `x-api-key` header. We generate FinderAI a 32-byte random hex key and store only its
SHA-256 hash in the `ApiKey` table (`backend/src/lib/apiKey.ts`); the raw key is never logged or
committed. Missing or wrong key → `401`.

**Rate limit:** 60 requests/minute per key.

**Data minimization:** only the organizer's name/email and an attendee count — no attendee
identities, no purpose, no room capacity/amenities.

Implementation: [src/modules/external/](../src/modules/external/), guarded by
[src/middleware/requireApiKey.ts](../src/middleware/requireApiKey.ts).

---

## We consume: item lookup by location

**Purpose:** on check-in (`POST /reservations/:id/check-in`), we ask FinderAI whether any lost
items have been reported near the room recently, so the organizer sees a heads-up immediately.

```
GET <FinderAI base URL>/api/v1/items/by-location?location=<room>&since=<ISO datetime>
x-api-key: <key FinderAI issues to us>
```

Authenticated with `SpaceReserve-FinderAIApiKey` from Key Vault (`FINDERAI_API_KEY` in dev).

**Status:** FinderAI's real request/response shape isn't finalized yet (target per
`DECISIONS.md` #11: contract frozen 28 Aug, keys exchanged 4 Sep, joint end-to-end test 16 Sep) —
we were told not to invent their field names ahead of that. `backend/src/integrations/finderai.ts`
defines a `FinderAiClient` interface and ships a mock implementation (`MockFinderAiClient`, always
returns `[]`) with the resilience behavior already built and tested:

- 3-second timeout per call
- 60-second cache per `(room, timestamp)` key
- Circuit breaker: opens for 60s after 3 consecutive failures
- On any failure/timeout/open circuit: check-in still succeeds, with `lostItemNotice: null`

Swapping in the real client is implementing `FinderAiClient` against their actual schema —
nothing that calls `lookupLostItems()` needs to change.

## Key exchange

Each side generates a key for the other (`openssl rand -hex 32` or equivalent), shares it over a
private channel (not committed, not logged), and stores only its SHA-256 hash. `seed.ts` inserts
FinderAI's row from `PEER_API_KEY_HASH` (mirrors `SpaceReserve-PeerApiKeyHash` in Key Vault) on a
fresh database; if that env var is unset it generates and prints a one-time dev key instead so
local development still works before the real exchange happens.
