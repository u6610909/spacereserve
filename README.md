# SpaceReserve

Campus room-booking system. Students and faculty search for rooms, book them, and invite others
along; facility staff manage rooms and override bookings; admins see audit logs and utilization.
Sign-in goes through the university's Microsoft Entra ID — nobody sets a SpaceReserve password.

This repo has two apps:

| | What | Docs |
|---|---|---|
| [`backend/`](backend/) | The REST API — the graded final project for **CSX4110 Backend Application Development** (Assumption University, Prof. Dr. Chayapol Moemeng, Section 542, Semester 1/2026) | [backend/README.md](backend/README.md) |
| [`frontend/`](frontend/) | A React app on top of the API, built for students to actually use — not part of the CSX4110 grading rubric | [frontend/README.md](frontend/README.md) |

They deploy together (one Nginx host, one domain) but are otherwise independent: separate
`package.json`, separate CI steps, separate dev servers. See each app's own README for setup,
architecture, and status — the backend one in particular covers the full graded spec
(architecture diagram, ERD, tech stack, API reference, RBAC matrix, peer API, deployment guide,
Key Vault secret table).

## Contributing

Branch per feature, open a pull request into `main`, CI must pass before merge.
No direct commits to `main`.

## Team

| Name | Student ID |
|---|---|
| Ratchanon P. | 6610909 |
| Badin Bangsen | 6611108 |
| Warachai A. | 6610996 |
