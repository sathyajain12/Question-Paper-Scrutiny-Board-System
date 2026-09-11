# DECISION.md — why this codebase looks the way it does

A running log of engineering decisions for the QPSB Portal. Every entry answers
the same three questions: **what was decided**, **why this approach over the
alternatives**, and **what it costs us**.

- [ARCHITECTURE.md](ARCHITECTURE.md) is the *plan* — what we intend to build.
- **This file is the *log*** — what was actually chosen, and the reasoning that
  would otherwise be lost when the person who chose it moves on.
- [FLOW.md](FLOW.md) is the *map* — how a request travels through the result.

## How to use this log

**Add an entry whenever you make a choice a future reader could reasonably
disagree with.** Not every commit; only the ones where someone six months from
now would ask "why on earth is it like this?"

Append to [§9 Session log](#9-session-log) using this shape:

```markdown
### YYYY-MM-DD — <short title>

**Decision.** One sentence.
**Why this approach.** The reasoning, including the constraint that forced it.
**Alternatives rejected.** What else was on the table and why it lost.
**Cost.** What this makes harder or slower.
**Code.** `path/to/file.ts` — the place this decision physically lives.
```

Entries are append-only. If a decision is reversed later, write a *new* entry
that supersedes it and link back — do not edit history, because the reasoning
in the old entry explains code that may still be in the repo.

---

## Table of contents

1. [The two constraints everything follows from](#1-the-two-constraints-everything-follows-from)
2. [Platform and deployment](#2-platform-and-deployment)
3. [Backend library choices](#3-backend-library-choices)
4. [Frontend library choices](#4-frontend-library-choices)
5. [Data-access architecture](#5-data-access-architecture)
6. [Correctness and safety patterns](#6-correctness-and-safety-patterns)
7. [Declared but not yet used](#7-declared-but-not-yet-used)
8. [Known gaps and deliberate stubs](#8-known-gaps-and-deliberate-stubs)
9. [Session log](#9-session-log)

---

## 1. The two constraints everything follows from

Almost every decision below is downstream of two facts that were **given, not
chosen**:

| Constraint | Consequence |
|---|---|
| **Google Sheets + Drive are the system of record** | No transactions, no joins, no `WHERE` clause, hard API quotas (Sheets: 300 reads/min/project, 60/min/user), ~200–800 ms per call |
| **Hosting is Cloudflare Workers** | The runtime is not Node. No filesystem, no `googleapis` npm SDK, ~128 MB memory, a CPU ceiling per request |

If you only remember one thing from this document: **most of the "extra"
machinery in this repo — the KV cache, the Durable Object, the `version` field
on every mutation, the repository layer — exists because Sheets is slow and has
no transactions.** None of it would be here if the data lived in Postgres.

---

## 2. Platform and deployment

### 2.1 One Worker serves both the SPA and the API

**Decision.** A single Cloudflare Worker serves the static React bundle (via the
`ASSETS` binding) *and* every `/api/*` route.
See [`src/server/index.ts`](../src/server/index.ts).

**Why this approach.** Same-origin is the whole point. Because the SPA and the
API share an origin:
- there is **no CORS** configuration to get wrong,
- the session cookie is sent automatically — the client never handles a token,
  which is why [`src/client/lib/api.ts`](../src/client/lib/api.ts) is 75 lines
  with no auth logic in it,
- deployment is **one** `wrangler deploy`, so the client and server can never
  drift to incompatible versions.

**Alternatives rejected.** Pages for the SPA + a separate Worker for the API:
two deploys, CORS, cookie-domain problems, and a window where the deployed
client expects an endpoint the deployed server doesn't have yet.

**Cost.** The Worker is in the request path for the HTML document. Mitigated by
`not_found_handling: "single-page-application"` in
[`wrangler.jsonc`](../wrangler.jsonc) and the `assets` binding, which serves
static files from the edge cache without waking Worker CPU.

### 2.2 SPA, not server-side rendering

**Decision.** Client-rendered single-page app.

**Why this approach.** Every screen in this portal is behind a login and is
personalised by role and department. SSR's benefits — first-paint speed for
anonymous visitors, SEO — are worth exactly nothing here, while the cost is real:
Worker CPU burned on every single page view, on a platform that bills CPU and
caps it.

**Cost.** A blank frame until the JS bundle loads. Acceptable for an internal
tool used by staff on institute networks.

### 2.3 Static assets from `public/`, not base64 through the API

**Decision.** `logo.png` lives in [`public/`](../public/) and is referenced as
`<img src="/logo.png">` in
[`AppLayout.tsx`](../src/client/components/AppLayout.tsx).

**Why this approach.** The Apps Script portal had a `getLogoBase64()` function
because a sandboxed Apps Script `<iframe>` cannot reference a Drive file
directly. That constraint **does not exist on Cloudflare**, so the function was
dropped entirely. The result: the logo paints on first render instead of after a
`google.script.run` round trip (no more `display:none` flash), the browser
caches it across sessions, and we don't pay base64's ~33 % payload inflation.

**Cost.** None. This is a pure win from changing platforms — worth logging
precisely because a reader familiar with the old portal will wonder where
`getLogoBase64` went.

---

## 3. Backend library choices

### 3.1 Hono — why not Express, itty-router, or raw `fetch`?

**Decision.** [Hono](https://hono.dev) as the API framework.
See [`src/server/index.ts`](../src/server/index.ts).

**Why this library.**
- **Express cannot run here at all.** It depends on Node's `http` module. This
  isn't a preference; it's disqualifying.
- **Raw `fetch` + manual routing** would mean hand-writing path params, method
  matching, and middleware composition — and getting the middleware *order*
  right is exactly where auth bugs live.
- Hono is **built for Workers**: tiny bundle, no Node shims, and it composes
  middleware in a way that makes the security model readable at a glance:

  ```ts
  boards.post('/:boardId/approve',
    requireRole('admin'),                       // who
    zValidator('json', approveBoardSchema),     // what
    handler)                                    // do
  ```

- Its **TypeScript inference is the real selling point.** The `Env` generic
  ([`src/server/env.ts`](../src/server/env.ts)) types both the Cloudflare
  bindings *and* `c.get('user')`, so `c.get('user').departments` is checked at
  compile time rather than being `any`.

**Cost.** A smaller ecosystem than Express. Has not bitten us — the only
middleware we need is our own.

### 3.2 `@hono/zod-validator` — validation as middleware

**Decision.** Request bodies are validated by `zValidator('json', schema)`
before the handler runs.

**Why this approach.** It makes invalid input *unrepresentable inside the
handler*. By the time handler code executes, `c.req.valid('json')` is a fully
typed, validated object — so no handler contains a manual `if (!body.reason)`
check that could be forgotten on the next endpoint. The schema is also the
single source of the error message the user eventually sees.

**Code.** Every mutation in [`src/server/routes/boards.ts`](../src/server/routes/boards.ts).

### 3.3 WebCrypto for the Google service-account JWT — not `google-auth-library`

**Decision.** [`src/server/google/sa-token.ts`](../src/server/google/sa-token.ts)
imports a PKCS8 PEM and signs an RS256 assertion with `crypto.subtle`, then
exchanges it for an access token.

**Why this approach.** `google-auth-library` and the `googleapis` SDK are
**Node-only** — they use `crypto`, `fs`, and `http`. On Workers they are not an
option. WebCrypto is the only path, so this was spiked *first*, before any
feature work, because if it had failed the entire hosting decision would have
had to be revisited.

**Result.** Spike passed 2026-08-14. `sa-token.test.ts` verifies the signature
**inside workerd** (the real Workers runtime, via
`@cloudflare/vitest-pool-workers`) rather than in Node — so a green test here
genuinely means it works in production. The tests generate a throwaway RSA
keypair, so they need no credentials and run in CI.

**Cost.** We hand-roll what a library would normally do. Bounded: it is one
file, and the token is cached in KV for 55 minutes so the signing path runs
roughly once an hour, not once a request.

### 3.4 Workers KV for caching

**Decision.** KV (binding `CACHE`) holds the catalogue tabs and the
service-account access token.

**Why this approach.** Read-heavy, rarely-changed data — `Programmes`,
`Courses`, `Faculty` — read on nearly every page load, changed a few times a
term. Sheets' quota is **60 reads/min/user**, which a 40-department admin
dashboard would blow through. Caching turns "one Sheets read per dashboard card"
into roughly **one Sheets read per 15 minutes**.

**Why KV specifically over the Cache API.** KV is a key-value store we can
invalidate *explicitly by key* after a write. The Cache API is URL-keyed and
better suited to the Drive folder listings (60 s, §9 of ARCHITECTURE.md), which
is where it is in fact used.

**Cost.** KV is eventually consistent — a write may take seconds to propagate
globally. This is why a mutation busts its own key immediately: the user must
always see their own write, even if another region is briefly stale.

### 3.5 Durable Objects for write serialisation

**Decision.** One `BoardLock` Durable Object instance per `boardId`.
See [`src/server/durable-objects/board-lock.ts`](../src/server/durable-objects/board-lock.ts).

**Why this approach.** This is the direct fix for *Sheets has no transactions*.
The failure it prevents is concrete and would happen during a real QPSB week:

> Two admins open the Submitted queue. Both read `status=Submitted`. One clicks
> Approve, the other clicks Reject. Both writes succeed. The second silently
> wins, and there is no record that the first ever happened.

The Workers runtime guarantees that a given DO instance processes **one request
at a time**. Keying the instance by `boardId` means all writes to one board are
serialised, while different boards still run fully in parallel.

**Why not a lock cell in the sheet, or a KV mutex.** A lock cell has the same
race it's trying to fix (read-then-write is not atomic). A KV mutex is unsound
because KV is eventually consistent — two regions can both see "unlocked".

**Cost.** One extra network hop per write, and a Workers Paid plan. Reads never
touch the DO — they hit KV — so the hot path pays nothing.

**Status.** Declared in [`wrangler.jsonc`](../wrangler.jsonc) with its migration,
class exported from [`src/server/index.ts`](../src/server/index.ts), but
`fetch()` returns **501** — see [§8](#8-known-gaps-and-deliberate-stubs).

---

## 4. Frontend library choices

### 4.1 TanStack Query — the most load-bearing library in the client

**Decision.** All server state goes through TanStack Query.
See [`src/client/lib/hooks.ts`](../src/client/lib/hooks.ts).

**Why this library.** Sheets calls take 200–800 ms. Everything that makes this
app feel acceptable despite that comes from Query:

- **Request deduplication.** [`BoardRow`](../src/client/components/admin/BoardRow.tsx)
  and [`BoardCard`](../src/client/components/board/BoardCard.tsx) both call
  `useBoard(boardId)`. Without dedupe that is two requests for one board; with
  it, one.
- **Cache-first rendering.** `staleTime: 30_000` in
  [`main.tsx`](../src/client/main.tsx) means navigating between tabs re-renders
  from cache instantly instead of re-hitting Sheets.
- **`invalidateQueries` after mutations** is what keeps the admin dashboard
  *honest*. Approving a board must change the "Pending approval" count. Rather
  than hand-patching that number, `useBoardMutation` invalidates both the board
  detail and the list, and both re-derive from the server:

  ```ts
  onSettled: () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.boards });
  }
  ```

  Note **`onSettled`, not `onSuccess`** — deliberate. On a `409 VERSION_CONFLICT`
  we *especially* want to refetch, because the whole recovery story is "reload
  the current state and let the user retry against it."

**Alternatives rejected.** `useEffect` + `useState` fetching: no dedupe, no
cache, and every component reinvents loading/error handling. Redux/Zustand:
these are *client*-state tools; server state has different needs (staleness,
refetch, invalidation) that they don't address.

**Cost.** A real mental model to learn — query keys, staleness, invalidation.
Contained by keeping every key in one file,
[`query-keys.ts`](../src/client/lib/query-keys.ts).

### 4.2 Zod, shared by both client and server

**Decision.** Validation schemas live in
[`src/shared/schemas/`](../src/shared/schemas/) and are imported by the React
forms **and** the Hono routes.

**Why this approach.** This directly fixes a real defect in the portal being
replaced. From ARCHITECTURE.md §11 item 3: the old portal *displayed* the "2 or
3 senior faculty" rule but `enforceFacultyLimit()` had been reduced to updating
a counter — a HoD could submit 1 or 9 members. The rule was in the UI copy and
nowhere else.

Now it is stated exactly once, in
[`board.ts`](../src/shared/schemas/board.ts):

```ts
facultyEmails: z.array(z.string().email())
  .min(MIN_BOARD_MEMBERS, `Select at least ${MIN_BOARD_MEMBERS} faculty members.`)
  .max(MAX_BOARD_MEMBERS, `Select at most ${MAX_BOARD_MEMBERS} faculty members.`)
```

The client uses it to disable the button; the server uses it to reject the
request. **They cannot disagree, because they are the same object.** The same
pattern gives the rejection-reason rule one home — `BoardActions` computes
`reason.trim().length >= 10` to gate its button, matching
`rejectBoardSchema`'s `.min(10)` exactly.

**Why Zod over Yup/Joi/io-ts.** Zod infers TypeScript types from the schema
(`z.infer`), so the schema *is* the type — one definition, not a schema plus a
hand-maintained interface that silently drifts. Yup's inference is weaker; Joi
is Node-oriented; io-ts costs more in ergonomics than this project needs.

### 4.3 Tailwind v4 with `@theme` tokens

**Decision.** Tailwind v4, with SSSIHL's identity declared as CSS custom
properties in [`src/client/index.css`](../src/client/index.css).

**Why this approach.** v4 reads design tokens straight from CSS — there is no
`tailwind.config.js` in this repo, and that is intentional, not an oversight:

```css
@theme {
  --color-brand-600: #0c5196;   /* the original --headingFont */
}
```

Declaring `--color-brand-600` generates `bg-brand-600`, `text-brand-600`,
`ring-brand-600`, and the rest automatically. The institute's blue is written
down **once**, in a form a designer can read, and every usage derives from it.

**Cost.** v4 is recent; some third-party Tailwind snippets found online still
assume v3's JS config.

### 4.4 lucide-react for icons

**Decision.** `lucide-react`, used everywhere a status appears.

**Why this library.** Chosen for a specific accessibility requirement rather
than aesthetics. ARCHITECTURE.md §11 item 8 records that in the old portal
**colour was the only signal** for pass/fail, which fails colour-blind users and
greyscale printing. The rule adopted here is *colour + icon + text, always* —
implemented in
[`StatusBadge.tsx`](../src/client/components/ui/StatusBadge.tsx), where every
status carries all three:

```ts
Approved: { className: 'bg-emerald-50 text-emerald-800 …', Icon: CheckCircle2 }
```

Lucide is tree-shakeable (only imported icons ship) and its icons are plain SVG
React components, so `aria-hidden="true"` and Tailwind sizing work normally.

### 4.5 React Router in declarative mode

**Decision.** Plain `<Routes>`/`<Route>` in
[`App.tsx`](../src/client/App.tsx), with `RequireRole` as a wrapper element.

**Why this approach.** The old portal's tabs were `switchTab()` calls against
`display:none` divs — the back button did nothing and no screen could be linked
to. Real routes fix both. Declarative mode (rather than the data-router API) is
enough here because **all data loading is TanStack Query's job**; adopting
loaders would mean two competing caches.

**Version note.** ARCHITECTURE.md §2 says "React Router v7"; the repo actually
installs **v8.3.0** (see [`package.json`](../package.json)). v8 is why the
project requires **Node ≥ 22.22.0** — worth knowing, because on Node 22.19 the
install emits an `EBADENGINE` warning and proceeds.

---

## 5. Data-access architecture

### 5.1 The repository seam — the most important boundary in the repo

**Decision.** **Nothing outside `src/server/repositories/` and
`src/server/google/` knows the data lives in Google.** Routes call
`repo.approve(...)`, never `sheets.values.update(...)`.

**Why this approach.** Three payoffs, in increasing order of importance:

1. Route handlers stay readable — they express *workflow*, not A1 notation.
2. The mock repository (§5.2) becomes possible, because "the repository" is an
   interface ([`repositories/types.ts`](../src/server/repositories/types.ts))
   rather than a set of API calls sprinkled through handlers.
3. **It keeps the escape hatch cheap.** ARCHITECTURE.md §14 anticipates that
   Sheets' read quota may not survive peak QPSB week. The planned fix is a
   Cloudflare D1 read-model synced from Sheets. Because all Google access is
   behind this seam, that is an *additive change to one folder* — not a rewrite.
   This seam is the difference between "a week of work" and "a quarter."

**Enforced by.** `getRepo()` /`getDriveRepo()` in
[`repositories/index.ts`](../src/server/repositories/index.ts) being the only
way a route obtains data access.

### 5.2 `DEV_MODE` fixtures that enforce the real rules

**Decision.** With `DEV_MODE: "true"`, `getRepo()` returns
[`createMockRepo()`](../src/server/repositories/mock-sheets.ts) — an in-memory
implementation of the same `BoardRepo` interface.

**Why this approach.** This is what let all three screens be built and tested
before a single Google credential existed. But the important part is *how* the
mock is written:

> **The mock enforces the same rules the live repository will** — the state
> machine (`assertTransition`), the version check (`checkVersion` → throws
> `VersionConflictError`), and role/department scoping (`visibleTo`).

A mock that always returned `200 OK` would have produced a client written for a
happy path that disappears the moment real data arrives. Because this one throws
real `409`s and real `ConflictError`s, the client's conflict handling
([`ErrorState`](../src/client/components/ui/states.tsx),
`ApiError.isVersionConflict`) was **written and exercised against them from day
one**.

**Cost.** Two implementations of `BoardRepo` to keep in step. The shared
interface makes drift a compile error rather than a runtime surprise.

**⚠️ Safety.** `DEV_MODE` also enables `?as=<email>` impersonation
([`middleware/auth.ts`](../src/server/middleware/auth.ts)). It **must be
`"false"` before any production deploy.** Today it is `"true"` in
[`wrangler.jsonc`](../wrangler.jsonc).

### 5.3 `boardId` replaces the `(department, degree, programme)` triple

**Decision.** Every endpoint identifies a board by a single stable slug —
`msc-mathematics-2026`.

**Why this approach.** It is **primarily a security decision, and only
incidentally an ergonomic one.**

The old portal passed `department` and `degree` as strings from the client into
`approveBoard()`. Authorisation therefore meant comparing three
client-controlled strings — and any authenticated HoD could post another
department's payload. With one opaque id, authorisation becomes a single
server-side lookup:

```ts
// middleware/auth.ts — requireBoardAccess
const board = await repo.getBoard(boardId);
if (user.role === 'hod' && !user.departments.includes(board.department)) {
  return c.json({ error: 'Board not found' }, 404);
}
```

The department is **derived from the board row**, never accepted from the
client. The bonus: the file checker's three cascading dropdowns collapse into
one grouped `<select>`
([`file-checker/index.tsx`](../src/client/routes/file-checker/index.tsx)).

**Note the deliberate 404.** A HoD requesting another department's board gets
`404 Not found`, not `403 Forbidden` — a 403 would confirm the board exists.

---

## 6. Correctness and safety patterns

### 6.1 The state machine is a table, not scattered `if`s

**Decision.** [`src/shared/domain/board-state.ts`](../src/shared/domain/board-state.ts)
declares every legal transition in one `TRANSITIONS` record, and every mutation
calls `assertTransition(action, currentStatus, role)`.

**Why this approach.** In the old portal the lifecycle lived implicitly in
scattered `if (combo.status === …)` branches **in the HTML** — which means the
rules were enforced by *hiding buttons*. Hiding a button is not access control:
a crafted request could approve an already-locked board.

Making it a table gives us three things at once:
1. The whole lifecycle is readable in 50 lines.
2. Role and state are checked **together** — `approve` requires both
   `from: ['Submitted']` and `allowedRoles: ['admin']`.
3. Adding a transition is a data edit, not a hunt through branches. The
   post-QPSB corrections flow (`requestChanges` / `acknowledgeChanges`) was
   added exactly this way — note it deliberately stays `Locked → Locked` and
   only flips a flag, mirroring how `offerDates` stays within `Approved`.

**Cost.** One indirection between "click Approve" and "status changes." Worth it.

### 6.2 Every mutation carries a `version` (optimistic concurrency)

**Decision.** Every mutating request includes the `version` the client believed
it was editing; the server compares before writing and increments after.

**Why this approach.** The Durable Object (§3.5) serialises *concurrent* writes,
but serialisation alone doesn't prevent a **stale** write: an admin who loaded
the page ten minutes ago would otherwise overwrite everything that happened
since. The version check turns a silent overwrite into a visible, recoverable
`409`.

**Why the client's error handling is shaped the way it is.** Not every 409 is
the same, so [`api.ts`](../src/client/lib/api.ts) distinguishes them by an
explicit `code`:

```ts
get isVersionConflict() { return this.code === 'VERSION_CONFLICT'; }
```

- `VERSION_CONFLICT` → the refetch has *already fixed things*, so a canned
  message is correct: "This board was updated by someone else. The latest
  version has been loaded."
- **Every other 409** — an illegal transition, adding a faculty member who
  already exists — carries a message written *for the user* by
  `ConflictError`/`TransitionError`. Collapsing those into "someone else changed
  this" would be actively misleading, so
  [`states.tsx`](../src/client/components/ui/states.tsx) shows the server's own
  message instead.

### 6.3 Authority comes from the session, never the request body

**Decision.** `requireSession` populates `c.var.user`; every authorisation
decision reads from there.

**Why this approach.** This is the single rule that must never be broken in this
codebase, and it is written at the top of
[`middleware/auth.ts`](../src/server/middleware/auth.ts) for that reason. The
client sends a `boardId`; the server resolves department, degree, role, and
permissions itself. See §5.3 for the vulnerability this closes.

**Composition.** Three middlewares stack: `requireSession` (are you anyone?) →
`requireRole('admin')` (are you the right kind?) → `requireBoardAccess` (is this
board yours?).

**Client-side gating is convenience only.** `RequireRole` in the React app
([`RequireRole.tsx`](../src/client/components/RequireRole.tsx)) says so in its
own comment — it exists to avoid rendering a screen that would only 403, not to
protect anything. The Worker enforces the same rules independently, and the
`pre` check's HoD restriction in
[`routes/checks.ts`](../src/server/routes/checks.ts) is a good example: the old
portal hid the toggle; here it is actually enforced server-side.

### 6.4 Domain errors are mapped to HTTP in exactly one place

**Decision.** [`middleware/error.ts`](../src/server/middleware/error.ts) maps
`ZodError → 400`, `TransitionError → 403|409`, `ConflictError → 409`,
`VersionConflictError → 409 VERSION_CONFLICT`, everything else → 500.

**Why this approach.** Handlers throw domain errors and stay readable; the
mapping to HTTP is a presentation concern that belongs in one place. It also
guarantees an unexpected exception can never leak a stack trace to the browser —
the fallthrough logs server-side and returns a bare `500`.

**Note the nuance in `TransitionError`.** `FORBIDDEN_ROLE` → 403 (you may never
do this), but `INVALID_STATE` → 409 (this was legal a moment ago; someone moved
the board first). Different recovery, different status code.

### 6.5 Faculty override endpoints return the whole department snapshot

**Decision.** Every `/api/faculty/overrides` response returns `baseFaculty`,
`overrides`, **and** `effective` — the list HoDs actually see.

**Why this approach.** From [`routes/faculty.ts`](../src/server/routes/faculty.ts):
the old portal made the *browser* derive the effective list by cross-referencing
two tables, which is how the UI and the server came to disagree about who was
selectable. The server computes it once (`effectiveFacultyFor`) and everyone
reads the same answer.

Consequently the client seeds its cache from the mutation response rather than
refetching (`setQueryData` in `useOverrideMutation`) — the response already *is*
the new truth.

---

## 7. Declared but not yet used

Honesty about the gap between the plan and the code, so nobody assumes a
dependency is load-bearing when it is not. All three are legitimate future
plans, not mistakes — but **none is wired up today**.

| Package | Planned for | Actual status |
|---|---|---|
| `@tanstack/react-table` | The check matrices and admin table (ARCHITECTURE §2) | **Unused.** No import anywhere in `src/`. Both tables are hand-written `<table>` markup. |
| `react-hook-form` + `@hookform/resolvers` | Constitution and faculty forms | **Unused.** Forms currently use plain `useState`. |
| `jose` | Signing/verifying the session JWT (ARCHITECTURE §6) | **Unused.** Blocked on Google login, which is a Phase 1 stub. |

Similarly, **shadcn/ui is named in ARCHITECTURE.md §2 and the README but is not
installed.** [`src/client/components/ui/`](../src/client/components/ui/) holds
three hand-rolled primitives (`Button`, `StatusBadge`, `states`), not shadcn
output. This matters for any future dialog/drawer/toast work, where shadcn's
Radix underpinnings would supply focus trapping and live-region behaviour that
is tedious and easy to get wrong by hand.

---

## 8. Known gaps and deliberate stubs

These throw or return 501 **on purpose**, so the shape of the finished system is
visible and the workflow can be wired end-to-end before the backend exists.

| Area | Where | State |
|---|---|---|
| Google login (OIDC + PKCE) | [`routes/auth.ts`](../src/server/routes/auth.ts) | `throw new Error('login not implemented')` — Phase 1. Dev impersonation stands in. |
| Session JWT verification | [`middleware/auth.ts`](../src/server/middleware/auth.ts) | Non-`DEV_MODE` path returns 401 unconditionally. |
| Live Sheets repository | [`repositories/sheets.ts`](../src/server/repositories/sheets.ts) | Throws. Fixtures serve everything today. |
| Live Drive repository | [`repositories/drive.ts`](../src/server/repositories/drive.ts) | Throws. Drive permission revocation on close is **not** modelled — `closeBoard` records the decision only. |
| `BoardLock` critical section | [`durable-objects/board-lock.ts`](../src/server/durable-objects/board-lock.ts) | Returns **501**. Mutations currently run the version check in the repository instead; see the note at the top of [`routes/boards.ts`](../src/server/routes/boards.ts). **This is the gap that matters most** — the concurrency fix is designed but not yet in the write path. |
| Catalogue endpoints | [`routes/catalog.ts`](../src/server/routes/catalog.ts) | Throw. Superseded in practice by the boardId-centric list. |
| ZIP download | [`routes/downloads.ts`](../src/server/routes/downloads.ts) | Throws — Phase 5. Highest-risk item in the plan (§9 of ARCHITECTURE.md). |
| Appointment email | `boards.post('/:boardId/appointment-email')` | Throws — Phase 5. The Admin Portal button is rendered `disabled` with an explanatory `title`. |
| Notifications | `notify-admin`, `request-changes`, `close` | `console.log` + an audit entry. No mail is sent yet. |

**Toolchain pin worth knowing:** TypeScript is held at **5.9** rather than 7.x
because `typescript-eslint` caps TypeScript at `<6.1.0`. Recorded in
ARCHITECTURE.md §12a; repeated here because "why is TS old?" is a question
someone will ask.

---

## 9. Session log

Append-only. Newest last.

### 2026-08-14 — Spike 1: service-account JWT on Workers — PASSED

**Decision.** Sign the Google service-account assertion with `crypto.subtle`
rather than any Google SDK.
**Why this approach.** `google-auth-library` is Node-only; on Workers there is
no alternative. Spiked before feature work because a failure here would have
invalidated the Cloudflare hosting decision entirely.
**Result.** 5 tests green **inside workerd**, using a throwaway generated
keypair (no credentials needed in CI). The token *exchange* and the
service-account's actual Sheet/Drive sharing remain unverified — the sharing
audit is flagged High risk in ARCHITECTURE.md §13.
**Code.** [`src/server/google/sa-token.ts`](../src/server/google/sa-token.ts),
`sa-token.test.ts`.

*(Also settled while installing: `typescript-eslint` caps TS at `<6.1.0` → pin
5.9. React Router 8 requires Node ≥ 22.22.0.)*

---

### 2026-09-07 — Ran the portal locally; no application code changed

**Decision.** Bring the dev environment up and verify the portal end-to-end
against fixtures. **No source files were created, edited, or deleted.**

**What was actually done.**
- `npm install` — 301 packages, 0 vulnerabilities. One `EBADENGINE` warning:
  `react-router@8.3.0` requires Node ≥ 22.22.0; this machine runs **22.19.0**.
  Installs and runs, but is formally unsupported (see §4.5).
- `npm run dev` — Vite 8 + the Worker, ready in ~15 s on
  <http://localhost:5173/>.
- Verified live: `GET /` → 200; `/api/me?as=coe@sssihl.edu.in` → admin identity;
  `/api/me?as=hod.maths@sssihl.edu.in` → HoD scoped to Mathematics;
  `/api/boards` → the seeded boards with correct statuses.
- `.dev.vars` was **not** created. Confirmed unnecessary: under
  `DEV_MODE: "true"`, `getRepo()` returns the mock before any secret is read
  (§5.2), so nothing in `.dev.vars.example` is consulted.

**Why this approach.** The `?as=` impersonation path made a full role-by-role
walkthrough possible with no Google credentials — which is precisely the payoff
of the §5.2 decision, recorded here as evidence that it works.

**Cost / follow-up.** Node should be upgraded to ≥ 22.22.0 before anyone treats
react-router behaviour as trustworthy.

**Code.** None changed. Working tree clean at `434398a`.

---

### 2026-09-07 — Admin Portal UI review (advisory only, nothing implemented)

**Decision.** Recorded a prioritised set of UI improvements for the Admin
Portal. **No code was written** — this entry exists so the reasoning survives
until someone implements it.

**Findings, in priority order.**

1. **Move heavy actions out of table cells → a detail drawer.**
   [`BoardActions.tsx`](../src/client/components/admin/BoardActions.tsx) renders
   a 3-row `<textarea>` and four `<input type="date">` *inside a `<td>`*. That
   single choice causes most of the visible problems: wildly uneven row heights,
   the `min-w-4xl` horizontal scroll, and a rejection form that appears with no
   focus management. A drawer also gives `courses`, `actionBy`, `actionAt` and
   `closed` — all present on `BoardDetail` and currently invisible — somewhere
   to live.
2. **Fix the per-row N+1 fetch.**
   [`BoardRow.tsx`](../src/client/components/admin/BoardRow.tsx) calls
   `useBoard()` for *every* row, only to obtain `version` and `members`. With
   ~30 programmes that is 30 parallel requests, each cell independently
   flipping from "Loading…" to content. Fold those fields into the list
   response; with the drawer, full detail is fetched only when a row is opened.
   **This gets worse, not better, when the live Sheets repository lands.**
3. **Actually use `@tanstack/react-table`** (see §7) for sorting, search and
   column visibility.
4. **Merge the summary cards and the filter chips** — they present the same six
   statuses twice. Make the cards *be* the filter, and give "Pending approval"
   visual primacy, since it is the one number an admin opens the page to check.
5. **Add an `aria-live` toast layer.** Mutation errors currently render *inside
   a table cell*, and success is silent. The carefully-worded `VERSION_CONFLICT`
   message (§6.2) deserves better than a 200 px-wide cell.
6. **Compact the header.** [`AppLayout.tsx`](../src/client/components/AppLayout.tsx)
   spends ~180 px on a centred `h-28` logo before any content.
7. **Bulk approve** — needs a batch endpoint and per-board version handling.

**Open decision this raises.** Items 1 and 5 need a dialog/drawer and a toast.
Given §7, that is the moment to either adopt shadcn/ui as originally planned or
formally decide against it and own the accessibility work by hand. **Not yet
decided.**

---

### 2026-09-10 — Help widget: browse view, and a live HoD ↔ admin support desk

**Decision.** Two changes to the HoD help widget, plus a new admin screen.

1. The FAQ widget gained a **`browse` view** and a back arrow.
2. A HoD who cannot find their answer can **talk to an administrator in real
   time**, over a WebSocket held by a new `SupportChat` Durable Object. When no
   administrator is connected, the widget says so and offers a phone number.

**Why the browse view.** The original widget rendered its suggested questions
only while `messages.length === 0`. Asking one thing destroyed the list
permanently, with no way back — the user's words were "there is no going back
option to select any question". Rather than re-showing the same five
suggestions, `browse` lists **every** entry grouped by category, and each
non-root view has a back arrow. There is now no state the widget can reach
from which the full question list is unreachable.

**Why a Durable Object rather than polling.** Presence is the crux. The
promise made to a HoD is "someone is on the portal right now, or here is a
phone number" — a promise that is worse than useless if it is wrong. A DO is
the only place in this stack where *every* participant's connection is
represented in one object, so `getWebSockets('role:admin')` **is** the answer,
not an inference from last-seen timestamps in a table. Polling would have
given a 3-second lag and a presence signal assembled from heartbeats, which is
strictly more machinery for a strictly worse answer. It reuses the pattern
BoardLock already established, and it needs no Google credentials, so it works
completely today.

**Alternatives rejected.** HTTP polling (above). A third-party chat widget:
sends institute correspondence to an external service, and cannot see portal
identity. Email: no presence, no "resolve", no thread.

**One DO for the whole desk, not one per conversation.** Presence is a
property of the desk, not of any thread. Per-conversation objects would mean
querying N objects to answer "is anyone online", and no object would know the
answer by itself.

**Cost.** A new DO class and migration (`v2`), and a socket held open per
signed-in HoD and admin. Hibernation keeps an idle desk free of duration
billing. The socket is opened in `AppLayout` rather than in either screen, so
an admin counts as available whenever the portal is open — anything narrower
would make the presence signal mean "is on the Support Desk page", which is
not what a HoD is being told.

**Code.** `src/server/durable-objects/support-chat.ts`,
`src/server/routes/support.ts`, `src/client/lib/support.tsx`,
`src/client/routes/support/index.tsx`,
`src/client/components/help-chat/HelpChatWidget.tsx`,
`src/shared/constants/support.ts`, `src/shared/schemas/support.ts`.

**Verified by.** A 20-check scripted run driving two live sockets: thread
creation, delivery both ways, unread counters, resolve/reopen, history
ordering, and presence transitions. Plus `npm test` (34), typecheck, lint, and
`vite build`.

---

### 2026-09-10 — Support presence needs liveness, not just close events

**Decision.** Socket liveness is established by a ping/pong heartbeat plus an
alarm sweep, and presence counts only sockets that have answered recently.

**Why.** Found while testing, and it is a genuine defect rather than a test
artefact: a socket that dies **without a close handshake** — a closed laptop,
a crashed tab, a dropped connection — stays registered with the runtime.
`webSocketClose` never fires, so its owner is reported as online forever. For
an administrator that is the worst possible failure mode, because it silently
defeats the one thing this feature promises: the HoD is told help is available,
waits, and never sees the phone number.

The fix has three parts, and the third is the one that matters most:

1. The client pings every 30 s.
2. The DO records `lastSeen` on the socket's attachment when a ping arrives.
3. `presence()` ignores any socket that has not pinged within 90 s, and a 30 s
   alarm sweeps while anyone is connected. Presence therefore corrects itself
   on a timer rather than only when someone connects or disconnects.

**Considered, and a wrong turn worth recording: `setWebSocketAutoResponse`.**
The cheaper implementation has the *runtime* answer `pong` and timestamp it
via `getWebSocketAutoResponseTimestamp()`, never waking the DO — an idle desk
would then cost nothing at all, which is the entire point of hibernation. It
was built that way first, and replaced with explicit tracking.

**The first diagnosis for replacing it was wrong, so don't inherit it.**
During testing an administrator appeared permanently online while the
auto-response timestamp kept advancing. That looked like the runtime
refreshing the timestamp on *any* socket activity — including this object's
own outbound broadcasts, which would be self-sustaining and fatal: the sweep
writes to a dead socket, marking the dead socket alive, forever. It was not
that. The timestamp advanced because the socket was **genuinely alive** — a
browser tab was open on the portal as that user, heartbeating every 30 s
exactly as designed. Presence deduplicates by email, so that one real tab also
masked every test that tried to drive the same account. The auto-response
variant was never actually shown to be broken.

What settled it was **testability, not correctness**. Recording the ping in
`webSocketMessage` puts `lastSeen` in the socket's own attachment, where it
can be asserted on directly and behaves identically in dev and production. The
cost is one DO wake per client per 30 s — negligible at tens of HoDs and a
couple of admins. If the desk ever grows enough for that to matter, revisiting
the auto-response variant is reasonable; just verify it against a socket that
is *provably* silent, on an account nobody has open.

**A related fragility fixed at the same time.** `broadcastPresence` originally
relied on the runtime having already removed the closing socket from
`getWebSockets()` by the time `webSocketClose` ran. That happened to hold only
because an `await` inside the handler introduced a microtask boundary;
removing the `await` broke presence outright. The closing socket is now passed
in and excluded explicitly, so the result no longer depends on scheduling.

**Cost.** A few bytes every 30 s per connection, and one pending alarm while
anyone is connected. An unclean disconnect takes up to ~120 s to be noticed —
a bounded, known window, versus the previous behaviour of never.

**Code.** `src/server/durable-objects/support-chat.ts` (`isAlive`, `alarm`,
`scheduleSweep`), `src/client/lib/support.tsx` (heartbeat).

**Verified by.** A socket that connects and then never pings, with its TCP
connection deliberately left open, is closed by the server after **109 s**
with `1001 No ping received` — inside the expected 90 s timeout plus up to one
30 s sweep. A socket whose TCP is destroyed outright is dropped sooner, by the
runtime's own close handling.

**Testing note for whoever comes next.** Presence deduplicates by email, and
`?as=` impersonation means a developer's own browser tab counts as a real
user. A tab left open as `coe@sssihl.edu.in` will keep that admin online
through every server restart — the client reconnects by itself — and will
silently invalidate any test that tries to drive the same account. Close the
tab, or test with an account nobody has open.

---

### 2026-09-10 — Typing indicators

**Decision.** A `typing` frame in both directions, expiring on a receiver-side
timeout. Nothing is stored and nothing is acknowledged.

**Why this approach.** Three properties fall out of treating typing as pure
signal rather than as state:

- **No "stopped typing" frame.** The receiver hides the indicator
  `TYPING_TTL_MS` after the last frame it saw. A closed tab, a dropped socket
  or a lost frame therefore cannot strand someone as permanently "typing" —
  the failure mode of every implementation that waits to be told to stop.
- **No storage, no alarm.** A keystroke must not cost a Durable Object write.
  A lost typing frame is a non-event, which is exactly the right cost profile
  for something sent this often.
- **Throttled in the provider, not the component.** `notifyTyping` drops calls
  inside `TYPING_THROTTLE_MS`, so `onChange` handlers can call it on every
  keystroke without each call site re-implementing the same guard. The TTL is
  deliberately double the throttle — closer together and a steady typist would
  flicker between states.

**Routing.** A frame goes only to the other side of that conversation: an
admin's keystrokes reach that one HoD, a HoD's reach the admins. It is never
echoed to the sender, and never reaches an unrelated HoD — a support thread is
private to the two parties, and typing leaks presence just as much as a
message does.

**Bidirectional, though only admin → HoD was asked for.** Routing to "the
other party" is less code than special-casing one direction, and an admin
watching a HoD compose a question benefits identically. Trivial to restrict if
that is not wanted.

**Authority, as everywhere else.** A HoD's `conversationId` is ignored and
replaced with their own email, exactly as `handleSend` does — otherwise a
crafted frame could make an arbitrary HoD appear to be typing in someone
else's thread.

**Cost.** One frame per two seconds per actively-typing client. No persistence.

**Accessibility.** The dots are `aria-hidden`; the sentence beside them is the
accessible text, inside a `polite` live region so it never interrupts. The
animation is disabled under `prefers-reduced-motion` — the motion is
decoration, the text carries the meaning.

**Code.** `shared/constants/support.ts` (TTL + throttle),
`shared/schemas/support.ts`, `server/durable-objects/support-chat.ts`
(`handleTyping`), `client/lib/support.tsx` (`notifyTyping`,
`typingByConversation`), `client/components/ui/TypingIndicator.tsx`,
`client/index.css` (keyframes).

**Verified by.** 10 scripted checks over three live sockets: the HoD receives
the admin's frame with the right name, role and thread; it is not echoed to
the sender; it does not reach an unrelated HoD; the reverse direction works; a
HoD-supplied `conversationId` is ignored; and nothing lands in stored history.

---

### 2026-09-11 — Admin Portal redesign

**Decision.** The Admin Portal splits into a **work queue** above a
**browsable table**, status renders as a 3-step track, and the stat tiles and
filter chips merge into one control. Heavy actions moved into a drawer. Built
from the mockups in the design canvas of the same date.

**Why this approach.** The old screen was a database viewer, not a workspace:
six equal-weight tiles, then the same six statuses again as chips, then a
uniform table where a `NotSubmitted` board an admin cannot act on looked
exactly as important as a `Submitted` one waiting on their approval. Nothing
answered the question the page exists to answer — *what needs me right now?*

- **`ActionQueue` is defined by who moves next, not by status.** It holds
  `Submitted` plus `Approved`-with-no-dates-offered: the two cases where the
  next move belongs to the office. That is a different axis from the status
  counts, which is why "Needs your action" sits apart from the five tiles
  rather than among them.
- **The counts became the filter.** One control instead of two rows saying
  the same thing, and breaking the equal-weight grid lets the number an admin
  came for carry the page. Selection keeps `aria-pressed`, as the chips had.
- **`StatusTrack` shows position, not a word.** Three segments —
  Submitted → Approved → Scheduled — because `NotSubmitted` is the absence of
  progress rather than a step. `Rejected` deliberately reads as a step *lost*
  (one red segment, then a broken one), so scanning the column shows which
  board fell back, not merely how far each got. The label stays beside the
  track: colour is never the only signal (docs §11 item 8).

**Alternatives rejected.** Keeping one table and only restyling it — the row
heights are caused by the action UI, so no amount of styling fixes them.
Sorting by status alone — it answers "what state is everything in", not
"what do I do next".

**Cost.** More components, and a second concept (queue vs table) for a new
admin to learn. The queue's empty state is common outside QPSB week, which is
deliberate: an empty queue is the honest answer to "what needs me".

**Code.** `client/routes/admin/index.tsx`, `components/admin/ActionQueue.tsx`,
`components/admin/BoardDrawer.tsx`, `components/admin/BoardRow.tsx`,
`components/admin/SummaryCards.tsx`, `components/ui/StatusTrack.tsx`,
`components/AppLayout.tsx`.

---

### 2026-09-11 — `BoardSummary` carries members, dates and flags

**Decision.** The board list payload now includes `members`, `availableDates`,
`sessionTime`, `changesRequested` and `closed`. `BoardDetail` keeps only what
is genuinely detail: `chairperson`, `courses`, `actionBy`, `actionAt`,
`rejectionReason`.

**Why this approach.** This closes the N+1 recorded in the 2026-09-07 UI
review. `BoardRow` called `useBoard()` **per row**, purely to reach `members`
and `version` — one request per board on every page load, each cell
independently flipping from "Loading…" to content, and a table that visibly
jittered as it settled. The admin screen is now **one request**.

It also makes the split mean something: the list carries what a *list* needs,
and the drawer fetches detail only when a board is actually opened. That is
what makes the drawer affordable rather than another N+1 waiting to happen.

**The knock-on that made this cheap.** With `status`, `version`,
`availableDates` and `changesRequested` all on the summary, `BoardActions`
now takes a `BoardSummary` instead of a `BoardDetail` — so the queue cards and
the drawer footer share one component instead of duplicating the state
machine. `BoardDetail extends BoardSummary`, so the drawer passes detail
straight in.

**Cost.** A heavier list payload — and it grows with board count, which
matters once this is talking to Sheets rather than fixtures. Still far cheaper
than N round trips: one `batchGet` already reads `BoardMembers` and
`BoardDates` (§8), so the live repository pays nothing extra to include them.

**Code.** `shared/types.ts`, `server/repositories/mock-sheets.ts` (`toSummary`),
`components/admin/BoardActions.tsx`.

**Verified by.** `/api/boards` returns members and dates for all five boards;
summary and detail agree on `version`, `members` and `changesRequested` for
every board; an approve through the new path moved v3 → v4 and a stale repeat
returned 409.

---

### 2026-09-11 — Support desk: office email, board attachment, deletion

**Decision.** Three additions, chosen because each closes a gap that made the
desk less trustworthy rather than merely less featureful.

---

**1. Email the office when a thread goes unanswered.**

The desk previously assumed someone had the portal open. A HoD writing at 9pm
reached storage and nothing else — the phone number covered *their* side of
that, but nothing told the office anything was waiting. Five minutes after a
HoD writes with no administrator connected, the office is emailed.

The decision that matters is **re-checking at fire time, not trusting send
time**: an admin who signs in during the delay makes the email unnecessary, so
`notifyUnanswered` re-reads presence and the unread count before sending. A
one-hour cooldown per thread means five lines typed in a row are one problem,
not five emails.

This forced the alarm to serve two masters. The liveness sweep only matters
while someone is connected; the notification matters **especially when nobody
is** — so `scheduleSweep`'s "no sockets, no alarm" rule would have skipped the
case the feature exists for. `scheduleNextAlarm` now takes the earliest of the
two deadlines and keeps an alarm pending on an empty desk with a waiting
thread.

`notifications/mailer.ts` is a seam, the same shape as `repositories/`: the
rest of the server never learns the provider. In DEV_MODE, or with the key or
address unset, it logs instead of sending — matching every other notification
here (`notify-admin`, `request-changes`, `close`) so the workflow is wired end
to end before credentials exist. Throwing instead would make the desk unusable
in development.

---

**2. A thread can name the board it is about.**

Nearly every conversation opened with the office asking "which programme?" The
portal already knows the HoD's boards, so the thread carries the answer: a
picker in the widget, and the programme shown in the admin's thread header.

**The authorisation is the interesting part.** The Durable Object has no
repository and cannot ask whether a board belongs to a HoD. So the *route*
resolves `listBoards(user)` at connect time — role-scoped, from the session —
and stamps the result onto the socket identity. The object validates the id
against that list. It is the same rule as everywhere else in this codebase
(authority comes from the session, never the payload), applied to a component
that has no data access of its own.

`boardProgramme` is denormalised alongside `boardId` so the admin screen can
label a thread without a second lookup.

---

**3. An administrator can delete a conversation.**

Threads accumulated forever with no way to remove one — twice during
development the only way to clear test traffic was deleting Durable Object
storage by hand. Deletion removes the conversation, its messages **and its
images**; an orphaned image would otherwise outlive the thread with nothing
pointing at it. It is admin-only, irreversible, and confirmed inline.

`resolve` already covers the archive case (resolved threads are filtered out
of the default view), so this is a hard delete rather than a second soft state.

---

**Cost.** One more alarm reason, a per-thread notification deadline, and a list
scan on each alarm — all O(conversations), which is tens, not thousands. The
board list adds one `listBoards` call per socket connect.

**Code.** `server/notifications/mailer.ts`,
`server/durable-objects/support-chat.ts` (`handleSetBoard`, `handleDelete`,
`notifyUnanswered`, `scheduleNextAlarm`, `emailOffice`),
`server/routes/support.ts`, `shared/types.ts`, `shared/schemas/support.ts`,
`shared/constants/support.ts`, `client/lib/support.tsx`,
`client/components/help-chat/HelpChatWidget.tsx`,
`client/routes/support/index.tsx`, `wrangler.jsonc`, `server/env.ts`.

**Verified by.** 12 scripted checks over live sockets: the board list arrives
scoped to the HoD's own departments, attaching and clearing work, a board
outside their departments is refused, an admin cannot set it, a HoD cannot
delete, an admin can, both sides are told, and the thread and its messages are
genuinely gone afterwards. The notification was verified with the delay
temporarily shortened — the email composed correctly with the right recipient,
subject and body, and **was correctly suppressed** when an administrator signed
in during the delay. The delay was restored to five minutes afterwards.

---

### 2026-09-11 — A thread per question, not per HoD

**Decision.** `conversationId` is now an opaque per-thread id instead of the
HoD's email. A HoD may have several threads; each carries a quotable
reference (`QPSB-104`) and a subject taken from its opening line.

**Why this approach.** This was the one place the chat model genuinely broke
down. Keying by email gave each HoD exactly one thread, so two unrelated
problems — a wrong faculty list and a failing upload — interleaved in a single
transcript that could only be resolved as a whole. That is the problem people
buy a ticket system to solve, and it needed a new key, not a new product.

**What was deliberately *not* added.** No form, no priority, no
HoD-chosen category. Asking someone to classify a problem before describing it
is the ceremony that makes them phone the office instead, and they are
guessing anyway. A thread still starts by typing a sentence; the subject is
that sentence.

**The authorisation this forced.** With threads keyed by email, "is this
yours?" was answered by the key itself. Now it is a real question, so every
handler taking a `conversationId` goes through `ownedConversation` — admins
see any thread, a HoD only their own, and someone else's reads as *missing*
rather than forbidden, the same way `requireBoardAccess` 404s rather than 403s.

**Cost.** Existing threads could not be migrated — the stored shape changed —
so the desk was cleared. That was acceptable here because it held only test
data; it would not be after go-live.

---

### 2026-09-11 — Categories at resolve time, and the themes report

**Decision.** An administrator picks a category when resolving a thread, and
the Support Desk shows the distribution across resolved threads.

**Why this approach.** This is the one thing a ticket system does that a chat
cannot: a chat answers a question and forgets it, so nobody ever learns that
the same faculty-list problem was explained thirty times. Counting resolved
threads by category turns support traffic into a list of things worth fixing
in the portal or the FAQ — which is the *institutional* value, and it is worth
more than tracking any individual request.

**The asymmetry is the design.** The category is asked of the **admin at the
end**, never of the HoD at the start. The admin knows what it actually was
once they have answered it; the HoD is guessing before they have explained it.
Same information, one of the two costs nothing.

A reopened thread keeps the category it was resolved under, so reopening does
not silently erase a data point.

**Rejected: routing and assignment.** The other thing tickets do. It earns its
keep when support spans several teams with separate queues; here the team is
the COE office. Revisit if IT or individual departments start handling
categories of request — that is a genuine ticket system and this is not.

**Cost.** One dropdown per resolution, and a report that is meaningless until
enough threads have been closed to show a shape.

**Code.** `shared/constants/support.ts` (`SUPPORT_CATEGORIES`, reference
prefix), `shared/types.ts`, `shared/schemas/support.ts`,
`server/durable-objects/support-chat.ts` (`ownedConversation`,
`nextReference`), `client/components/support/ThemesReport.tsx`,
`client/components/help-chat/HelpChatWidget.tsx` (thread list),
`client/routes/support/index.tsx`, `client/lib/support.tsx`.

**Verified by.** 19 scripted checks over live sockets: two questions open two
threads with sequential references; a follow-up stays in its own thread;
another HoD can neither post into nor read someone else's thread; a HoD's list
contains only their own and carries no transcripts; resolving records the
category and time; an unknown category is refused; a HoD cannot resolve; a
reply reopens a thread while keeping its category; and a board attaches to one
thread without touching the other.

---

### ⚠️ Before deploying the support desk

- **Set the phone number.** `SUPPORT_PHONE` in
  `src/shared/constants/support.ts` is a deliberate `TODO` placeholder. The
  widget detects this and shows a configuration notice rather than a fake
  number — a plausible-looking wrong number is worse than an obvious gap,
  because a HoD would dial it.
- **Set the office email address**, `SUPPORT_NOTIFY_EMAIL` in
  `wrangler.jsonc`, and `wrangler secret put RESEND_API_KEY`. Until both are
  real, an unanswered thread is logged rather than emailed — so nobody is
  told, which is the failure this feature exists to prevent.
- Conversations live in Durable Object storage, **not** in Google Sheets. They
  are outside the `AuditLog` (§4 of ARCHITECTURE.md). If support threads need
  to be auditable alongside board actions, that is unbuilt work.
- Messages are **not** encrypted at rest beyond what Cloudflare provides, and
  a HoD may well paste something sensitive into a support chat. Worth a
  retention policy; currently a thread keeps its last 500 messages forever.
