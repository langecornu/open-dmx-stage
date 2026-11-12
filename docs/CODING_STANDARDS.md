# Coding standards

The rules for code in Open DMX Stage: **Node.js** (server), **React** and **Vite** (browser), plus a few rules that are
specific to a lighting controller. Parts 1 to 3 are adapted from a broader internal engineering standards document,
keeping only what applies to this stack. Part 4 adds widely used industry practice to close the known gaps.

Tags used below:

- **(met)** the code already follows this rule.
- **(gap)** not yet true everywhere. Adopt it for new code and when touching a file. Known gaps are listed in
  [Status and known gaps](#status-and-known-gaps), and [Part 4](#part-4-industry-practice-that-closes-the-known-gaps)
  says how to close each one.

**Match the sibling files in the same folder** unless the fix is small and risk-free.

Contents: [Tooling](#tooling) · [Formatting and style](#formatting-and-style) · [Part 1: Node.js](#part-1-nodejs) ·
[Part 2: React and Vite](#part-2-react-and-vite) · [Part 3: Project rules](#part-3-project-rules) ·
[Part 4: Industry practice](#part-4-industry-practice-that-closes-the-known-gaps) ·
[Quick reference](#quick-reference) · [Status and known gaps](#status-and-known-gaps)

## Tooling

Run these before calling work done, and in CI:

```bash
npm run lint     # ESLint (flat config in eslint.config.js)
npm test         # node:test suite in tests/
npm run build    # Vite production build must succeed
npm audit --omit=dev
```

Prettier (`.prettierrc`) is the formatter; run `npm run format`. Formatting-only changes go in their own commit so they
do not bury real changes.

---

# Formatting and style

Enforced by Prettier and ESLint, so nobody argues about it in review.

| Topic                          | Rule                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| Indent                         | 2 spaces, never tabs                                                                     |
| Braces                         | K&R: `{` on the same line, `} else {` cuddled                                            |
| Braces on `if`, `for`, `while` | always, even for one-line bodies (ESLint `curly: all`)                                   |
| Quotes                         | single `'` in JS; double `"` in JSX attributes and HTML                                  |
| Semicolons                     | required                                                                                 |
| Trailing commas                | on multiline structures                                                                  |
| Line length                    | about 120                                                                                |
| Blank lines                    | one between functions or logical groups, never more than one; file ends with one newline |
| Declarations                   | one `const` or `let` per statement; never `var`                                          |

```
RULES (all JS and JSX):
- Spaces inside object braces and imports: `{ a, b }`. (met)
- Arrow functions always parenthesize the parameter: `(row) => row.id`. (met)
- Prefer `function` declarations for named top-level functions; arrows for callbacks and handlers. (met)
- `const` by default, `let` only when reassigned, never `var`. (met)
- Template literals for interpolation. Use `??` and `?.` rather than `||` and long `&&` chains. (met)
- Comments explain WHY, not what, and sit above the code they describe. No commented-out code. (met)
- Import order: `node:` built-ins, a blank line, third-party packages, a blank line, local modules. (met)
- File order: header comment, imports, constants, helpers, exports. Every module opens with a short header comment
  saying what it is and why it exists. (met)
- JSX: one attribute per line once a tag is too long; self-close empty elements; avoid nested ternaries. (met)
- CSS: one selector and one declaration per line, kebab-case classes, values from design tokens (`var(--name)`),
  no vendor prefixes (the build handles them). (met)
```

---

# Part 1: Node.js

Runtime: Node 24 LTS (24.15 or newer), ESM only (`"type": "module"`). The test tooling (jsdom 31, Vitest 5) needs it.

## 1.1 Structure and naming

```
RULES:
- ESM only: `import` and `export`, `node:` prefix for built-ins, no `require`. (met)
- Layers (met):
    routes, socket handlers   parse and validate input, shape the response, nothing else
    services                  business logic (the engine, projects, output management, importers)
    clients                   one module per external system or device (each DMX driver)
  A route never talks to a device directly.
- `server/index.js` only wires things together and starts the listener. No logic. (met)
- Files camelCase.js, constants UPPER_SNAKE_CASE, classes PascalCase, booleans `is`/`has`/`should`. Use full words,
  not abbreviations. (met)
- One concept per file, and the filename matches the main export. A file past about 300 lines is a signal to split.
- Route files export a router, service files export named functions. Avoid default exports except for one obvious
  main thing. (met)
- No dead code, unused exports or unused imports.
- Pin the Node version with `"engines"` in `package.json` and `.nvmrc`. (met)
```

## 1.2 Modern JavaScript

```
RULES:
- Use `async`/`await`. Never mix it with `.then()` chains in the same function. (met, with one deliberate exception:
  a serialised write queue in the project service)
- Use `for...of` rather than `forEach` when the body awaits. `forEach` does not await.
- Use `Map` and `Set` for keyed lookup and de-duplication.
- Use `structuredClone` for deep copies, never `JSON.parse(JSON.stringify(x))`.
- Use `AbortController` or timeouts for outbound calls that can hang.
- Prefer built-in `fetch` and `node:` modules over adding a dependency.
- Test doubles are named `Mock*`, never `Fake*`. (met)
```

## 1.3 I/O, batching and limits

```
RULES:
- Never do I/O inside a per-item loop when it can be batched. Run independent I/O concurrently with `Promise.all`.
- Bound everything that comes from outside: request body size (`express.json` limit), WebSocket payload size,
  collection lengths and string lengths in schemas, and result counts. (met)
- The real-time output loop must never block: no synchronous file or network work inside a tick.
- Cache slow-changing reference data with an explicit refresh rather than fetching it per request.
```

## 1.4 Configuration

```
RULES:
- One `config.js` is the ONLY module that reads `process.env`. It validates at startup and fails fast with a clear
  message. Everything else imports config. (met)
- Ship `.env.example` with every key and no real values. (met)
- Never hardcode hostnames, addresses, serial paths or credentials. Environment settings come from config; user choices
  come from saved settings. (met)
- Never commit `.env`, keys or machine-specific paths. (met)
```

## 1.5 Error handling and logging

```
RULES:
- Never write an empty `catch`. Handle the error, log it with context, or rethrow. A comment alone is not handling,
  unless it states why ignoring is correct. (met)
- Never swallow errors with a bare `console.log(error)`.
- One shared `httpError(status, message)` helper, not a copy per file. (met)
- One Express error middleware maps errors to responses. Routes throw or call `next(err)`. Wrap async handlers so
  rejected promises reach it. (met)
- Never send raw exception text, stack traces or file paths to clients. Return a safe message plus a correlation id.
  Log 5xx with the stack and 4xx as one line. (met)
- Validation and "user can fix this" errors use plain, actionable wording (for example "Plug the cable in and refresh
  the list"), never internal jargon.
- Degrade gracefully where the feature allows: if a saved output device is missing, start on the simulator and report
  why, rather than failing to start. (met)
- Handle `unhandledRejection` and `uncaughtException` at process level: log and exit non-zero. Handle `SIGTERM` and
  `SIGINT` by stopping output cleanly before exit. (met)
- Log lines are tagged `[module]`. Never log secrets or raw personal data at info level.
- Use one shared logger (`server/logger.js`) instead of raw `console.*`; ESLint enforces it for `server/`. (met, see 4.1)
```

## 1.6 Security

```
RULES:
- CRITICAL: secrets come only from the environment. Never in source, logs, or the browser. (met)
- CRITICAL: validate every external input (HTTP body, WebSocket message, imported file) against a schema (zod),
  reject unknown fields (`.strict()`), and enforce size limits. (met)
- CRITICAL: input that selects a resource must be checked against what the system actually offers or a strict
  pattern. A serial port must be one the OS lists; a network destination must be an IPv4 address on the local network
  (private, loopback, link-local, multicast or broadcast), never a hostname or public address. Never pass
  a client-supplied path or URL straight to the filesystem, a device or the network. (met)
- CRITICAL: parse untrusted files defensively. XML parsing must not expand entities. Imported fixtures and projects
  are data, never instructions. (met)
- Lock CORS to a configured origin list. Never use bare `cors()`. Check the `Origin` on WebSocket upgrades. (met)
- Use `helmet`, API rate limiting, and request and message size limits. (met)
- Never expose a control surface to the internet without authentication. This app has no login and is for a trusted
  machine or network. Say so in the docs. (met)
- Commit the lockfile, install with `npm ci`, run `npm audit`, and justify every new dependency. Prefer the standard
  library. (met)
```

## 1.7 Testing

```
RULES:
- Use `node:test` with `node:assert/strict`. Test names read as sentences: subject, condition, outcome. (met)
- Unit-test pure logic hardest: the engine's layering, fades and chases, patch maths, importers, colour mapping.
- Test packet and wire formats byte by byte. Where possible also run a loopback test (a real UDP socket on
  127.0.0.1). (met)
- Mock all hardware and external systems. No test needs a device, real network or credentials. Name doubles
  `Mock*`. (met)
- Inject time (a `now` function or an explicit `tick(at)`) so timing logic is deterministic. (met)
- Cover positive, negative, bulk and invalid-input cases. Every bug fix lands with a regression test. (met)
- Assertion messages say what should be true.
- Target at least 80% line coverage on `server/services/` and `shared/`. (met: `npm run test:coverage` enforces thresholds, measured at 93% lines for the server; raise them as tests are
  added, see 4.4)
```

## 1.8 Documentation and dependencies

```
RULES:
- Each module opens with a short header comment: what it is and why. (met)
- JSDoc on exported functions with non-obvious contracts (`@param`, `@returns`, `@throws`). (met for `server/`, `shared/` and `scripts/`; browser code is not annotated yet, see 4.7)
- Every dependency is justified and documented in ATTRIBUTIONS.md with its licence. (met)
- Licences must be compatible with MIT. Do not bundle third-party data (for example fixture libraries) without a
  licence that allows it.
```

## 1.9 Node anti-patterns

- I/O in a per-item loop, or blocking work in the output tick.
- Empty `catch`, or a `catch` that only logs.
- Reading `process.env` anywhere but `config.js`.
- Bare `cors()`, or no origin check on the WebSocket.
- Business logic inside route handlers.
- Passing client-supplied paths, hosts or ports to the OS without validation.
- Unbounded request bodies, messages, collections or retries.
- Fire-and-forget promises with no `.catch`.
- Copy-pasted helpers (one `httpError`, one `asyncHandler`).
- Expanding XML entities or trusting imported files.

---

# Part 2: React and Vite

Stack: React 18 and Vite 6, function components, hooks only, ESM, plain CSS with design tokens.

## 2.1 Components

```
RULES:
- Function components and hooks only. No class components. (met; the one exception is `ErrorBoundary`, because React
  supports error boundaries only as classes)
- One component per file. Filename equals the component name (PascalCase.jsx). Non-component helpers and hooks live
  in `.js` files with named exports (`api.js`, `useLive.js`). (met)
- Destructure props in the signature. Keep props small and explicit; past about six props, group or compose. (met)
- Keep components under about 250 lines. Split presentational pieces from container logic. (met for components;
  see known gaps for content files)
- Type props and data shapes with JSDoc types checked by `tsc`, or TypeScript. Do not add PropTypes. (gap: `server/`,
  `shared/` and `scripts/` are checked by `npm run typecheck`; browser code and tests are not yet, see 4.2)
```

## 2.2 Naming

```
RULES:
- Components PascalCase, hooks `useThing`, handlers `handleThing` (defined) and `onThing` (props), booleans
  `isX`/`hasX`/`shouldX`. (met)
- Constants UPPER_SNAKE_CASE, CSS classes kebab-case. Use full words. (met)
```

## 2.3 State and effects

```
RULES:
- Keep state as local as possible and lift only to the nearest common parent. (met)
- Derive values during render. Do not mirror props or other state into new state. Use `useMemo` only when measurably
  expensive. (met)
- Related multi-step transitions use `useReducer` or a small state machine, not several loose `useState` booleans.
- `useEffect` is for syncing with external systems (network, sockets, timers). Not for derived data or events. (met)
- Every effect that subscribes, polls or fetches returns a cleanup and ignores stale results. (met)
- Complete dependency arrays. Do not silence `react-hooks/exhaustive-deps`. (met)
- Never mutate state or props. Update immutably. (met)
- Extract repeated stateful logic into a custom hook (`useProject`, `useLive`, `useTheme`). (met)
- Wrap `localStorage` access in try and catch and make the UI work without it. (met)
```

## 2.4 Data and API access

```
RULES:
- All HTTP goes through `src/api.js`. Components never call `fetch` directly. (met)
- Check `res.ok` and throw an error that carries the server's message. (met)
- Show loading, empty and error states for every async view. No silent failures. (met)
- Flush pending saves before actions that depend on them (play, recall). (met)
- No secrets in the browser, ever. (met)
- Real-time updates come through the WebSocket hook; coalesce high-rate input (faders) to one message per animation
  frame. (met)
```

## 2.5 JSX and rendering

```
RULES:
- Use stable, unique `key`s from data identity. Never the array index for lists that reorder, filter or change. (met: chase
  steps have stable ids)
- Never use `dangerouslySetInnerHTML` with unsanitized content. (met: not used)
- Treat imported fixture names and all file contents as untrusted text.
- Use semantic elements (`button`, `nav`, `table`, `dialog`) rather than clickable `div`s. (met)
- Memoize only after measuring.
```

## 2.6 Accessibility

```
RULES:
- Every interactive element is keyboard-operable with a visible focus state. (met)
- Icon-only buttons get `aria-label`. Toggles expose state with `aria-pressed` or `aria-checked`. (met)
- Status regions use `role="status"` or `aria-live`. Errors use `role="alert"`. (met)
- Modals use the native `<dialog>` (focus trap, Escape to close), are labelled, and close from the keyboard. (met)
- Tabs follow the tab pattern: `role="tablist"`, arrow-key navigation. (met)
- Form controls have a `<label>`. Images and SVGs have a text alternative or are `aria-hidden`. (met)
- Colour is never the only signal; pair it with text or an icon. Contrast meets WCAG AA in BOTH themes. (met)
- Respect `prefers-reduced-motion`. (met)
- Add `eslint-plugin-jsx-a11y` and automated accessibility checks. (met: `eslint-plugin-jsx-a11y` runs in lint and axe runs in the component tests;
  the manual pass before a release is still a human step, see 4.3)
```

## 2.7 CSS and theming

```
RULES:
- Every colour, radius, shadow and spacing value comes from the tokens in `src/styles/tokens.css`. Never re-type a hex
  value in a component or rule. (met)
- Light and dark themes are token sets (`:root` and `:root[data-theme='dark']`). A new colour needs a value in both.
  (met)
- The theme is applied before first paint by an external script (`public/theme-init.js`); inline scripts are not
  allowed by the content security policy. (met)
- No inline `style` for anything reusable. Inline style is for values computed at runtime (a live colour, a width
  percentage). (met)
- No `!important` except to override a third party rule, with a comment. (met)
- Layouts work from 375px wide up, with no horizontal page scroll. Test phone, tablet and desktop widths. (met)
- Kebab-case classes with a short component-ish prefix to avoid collisions (`conn-`, `help-`, `dg-`).
```

## 2.8 Vite and build

```
RULES:
- Keep `vite.config.js` minimal: the React plugin and the dev proxy for `/api` and `/live`. (met)
- The browser may import from `shared/` only if the module is pure (no Node or DOM APIs). Never import server code into
  the client. (met)
- Static files that must keep their path (the favicon, the theme script) live in `public/`. (met)
- Fonts and other assets are bundled (for example via an npm font package), not loaded from a CDN, so the app works
  offline. (met)
- Only values prefixed `VITE_` reach client code through `import.meta.env`, and they are never secrets. (met: unused)
- `npm run build` must pass before merging. `dist/` is never committed. (met)
- Code-split large or rarely used screens with `React.lazy` once they are measurably heavy (for example the guide
  modal). (met for the guide, which loads on demand, see 4.6)
```

## 2.9 Performance

```
RULES:
- Measure before adding `memo`, `useMemo` or `useCallback`.
- Coalesce high-frequency events and avoid re-rendering whole screens for per-frame data where it can be scoped.
- Virtualize or paginate long lists beyond a few hundred rows.
- Debounce free-text input that triggers work.
```

## 2.10 Testing

```
RULES:
- Vitest with React Testing Library: test behaviour by role, label and text, not class names or internals. (met: every screen,
  the app shell, the top bar, the navigation and the hooks have component tests with an accessibility check; browser
  coverage is about 98% of statements and 90% of branches, see 4.4)
- Unit-test pure browser logic first: colour mapping, patch tools, scene colours. (met)
- Mock `api.js`, not `fetch`. Cover loading, success, error and cancel paths.
- Add `vitest-axe` checks on the key screens.
- No test depends on a real network, device or credentials.
```

## 2.11 React anti-patterns

- Fetching inside components with no cleanup or abort.
- Derived data stored in state and kept in sync by effects.
- Missing or wrong hook dependencies.
- Array index as `key` in dynamic lists.
- Unsanitized HTML from files or API content.
- Components of several hundred lines mixing fetching, state and markup.
- Direct `fetch` calls scattered through components.
- Prop drilling more than two levels without composition or context.
- Hard-coded colours that ignore the theme.

---

# Part 3: Project rules

Rules specific to Open DMX Stage, beyond the general stack rules.

```
DMX output and drivers:
- A driver implements `open()`, `send(frame)`, `close()` and `getStatus()` and lives in `server/clients/`. It is
  registered in `server/services/outputManager.js`.
- Every new driver ships with byte-level tests of what it puts on the wire, plus a test with a mock port or a loopback
  socket.
- A driver never blocks the engine tick. Drivers that need their own timing loop own it and stop it in `close()`.
- Switching output blanks the old output before closing it, keeps the old driver if the new one fails to open, and
  never leaves the app without a working driver.
- Docs and UI must say whether a driver has been tested on real hardware. Do not claim "works with" what has not been
  tried.
- Verify a driver on real equipment with `npm run dmx:ramp` (it ramps channel 1 through the same driver the app uses),
  and record the adapter, operating system and result before changing a driver's status from experimental.

Engine:
- The engine takes its clock and driver as constructor arguments so tests are deterministic.
- Manual (programmer) changes sit above looks. Playing a look or sequence clears them, so playing always does
  something visible.
- Master and blackout affect brightness channels only, never position channels such as pan and tilt.

Data and persistence:
- The project is one JSON document validated by a strict zod schema on load and on save. Invalid saved data falls
  back to defaults with a logged reason rather than crashing.
- Writes are atomic (write a temporary file, then rename). Saved files live in `server/data/` and are git-ignored.
- `shared/patch.js` is the single source of truth for resolving fixtures to DMX channels, for server and browser.

Importers (QLC+, Open Fixture Library):
- Importers convert external formats into the internal fixture type and then validate with the same schema as
  everything else. No external format leaks into the rest of the code.
- Never bundle third-party fixture data without a licence that allows it. Users import their own files.

Documentation:
- A user-visible change updates the docs and, where it changes the look of a screen, the screenshots.
- A new dependency, file format or protocol is added to ATTRIBUTIONS.md with its licence.
- The in-app connection guide and docs/CONNECTION.md must say the same thing.

Pull requests:
- Small, focused changes. Lint, tests and the build pass. UI changes include screenshots in light and dark themes.
- The description states what was NOT verified, especially anything involving real hardware.
```

---

# Part 4: Industry practice that closes the known gaps

These sections turn the **(gap)** items above into concrete, adoptable practice, drawing on widely used industry
guidance. They are **targets**: nothing here is claimed as already in place. Each one says what to adopt, why, and how to
know it is done. Sources worth reading are listed at the end of the part.

## 4.1 Logging and observability

Why: raw `console.*` is unstructured, cannot be filtered or redacted, and makes incidents hard to trace.

```
RULES:
- One logger module (`server/logger.js`) is the only place that writes to stdout or stderr. All other code imports it.
  A small zero-dependency wrapper is enough to start; adopt `pino` if you need speed, transports or redaction at
  scale. Keep the same interface either way: `logger.info`, `warn`, `error`, `debug`, and `logger.child({ module })`.
- Use levels deliberately: `error` (an operation failed and needs attention), `warn` (recovered or degraded, for
  example falling back to the simulator), `info` (lifecycle events: start, driver switched), `debug` (off by default).
- Emit structured JSON in production and readable text in development. Always include a timestamp, level, module tag
  and message, plus fields rather than string concatenation: `logger.info({ driver, path }, 'Output switched')`.
- Redact by allowlist: log only the fields you mean to. Never log whole request bodies, project contents or file
  contents. If you use a logging library with `redact`, list sensitive paths explicitly.
- Every HTTP request gets a request id (reuse an incoming `X-Request-Id` if present). Carry it through the call with
  `AsyncLocalStorage` so every log line for that request includes it, and return it to the client in error responses
  (the existing correlation id).
- Expose `GET /healthz` (process is up) and `GET /readyz` (output driver state and project loaded). Keep them
  unauthenticated and free of sensitive detail.
- Make log level configurable through config (`LOG_LEVEL`), validated at start-up.
- Log hardware events that help support: driver opened or closed, serial error, reconnect attempt. Never log every
  frame.
- Do not add a metrics or tracing stack until there is a question it would answer. When you do, prefer
  OpenTelemetry-compatible tools.
```

Done when: no `console.` calls remain outside the logger, a lint rule (`no-console`) enforces it, and a request id
appears on every server log line produced during a request.

## 4.2 Type safety

Why: wrong shapes cause bugs that tests only catch later, and props and data shapes are currently undocumented.

```
RULES:
- Decision: keep plain JavaScript for now and add type checking through JSDoc types and `tsc` in check-only mode
  (`allowJs`, `checkJs`, `noEmit`). This gives most of the value without a migration. Revisit full TypeScript when
  the codebase or contributor count grows; record that choice as an ADR (4.12).
- Add `tsconfig.json` (or separate server and web configs, because only the browser needs DOM types) and an
  `npm run typecheck` script. Run it in CI.
- Turn it on gradually: start with `// @ts-check` at the top of new files and the highest-value modules
  (`shared/patch.js`, the engine, drivers, `api.js`), then widen the `include` list.
- Zod schemas are the runtime source of truth for data. Derive types from them with JSDoc (`@typedef` imported from
  a schema-inferred type) rather than hand-writing a second definition that can drift.
- Do not add PropTypes. They are being phased out of React and add little over static checking. Type component props with
  JSDoc `@param {{ ... }} props` or TypeScript.
- Prefer `unknown` over `any`, narrow before use, and never silence the checker with `@ts-ignore` without a comment
  saying why and a link to the issue that removes it.
```

Done when: `npm run typecheck` passes in CI with `strict` on for `shared/` and `server/`.

## 4.3 Component, accessibility and end-to-end testing

Why: the browser code is currently covered only through manual checks.

```
RULES:
- Use Vitest with `jsdom`, React Testing Library and `@testing-library/user-event` for component tests. Query by
  role, label and visible text, the way a person finds things. Avoid querying by class name or test ids except as a
  last resort.
- Test behaviour, not implementation: "pressing Connect with no port selected is disabled", "the guide opens on the
  tab for the selected interface", "Escape closes the guide".
- Mock `src/api.js` and the socket hook, not `fetch` or `WebSocket`. Cover loading, success, error and cancel paths.
- Add an automated accessibility check to every screen and modal test using `axe-core` through a Vitest matcher
  package (`vitest-axe` or the `vi-axe` fork; check which is maintained when you adopt it). Automated checks catch
  only part of the issues, so they supplement manual checks, never replace them.
- Lint accessibility statically with `eslint-plugin-jsx-a11y` (its flat-config recommended preset) for `src/`.
- Do a manual accessibility pass for every release: keyboard only, a screen reader on at least one platform
  (VoiceOver or NVDA), 200% zoom, and a forced-colours or high-contrast check. Record the result in the PR.
- Target WCAG 2.2 level AA.
- Add a small end-to-end suite (Playwright) once the core flows are stable: first run, set up lights, colour, save a
  look, play a sequence, switch output to the simulator. Run it against the built app with the simulator driver. Keep it
  small and deterministic.
- Keep browser tests separate from server tests (`tests/web/` and `tests/server/`) and run both with `npm test`.
- Visual changes are reviewed in the PR with screenshots in both themes and at phone width.
```

Minimal Vitest config to start from:

```js
// vitest.config.js
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/web/**/*.test.{js,jsx}'],
    setupFiles: ['tests/web/setup.js'],
  },
});
```

Static accessibility lint, added to the existing flat config:

```js
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  // ...existing config
  { files: ['src/**/*.{js,jsx}'], ...jsxA11y.flatConfigs.recommended },
];
```

Done when: component and accessibility tests run in CI, and a regression in the guide modal or connection panel fails
the build.

## 4.4 Test coverage

Why: you cannot improve what you cannot see, but chasing a number can produce poor tests.

```
RULES:
- Measure server coverage with the built-in runner and fail the build under a threshold:
    node --test --experimental-test-coverage --test-coverage-lines=80 --test-coverage-functions=80 tests/server
  Threshold flags are documented for the Node 22 and 24 lines; confirm the flags against the Node version you run.
- Measure browser coverage with Vitest's `v8` provider.
- Set thresholds per area and ratchet them upward over time: start at the current level, then never let it fall.
  Start at 80% lines for `server/services/` and `shared/`, and lower for UI glue code.
- Coverage is a floor, not a goal. Review what is uncovered rather than adding assertion-free tests to move the
  number. Branch coverage on the engine, importers and patch maths matters more than line coverage on glue.
- Upload the coverage report as a CI artifact and show the change on pull requests.
```

## 4.5 Continuous integration and delivery

Why: today every check depends on a person remembering to run it.

```
RULES:
- A required CI workflow runs on every pull request and on pushes to `main` and `release/**`:
  install with `npm ci`, then lint, typecheck, test with coverage, build, and `npm audit`.
- Protect `main` and `release/**`: require the CI checks and a review, require branches to be up to date, and block
  force-pushes and deletions.
- Least privilege: set `permissions: {}` at the top of every workflow and grant each job only what it needs
  (usually `contents: read`). Do not persist credentials on checkout.
- Pin third-party actions to a full-length commit SHA with the version in a comment, and let Dependabot update them.
  A mutable tag can be moved by the action's owner or an attacker.
- Never print secrets, never run untrusted pull-request code with secrets, and avoid `pull_request_target` unless you
  fully understand the risk.
- Use concurrency groups so a newer push cancels an older run, and cache npm through `setup-node`.
- Run on the Node version in `.nvmrc` (24) and, while you still support it, the previous LTS.
- Releases are built by CI from a tag, not from a developer's laptop, and attach the build output and a changelog.
- Enable GitHub secret scanning with push protection, and CodeQL code scanning.
```

Starting workflow (replace the placeholders with the real pinned SHAs):

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main, 'release/**']
permissions: {}
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@<full-commit-sha> # vX.Y.Z
        with:
          persist-credentials: false
      - uses: actions/setup-node@<full-commit-sha> # vX.Y.Z
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: npm audit --omit=dev --audit-level=high
```

Dependabot, for npm packages and for the actions themselves:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

## 4.6 Performance and code splitting

```
RULES:
- Split rarely used or heavy screens with `React.lazy` and `Suspense`: the connection guide modal first, then the
  Output screen. Show an accessible fallback while loading.
- Set a bundle budget (for example initial JavaScript under 250 kB gzipped) and fail CI when it is exceeded. Review
  `vite build` output and a bundle visualiser when it grows.
- The live frame updates about 15 times a second. Do not re-render whole screens for it. Keep frame data in a
  store read with `useSyncExternalStore` (or a scoped context) so only the Output grid and fixture orbs subscribe.
- Coalesce high-rate input to one message per animation frame (already done for faders). Debounce free-text input
  that triggers work.
- Measure before optimising: use the React Profiler and the browser performance panel, and record the before and
  after in the PR.
- Respect `prefers-reduced-motion` and avoid layout thrash in animations (animate `transform` and `opacity`).
- Serve built assets with long-lived cache headers and content-hashed filenames (Vite does this by default).
```

## 4.7 JSDoc and in-code documentation

```
RULES:
- Every exported function, class and hook has a JSDoc block when its contract is not obvious from the name and
  signature: what it does and why, `@param` with types and units, `@returns`, and `@throws` or error behaviour.
- Document units and ranges for hardware-facing values: "`value` is 0 to 255", "`fadeMs` is milliseconds",
  "`address` is 1 to 512".
- Document invariants and threading or timing assumptions, such as "must not block the output tick".
- Keep comments about WHY. Delete a comment that only repeats the code, and update comments in the same change as the
  code.
- Use `@typedef` for shared object shapes, and import types across files so `tsc` can check them (4.2).
- Public behaviour changes update the README or docs in the same pull request.
```

Template:

```js
/**
 * Switches the active DMX output, blanking the old one before closing it.
 * The previous driver stays active if the new one fails to open.
 *
 * @param {OutputSettings} input - Driver choice and its options (port, host, universe).
 * @returns {Promise<OutputStatus>} The status after the switch.
 * @throws {HttpError} 400 when the settings are invalid or the device cannot be opened.
 */
```

## 4.8 Runtime and version policy

```
RULES:
- Support the current Node LTS (24) as the target. Add `engine-strict=true` to `.npmrc` so installs fail loudly on an
  unsupported Node instead of warning.
- Keep `engines`, `.nvmrc` and the CI Node version in sync, and update all three together.
- Move to a new LTS within a few months of it becoming LTS, and never run an end-of-life Node in production.
- Develop and test on the supported version. A developer machine on an older Node is a bug in the setup, not a
  supported configuration.
- Pin the npm major through the Node version, and commit `package-lock.json`.
```

## 4.9 Dependency management

```
RULES:
- Enable Dependabot (4.5) for npm and for GitHub Actions. Review upgrade pull requests like any other code, and
  read the release notes for majors.
- Use semver ranges with a committed lockfile and `npm ci` everywhere (CI, release, deploy).
- Run `npm audit --omit=dev --audit-level=high` in CI. Triage findings by reachability: a vulnerability in a build tool
  is not the same as one in the running server. Record accepted risks with an expiry date.
- Run `npm audit signatures` where available to verify registry signatures and provenance.
- Check licences automatically (for example `license-checker --production --onlyAllow "MIT;ISC;BSD-2-Clause;BSD-3-Clause;Apache-2.0"`)
  and fail on unexpected ones. Keep ATTRIBUTIONS.md in sync with the lockfile.
- Detect unused dependencies and exports (for example with `knip` or `depcheck`) and remove them.
- Prefer small, maintained, well-known packages. Check maintenance activity, open security issues and the number of
  transitive dependencies before adding one. Avoid packages that run install scripts you cannot justify.
- Optional native modules (such as `serialport`) must fail soft: the app still runs in simulator mode if the native
  module cannot load. (met)
```

## 4.10 Git and release workflow

```
RULES:
- Branches: short-lived feature branches (`feature/...`, `fix/...`) merged by pull request into the release branch or
  `main`. Release lines use `release/vX.Y.Z`. Never commit directly to a protected branch.
- Commits: small and focused, in the imperative mood, with a subject under about 72 characters and a body that
  explains why. Conventional Commit prefixes (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`) make
  changelogs and version bumps mechanical, so adopt them.
- Versioning: Semantic Versioning. Breaking changes (a project file format, an API or setting change) bump the
  major version, features the minor, fixes the patch. While below 1.0, still call out breaking changes explicitly.
- Changelog: keep `CHANGELOG.md` in the Keep a Changelog format, updated in the pull request that changes behaviour.
- Releases: tag `vX.Y.Z` on the release branch, build in CI, and publish a GitHub release with notes. Never move or
  delete a published tag.
- Pull requests: use a template with a summary, how it was tested, what was NOT verified, screenshots for UI, and a
  checklist (tests, docs, attributions, accessibility). Keep them small enough to review in one sitting.
- Review: at least one approving review, and the author does not merge their own change to a protected branch where
  there is another maintainer. Reviewers check behaviour, tests, security, accessibility and documentation, not style
  (tools own style).
- Never force-push a shared branch. Rewrite history only on your own unmerged branch.
- Do not commit secrets. If one leaks, rotate it first, then remove it from history.
- Add a `CODEOWNERS` file once there is more than one maintainer.
```

## 4.11 Open-source hygiene

```
RULES:
- Keep `LICENSE`, `ATTRIBUTIONS.md` and `README.md` current. State clearly what is and is not tested.
- Add `SECURITY.md` with a private way to report vulnerabilities (GitHub private vulnerability reporting) and the
  versions that receive fixes. Do not ask people to report vulnerabilities in public issues.
- Add `CONTRIBUTING.md` that points to this document, explains how to run the checks, and sets expectations for pull
  requests.
- Add `CODE_OF_CONDUCT.md` (for example the Contributor Covenant) once outside contributions are welcome.
- Provide issue templates for bugs (with adapter model, operating system and app version) and feature requests, and a
  pull request template.
- Label issues clearly (`good first issue`, `hardware`, `docs`) so newcomers can find work.
- Be honest about hardware: record which interfaces have been tested, on which operating system, by whom.
```

## 4.12 Architecture decisions and documentation

```
RULES:
- Record significant decisions as short Architecture Decision Records in `docs/adr/NNNN-title.md` (context, decision,
  consequences). Examples: typing strategy, why a driver is software-timed, the single-universe limit, the project file
  format. Supersede an ADR rather than editing history.
- Keep diagrams as code (Mermaid) beside the docs so they are reviewed and versioned with the change.
- Docs are part of the definition of done: a user-visible change updates the guides and screenshots in the same pull
  request. Screenshots are regenerated, not hand-edited.
- Keep one source of truth for repeated content. The in-app connection guide and `docs/CONNECTION.md` must say the same
  thing; when one changes, change both, or generate one from the other.
- Write docs for the least experienced reader first, with the shortest path to a working result at the top.
```

## 4.13 Real-time reliability and data safety

Why: this app drives physical equipment, often live. Failure modes matter more than in a typical web app.

```
RULES:
- WebSocket: reconnect with exponential backoff and jitter (not a fixed interval), send periodic ping and pong
  heartbeats to detect dead connections, and show a clear "reconnecting" state in the UI. On reconnect, resync full
  state from the server.
- Give socket messages a version field and ignore unknown versions gracefully, so an old browser tab does not crash a
  new server.
- Make server actions idempotent where possible, and design the UI so a repeated click is harmless.
- The output must fail safe. If the process crashes, lights should hold or go dark in a way that is documented. Decide
  and document which, and test the unplug-the-cable and kill-the-server paths.
- Detect a failed driver while running (serial error, closed port) and surface it within seconds. Offer reconnect,
  and consider automatic retry with backoff for transient errors.
- Protect the project data: validate on load and save, write atomically (done), keep a rolling backup of the previous
  save, and provide Export and Import of a show file so users can back up and move shows.
- Add a `schemaVersion` to the project file and write migrations for every format change, with a test that loads an
  old fixture file. Never break a user's saved show silently.
- Confirm destructive actions that cannot be undone (deleting a look used by sequences, replacing a project) and
  provide undo for common edits where practical.
- Apply back-pressure and rate limits per client on the control socket, so one noisy or malicious client cannot
  starve output.
- Keep the engine's tick deterministic and free of allocation-heavy work. Measure tick duration and log a warning
  when a tick runs late.
```

## 4.14 API design

```
RULES:
- Version the HTTP API from the start (`/api/v1/...`) so the browser and server can evolve separately. Keep the
  WebSocket message version as above.
- Use consistent resources, methods and status codes: 200 or 201 on success, 400 for invalid input, 404 for unknown,
  409 for conflicts, 429 when rate limited, 5xx for server faults. Never return 200 with an error body.
- Use one error shape everywhere: `{ "error": "message", "correlationId": "..." }`. Messages are safe to show to
  users.
- Document the API in an OpenAPI file once it is used by anything other than this app, and test the server against it.
- Validate params, query and bodies with schemas at the edge. Reject unknown fields. Cap sizes.
- Set sensible CORS and rate limits per route group, and keep the surface minimal: do not expose endpoints you do not use.
```

## 4.15 Frontend resilience and compatibility

```
RULES:
- Add a React error boundary around each top-level screen and around the guide modal, with a friendly message and a
  way to recover, and log the error. A crash in one screen must not blank the whole app.
- Show a clear, non-technical state when the server is unreachable, and keep the UI usable for what does not need
  the server.
- Define a browser support policy (for example the last two versions of Chrome, Edge, Firefox and Safari) in
  `browserslist` and test against it.
- Keep all user-visible strings in one place so the app can be translated later, and avoid building sentences by
  concatenation.
- Use the platform: native `<dialog>`, `<details>`, form controls and CSS before custom widgets.
- Keep the Content Security Policy strict. No inline scripts or styles that are not needed, no remote code, and
  review any new external origin.
```

## 4.16 Security additions

```
RULES:
- Enable secret scanning with push protection, and scan history for leaked secrets (for example with gitleaks) in CI.
- Treat the no-login design as a documented risk. Before the app is used on a shared network, add an optional access
  token or password for the control surface. The app listens on the network by default (ADR 0008, which supersedes the
  loopback default of ADR 0005); the docs say how to keep it on one computer.
- Keep the Content Security Policy as tight as possible and test it in the browser on every build.
- Add `SECURITY.md` (4.11) and a short threat model to the docs: who can reach the server, what they could do, and what
  is mitigated.
- Keep dependencies patched (4.9) and prefer fewer of them. Review the scripts that run at install time.
- Never run the server as root, and document least-privilege serial access instead (the `dialout` group on Linux).
```

## Sources worth reading

- Node.js documentation: test runner and code coverage, `AsyncLocalStorage`, and the release schedule for LTS.
- GitHub documentation: secure use of GitHub Actions, Dependabot, secret scanning and code scanning.
- WCAG 2.2 from the W3C, and the ARIA Authoring Practices Guide (dialog, tabs and switch patterns).
- React documentation: `lazy` and `Suspense`, error boundaries, and the Rules of Hooks.
- Keep a Changelog, Semantic Versioning and Conventional Commits.
- Architecture Decision Records (Michael Nygard's format).
- OWASP guidance: the Top Ten, the Application Security Verification Standard and the Cheat Sheet Series.

---

# Quick reference

| Layer       | Rule                                                                                                      | Priority     |
| ----------- | --------------------------------------------------------------------------------------------------------- | ------------ |
| Node        | Secrets only from the environment; never logged or sent to the browser                                    | **CRITICAL** |
| Node        | Validate every external input against a strict schema with size limits                                    | **CRITICAL** |
| Node        | Validate anything that selects a resource (serial path, host) against what exists or a strict pattern     | **CRITICAL** |
| Node        | Parse untrusted files defensively (no XML entity expansion)                                               | **CRITICAL** |
| React       | No secrets in client code; never inject unsanitized HTML                                                  | **CRITICAL** |
| Node        | No empty `catch`; one error middleware; safe client messages                                              | **HIGH**     |
| Node        | Lock CORS and the WebSocket origin; helmet, rate limits, body and message caps                            | **HIGH**     |
| Node        | One config module; fail fast; `.env.example`                                                              | **HIGH**     |
| Node        | Tests with mocked hardware, injected time, byte-level wire checks; regression test per bug                | **HIGH**     |
| Project     | Never block the output tick; switching output must be safe and reversible                                 | **HIGH**     |
| Project     | Do not claim hardware support that has not been tested                                                    | **HIGH**     |
| React       | Effects return cleanup and ignore stale results; complete dependency arrays                               | **HIGH**     |
| React       | All HTTP through `api.js`; check `res.ok`; loading, empty and error states                                | **HIGH**     |
| React       | Keyboard access, labels, `aria-*`, text with colour, AA contrast in both themes                           | **HIGH**     |
| Node        | Graceful shutdown; exit on `uncaughtException`                                                            | **MEDIUM**   |
| Node        | ESM, `node:` built-ins, `async`/`await`, `??` and `?.`                                                    | **MEDIUM**   |
| Node        | One shared logger                                                                                         | **MEDIUM**   |
| React       | Derive, do not mirror; `useReducer` for multi-step flows                                                  | **MEDIUM**   |
| React       | Stable data-based `key`s                                                                                  | **MEDIUM**   |
| React       | Components under about 250 lines; types or PropTypes on props                                             | **MEDIUM**   |
| React       | Tokens only, in both themes; no re-typed hex                                                              | **MEDIUM**   |
| Vite        | Bundle assets, minimal config, pure `shared/` imports only                                                | **MEDIUM**   |
| CI          | Required CI on every PR (lint, typecheck, test with coverage, build, audit); protected branches           | **HIGH**     |
| CI          | Least-privilege workflow permissions; third-party actions pinned to a commit SHA                          | **HIGH**     |
| Reliability | Output fails safe; failed drivers surface fast; project file has a schema version, migrations and backups | **HIGH**     |
| Testing     | Component tests by role and label with automated accessibility checks; a coverage floor that only goes up | **HIGH**     |
| Logging     | One structured logger with levels, redaction by allowlist and request ids                                 | **MEDIUM**   |
| Types       | JSDoc and tsc --checkJs now; full TypeScript is an ADR-recorded decision                                  | **MEDIUM**   |
| Releases    | Semantic Versioning, Conventional Commits, changelog, tagged CI-built releases                            | **MEDIUM**   |
| API         | Versioned /api/v1, one error shape, correct status codes                                                  | **MEDIUM**   |
| Docs        | ADRs for big decisions; docs and screenshots updated in the same PR                                       | **MEDIUM**   |

---

# Status and known gaps

Checked against the code on the day the standards were applied to the whole codebase. Each row says what is still open
and where Part 4 explains how to close it.

| Area                      | Open gap                                                                                                            | Why it is open                                                                              | Next step                                                               | Guidance |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| Types                     | Browser code and tests are not type-checked                                                                         | `tsc` covers `server/`, `shared/` and `scripts/`; React components need prop typedefs first | Add JSDoc prop types and widen the `include` list in `tsconfig.json`    | 4.2      |
| Component tests           | Browser coverage is high but only the mocked paths are exercised; nothing runs the real server and browser together | The component tests mock `api.js` and the WebSocket                                         | Covered by the end-to-end suite below                                   | 4.3, 4.4 |
| End-to-end tests          | None                                                                                                                | Needs a browser test runner and a stable flow                                               | Small Playwright suite against the built app on the simulator           | 4.3      |
| Manual accessibility pass | Not recorded for releases                                                                                           | Automated checks cover only part of the issues                                              | Keyboard, screen reader and zoom checklist in each release PR           | 4.3      |
| Node version              | The dev machine's default is still Node 20 (Node 24 is installed beside it for tests); `engine-strict` is off       | Enabling it would stop installs on Node 20                                                  | Make Node 24 the default, then add `engine-strict=true` to `.npmrc`     | 4.8      |
| Dependencies              | No unused-dependency check                                                                                          | Needs a tool and a baseline                                                                 | Add `knip` and fix what it finds                                        | 4.9      |
| Security                  | No access token for the control surface                                                                             | Documented; `HOST=127.0.0.1` keeps it on one computer; a token needs a login design         | Optional access token if the app is used on shared networks             | 4.16     |
| Network output            | The network interface for broadcast and multicast cannot be chosen                                                  | Needs a setting in the schema, UI and guide                                                 | Optional interface setting                                              | 4.13     |
| USB output                | Not verified on real hardware                                                                                       | No adapter was available                                                                    | `npm run dmx:ramp` on a real adapter, then update ADR 0003 and the docs | 4.13     |
| API                       | No OpenAPI description                                                                                              | Only this app uses the API today                                                            | Add one when anything else does                                         | 4.14     |
| Internationalisation      | Strings are written in the components                                                                               | Not needed yet                                                                              | Centralise strings before translating                                   | 4.15     |
| Browser support           | No `browserslist` policy                                                                                            | Not defined yet                                                                             | Decide and test against it                                              | 4.15     |
| Logging                   | No log shipping or metrics                                                                                          | No question needs them yet                                                                  | Add OpenTelemetry-compatible tooling when one does                      | 4.1      |

Closed by this work: stable ids for chase steps; a structured logger with request ids and health endpoints; JSDoc and
`tsc` for the server; component and accessibility tests; coverage thresholds; CI with pinned actions and a bundle and
licence check; Dependabot; versioned API under `/api/v1`; network exposure decided and documented (ADR 0008); show file schema version, migrations,
rolling backup and export and import; WebSocket backoff, heartbeat and protocol version; automatic recovery of a failed
output; error boundaries; the guide split into one component per file and loaded on demand; contributor files and ADRs.

## Recommended order of work

1. **Verify USB output on real hardware** with `npm run dmx:ramp`, and record the result in ADR 0003.
2. **Type the browser code** and bring the tests under `tsc`.
3. ~~Cover the remaining screens with component tests and raise the coverage thresholds.~~ Done: all screens covered, floor raised to 93% (85% branches).
4. **Move development to Node 24** and enable `engine-strict`.
5. **Add the end-to-end suite** and the manual accessibility checklist to the release process.
6. **Add `knip`** and an optional access token for shared networks.
