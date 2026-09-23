# Lapangin — Frontend stack

**Stage:** S3 · **Owns:** the eight library choices, their alternatives, their traps · Conventions: [`../../references/conventions.md`](../../references/conventions.md) · Lint: [`./lint.md`](./lint.md)

Fixed once at S3 and recorded in `docs/.pspt.json`. Changing an entry is a specification change.

---

## 1. Choices

| # | Concern | Choice | Alternative it beat | Why it won *for this project* | Trap |
|---|---|---|---|---|---|
| 1 | Language | **TypeScript** | JavaScript | The response schemas are Zod → `type X = z.infer<typeof …>` is the shape used inside components; branded `Money` prevents adding two amounts by accident | Vite's `isolatedModules` requires every re-export of a type to use `export type`. A `barrel.ts` re-exporting values and types with plain `export` compiles but breaks the dev bundle |
| 2 | Framework | **React 19** | Preact, Svelte, plain HTML/CSS | The mockup is HTML/CSS to start with (see `../FE/fe-architecture.md` §1); React is the smallest jump that keeps the markup shape and gains real reactivity for the four-state screens. Svelte would rewrite everything; Preact drags a per-library compatibility check | React 19's compiler removes most `useMemo`/`useCallback` calls, and hand-memoising can now *harm* the output. Don't add them until a profile shows a cost |
| 3 | Build | **Vite 5** | Next.js, Remix, Parcel | Two client-only screens with a separate Express API — Next's server-side rendering is dead weight, and its file router replaces our router choice. Vite is the smallest tool that ships the SPA and hot-reloads the mockup refactor | `server.proxy` for `/api` in dev is not a nice-to-have — without it the SPA calls `localhost:5173/api/...`, cookies drop cross-origin, and CORS problems appear that will not exist in production. Set it in `vite.config.ts` |
| 4 | Routing | **react-router** (v6.4+, data router) | TanStack Router | Two routes plus a 404. The data router's `loader`/`action` shape is exactly the split we want (`useCourts`, `useCreateBooking`). TanStack Router's type-safe params are a bigger dependency and a bigger learning gradient for one project | `<Link to="/v/gor-kemang">` skips the venue slug validation in the route; the `slug` param must always be validated in the loader (Zod), or a URL typo renders a broken page rather than a 404 |
| 5 | Server state | **TanStack Query v5** | SWR, RTK Query | The refetch-on-focus and invalidate-on-mutation behaviour are what makes the FR-028 conflict flow feel instant. RTK Query drags Redux for no gain here; SWR is smaller but has no equivalent to `useMutation` returning the created row cleanly | The default retry is 3, which triples the wait on a real 400 and hides the error state. Set `retry: (n, err) => err.status >= 500 && n < 2` on the QueryClient — user errors are never retried |
| 6 | Validation | **Zod** | Valibot, TypeBox | Same shape as the backend — one schema style across two repos, one `z.infer` per DTO. The form validation (`react-hook-form` + `@hookform/resolvers/zod`) reuses the request schema | Zod's `.transform()` runs during parse — a transformer that throws turns a 200 response into an `ApiError`. Keep transforms pure and total; use `.refine()` for conditional validation |
| 7 | Forms | **react-hook-form** + `@hookform/resolvers/zod` | Formik, uncontrolled inputs by hand | Two forms this release — the review's booker form and (implicitly) the filter bar. `react-hook-form` gives us `keepValues: true` on submit-failure, which is exactly FR-029's "conflict preserves every value" without hand-rolling it | `mode: 'onSubmit'` is the default; a field marked invalid *after* an API failure needs `setError(name, {…}, { shouldFocus: true })` — otherwise focus stays on the submit button and screen readers don't announce the error |
| 8 | Test runner | **Vitest + jsdom** + Playwright/Chromium for e2e | Jest, Cypress | Vitest shares the Vite pipeline (one config, one transformer). Cypress is fine but Playwright covers the same journeys, cross-browser, with one binary; SR-4 already picks Chromium | `jsdom` does not implement `IntersectionObserver`, `ResizeObserver`, or `matchMedia`. `tests/helpers/dom-polyfill.ts` shims all three; forgetting it turns a first `useLayoutEffect` into a cryptic test failure |

## 2. Lint

The governing lint file is [`./lint.md`](./lint.md) — copied from `references/lint/react.md` into this repo. The three consequences that reach the specification are already threaded through the other documents:

| Rule | Where the spec absorbs it |
|---|---|
| `complexity: 8`, `max-depth: 2`, `jsx-max-depth: 5` | Field rules are expressed as **Zod schema**, never as service branching. A JSX branch past five levels means the inner block is its own component |
| `sonarjs/no-nested-conditional` | The code → presentation-class map (`../error-handling.md` §5) is a **`const` lookup table** in `src/api/errors.ts`, never a chained ternary. `{loading ? <A/> : error ? <B/> : <C/>}` in JSX is banned outright — use early `return`s or a `<Body state=…>` sub-component |
| `sonarjs/todo-tag` | Deferred work has exactly one home: `phases.md` (S6) |

`warn` is not advisory: `pnpm check` runs `eslint --max-warnings=0 --no-warn-ignored`.

The React-specific consequence: **hooks are not allowed in helpers.** A module-level `COLUMNS = [...]` table cannot call `useTranslation`. It becomes `buildColumns(t)` called from the component ([`./lint.md`](./lint.md) §4). This shapes several places in the design — the filter bar's option lists, the error-copy interpolation, the settings-derived cancellation-policy sentence — all read their strings through the component that owns the hook, never through a lower-level helper.

## 3. Toolchain

| Concern | Choice | Command |
|---|---|---|
| Package manager | **pnpm** | `pnpm install` |
| Dev server | **Vite** | `pnpm dev` — with `server.proxy` for `/api` |
| Build | **Vite** | `pnpm build` — outputs `dist/` |
| Preview | **Vite preview** | `pnpm preview` |
| Format | **Prettier** | `pnpm format` |
| Lint | **ESLint 9 flat config** | `pnpm lint` |
| Types | **tsc --noEmit** | `pnpm typecheck` |
| Dead code | **knip** | `pnpm dead` |
| Unit + component | **Vitest** with jsdom | `pnpm test` |
| End to end | **Playwright/Chromium** (SR-4), `axe-core/playwright` for a11y | `pnpm e2e` |
| Bundle budget | **size-limit** enforcing NFR-010 (180 KB gz) | `pnpm size` |
| Commit hook | **husky + lint-staged + commitlint** | as backend; SR-6 |

## 4. The single check command

```jsonc
// package.json
{
  "scripts": {
    "check": "pnpm run format:check && pnpm run lint && pnpm run typecheck && pnpm run dead",
    "format:check": "prettier --check .",
    "lint": "eslint --max-warnings=0 --no-warn-ignored .",
    "typecheck": "tsc --noEmit",
    "dead": "knip"
  }
}
```

Same shape as the backend. `pnpm test`, `pnpm e2e` and `pnpm size` run in addition in CI.

## 5. Environment

`.env` at the SPA root, loaded by Vite. **Only `VITE_`-prefixed variables reach the browser.**

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Base URL for the API; blank in dev (proxy handles it) |
| `VITE_STAGE_LABEL` | Value for the footer stage line (FR-035) |

> Anything not `VITE_`-prefixed is silently absent in the build; forgetting the prefix is the trap that surfaces as `undefined` on the wire.

## 6. Packages

| Purpose | Package | Version |
|---|---|---|
| Framework | `react`, `react-dom` | ^19 |
| Router | `react-router-dom` | ^6.26 |
| Server state | `@tanstack/react-query` | ^5 |
| Validation | `zod` | ^3.23 |
| Forms | `react-hook-form`, `@hookform/resolvers` | ^7.53, ^3.9 |
| Test runner | `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event` | latest |
| E2E | `@playwright/test`, `@axe-core/playwright` | ^1.47, ^4.10 |
| Lint | `eslint`, `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `eslint-plugin-import`, `eslint-plugin-unused-imports`, `eslint-plugin-sonarjs`, `eslint-config-prettier` | flat-config-compatible versions |
| Build | `vite`, `@vitejs/plugin-react` | ^5, ^4 |
| Hooks | `husky`, `lint-staged`, `@commitlint/cli`, `@commitlint/config-conventional` | latest |
| Dead code | `knip` | ^5 |
| Bundle budget | `size-limit`, `@size-limit/preset-app` | ^11 |

> No `date-fns`, no `dayjs`, no `moment`. The one Indonesian long-date format (`Minggu, 27 September 2026`) uses `Intl.DateTimeFormat('id-ID', {…})`. Adding a date library needs a real requirement to justify the KB it costs against NFR-010.

> No UI kit (no MUI, no Chakra, no Radix). The mockup owns the visual system; adding one costs a full re-skin without a benefit the current design lacks. If a real accessibility requirement wants a proven combobox later, `react-aria` (headless) is the option to reach for first.

## 7. Traps worth naming

Every trap that has cost an afternoon on a comparable stack, in one place.

| Trap | Cost | Fix |
|---|---|---|
| Missing Vite `server.proxy` for `/api` | Cookies drop cross-origin in dev; CORS errors that never appear in prod eat an afternoon | `server.proxy = { '/api': { target: 'http://localhost:3000', changeOrigin: true } }` in `vite.config.ts` |
| `react.configs.recommended` in flat config | ESLint fails to load with "not a valid flat config" | Use `react.configs.flat.recommended` ([`./lint.md`](./lint.md) §8) |
| Spreading a plugin's `.rules` without `.plugins` | "Definition for rule not found" crash | Use the whole config entry, not just the `.rules` — [`./lint.md`](./lint.md) §8 |
| TanStack Query default `retry: 3` on user errors | The invalid-input screen takes ~10s to appear because the client keeps retrying a `400` | `retry: (n, err) => err.status >= 500 && n < 2` on the QueryClient |
| `Prisma.Decimal` accidentally leaked as a JSON number by the API | Client does arithmetic; PRD §6 violated silently | Backend mapper contract prevents it ([`../BE/be-stack.md`](../BE/be-stack.md) §7); frontend keeps money as `Money = string & { __money }` so a numeric coercion is a compile error |
| `useEffect` for data fetching | Race conditions, stale data, double fetches under Strict Mode | Never. Use TanStack Query (`../fe-architecture.md` §5) |
| `mode: 'onSubmit'` react-hook-form + API-side field error not focused | Screen reader silent; keyboard user cannot find the invalid field | `setError(name, {…}, { shouldFocus: true })` in the mutation's `onError` |
| jsdom missing observers | First component that uses `IntersectionObserver` or `ResizeObserver` fails cryptically in tests | `tests/helpers/dom-polyfill.ts` shims all three, imported from `vitest.setup.ts` |
| Non-`VITE_` env var referenced in a component | `undefined` at runtime, no warning | ESLint has a project-scoped `no-restricted-syntax` rule matching `MemberExpression[object.name='process'][property.name='env']` inside `src/**` |
| A ternary chain in JSX | Banned by `sonarjs/no-nested-conditional` at commit time | Use early returns in the component, or a `<Body state=…>` sub-component |
