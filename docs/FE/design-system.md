# Lapangin — Design system

**Stage:** S5 · **Owns:** the tokens that live in `src/styles/tokens.css`, the extracted UI kit, and the mockup-to-app refactor map · Conventions: [`../../references/conventions.md`](../../references/conventions.md) · Architecture: [`./fe-architecture.md`](./fe-architecture.md)

The mockup carries the approved layout, copy and states. This document freezes the visual system the mockup already decided and names which parts of it become React under the two screens.

---

## 1. Where these come from

Every value in §2 is copied **verbatim** from [`../../mockup/styles.css`](../../mockup/styles.css) `:root`. No token here was renamed, rounded, tidied or reinterpreted — a "cleaned up" token is a visual regression against a screen someone signed off. When the token file diverges from the mockup, the mockup wins and the token is rewritten.

The UI kit in §2.5 lists only what already appears more than once with a consistent shape in `mockup/courts.html` and `mockup/booking-review.html`. Anything invented after S5 that is not a token gets added here first, and only then to the component.

---

## 2. Tokens

Exposed as CSS custom properties on `:root` in `src/styles/tokens.css`, imported once from `src/main.tsx`. TypeScript never reads a token directly; every colour/spacing/size on the screen resolves to one of these names.

### 2.1 Colour

| Token | Value | Used for |
|---|---|---|
| `--navy` | `#14243a` | Page and card headings, brand mark, total row |
| `--ink` | `#2b3440` | Body text, form input value, active nav |
| `--muted` | `#6b7684` | Subtitles, labels, hints, disabled nav, footer |
| `--line` | `#dde3ea` | Card borders, input borders, dividers |
| `--surface` | `#ffffff` | Cards, header, footer, inputs, chips at rest |
| `--canvas` | `#f4f6f9` | Body background, `taken`/`closed` slot fill, amenity chip fill |
| `--brand` | `#1f6f5c` | Primary button, active chip border/text, brand accent, open status |
| `--brand-soft` | `#e6f2ee` | Avatar bubble, active chip fill, active state-switch fill |
| `--warn` | `#b8860b` | Warn banner text, maintenance status |
| `--warn-soft` | `#fdf5e3` | Warn banner fill |
| `--danger` | `#b3261e` | Danger banner text, field error, invalid input border |
| `--danger-soft` | `#fdecea` | Danger banner fill |

> Status colours mean status only. Never use `--warn` for decorative emphasis and never use `--danger` for a "look at this" red — a user in the invalid-input state must be able to trust that a red border means their input is wrong (NFR-011, FR-030).

Six colours are inline in `styles.css` and are not tokens because they only appear once each. They stay inline until a second use appears:

| Inline value | Where | Why not a token |
|---|---|---|
| `#23543f`, `#1f6f5c`, `#46937c` | `.court-photo` gradient | Decorative photo stand-in, single use, replaced when real photos land |
| `#e9edf2` | `.bone` skeleton fill | Single component; a lighter `--line` would flatten the skeleton against the border |
| `#aab2bd`, `#c2c8d0` | `.slot.taken`, `.slot.closed` text | Two greys distinguishing two disabled states; promoting to tokens without a second use is premature |
| `#b9cdc6` | `.btn-primary:disabled` bg | Muted brand for disabled primary; if a second disabled brand surface appears, promote to `--brand-disabled` |
| `#fffafa` | `.form-row.invalid input` bg | The pink-tinted white behind an invalid field; single use |
| `#f3c9c5`, `#ecdcb3` | Banner borders | Border-per-severity, tied to `--danger-soft`/`--warn-soft`; if a third banner variant appears, promote both |

### 2.2 Radius

| Token | Value | Used for |
|---|---|---|
| `--radius-s` | `6px` | Inputs, buttons, chips, tags, slot chips |
| `--radius-m` | `10px` | Filter bar, banners, court photo, skeleton photo |
| `--radius-l` | `16px` | Cards, court card, empty/error card, skeleton |

### 2.3 Spacing

| Token | Value |
|---|---|
| `--space-1` | `4px` |
| `--space-2` | `8px` |
| `--space-3` | `12px` |
| `--space-4` | `16px` |
| `--space-5` | `24px` |
| `--space-6` | `32px` |
| `--space-7` | `48px` |

> Layout `padding` and `margin` in a component are only these tokens. `padding: 5px` in a JSX component is a lint failure (see [`./lint.md`](./lint.md), rule `declaration-property-value-allowed-list` under `stylelint`); the fix is to add a token here first if none fits.

### 2.4 Typography

| Token | Value |
|---|---|
| `--font` | `"Inter", "Segoe UI", system-ui, sans-serif` |
| `--size-xs` | `12px` |
| `--size-s` | `13px` |
| `--size-m` | `15px` |
| `--size-l` | `18px` |
| `--size-xl` | `24px` |
| `--size-xxl` | `30px` |

> Two hard-coded line-heights appear in `mockup/styles.css` (`body { line-height: 1.5 }`, `.brand { letter-spacing: -0.01em }`). Preserved verbatim in `src/styles/tokens.css`; if a second heading letter-spacing appears the pair becomes `--tracking-tight` / `--tracking-normal`.

### 2.5 Extracted UI kit

Components the mockup has proven — the ones that appear more than once with a consistent shape, so extraction pays for itself. Each is a React file under `src/components/` (cross-cutting) or under `src/features/<name>/` (screen-owned). No component here was invented after review; every one is already drawn in the mockup.

| Component | File | Extracted because |
|---|---|---|
| `Card` | `components/Card.tsx` | Used four times (schedule, booker form, cancellation terms, cost breakdown) plus twice on `courts.html` (`.empty`, `.error-page`) share the same border/radius/padding shape |
| `Button` | `components/Button.tsx` | `btn`, `btn-primary`, `btn-ghost`, `btn-block` — three variants, four screens |
| `Chip` | `components/Chip.tsx` | Sport chips (FR-013), state-switcher chips share `.chip` + `[aria-pressed]` |
| `Tag` | `components/Tag.tsx` | Amenities (FR-003) and the `requestId` label (FR-017) share `.tag` |
| `Banner` | `features/review/Banners.tsx` | Two variants (`danger`, `warn`) — FR-028, FR-030, FR-031 |
| `SlotChip` | `features/courts/SlotChip.tsx` | Three states (`free`, `taken`, `closed`) — FR-008, FR-009 |
| `Skeleton` | `features/courts/LoadingState.tsx` | Only one call site today, but the mockup ships three cards, and every list-loading state in the app becomes one file |

> No accordion, tabs, dropdown, modal, tooltip, toast, drawer or table. The mockup has none of these. Adding one at build time is a specification change with a written reason (SRS §5, [`./fe-stack.md`](./fe-stack.md) §6 "no UI kit").

---

## 3. Rules

| Rule | Why |
|---|---|
| No component introduces a colour, radius, spacing or size that is not a token | A raw value in a component is either a bug or a missing token; there is no third case. Adding a token here first is the fix |
| A component that would need a new token adds it in §2 before the component is written | The alternative — dropping a raw value into JSX "for now" — is how a design system becomes an archaeology dig |
| Status colours (`--warn`, `--danger`, `--brand`, `--muted`) mean status only | A decorative red border on an invalid-neutral element trains users to distrust the invalid-input signal (FR-030, NFR-011) |
| `.slot`, `.slot.taken`, `.slot.closed` are three visual variants of one component | Three separate components would drift on padding/border-radius/font-size; three CSS classes on one React file cannot (FR-008, FR-009) |
| Class names in the mockup are preserved in JSX | The reviewer diffs the running app against the mockup by opening devtools and reading class names; a rename breaks the diff (`fe-architecture.md` §1) |
| Copy strings live with the component that renders them | One language, no i18n framework ([`./fe-stack.md`](./fe-stack.md) §6, NFR-012). Error copy is the one exception — it lives in [`../error-handling.md`](../error-handling.md) §4 |

---

## 4. Refactor map

**One row per mockup file and per state.** `page.html?state=empty` is its own row. This is the only place that says which parts of the mockup have become React, which is what keeps a half-migrated frontend legible.

| Mockup file | Route | State | Components extracted | Endpoints consumed | Requirements | Status |
|---|---|---|---|---|---|---|
| `mockup/courts.html` (default) | `/v/:slug` | `filled` | `Header`, `Footer`, `FilterBar`, `CourtList`, `CourtCard`, `AvailabilityStrip`, `SlotChip`, `Tag`, `Button`, `Chip` | `GET /api/v1/venues/:slug` (settings), `GET /api/v1/venues/:slug/courts` | FR-001..014, FR-032, FR-033, FR-034, FR-035 | not started |
| `mockup/courts.html?state=loading` | `/v/:slug` | `loading` | `LoadingState` (three `Skeleton` rows) | same, `isLoading === true` | FR-015, NFR-009 | not started |
| `mockup/courts.html?state=empty` | `/v/:slug` | `empty` | `EmptyState`, `Button` | same, `data.items.length === 0` | FR-016 | not started |
| `mockup/courts.html?state=error` | `/v/:slug` | `error` | `ErrorState`, `Tag`, `Button` | same, `isError === true`, reads `error.requestId` | FR-017, NFR-007 | not started |
| `mockup/booking-review.html` (default) | `/v/:slug/courts/:courtId/review` | `normal` | `Header`, `Footer`, `Card`, `ScheduleCard`, `BookerForm`, `CancellationPolicy`, `CostBreakdown`, `LockNote`, `Banners`, `SubmitBar`, `Button` | `GET /api/v1/venues/:slug`, `GET /api/v1/venues/:slug/courts/:courtId/quote` | FR-018..027, FR-032, FR-033, FR-034, FR-035 | not started |
| `mockup/booking-review.html?state=taken` | same | `slot taken` | `Banners` (danger), `SubmitBar` (disabled + relabelled) | same + `POST /api/v1/venues/:slug/bookings` returning `409 E-BOOKING-SLOT-TAKEN` **or** background refetch of `GET /courts` marks the slot `taken` | FR-028, FR-029 | not started |
| `mockup/booking-review.html?state=invalid` | same | `invalid input` | `Banners` (danger), `BookerForm` with per-field errors | same + `POST /api/v1/venues/:slug/bookings` returning `400 E-VALIDATION`, **or** client Zod schema rejects on submit | FR-030 | not started |
| `mockup/booking-review.html?state=window` | same | `short-notice advisory` | `Banners` (warn) | same; derived from `data.policy.isInsideCancellationWindow === true` in the quote response | FR-031 | not started |

> Loading, empty and error rows finish first — no backend is needed to render them, and every one is enumerated in [`fe-architecture.md`](./fe-architecture.md) §8. The `filled` and `normal` rows land last because their contracts sit behind an integration test against the seed ([`../data-spec.md`](../data-spec.md) §10).

> The `?state=` query string and every inline `<script>` block in the mockup are replaced by TanStack Query + react-router state — the switcher is scaffolding (SRS §5), not a feature. The `Status layar:` bar itself ships nowhere.

### 4.1 What moves across, what is replaced

Two columns. If it is not in one, it is in the other.

| Moves across unchanged (paste, don't rewrite) | Replaced during refactor |
|---|---|
| `mockup/styles.css` → `src/styles/tokens.css` + `src/styles/base.css` (verbatim, one-time cut per rule) | `mockup/data.js` (`SETTINGS`, `VENUE`, `COURTS`, `DRAFT_BOOKING`) — fetched from the API, never bundled |
| Every Indonesian copy string (headings, buttons, labels, hints, empty/error copy, footer) | Every inline `<script>` block — replaced by React components |
| Class names (`.court`, `.slot.taken`, `.banner.danger`, `.summary`, `.state-switch`) | The `state-switch` element itself — scaffolding, does not ship |
| Semantic markup (`<article>`, `<dl>`, `<label for>`, `aria-pressed`, `role="alert"`) | `?state=` URL parameter — replaced by real query/mutation lifecycles |
| The `formatIDR` helper from `mockup/data.js:110` — one-line, pure, already correct | Every literal amount in `data.js` (`"180000.00"`, `"399600.00"`, …) — arrives from the server, never hard-coded |
| The `SLOT_TITLE` map from `mockup/courts.html:94` — `{ free, taken, closed }` labels | The dummy `COURTS` array — replaced by `GET /venues/:slug/courts` response |

> `formatIDR` is the one function in the mockup that survives verbatim. It is the "one function that renders rupiah" named in [`./fe-architecture.md`](./fe-architecture.md) §2, and its round-trip test (`"180000.00"` → `Rp 180.000`) sits in `tests/unit/api/money.test.ts` (FR-032).
