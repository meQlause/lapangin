# Lapangin — Frontend architecture

**Stage:** S3 · **Owns:** the shape of the React SPA · Conventions: [`../../references/conventions.md`](../../references/conventions.md) · Lint: [`./lint.md`](./lint.md)

React 19 + Vite 5 in TypeScript. Two screens: `courts.html` and `booking-review.html`, refactored from `../../mockup/`. Routing with react-router. Server state through TanStack Query. Zod validates every response before it reaches a component.

---

## 1. Principle

**The app is a refactor of the approved mockup, not a rewrite.** Copy, markup shape, class names, states, tab order, hitboxes and Indonesian wording are preserved exactly. `../../mockup/styles.css`, `../../mockup/courts.html`, `../../mockup/booking-review.html` and `../../mockup/data.js` are the reference the reviewer will compare against — and every state in `../../screenshots/` must be reachable from the running app.

Two consequences that decide the whole shape:

- **The `Status layar:` switcher does not ship** (SRS §5). It is scaffolding for reviewing the four states of the court list and the four states of the review screen; the running app reaches those states through real query and mutation lifecycles.
- **The client never sends an amount** (PRD §6). Every figure is server-computed and only formatted for display. There is no arithmetic in a component, no `useMemo` computing a total, no summing.

## 2. Tree

```
src/
  main.tsx                       creates the root, mounts <App/>
  App.tsx                        <QueryClientProvider>, <RouterProvider>
  router.tsx                     the two routes plus a 404
  queryClient.ts                 the one TanStack QueryClient
  api/
    client.ts                    fetch wrapper: base URL, credentials, requestId echo
    envelope.ts                  Zod schema for the error envelope; throws ApiError
    errors.ts                    ApiError (code, status, details, requestId)
    money.ts                     formatIDR — the ONE function that renders rupiah, copied from mockup/data.js:110
    time.ts                      formatBookingDate (Indonesian long form), the venue-timezone helpers
  features/
    courts/
      CourtsScreen.tsx           the route component
      CourtList.tsx              the list of cards
      CourtCard.tsx              one court
      AvailabilityStrip.tsx      the hour chips
      SlotChip.tsx               one chip; three states (free/taken/closed)
      FilterBar.tsx              date, start-time, duration, sport (FR-010..013)
      EmptyState.tsx             FR-016
      ErrorState.tsx             FR-017 — shows requestId + Muat ulang
      LoadingState.tsx           FR-015 — three skeleton cards
      useCourts.ts               TanStack Query hook wrapping /api/v1/venues/:slug/courts
      courts.schema.ts           Zod schema for the response
      courts.rules.ts            ← pure: classifySlot(open, close, bookings, hour) → 'free'|'taken'|'closed'
      index.ts
    review/
      ReviewScreen.tsx           the route component
      ScheduleCard.tsx           FR-019
      BookerForm.tsx             name / phone / note (FR-020..022)
      CancellationPolicy.tsx     FR-023 — interpolates {cancellationWindowHours}
      CostBreakdown.tsx          FR-024, formats subtotal/tax/total (no arithmetic)
      LockNote.tsx               FR-025
      Banners.tsx                the danger/warn banner slot (§7)
      SubmitBar.tsx              primary + Ganti jadwal
      useDraftBooking.ts         reads the URL params, fetches the server-computed quote
      useCreateBooking.ts        mutation hook
      review.schema.ts           Zod for the response, and for the form (Zod-with-react-hook-form)
      review.rules.ts            ← pure: isInsideCancellationWindow(now, startsAt, windowHours) — same rule as BE `bookings.rules.ts`, run again on the client for the advisory (FR-031)
      index.ts
  layout/
    Header.tsx                   brand, Cari lapangan, Booking saya placeholder, avatar (FR-033, FR-034)
    Footer.tsx                   stage line (FR-035)
    Layout.tsx                   <Header/> <Outlet/> <Footer/>
  hooks/
    useSettings.ts               TanStack Query hook wrapping /api/v1/venues/:slug — cached, keyed by slug
    useUser.ts                   the current user for booker prefill (stub this release; PRD §7)
  types/
    dto.ts                       branded types: Money = string & { readonly __money: unique symbol }
tests/
  unit/                          mirrors src/
  integration/                   mirrors src/features/
  e2e/                           journeys, Chromium
  regression/                    REG-nnn, never deleted
  fixtures/                      builders
  helpers/
public/                          static assets — the four screenshots referenced in the empty/error states, favicons
```

> `layout/` is not a feature — it is chrome shared by every route. `hooks/` holds cross-feature data (venue settings, current user) so the two features do not each hand-roll the same fetch.

## 3. Component rules

| Rule | Why |
|---|---|
| One default export per file, named after the file | The linter (`max-classes-per-file: 1`, applied by convention to components too) plus grep-ability — a component and its file share a name |
| A component ≤ 100 lines, else split ([`./lint.md`](./lint.md) §1) | JSX is line-hungry; anything past 100 is two components |
| No inline arithmetic on amounts | PRD §6. `formatIDR(subtotalAmount)` is the only permitted operation on a Money string |
| Presentational vs container is not enforced as separate folders — one file per responsibility is | Folder taxonomy that no one maintains rots into a lie |
| Props over context for anything the parent could pass in one hop | Context is for cross-cutting values (the QueryClient, the venue settings, the current user), not for saving a prop drill |
| No boolean selector prop | `<Button primary>` and `<Button danger>` beat `<Button isPrimary/isDanger>` ([`./lint.md`](./lint.md) §6) |
| Every `<button>` and `<a>` has an accessible label; every icon-only control has `aria-label` | NFR-011 |
| `role="alert"` on the banner slot; `aria-invalid` + `aria-describedby` on invalid rows | NFR-011, matches the mockup markup in `../../mockup/booking-review.html` |

## 4. State ownership

Three layers, one owner each.

| Kind | Owner | Where |
|---|---|---|
| Server state (venue, courts, availability, draft-booking quote, booking result) | **TanStack Query** | `use*` hooks per feature. Cache key names the URL |
| URL state (venue slug, date, startTime, duration, sport, courtId) | **react-router** search params | `useSearchParams`; the URL is the source of truth so a refresh or a shared link lands on the same view |
| Local UI state (form fields, banner dismissal, focus target) | `useState` / `useReducer` inside the feature | Never lifted higher than the component that needs it |

> Redux, Zustand, Jotai and MobX are **not** installed. TanStack Query owns every network cache; the URL owns every filter and identifier; `useState` owns the rest. Adding a global store is a specification change with a written reason, not a pull-request-time choice.

**FR-029 — the conflict-preserves-input rule.** The form fields live in `BookerForm.tsx`'s local state, keyed by the *client-generated* draft id (a `useId()` seeded at mount), not by the server response. A refetched draft (after the slot-taken conflict) does not blow the form away because the fields are not read from the server at all — they are ours from the first keystroke.

## 5. Data fetching

| Rule | How |
|---|---|
| Every response validated with Zod before it reaches a component | `api/client.ts` runs `schema.parse(await res.json())`; a validation failure raises `ApiError('E-INTERNAL')` and shows the FR-017 screen with the `requestId` |
| Every failure follows the envelope in `../error-handling.md` §1 | The client trusts the shape; a body that does not parse is treated as `E-INTERNAL` (bug, not user error) |
| Optimistic UI is not used for `POST /bookings` | The whole point of the review screen is the confirmation. Success shows the created booking; a `409 E-BOOKING-SLOT-TAKEN` invalidates the availability query and shows the banner |
| Availability query auto-refetches on window focus | Cheap correctness win — a friend booking in the other tab updates the strip on return |
| Money and timestamps stay as strings through the query cache | `Money = string & { __money }`; `NUMERIC` never becomes `number`. Two places want it as a display string (`formatIDR`) — one place produces it |
| No `useMemo`/`useCallback` unless a profile shows a real cost | The React 19 compiler is doing the work; hand-memoising is code with no reader |

## 6. Client-side rules (`*.rules.ts`)

The same purity boundary as the backend: pure decision logic in `*.rules.ts`, no `Date`, no `fetch`. Two rules exist this release:

| Rule | Runs on | Why |
|---|---|---|
| `classifySlot(openingTime, closingTime, bookings, hour)` (FR-008, FR-009) | Backend authoritative, client reproduces for the availability strip after an optimistic refetch | Backend is the source of truth; the client rule exists so the strip can re-render instantly from cached bookings without a round-trip |
| `isInsideCancellationWindow(now, startsAt, windowHours)` (FR-031) | Both sides | The client shows the warning banner (advisory, `warn`); the backend never rejects the booking for it, so the rule is only for copy on the client |

Both rules read the venue settings (`cancellationWindowHours`, `minimumDurationMinutes`) through the argument list, never from a module-level constant. The service (or component) resolves the setting via TanStack Query and passes it in.

## 7. Routing

Two routes plus a 404. Every filter is a search param so the URL is a bookmarkable state (SRS `FR-010..013`, `FR-016`).

| Path | Component | Search params | Renders |
|---|---|---|---|
| `/v/:slug` | `CourtsScreen` | `date`, `startTime`, `duration`, `sport` | The court list |
| `/v/:slug/courts/:courtId/review` | `ReviewScreen` | `date`, `startTime`, `duration` | The review card + booker form + cost breakdown |
| `*` | `NotFound` | — | The screen-level 404 for `E-VENUE-NOT-FOUND` and `E-COURT-NOT-FOUND` |

> The URL carries the venue slug for two reasons — the single-venue MVP is really `gor-kemang`, and the second-venue future needs zero routing changes to arrive.

## 8. The states every screen implements

Every state in `../../screenshots/` corresponds to a code path in the running app.

### 8.1 `CourtsScreen` (four states, PRD §5)

| State | Trigger | What renders | Requirement |
|---|---|---|---|
| `filled` | `useCourts` resolves with a non-empty list | `<CourtList>` | FR-002..014 |
| `loading` | `useCourts` is fetching first-time (no cached data) | `<LoadingState>` — three skeleton cards, ≤100 ms to paint | FR-015, NFR-009 |
| `empty` | `useCourts` resolves with an empty list under the current filters | `<EmptyState>` — quotes the filter values verbatim, `Atur ulang filter` action clears search params | FR-016 |
| `error` | `useCourts` rejects with `ApiError` | `<ErrorState>` — `Jadwal gagal dimuat`, `Kode permintaan: {requestId}`, `Muat ulang` retries the query | FR-017, NFR-007 |

### 8.2 `ReviewScreen` (four states, PRD §5)

| State | Trigger | What renders | Requirement |
|---|---|---|---|
| `normal` | Fresh landing, no submission attempt | Schedule + form + cost breakdown, primary CTA enabled | FR-018..027 |
| `slot taken` | `useCreateBooking` rejects with `409 E-BOOKING-SLOT-TAKEN`, **or** a background availability refetch marks the slot taken | Danger banner in `<Banners>`; **every typed value preserved** (FR-029); primary disabled and relabelled to `Pilih jam lain dulu` | FR-028, FR-029 |
| `invalid input` | Zod form-schema rejects on submit, **or** `400 E-VALIDATION` returns from the API | Per-field errors from `../error-handling.md` §4 field table; blocking banner `Ada isian yang perlu diperbaiki` above the form | FR-030 |
| `short-notice advisory` | `isInsideCancellationWindow(now, startsAt, windowHours)` returns `true` on the derived quote | Warn banner in `<Banners>` naming the window; primary stays enabled | FR-031 |

> The `normal` state must render whether or not `useUser` has resolved — the mockup shows a prefilled name, but a hard dependency on the user query would make the form blink. The name field defaults to `''`, then hydrates when the user resolves; typing into the field before hydration wins (FR-020, "editable").

## 9. Mapping error codes to the UI

The class table in [`../error-handling.md`](../error-handling.md) §5 is realised by a single `const` object:

```ts
// src/api/errors.ts
export const ERROR_CLASS = {
  'E-VALIDATION':          'field',
  'E-OUT-OF-HOURS':        'blocking',
  'E-OUTSIDE-HORIZON':     'blocking',
  'E-DURATION-BELOW-MIN':  'blocking',
  'E-VENUE-NOT-FOUND':     'navigate',
  'E-COURT-NOT-FOUND':     'navigate',
  'E-BOOKING-NOT-FOUND':   'screen',
  'E-BOOKING-SLOT-TAKEN':  'blocking',
  'E-COURT-NOT-BOOKABLE':  'blocking',
  'E-INTERNAL':            'screen',
} as const;

export type ErrorClass = typeof ERROR_CLASS[keyof typeof ERROR_CLASS];
```

The dispatcher is a `const` lookup, never a chain of ternaries — the linter ([`./lint.md`](./lint.md) §3) rejects the ternary form.

## 10. Accessibility (NFR-011)

Not an addendum; enforced at the shape.

| Rule | How |
|---|---|
| Every control labelled | `<label for>` in the mockup is preserved. `jsx-a11y/label-has-associated-control` is on ([`./lint.md`](./lint.md) §9 note on re-enabling `anchor-is-valid`) |
| Toggle state exposed | Sport chips render as `<button role="radio" aria-checked>` (FR-013 — exactly one pressed) |
| Unavailable slots not focusable but described | `<SlotChip>` in `taken` / `closed` renders as a `<span>` with `aria-label`, not a `<button>` |
| Alerts announced | Banners are `role="alert"` |
| Contrast ≥ 4.5:1, focus always visible | `styles.css` from `../../mockup/` already meets this; kept intact |
| Automated check passes | `axe-core/playwright` runs in the e2e job on both screens in every state |

## 11. Language (NFR-012)

Every user-visible string is Indonesian. Copy lives with the component that renders it, or in [`../error-handling.md`](../error-handling.md) §4 for error messages. No i18n framework is installed — one language, one file per component. Adding a second language is a specification change with a written reason.

## 12. Payload budget (NFR-010)

Initial JavaScript ≤ 180 KB gzipped. React 19 + react-router + TanStack Query + Zod is the whole runtime; anything larger arrives as a `dynamic import` if a real screen needs it. The Vite build is inspected in CI by `vite-plugin-visualizer` producing `stats.html`, and a `size-limit` check fails the pipeline over budget.

## 13. How to add a screen

1. Create `src/features/<name>/` mirroring the shape in §2.
2. Add the route to `src/router.tsx`.
3. Enumerate every state in a `states.md` next to the components, matching the pattern in §8 — the S5 feature doc will absorb it later.
4. Add the requirement id (`FR-nnn`) to the corresponding row when writing `docs/FE/features/<name>.md` at S5.
5. Mirror the folder under `tests/unit/features/<name>/` (SR-2).
