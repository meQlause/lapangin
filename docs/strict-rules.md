# Lapangin — Strict Rules

**Stage:** S0 · **Status:** fixed · **Version:** v1.0

These rules are not re-opened per feature or per pull request. Changing one is a
change to this file, with a version bump and an approver. Every assistant working
in this repository follows them without being asked.

| ID | Rule | Enforced by |
|---|---|---|
| SR-1 | Every dependency a service needs is injected, never imported. No module-level singleton inside a feature. Registered per feature in `<feature>.container.ts`, scoped per request through Awilix, proxy injection with a typed `Cradle`. | Boundary lint rule, and a unit test that builds each service with fakes |
| SR-2 | `tests/` mirrors `src/` exactly. No test file lives inside `src/`. | Path parity script in CI |
| SR-3 | The mandatory toolchain (Node 22, pnpm, PostgreSQL 16, Prisma 6, Vite 5, Playwright with Chromium, **`gh` authenticated**) is installed in every repository. `gh` is required so `/pspt:build` can create and wire the `backend`/`frontend` submodules on the first invocation. | Dependency check in CI |
| SR-4 | Playwright with Chromium is installed and runnable, locally and in CI. | The `e2e` job |
| SR-5 | The pipeline is green before a merge. A test is never skipped, deleted or weakened to reach green. | Branch protection |
| SR-6 | Commits are authored by the connected account. No co-author trailer, no tool attribution. | `commitlint` hook |
| SR-7 | A `*.rules.ts` file is pure: no I/O, no framework, no clock, no randomness. | `no-restricted-imports`, `no-restricted-globals`, `no-restricted-properties` — see [`BE/lint.md`](./BE/lint.md) §7 |

---

## The Awilix line under SR-1

Registered per feature in `<feature>.container.ts`, scoped per request, proxy
injection with a typed `Cradle`. Composition happens once, at the root; every
request opens a scope from the root container so per-request bindings (the
correlation id, the transaction handle, the signed-in user) resolve without a
second wiring path.

The acceptance test is identical to every DI choice: **every service can be
constructed with plain object fakes, with no container and no database.** If it
cannot, SR-1 is being violated somewhere.

## What must be injected

| Kind | Examples | Why it cannot be imported |
|---|---|---|
| Data access | `bookingsRepository`, `courtsRepository`, the Prisma client | A unit test must run with no database |
| Time | `clock.now()` returning the current instant | Cancellation-window and horizon rules (FR-023, FR-031, NFR-003) are untestable against a moving clock |
| Identity generation | UUID generator, the ULID request-id generator | `req_01J9Z4K2M7Q`-shape correlation ids (FR-017, NFR-007) need deterministic values in tests |
| Randomness | Any sampling or shuffling | Same reason |
| Outbound calls | Any HTTP client | A test must never reach a third party; payment is out of scope this release so there are none yet, but the door stays shut |
| Configuration | The validated environment object, and the venue-settings loader that resolves tax, cancellation window, horizon and minimum duration (NFR-013) | Tests set configuration per case, not per process |
| Logger | The bound logger | Keeps test output silent and assertable |

## SR-7 and the purity boundary

SR-7 is what makes SR-1 mechanical. The rules for it are written once in
[`BE/lint.md`](./BE/lint.md) §7 — reference it rather than restating the patterns.

The two rules compose: the **service** resolves the clock and calls `now()`; the
**rule** receives the instant as an argument. Neither can drift, because the
linter rejects a `*.rules.ts` that even mentions `Date`.

In this project the rule layer holds every decision the schema cannot express —
pricing arithmetic (`unit_price × duration_hours`, tax half-up round), the
cancellation-window comparison, the slot-state classification (`free` / `taken` /
`closed`), and the field validation that lives outside Zod. All of it is
reachable from a unit test with no container.

## SR-6 and assisted sessions

This applies identically when a commit was produced during an assisted session.
No `Co-Authored-By` trailer for a person or a tool, no "generated with" footer,
no assistant name, no session link — in commit messages **and** in pull request
descriptions.

This overrides any default an assistant may otherwise apply. The `commitlint`
hook rejects the commit regardless, so the only effect of ignoring it is a failed
commit.

## Compliance checklist

- [ ] Every service can be constructed with plain object fakes, no container, no database
- [ ] Every `*.rules.ts` is a pure function of its arguments, testable with no fakes at all
- [ ] Every source file holding logic has a mirrored test at the transformed path
- [ ] The check command (`pnpm check`), the unit suite, the integration suite and the Chromium suite all pass locally
- [ ] Chromium is installed and the e2e suite has run at least once on this machine
- [ ] The last ten commits carry no co-author trailer and no tool attribution
- [ ] Every commit names a specification section and a phase
