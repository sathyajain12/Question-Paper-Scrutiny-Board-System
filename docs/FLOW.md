# FLOW.md — how execution travels through this codebase

A map of what runs, in what order, and what calls what.

- [ARCHITECTURE.md](ARCHITECTURE.md) — the plan (what we intend to build)
- [DECISION.md](DECISION.md) — the log (why it is built this way)
- **This file** — the map (how a request actually moves)

> **Reading tip.** There are **two** entry points, because one deployed artefact
> contains two programs: a Worker (server) and an SPA (browser). They meet at
> `fetch('/api/...')`, and because they are the same origin there is no CORS
> step in between.

---

## Table of contents

1. [Entry points](#1-entry-points)
2. [Cold start — first paint, step by step](#2-cold-start--first-paint-step-by-step)
3. [Request lifecycle inside the Worker](#3-request-lifecycle-inside-the-worker)
4. [The middleware chain](#4-the-middleware-chain)
5. [Walkthrough A — Admin approves a board](#5-walkthrough-a--admin-approves-a-board)
6. [Walkthrough B — HoD submits a constitution](#6-walkthrough-b--hod-submits-a-constitution)
7. [Walkthrough C — a 409 version conflict](#7-walkthrough-c--a-409-version-conflict)
8. [Walkthrough D — a HoD asks for help](#8-walkthrough-d--a-hod-asks-for-help)
9. [Call graph by module](#9-call-graph-by-module)
10. [Where execution currently stops](#10-where-execution-currently-stops)
11. [What AI changed in this session](#11-what-ai-changed-in-this-session)

---

## 1. Entry points

| # | Entry point | File | Triggered by |
|---|---|---|---|
| 1 | **Worker `fetch`** | [`src/server/index.ts`](../src/server/index.ts) → `export default app` | Every HTTP request to the origin |
| 2 | **Browser bootstrap** | [`index.html`](../index.html) → `<script src="/src/client/main.tsx">` | The browser, after the Worker serves the HTML |
| 3 | **Durable Object — BoardLock** | [`src/server/durable-objects/board-lock.ts`](../src/server/durable-objects/board-lock.ts) → `BoardLock.fetch` | Worker code addressing a DO stub (**not yet wired** — §10) |
| 4 | **Durable Object — SupportChat** | [`src/server/durable-objects/support-chat.ts`](../src/server/durable-objects/support-chat.ts) → `fetch`, `webSocketMessage`, `alarm` | A WebSocket upgrade on `/api/support/ws`, an inbound frame, or the liveness alarm |
| 5 | **Dev server** | [`vite.config.ts`](../vite.config.ts) → `@cloudflare/vite-plugin` | `npm run dev` — runs the Worker in workerd alongside Vite's HMR |

Entry point 4 is the only one that is **not** request/response: once the socket
is open, the DO pushes frames to clients on its own, and its `alarm()` runs on
a timer with no client involved at all.

**Entry point 1 is the true root.** Even loading `index.html` goes through the
Worker: the SPA is served by the `ASSETS` binding from inside the same
`fetch` handler that serves the API.

```
                    ┌──────────────────────────────────┐
   any request ───► │  src/server/index.ts  (Hono app) │
                    └───────────────┬──────────────────┘
                                    │
                 ┌──────────────────┴──────────────────┐
                 │                                     │
        path starts /api/*                    everything else
                 │                                     │
                 ▼                                     ▼
        Hono routers + middleware            c.env.ASSETS.fetch()
                 │                                     │
                 ▼                                     ▼
        repositories/ ──► Google or fixtures   index.html, JS, CSS, logo.png
                                                       │
                                                       ▼
                                            src/client/main.tsx  (entry point 2)
```

---

## 2. Cold start — first paint, step by step

What happens between typing the URL and seeing the Admin Portal. Numbered so
you can follow it in the code.

**Server side**

1. Request `GET /admin` hits the Worker.
2. [`index.ts`](../src/server/index.ts) registers `app.onError(errorHandler)`,
   then matches routes **in declaration order**.
3. `/admin` is not `/api/*`, so it falls through to the last route:
   `app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw))`.
4. The `ASSETS` binding finds no file at `/admin`. Because
   [`wrangler.jsonc`](../wrangler.jsonc) sets
   `not_found_handling: "single-page-application"`, it returns `index.html`
   instead of 404. **This is what makes deep links work.**

**Browser side**

5. [`index.html`](../index.html) loads `/src/client/main.tsx`.
6. [`main.tsx`](../src/client/main.tsx) creates the `QueryClient`
   (`staleTime: 30_000`, `retry: 1`, `refetchOnWindowFocus: false`) and mounts
   `<QueryClientProvider><BrowserRouter><App /></BrowserRouter></QueryClientProvider>`.
7. [`App.tsx`](../src/client/App.tsx) matches `/admin` → `<AppLayout>` wrapping
   `<RequireRole roles={['admin']}><AdminPage /></RequireRole>`.
8. `AppLayout` renders and calls `useSession()`.
9. `RequireRole` **also** calls `useSession()`. TanStack Query dedupes: the key
   `['me']` is already in flight, so this is **one** request, not two.
10. `useSession` → `api.get('/me')` → `withDevUser('/me')`.
    - Reads `?as=` from `window.location.search`; if present, stores it in
      `sessionStorage` under `qpsb.devUser` and appends it to the path.
    - This exists because client-side navigation drops the query string — so
      `?as=` must be remembered for the tab, not re-read per navigation.
11. `fetch('/api/me?as=coe@sssihl.edu.in')` → back to the Worker (§3).
12. Response arrives → `RequireRole` sees `role === 'admin'` → renders
    `AdminPage`.
13. `AdminPage` calls `useBoards()` → `GET /api/boards` → renders
    `SummaryCards` + one `BoardRow` per board.
14. **Each `BoardRow` then calls `useBoard(boardId)`** → one `GET
    /api/boards/:boardId` **per row**.

> ⚠️ Step 14 is the N+1 documented in [DECISION.md §9](DECISION.md#9-session-log)
> (2026-09-07 UI review, item 2). It is why the Actions column shows "Loading…"
> per row and the table settles raggedly.

---

## 3. Request lifecycle inside the Worker

Every `/api/*` request follows the same path. Route registration order in
[`index.ts`](../src/server/index.ts) **is** the execution order:

```
  incoming Request
        │
        ▼
  app.onError(errorHandler)          ← wraps everything below (catch, not a step)
        │
        ▼
  app.route('/api/auth', authRoutes) ← PUBLIC. Registered BEFORE the guard,
        │                              because the login dance cannot require
        │                              a session it hasn't issued yet.
        ▼
  app.use('/api/*', requireSession)  ← THE GATE. Everything after this has a user.
        │
        ▼
  /api/me | /api/boards | /api/catalog | /api/faculty | /api/checks | /api/downloads
        │
        ▼
  per-route middleware: requireRole(...) → requireBoardAccess → zValidator(...)
        │
        ▼
  handler  ──►  getRepo(c.env)  ──►  BoardRepo
        │                              ├── DEV_MODE=true  → createMockRepo()   (in-memory)
        │                              └── DEV_MODE=false → createSheetsRepo() (throws today)
        ▼
  c.json({ ... })
```

**The ordering detail that matters:** `app.route('/api/auth', …)` is registered
*before* `app.use('/api/*', requireSession)`. Hono applies middleware in
registration order, so the auth routes are reachable without a session while
everything else is not. Moving that line would lock users out of login.

---

## 4. The middleware chain

Three guards compose, each answering one question.
All live in [`src/server/middleware/auth.ts`](../src/server/middleware/auth.ts).

| Order | Middleware | Question | On failure |
|---|---|---|---|
| 1 | `requireSession` | *Are you anyone?* | `401` |
| 2 | `requireRole(...roles)` | *Are you the right kind of someone?* | `403` |
| 3 | `requireBoardAccess` | *Is this board yours?* | `404` (deliberately — a `403` would confirm the board exists) |

### `requireSession` — the two-path fork

```ts
if (c.env.DEV_MODE === 'true') {
  const email = c.req.query('as')
             ?? getCookie(c, DEV_USER_COOKIE)
             ?? 'hod.cs@sssihl.edu.in';        // DEFAULT_DEV_USER
  const user = await (await getRepo(c.env)).findUserAccess(email);
  if (!user) return c.json({ error: `Unknown dev user: ${email}` }, 401);
  c.set('user', user);                          // ← authority is set HERE
  return next();
}
return c.json({ error: 'Not signed in' }, 401); // production path: Phase 1 stub
```

**Everything downstream reads `c.get('user')`.** No handler ever takes a role,
department, or email from the request body — see
[DECISION.md §6.3](DECISION.md#63-authority-comes-from-the-session-never-the-request-body).

### `requireBoardAccess` — how scoping actually happens

```ts
const boardId = c.req.param('boardId') ?? c.req.query('boardId');   // path OR query
const board   = await repo.getBoard(boardId);
if (user.role === 'hod' && !user.departments.includes(board.department))
  return c.json({ error: 'Board not found' }, 404);
```

It reads `boardId` from **either** the path or the query string, which is why
the same middleware serves `/api/boards/:boardId/...` and
`/api/checks/post?boardId=...`.

---

## 5. Walkthrough A — Admin approves a board

The full round trip, from click to re-render.

```
[BROWSER]
 1  BoardActions.tsx           user clicks "Approve"
 2    └─ approve.mutate({ version: board.version })
 3       └─ useApproveBoard(boardId)            hooks.ts
 4          └─ useBoardMutation(boardId, 'approve')
 5             └─ api.post(`/boards/${boardId}/approve`, { version })
 6                └─ withDevUser()  →  appends ?as= in dev
 7                   └─ fetch('/api/boards/msc-physics-2026/approve?as=coe@…')

[WORKER]
 8  index.ts                   app.use('/api/*', requireSession)
 9    └─ requireSession        DEV_MODE → findUserAccess('coe@…') → c.set('user', admin)
10  routes/boards.ts           POST /:boardId/approve
11    ├─ requireRole('admin')                     ✓  (403 otherwise)
12    ├─ zValidator('json', approveBoardSchema)   ✓  (400 otherwise — version must be int ≥ 0)
13    └─ handler
14       └─ getRepo(c.env)     → createMockRepo()      repositories/index.ts
15       └─ repo.approve(boardId, user, version)       mock-sheets.ts
16          ├─ mustFind(boardId)                       → throws if unknown
17          ├─ checkVersion(board, expected)           → VersionConflictError if stale
18          ├─ assertTransition('approve', board.status, 'admin')   shared/domain/board-state.ts
19          │     └─ TRANSITIONS.approve = { from:['Submitted'], to:'Approved', allowedRoles:['admin'] }
20          ├─ board.actionBy / actionAt = …
21          ├─ board.version += 1                      ← the concurrency token advances
22          └─ record(board, actor, 'approve', before) → auditLog.push(...)
23       └─ c.json({ board })

[BROWSER]
24  useBoardMutation.onSettled
25    ├─ invalidateQueries(['boards', boardId])   → refetch this board's detail
26    └─ invalidateQueries(['boards'])            → refetch list AND dashboard counts
27  SummaryCards + BoardRow re-render from server truth
```

**Step 26 is why the counts stay honest.** "Pending approval" is never
hand-decremented in the client; it is re-derived by `repo.countByStatus()` on
the server. See
[DECISION.md §4.1](DECISION.md#41-tanstack-query--the-most-load-bearing-library-in-the-client).

**Step 21 matters for what happens next.** The response carries the *new*
version, so the next action on this board sends `version + 1` and the stale-write
check keeps working.

---

## 6. Walkthrough B — HoD submits a constitution

Shows the extra guard and the validation that runs on both sides.

```
[BROWSER]
 1  ConstitutionPage           useBoards() → one BoardCard per programme
 2  BoardCard.tsx              useBoard(boardId) → { board, faculty }
 3    └─ status is NotSubmitted|Rejected → renders <FacultyPicker faculty={data.faculty} />
 4  FacultyPicker              user selects 2–3 faculty, clicks Submit
 5    └─ submit.mutate({ facultyEmails, version })
 6       └─ POST /api/boards/msc-mathematics-2026/constitution

[WORKER]
 7  requireSession             → user = hod.maths, departments = ['Mathematics']
 8  routes/boards.ts           POST /:boardId/constitution
 9    ├─ requireBoardAccess    board.department ∈ user.departments  ✓  (404 otherwise)
10    ├─ requireRole('hod')                                        ✓
11    ├─ zValidator('json', submitConstitutionSchema)
12    │    └─ shared/schemas/board.ts — min 2, max 3, no duplicates, valid emails
13    └─ repo.submitConstitution(boardId, user, facultyEmails, version)
14       ├─ checkVersion + assertTransition('submitConstitution', status, 'hod')
15       │    └─ from: ['NotSubmitted', 'Rejected']  ← resubmission after rejection is legal
16       ├─ effectiveFacultyFor(board.department)          ← base Faculty MINUS excludes PLUS adds
17       ├─ each email must exist in that list, else ConflictError → 409
18       ├─ board.rejectionReason = null                   ← clears prior feedback
19       └─ board.version += 1
```

**Two things worth noticing.**

- **Step 9 + step 10 together.** `requireBoardAccess` runs *before*
  `requireRole('hod')`. Both are needed: role alone would let any HoD submit any
  department's board.
- **Step 16 is defence in depth.** The picker only *displays* selectable
  faculty, but the server re-resolves against `effectiveFacultyFor()` anyway, so
  a crafted request cannot nominate an excluded faculty member. The same
  function computes what the picker shows and what the server accepts — they
  cannot disagree.

---

## 7. Walkthrough C — a 409 version conflict

The path most worth understanding, because it is the one the whole `version`
design exists for.

```
Admin A loads the page          board.version = 3
Admin B loads the page          board.version = 3
Admin A approves                → server: 3 === 3 ✓ → writes → version = 4
Admin B clicks Reject (stale)   → sends version = 3

[WORKER]
  repo.reject(...)
    └─ checkVersion(board /* 4 */, expected /* 3 */)
         └─ throw new VersionConflictError()
              │
              ▼
  middleware/error.ts  errorHandler
    └─ c.json({ error: 'This board was updated by someone else.',
                code:  'VERSION_CONFLICT' }, 409)

[BROWSER]
  api.ts  request()
    └─ !res.ok → throw new ApiError(409, body.error, body.code)
  useBoardMutation.onSettled  → invalidateQueries → refetch  ← recovery happens HERE
  BoardActions renders <ErrorState error={reject.error} />
    └─ ApiError.isVersionConflict === true
         → "This board was updated by someone else. The latest version has been
            loaded — please review and try again."
```

**Why `onSettled` and not `onSuccess`.** The refetch must run **on failure
too** — that is what puts the current board (version 4) in front of Admin B so
the retry is made against reality.

**Why the message is canned only for this code.** Other 409s
(`TransitionError` with `INVALID_STATE`, `ConflictError` from the faculty
override rules) carry messages written for the user, so `ErrorState` shows the
server's own text instead. See
[DECISION.md §6.2](DECISION.md#62-every-mutation-carries-a-version-optimistic-concurrency).

---

## 8. Walkthrough D — a HoD asks for help

The one flow that is not request/response. Note where the socket is *opened*:
in the layout, not in the widget.

```
[BROWSER — HoD]
 1  AppLayout mounts, useSession() resolves
 2    └─ <SupportProvider user={user}>            lib/support.tsx
 3       └─ new WebSocket('/api/support/ws?as=…') ← withDevUser(), same as fetch
 4          └─ heartbeat: send 'ping' every 30s

[WORKER]
 5  requireSession                     → c.set('user', hod)
 6  routes/support.ts  GET /ws
 7    ├─ reject unless Upgrade: websocket        → 426
 8    ├─ reject viewers                          → 403
 9    ├─ stamp X-QPSB-Support-User with the SESSION identity
10    └─ SUPPORT_CHAT.idFromName('qpsb-support-desk').fetch(req)
         ↑ one instance for the whole desk — that is what makes presence a fact

[DURABLE OBJECT — SupportChat]
11  fetch()
      ├─ acceptWebSocket(server, ['role:hod', 'user:<email>'])   ← hibernation
      ├─ serializeAttachment({ …user, connectedAt })             ← survives hibernation
      ├─ sendInit  → { type:'init', presence, conversation?, messages }
      └─ scheduleSweep()                                          ← liveness alarm

[BROWSER — HoD]  widget opens, user picks "Talk to a person"
12  presence.adminsOnline === 0  → render the phone-number panel
    presence.adminsOnline  >  0  → render "N people online"
13  types a message → send() → { type:'send', text }

[DURABLE OBJECT]
14  webSocketMessage
      ├─ 'ping'? → record lastSeen on the attachment, reply 'pong', done
      ├─ supportClientFrameSchema.safeParse    ← the ONLY validation on this path
      └─ handleSend
           ├─ conversationId = OWN email for a HoD — the payload field is ignored
           ├─ storage.put msg / seq / conv
           ├─ unreadForAdmin += 1
           └─ broadcast → toUser(hod) + toAdmins()

[BROWSER — every connected admin]
15  frame 'message' → conversations list re-sorts, nav badge increments
16  admin opens /support → requestHistory + markRead → unreadForAdmin = 0
17  admin replies → same path, unreadForHod += 1 → HoD's launcher shows a badge
```

**Presence, and why it is trustworthy.** `adminsOnline` is computed by
`presence()` from `getWebSockets('role:admin')`, deduplicated **by email** (an
admin with three tabs is one person who can answer), and filtered by
`isAlive()`. A socket counts as alive only if it pinged within 90 s — because a
socket whose owner closed their laptop never fires `webSocketClose` and would
otherwise be reported as online forever. `alarm()` re-checks every 30 s while
anyone is connected, so presence corrects itself on a timer rather than only
when someone connects or disconnects.

```
                     ┌──────────── SupportChat (one instance) ───────────┐
  HoD tab ──ws──────►│ tag role:hod  user:hod.maths@…                    │
  Admin tab ──ws────►│ tag role:admin user:coe@…                         │
  Admin phone ──ws──►│ tag role:admin user:coe@…   ← same email, 1 person│
                     │                                                   │
                     │ presence() = distinct alive emails tagged admin   │
                     │ storage    = conv:<id>, msg:<id>:<seq>, seq:<id>  │
                     └───────────────────────────────────────────────────┘
```

---

## 9. Call graph by module

### Client

```
index.html
└── main.tsx ......................... QueryClient, providers
    └── App.tsx ...................... route table + HomeRedirect
        └── AppLayout.tsx ............ useSession → logo, role-aware nav, <Outlet/>
            │                          ├── SupportProvider ← owns the WS for BOTH roles
            │                          ├── NavBar → useAdminUnreadCount() badge
            │                          └── HelpChatWidget  (HoD only)
            │                              ├── 'faq'    canned answers + footer chips
            │                              ├── 'browse' every question, by category
            │                              └── 'live'   useSupport() → real admin chat
            ├── ConstitutionPage ..... useBoards
            │   └── BoardCard ........ useBoard, useSubmitConstitution, useConfirmSchedule
            │       ├── FacultyPicker      (NotSubmitted | Rejected)
            │       ├── SessionPicker      (Approved + dates offered)
            │       ├── MemberList         (read-only states)
            │       └── CourseDisclosure
            ├── FileCheckerPage ...... useBoards, useCheck, useBoard,
            │   │                      useNotifyAdmin, useAcknowledgeChanges, useCloseBoard
            │   └── CheckMatrix
            ├── AdminPage ............ useBoards
            │   ├── SummaryCards ..... counts
            │   └── BoardRow ......... useBoard          ← one fetch PER ROW (N+1)
            │       └── BoardActions .. switch(board.status)
            │           ├── 'Submitted' → ApproveOrReject   useApproveBoard / useRejectBoard
            │           ├── 'Approved'  → OfferDates        useOfferDates
            │           └── 'Locked'    → LockedActions     useRequestChanges
            ├── SupportDeskPage ...... useSupport()            [admin only]
            │   └── ConversationList . inbox; selecting one → requestHistory + markRead
            └── FacultyOverridesPage . useFacultyDepartments, useFacultyOverrides,
                │                       useFacultyAuditLog, useSaveFacultyOverride,
                │                       useDeleteFacultyOverride
                ├── BaseFacultyTable
                ├── OverrideTable
                ├── AddFacultyForm ..... useCampusLookup   (autofill; disabled until
                │                                           there is something to look up)
                ├── ExcludeConfirmPanel  checkActiveNominations()  ← plain call, not a
                │                                           hook: fired on click, so it
                │                                           is not a per-row query
                └── AuditHistoryPanel .. (data fetched by the page, `enabled` only once opened)

lib/hooks.ts ─► lib/api.ts ─► withDevUser() ─► fetch('/api/…')
     │
     └─► lib/query-keys.ts   (every cache key defined once, so invalidation is precise)
```

**Every hook funnels through `api.get/post/del`.** That is the only place
`fetch` is called in the client — so `?as=` injection, the 401 → redirect rule,
and `ApiError` construction each exist exactly once.

### Server

```
index.ts
├── onError ──────────────► middleware/error.ts   errorHandler
│                             ├── ZodError            → 400
│                             ├── TransitionError     → 403 (FORBIDDEN_ROLE) | 409 (INVALID_STATE)
│                             ├── ConflictError       → 409 CONFLICT
│                             ├── VersionConflictError→ 409 VERSION_CONFLICT
│                             └── anything else       → 500 (logged, not leaked)
├── /api/auth ────────────► routes/auth.ts        [all stubs — Phase 1]
├── use('/api/*') ────────► middleware/auth.ts    requireSession
├── /api/me ──────────────► routes/me.ts          returns c.get('user')
├── /api/boards ──────────► routes/boards.ts      GET /, GET /:id,
│                                                 POST approve|reject|dates|constitution|
│                                                      schedule|notify-admin|request-changes|
│                                                      changes-incorporated|close
├── /api/catalog ─────────► routes/catalog.ts     [stubs]
├── /api/faculty ─────────► routes/faculty.ts     requireRole('admin') on '*'
│                                                 └── snapshot() = base + overrides + effective
├── /api/checks ──────────► routes/checks.ts      /pre (office only), /post
├── /api/downloads ───────► routes/downloads.ts   [stub — Phase 5]
├── /api/support/ws ──────► routes/support.ts     auth + identity header, then
│                                                 SUPPORT_CHAT.idFromName(…).fetch()
│                                                 └── durable-objects/support-chat.ts
│                                                     fetch / webSocketMessage / alarm
└── get('*') ─────────────► c.env.ASSETS.fetch()  SPA + static files

repositories/index.ts   getRepo() / getDriveRepo()      ← the mock ⇄ live seam
   ├── DEV_MODE=true  → mock-sheets.ts / mock-drive.ts  → fixtures.ts
   └── DEV_MODE=false → google/sa-token.ts (WebCrypto JWT → access token, cached in KV)
                        → sheets.ts / drive.ts          [both throw today]

shared/  (imported by BOTH sides — one definition, two consumers)
   ├── domain/board-state.ts   TRANSITIONS, assertTransition, STATUS_LABELS
   ├── schemas/board.ts        submit/approve/reject/dates/schedule
   ├── schemas/faculty.ts      override + lookup schemas
   ├── schemas/support.ts      the socket's client→server frames
   ├── constants/folder-spec.ts PRE_/POST_QPSB_FOLDERS, DRIVE_FANOUT_CONCURRENCY
   ├── constants/faq.ts        FAQ entries + the keyword/synonym search
   ├── constants/support.ts    SUPPORT_PHONE, message cap, desk instance name
   └── types.ts                BoardSummary, BoardDetail, SessionUser,
                               SupportConversation, SupportServerFrame, …
```

**`shared/` is the reason the two halves stay in sync.** `STATUS_LABELS` renders
the badge in `StatusBadge.tsx` *and* the filter chips in `AdminPage`, while
`TRANSITIONS` decides what the server permits — one vocabulary, no drift.

---

## 10. Where execution currently stops

Following a path and hitting a wall is expected in several places. These are
deliberate stubs, not bugs.

| If you follow… | You reach | Which does |
|---|---|---|
| any mutation → write serialisation | `BoardLock.fetch` | **returns 501.** Mutations do **not** route through the DO yet; the version check runs in the repository instead. The `boards.ts` header comment records this as Phase 3. |
| `DEV_MODE=false` → any request | `requireSession` production branch | returns `401` unconditionally — Google login is a Phase 1 stub |
| `DEV_MODE=false` → `getRepo()` | `createSheetsRepo` | throws |
| `/api/auth/login` | `routes/auth.ts` | throws `'login not implemented'` |
| `/api/catalog/*` | `routes/catalog.ts` | throws |
| `/api/downloads/qpsb` | `routes/downloads.ts` | throws — Phase 5 |
| `POST /:boardId/appointment-email` | `routes/boards.ts` | throws — Phase 5 (the button is rendered `disabled`) |
| board close → Drive de-share | `repo.closeBoard` | flips `closed`, appends an audit entry, `console.log`s. **No Drive permission is actually revoked.** |
| any "notify" action | `notify-admin`, `request-changes`, `close` | `console.log` + audit entry. **No email is sent.** |
| support widget → "no one is online" | `SUPPORT_PHONE` in `shared/constants/support.ts` | a `TODO` placeholder. The widget detects it and shows a configuration notice instead of a fake number. |

Full list with phase numbers: [DECISION.md §8](DECISION.md#8-known-gaps-and-deliberate-stubs).

**The support desk is the exception on this page** — unlike the board
workflow, it is wired end to end and works against real state today, because
it depends on Durable Object storage rather than on Google.

---

## 11. What AI changed in this session

Newest last. Append; do not rewrite history.

---

### 2026-09-07 — Documentation only

**Base commit:** `434398a`. **Application code changed: none.** No file under
`src/`, no config, no `package.json` entry. Everything described in this
document was read from existing code.

**Added:** [`docs/DECISION.md`](DECISION.md), [`docs/FLOW.md`](FLOW.md).

**Also done, no code:** `npm install` (301 packages, 0 vulnerabilities; one
`EBADENGINE` — `react-router@8.3.0` wants Node ≥ 22.22.0, machine has
22.19.0); `npm run dev`; smoke tests of `/`, `/api/me` for both roles, and
`/api/boards`; an advisory Admin Portal UI review recorded in
[DECISION.md §9](DECISION.md#9-session-log) but **not implemented**.

`.dev.vars` deliberately not created — under `DEV_MODE: "true"`, `getRepo()`
returns the mock before any secret is read.

---

### 2026-09-10 — Help widget navigation + live support desk

**Base commit:** `8195b1e`.

**Added — server**

| File | What it does |
|---|---|
| `src/server/durable-objects/support-chat.ts` | The desk. One instance for everyone: sockets, presence, liveness sweep, conversation + message storage. |
| `src/server/routes/support.ts` | Authenticates the upgrade, stamps the session identity onto the request, forwards to the DO. |

**Added — client**

| File | What it does |
|---|---|
| `src/client/lib/support.tsx` | `SupportProvider` / `useSupport()` — owns the socket, reconnect backoff, heartbeat. |
| `src/client/routes/support/index.tsx` | The admin inbox: thread list, transcript, reply, resolve. |

**Added — shared**

| File | What it does |
|---|---|
| `src/shared/constants/support.ts` | `SUPPORT_PHONE` (**placeholder — must be set before deploy**), message cap, desk instance id. |
| `src/shared/schemas/support.ts` | Zod for client→server frames — the only validation on the socket path. |

**Changed**

| File | Change |
|---|---|
| `src/client/components/help-chat/HelpChatWidget.tsx` | Rewritten around three views (`faq` / `browse` / `live`) with a back arrow. **Fixes the reported bug:** the question list was previously destroyed by asking anything and was unreachable thereafter. |
| `src/client/components/AppLayout.tsx` | Wraps the app in `SupportProvider`; nav extracted to `NavBar` for the unread badge; Support Desk entry added. |
| `src/client/App.tsx` | `/support` route, admin-only. |
| `src/client/lib/format.ts` | `formatChatTime` — clock time today, date + time otherwise. |
| `src/client/lib/api.ts` | `withDevUser` exported so the socket URL gets the same `?as=` handling as `fetch`. |
| `src/server/index.ts` | Mounts `/api/support`, exports `SupportChat`. |
| `src/server/env.ts` | `SUPPORT_CHAT` binding. |
| `src/shared/types.ts` | Support conversation / message / presence / server-frame types. |
| `wrangler.jsonc` | `SUPPORT_CHAT` binding + migration **`v2`**. |

**Flow impact:** new [§8 Walkthrough D](#8-walkthrough-d--a-hod-asks-for-help);
entry points table gained the SupportChat DO; §9 call graph updated. §5–§7 are
unaffected — no board code was touched.

**Verified by**

| Check | Result |
|---|---|
| `npm test` | 34 passed |
| `npm run typecheck` / `npm run lint` | clean |
| `npm run build` | client + worker built; generated `wrangler.json` carries both DO bindings and migrations `v1`, `v2` |
| Socket protocol, 20 scripted checks over two live sockets | thread creation, both-way delivery, unread counters, resolve/reopen, history ordering, presence transitions — all pass |
| Authority | a HoD supplying someone else's `conversationId` still lands in their own thread |
| Route guards | non-upgrade `GET` → 426; unknown user → 401; viewer → 403 |
| Liveness | a socket that stays TCP-connected but stops pinging is closed after 109 s with `1001 No ping received`; one killed outright is dropped sooner |

**Two bugs found and fixed while testing, not in the original design:**

1. `broadcastPresence` depended on the runtime having already removed a
   closing socket from `getWebSockets()` — true only because an `await`
   happened to yield first. The closing socket is now excluded explicitly.
2. A socket that dies without a close handshake stays registered forever, so
   its owner shows as online indefinitely. Fixed with the heartbeat + sweep.
   The first implementation used `setWebSocketAutoResponse`, which **looked**
   correct and was not — see
   [DECISION.md](DECISION.md#9-session-log) for why it was replaced.

---

### Convention for future sessions

Append an entry of this shape:

```markdown
### <YYYY-MM-DD> — <what was built>

**Changed:** `path/to/file.ts` — what changed and why (link the DECISION.md entry)
**Added:** `path/to/new.ts` — what it does and who calls it
**Flow impact:** which walkthrough above is now out of date, and how
**Verified by:** the command run and its result — not "should work"
```

Keep the walkthroughs in §5–§7 current. A flow document that has drifted from
the code is worse than none, because it is trusted and wrong.
