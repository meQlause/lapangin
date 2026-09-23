# Lapangin — Backend features, inherited conventions

**Stage:** S4 · **Base path:** `/api/v1` · Conventions: [`../../../references/conventions.md`](../../../references/conventions.md) · Architecture: [`../be-architecture.md`](../be-architecture.md) · Errors: [`../../error-handling.md`](../../error-handling.md)

Every feature document in this folder inherits the rules below and never restates them. A feature document adds its endpoints, its request and response shapes, and its errors — nothing else.

---

## 1. Feature files and ownership

| File | Owns (tables it writes) | Reads (through public surface) |
|---|---|---|
| [`venues.md`](./venues.md) | `venues` | — |
| [`courts.md`](./courts.md) | `courts`, `amenities`, `court_amenities` | `venues`, `bookings` (for the availability strip) |
| [`bookings.md`](./bookings.md) | `bookings` | `venues`, `courts`, `users` |

`users` is a repository, not a feature file: nothing in the mockup calls a users endpoint this release (sign-in is out of scope, PRD §7). The table exists so `bookings.user_id` has a target and so the booker name can be prefilled from a stub current-user id passed as `X-User-Id`.

> Two features never write the same table. If a change wants two features to insert into `bookings`, the split is wrong — not the constraint.

## 2. Base path, versioning, host header

| Concern | Rule |
|---|---|
| Base | `/api/v1` |
| Version bump | New base path (`/api/v2`), never a compatibility flag on a shared endpoint |
| Host | Same origin as the SPA in production. `CORS_ORIGIN` locks the browser origin ([`../be-stack.md`](../be-stack.md) §5) |
| Content type | `application/json; charset=utf-8` on request and response. A `text/plain` body is rejected before it reaches the router |

## 3. Authentication and access

Sign-in is out of scope this release (PRD §7). Identity is passed as an `X-User-Id` UUID header ([`../be-architecture.md`](../be-architecture.md) §5). The scope middleware reads it into `req.scope`; when the header is absent, `userId` is `null` and endpoints that require an owner return `404 E-BOOKING-NOT-FOUND` (NFR-005), never `401`.

| Level | Meaning | Endpoints this release |
|---|---|---|
| **Public** | No `X-User-Id` required | Every `GET` on `venues/*` and `courts/*` (the mockup renders these without a login) |
| **Owner** | `X-User-Id` must be present, and must match the row's `user_id` | `POST /venues/:slug/bookings`, `GET /bookings/:id` |
| **Staff**, **Admin** | Reserved. **Not used this release.** No endpoint accepts a staff override; a taken slot is refused for everyone (PRD §6) |

> When auth lands, the header disappears and the same `Cradle.userId` is resolved from a session cookie. No endpoint changes shape.

> **`X-User-Id` must never reach an environment holding real bookings.** It is a
> client-supplied claim of identity with nothing verifying it, so any caller can
> read or create a booking as any user by changing a header. That makes NFR-005
> unenforceable — non-enumerability means nothing when the caller chooses who
> they are.
>
> The stub is acceptable only because sign-in is out of scope (PRD §7) and this
> release cannot ship without it. Two guards make that explicit rather than
> assumed:
>
> - The application **refuses to boot** when `NODE_ENV=production` and the
>   `X-User-Id` fallback is enabled. Fail at boot, not on the first request.
> - An exit criterion in `../../phases.md` blocks release until identity comes
>   from a verified session.
>
> The SRS is silent on the authentication *mechanism*: it scopes out the sign-in
> *screens* while FR-018 still marks the review screen "Authenticated". That gap
> is what produced this header. Closing it is a requirements change, not an
> implementation detail.

## 4. Response shape

Every successful response is an object with a single top-level `data` key. Lists carry `meta` for the bounded-set note (§8).

```json
{
  "data": { "...": "..." },
  "meta": { "requestId": "req_01J9Z4K2M7Q" }
}
```

| Field | Rule |
|---|---|
| `data` | The resource, always an object. Even a list endpoint wraps its array under `data.items` — an anonymous top-level array cannot grow a sibling field later without breaking every client |
| `meta.requestId` | The ULID from the request scope (NFR-007). Also echoed as the `X-Request-Id` response header |
| `meta.next` | **Absent this release.** No endpoint paginates (§8) |

> An error uses the envelope in [`../../error-handling.md`](../../error-handling.md) §1. Success and failure share nothing structurally except the `requestId`. A client that reads `.data` on a failure body has a bug the shape refuses to hide.

## 5. Money on the wire

| Concern | Rule |
|---|---|
| Type | **Decimal string.** `"180000.00"` in and out. Never a JSON number, never a float |
| Currency | ISO 4217 alongside the amount (`"currency": "IDR"`). Snapshotted onto every transactional row |
| Rounding | Half up, two places, applied once, after tax. Never client-side |
| Client-computed amounts | **Never accepted.** A request that carries any `*Amount` or `unitPrice` field is rejected with `E-VALIDATION` (§7) |
| Display | The client formats `"180000.00"` → `Rp 180.000` via `formatIDR` ([`../FE/fe-architecture.md`](../../FE/fe-architecture.md) §2). No API concern |

## 6. Date and time on the wire

| Kind | Type | Example |
|---|---|---|
| Local date | `YYYY-MM-DD` string | `"2026-09-27"` |
| Local time | `HH:mm` string, 24-hour | `"10:00"` |
| Instant | ISO 8601 UTC string | `"2026-09-27T03:00:00.000Z"` (10:00 `Asia/Jakarta`) |
| Timezone | IANA identifier | `"Asia/Jakarta"` |
| Duration | Whole hours as an integer | `2` |

> The venue's `timezone` column is authoritative. Every local ↔ instant conversion uses the row's zone, never the server's ([`../../data-spec.md`](../../data-spec.md) §8, NFR-003).

## 7. Server-owned fields — never accepted from a client

Any request that carries one of the fields below is rejected with `400 E-VALIDATION`. The rejection is per-field, not a silent drop — a silent drop is how a client learns nothing until it depends on a value it invented.

| Field | Set by |
|---|---|
| `id` | Database default (`gen_random_uuid()`) |
| `createdAt`, `updatedAt`, `cancelledAt` | `now()` on the row |
| `unitPrice`, `subtotalAmount`, `taxPercent`, `taxAmount`, `totalAmount` | `bookings.service.ts` from the court and venue snapshot |
| `currency`, `venueTimezone` | Snapshotted from the venue at write |
| `startsAt`, `endsAt`, `endTime`, `durationHours` | Computed by the service from `bookingDate + startTime + duration` under `venues.timezone` |
| `status`, `paymentStatus` | Domain state; only the service moves them |
| `bookerName`, `bookerPhone` | These come from the client (FR-020, FR-021), but the server *snapshots* them onto the booking and never reads them from `users` afterwards ([`../../data-spec.md`](../../data-spec.md) §7) |

> Enforced by `.strict()` on every Zod request schema ([`../be-stack.md`](../be-stack.md) §7 row 7). An integration test posts one server-owned field and expects `400`, per [`../testing.md`](../testing.md) §5.

## 8. Pagination — deliberately absent this release

No endpoint paginates. The reason per list:

| Endpoint | Why the set is bounded |
|---|---|
| `GET /venues/:slug` | Returns one row |
| `GET /venues/:slug/courts` | The venue has 3 courts today, and the model caps at "a few dozen per venue" before a second venue is added. `meta.next` is reserved for the day this stops being true |
| `GET /bookings/:id` | Returns one row |

> When `courts` per venue crosses ~50, add `cursor` and `limit` (default `20`, max `100`), keyed on `(venue_id, display_order, id)`. Named here so the future contract does not surprise a client.

## 9. Validation policy

| Rule | Where |
|---|---|
| Field rules live in the Zod schema, not in a service branch | [`../../references/conventions.md`](../../../references/conventions.md) §4 — lint enforces `complexity: 8` and `max-depth: 2`, so an inline six-field validation breaches the cap |
| Every request schema ends with `.strict()` | [`../be-stack.md`](../be-stack.md) §7 row 7 |
| Coercion is explicit | Query strings are `z.coerce.number()`/`z.coerce.date()`; a body never coerces |
| Cross-field checks the schema cannot express (e.g. start < end) | The rule layer (`<feature>.rules.ts`), reachable from a unit test with no fakes |
| Field-error code vocabulary | The `details[].code` values in [`../../error-handling.md`](../../error-handling.md) §4. A new code goes there first |

## 10. Errors

| Rule | Detail |
|---|---|
| Envelope | The single shape in [`../../error-handling.md`](../../error-handling.md) §1 |
| Produced by | Services throw domain errors from `<feature>.errors.ts`. **No controller sets a status by hand.** No handler builds an envelope inline |
| Registry | Every code an endpoint can return is in [`../../error-handling.md`](../../error-handling.md) §3 with exactly one HTTP status. A new code goes there first |
| Not found vs forbidden | Another user's booking returns `404 E-BOOKING-NOT-FOUND` (NFR-005). Existence is never leaked through `403` |

## 11. Feature document template

Each file follows this shape. Every heading is mandatory; the `Notes` block after an endpoint is optional but the traps it names save an afternoon.

````markdown
# <Feature> API

**Owns:** <tables this feature writes>  ·  Conventions: [`README.md`](./README.md)

<one paragraph: what it is for, and what it deliberately does not do>

| # | Method | Path | Access |
|---|---|---|---|
| 1 | GET | `/venues/:slug/…` | Public |

---

## 1. `GET /venues/:slug/…`

<one line what it does> **Access:** Public.

### Request

Path: `slug` — URL-safe venue slug.

```json
// example query
```

| Field | In | Type | Required | Default | Rules | Source |
|---|---|---|---|---|---|---|
| `date` | query | date | yes | — | `YYYY-MM-DD`, today ≤ date ≤ today+`booking_horizon_days` | FR-010 |

### Response `200`

```json
{ "data": { "…": "…" }, "meta": { "requestId": "req_01J…" } }
```

| Field | Type | Source |
|---|---|---|

### Errors

| Status | Code | When |
|---|---|---|
| 400 | `E-VALIDATION` | Zod rejects the query |

### Side effects

None, or: `bookings` row inserted; …

### Concurrency

Where a constraint does the work, say so, and say the service does not check-then-write.

### Notes

> Traps, and any deliberate change against the current system.
````

`Source` carries the SRS requirement id the field satisfies. Every computed figure is specified as a formula **and** as a worked example whose figures match the mockup exactly.

## 12. Definition of done for a feature document

- [ ] Every endpoint the mockup needs is present, and no endpoint no screen calls
- [ ] Every endpoint states access, request rules, response example and error table
- [ ] Every error code appears in [`../../error-handling.md`](../../error-handling.md) §3 with exactly one status
- [ ] Server-owned fields are listed, so no amount or status can be set by a client
- [ ] Every computed figure in a response example matches the mockup exactly
- [ ] Every reserved regression in [`../testing.md`](../testing.md) §4 that touches this feature is cross-linked from the endpoint it protects
