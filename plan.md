# spent — product & implementation plan

## What it is

A personal finance agent that parses your Gmail to give you a real-time picture of your spending — with a beautiful dashboard and a conversational agent that answers questions about your own money.

No bank logins. No SMS permissions. No manual entry. Just Gmail.

---

## The moat

Every personal finance app in India is fighting the same battle: getting reliable transaction data. They chase Account Aggregator licensing, broker OAuth integrations, SMS read permissions — all of which take months, cost money, and hit a hard wall on iOS (Apple blocks SMS entirely).

**We already have the data. It's sitting in Gmail.**

Urban Indian users receive almost their entire financial life as email:

| Source | What arrives |
|---|---|
| Swiggy / Zomato | Order confirmations with exact amounts |
| Amazon | Invoice PDFs with itemised purchases |
| Rapido / Uber | Ride receipts with fare breakdown |
| Cleartrip / IndiGo | Booking confirmations with total fare |
| Banks | CC statements, EMI alerts, salary credits |
| Any invoicing app | Structured invoice emails |

This covers **80–90% of discretionary spending** for a typical urban user. Gmail OAuth is read-only, works natively on iOS, requires no regulatory approval, and users already trust Google with this data.

---

## Value add

### 1. It just works
Sign in with Google. Wait 30 seconds. See your last 3 months of spending — accurately categorised, zero manual work.

### 2. Proactive narrative, not reactive charts
- "Your Swiggy spend is up 34% this month. You'll overshoot your food budget by ₹2,400 at this rate."
- "Your HDFC bill hits on the 18th. Based on your balance trend, you'll have ₹6,200 left after that."
- "You usually travel in May. Last May you spent ₹14,000 on flights."

### 3. Conversational agent over your own data
Ask in plain English. The agent queries your transaction DB and Gmail in real time, streams its reasoning and answer back to you.

### 4. Visible agent reasoning
Every answer shows tool calls the agent made, what it found, how it computed the answer. Users see it working, not just asserting.

---

## Data flow

```
Gmail Inbox
    │
    ▼
[ Gmail OAuth — read-only scope ]
    │
    ├── Search by sender domain
    │   swiggy.com · zomato.com · amazon.in
    │   rapido.bike · cleartrip.com · goindigo.in · uber.com
    │
    ▼
[ Email Classifier ]
    │  Routes each email to the right parser
    │  based on sender domain + subject pattern
    │
    ▼
[ Per-Brand Parsers ]  ←── regex/pattern matching, fast + free
    │
    ├── Swiggy     → { merchant, amount, date, restaurant }
    ├── Zomato     → { merchant, amount, date, restaurant }
    ├── Amazon     → { merchant, amount, date, order_id }
    ├── Rapido     → { merchant, amount, date, route }
    ├── Cleartrip  → { merchant, amount, date, route, pnr }
    ├── IndiGo     → { merchant, amount, date, route, pnr }
    └── Generic    → DeepSeek-V3.2 extracts { merchant, amount, date, category }
    │               (handles BookMyShow, Myntra, Dunzo, etc.)
    │               result cached in SQLite by email_id
    │
    ▼
[ Structured Transaction Store ]
    │  SQLite — local, private
    │
    ├────────────────────────────────┐
    ▼                                ▼
[ Dashboard API ]          [ Agent API ]
  pre-computed aggregates    Grok-4-fast-reasoning
  served on page load        tool-use loop, streaming
```

---

## Tech stack

### Backend
- **Runtime**: Node.js + TypeScript
- **Framework**: Fastify
- **Database**: SQLite via `better-sqlite3`
- **Gmail**: `googleapis` (OAuth2 + gmail.users.messages)
- **AI — extraction**: DeepSeek-V3.2 via Azure AI Foundry (`@azure-ai/inference`)
- **AI — agent**: Grok-4-fast-reasoning via Azure AI Foundry (`@azure-ai/inference`)
- **Validation**: Zod + `zod-to-json-schema` (tool schemas)
- **Other**: `pdf-parse`, `node-html-parser`, `dotenv`, `pino`

### Frontend
- **Framework**: SvelteKit (TypeScript)
- **Styling**: Vanilla CSS with custom properties (Phosphor Noir design system)
- **Charts**: ECharts with custom phosphor-noir theme
- **Fonts**: JetBrains Mono (numbers/data) + Inter (prose)
- **Transport**: SSE for agent streaming + sync progress

### AI model roles
| Model | Role | How |
|---|---|---|
| **DeepSeek-V3.2** | Generic invoice extraction | `response_format: json_object`, one-shot, cached by email_id |
| **Grok-4-fast-reasoning** | Agent tool-use loop | Streaming tool calls, `search_gmail` + `query_transactions` tools |

Both accessed via `@azure-ai/inference` `ModelClient`. OpenAI-compatible tool schema format.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Browser (SvelteKit)                        │
│                                                                   │
│  ┌────────────────────────────┐  ┌───────────────────────────┐   │
│  │      Dashboard UI          │  │     Chat Agent Rail       │   │
│  │  KPI tiles · charts · txns │  │  streaming · tool traces  │   │
│  └─────────────┬──────────────┘  └─────────────┬─────────────┘   │
└────────────────┼────────────────────────────────┼─────────────────┘
                 │                                │
                 ▼                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Fastify Backend (Node/TS)                     │
│                                                                   │
│  GET  /api/summary     → aggregated stats (cached 60s)           │
│  GET  /api/txns        → paginated transaction list               │
│  POST /api/sync        → SSE progress, triggers Gmail parse      │
│  POST /api/agent       → SSE streaming, Grok tool-use loop       │
│  GET  /auth/google     → OAuth2 redirect                         │
│  GET  /auth/google/callback → token exchange + cookie            │
│  GET  /auth/status     → connection state                        │
└──────────────────────────────┬───────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                     ▼
   ┌─────────────┐   ┌──────────────────┐   ┌──────────────────┐
   │  SQLite DB  │   │  Gmail API       │   │  Azure AI Foundry│
   │  local file │   │  read-only OAuth │   │  DeepSeek-V3.2   │
   └─────────────┘   └──────────────────┘   │  Grok-4-fast     │
                                             └──────────────────┘
```

---

## Project structure

```
spent/
├── plan.md
├── package.json
├── tsconfig.json
├── svelte.config.js          # SvelteKit config
├── vite.config.ts
├── .env                      # secrets (gitignored)
├── .env.example
├── data/
│   └── spent.db              # SQLite (gitignored)
├── static/
│   └── fonts/
│       ├── JetBrainsMono-*.woff2
│       └── Inter-*.woff2
├── src/
│   ├── app.html
│   ├── app.css
│   │
│   ├── lib/                  # frontend components + utils
│   │   ├── styles/
│   │   │   ├── tokens.css
│   │   │   ├── type.css
│   │   │   ├── panel.css
│   │   │   └── motion.css
│   │   ├── components/
│   │   │   ├── layout/       TopBar, MonthSwitcher, Panel, BottomNav
│   │   │   ├── kpi/          KpiTicker, KpiTile
│   │   │   ├── charts/       TimelineChart, CategoryBars, echartsTheme.ts
│   │   │   ├── txns/         TransactionsPanel, TransactionRow, CategoryChip
│   │   │   ├── merchants/    TopMerchants
│   │   │   ├── insights/     InsightsPanel, InsightCard
│   │   │   ├── agent/        AgentRail, AgentModal, AgentThread,
│   │   │   │                 AgentMessage, ToolCallBlock, SourcedNumber,
│   │   │   │                 SourcedTxnCard, AgentComposer
│   │   │   └── primitives/   Skeleton, Popover, CommandPalette, Glyph
│   │   ├── stores/
│   │   │   ├── month.ts
│   │   │   ├── filters.ts
│   │   │   ├── agent.ts
│   │   │   └── ui.ts
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   ├── summary.ts
│   │   │   ├── txns.ts
│   │   │   └── agent.ts      # SSE stream parser
│   │   └── utils/
│   │       ├── format.ts     # ₹ formatter, tabular, delta
│   │       ├── date.ts
│   │       └── keys.ts       # global keyboard map
│   │
│   ├── routes/               # SvelteKit pages + API routes
│   │   ├── +layout.svelte
│   │   ├── +layout.server.ts
│   │   ├── +page.svelte      # dashboard
│   │   ├── +page.server.ts
│   │   ├── txns/+page.svelte
│   │   ├── ask/+page.svelte
│   │   └── api/
│   │       ├── summary/+server.ts
│   │       ├── txns/+server.ts
│   │       ├── sync/+server.ts
│   │       ├── agent/+server.ts
│   │       └── auth/
│   │           ├── google/+server.ts
│   │           ├── google/callback/+server.ts
│   │           └── status/+server.ts
│   │
│   └── server/               # backend-only modules (imported by +server.ts)
│       ├── config.ts         # env parsing via Zod
│       ├── db/
│       │   ├── client.ts
│       │   ├── migrate.ts
│       │   ├── migrations/
│       │   │   ├── 001_init.sql
│       │   │   └── 002_indexes.sql
│       │   └── repo/
│       │       ├── transactions.ts
│       │       ├── syncState.ts
│       │       ├── oauthTokens.ts
│       │       └── extractionCache.ts
│       ├── gmail/
│       │   ├── oauth.ts
│       │   ├── client.ts
│       │   ├── fetch.ts
│       │   ├── history.ts
│       │   └── decode.ts
│       ├── parsers/
│       │   ├── types.ts
│       │   ├── registry.ts
│       │   ├── util.ts
│       │   ├── swiggy.ts
│       │   ├── zomato.ts
│       │   ├── amazon.ts
│       │   ├── rapido.ts
│       │   ├── uber.ts
│       │   ├── cleartrip.ts
│       │   ├── indigo.ts
│       │   └── generic_deepseek.ts   # DeepSeek-V3.2 fallback
│       ├── sync/
│       │   ├── runner.ts
│       │   └── categorize.ts
│       └── agent/
│           ├── loop.ts               # Grok-4-fast-reasoning tool-use loop
│           ├── tools/
│           │   ├── search_gmail.ts
│           │   └── query_transactions.ts
│           └── prompts.ts
```

---

## SQLite schema

```sql
-- transactions
CREATE TABLE transactions (
  id           TEXT PRIMARY KEY,        -- sha1(email_id:idx)
  user_id      TEXT NOT NULL,
  email_id     TEXT NOT NULL,
  thread_id    TEXT,
  date         TEXT NOT NULL,           -- ISO yyyy-mm-dd
  merchant     TEXT NOT NULL,
  amount       REAL NOT NULL,           -- INR, positive
  currency     TEXT NOT NULL DEFAULT 'INR',
  category     TEXT NOT NULL,           -- food|shopping|travel|transport|bills|entertainment|other
  source       TEXT NOT NULL,           -- parser id
  details_json TEXT,
  subject      TEXT,
  from_addr    TEXT,
  snippet      TEXT,
  parsed_at    INTEGER NOT NULL,
  UNIQUE(user_id, email_id, merchant, amount, date)
);

-- oauth_tokens
CREATE TABLE oauth_tokens (
  user_id       TEXT PRIMARY KEY,
  email         TEXT,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expiry_date   INTEGER,
  scope         TEXT,
  token_type    TEXT,
  updated_at    INTEGER NOT NULL
);

-- sync_state
CREATE TABLE sync_state (
  user_id         TEXT PRIMARY KEY,
  last_history_id TEXT,
  last_full_sync  INTEGER,
  last_sync_at    INTEGER,
  status          TEXT
);

-- sync_attempts (unparsed tracking for parser iteration)
CREATE TABLE sync_attempts (
  email_id     TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  parser_tried TEXT,
  status       TEXT,       -- parsed|unparsed|error|skipped
  error        TEXT,
  attempted_at INTEGER NOT NULL
);

-- extraction_cache (DeepSeek results cached forever by email_id)
CREATE TABLE extraction_cache (
  email_id    TEXT PRIMARY KEY,
  result_json TEXT,
  created_at  INTEGER NOT NULL
);

-- _migrations (internal migration tracker)
CREATE TABLE _migrations (
  name       TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
```

**Category taxonomy**: `food | shopping | travel | transport | bills | entertainment | other`

---

## API reference

### `GET /api/summary?month=YYYY-MM`
Returns pre-computed aggregates for the given month. Defaults to current month.
```json
{
  "month": "2026-04",
  "total": 48230.5,
  "byCategory": [{ "category": "food", "amount": 9200, "count": 31 }],
  "bySource":   [{ "source": "swiggy", "amount": 6200, "count": 31 }],
  "byWeek":     [{ "week": "2026-W15", "amount": 12400 }],
  "topMerchants": [{ "merchant": "Amazon", "amount": 14200, "count": 8 }],
  "topTxns":    [{ "id": "...", "date": "...", "merchant": "...", "amount": 0 }],
  "deltas":     { "vsLastMonth": 0.12 },
  "lastSyncAt": 1712900000000
}
```

### `GET /api/txns?from=&to=&category=&source=&merchant=&q=&limit=100&offset=0&sort=date&dir=desc`
Paginated transaction list.
```json
{ "items": [...], "total": 0, "nextOffset": null }
```

### `POST /api/sync?mode=full|incremental` — SSE
```
event: progress  data: {"phase":"fetching","parser":"swiggy","count":12}
event: progress  data: {"phase":"parsing","parser":"amazon","done":30,"total":45}
event: progress  data: {"phase":"deepseek_fallback","done":3,"total":8}
event: done      data: {"inserted":57,"updated":2,"skipped":4}
event: error     data: {"message":"..."}
```

### `POST /api/agent` — SSE
Body: `{ "message": "...", "conversationId": "optional" }`
```
event: reasoning   data: {"delta":"..."}          # Grok reasoning_content
event: thinking    data: {"text":"..."}
event: tool_call   data: {"id":"tc_1","name":"query_transactions","input":{}}
event: tool_result data: {"id":"tc_1","result":{}}
event: text        data: {"delta":"..."}
event: done        data: {"stopReason":"stop"}
```

---

## Agent tools

```ts
// query_transactions — queries local SQLite
{
  from?: string, to?: string,
  category?: string[], source?: string[], merchant?: string,
  minAmount?: number, maxAmount?: number,
  groupBy?: 'day'|'week'|'month'|'category'|'merchant'|'source',
  agg?: 'sum'|'count'|'avg',
  limit?: number
}

// search_gmail — runs a Gmail search, returns summaries
{
  query: string,
  dateRange?: { from: string, to: string },
  maxResults?: number   // default 10, max 25
}
```

---

## Build order

### Week 1 — data foundation
- [x] Update plan.md
- [ ] Scaffold project (package.json, tsconfig, SvelteKit init)
- [ ] DB: client, migrations, repo helpers
- [ ] Gmail OAuth flow + token storage + auth endpoints
- [ ] Gmail fetch + decode (MIME, HTML→text, PDF)
- [ ] Parser engine: types, registry, all brand parsers
- [ ] DeepSeek-V3.2 generic fallback + extraction_cache
- [ ] Sync runner + /api/sync SSE endpoint

### Week 2 — dashboard
- [ ] /api/summary and /api/txns endpoints
- [ ] SvelteKit setup: design tokens, Panel primitive, TopBar
- [ ] KPI tiles wired to real data
- [ ] Timeline chart + Category bars (ECharts)
- [ ] Transactions panel, mobile layout pass

### Week 3 — agent
- [ ] Grok-4-fast-reasoning tool-use loop
- [ ] /api/agent SSE endpoint
- [ ] Agent rail + ToolCallBlock component
- [ ] Sourced number popovers, streaming UI

### Week 4 — intelligence
- [ ] Proactive weekly summary
- [ ] Anomaly detection
- [ ] Forward simulation ("at this rate…")
- [ ] Behavioural patterns / recurring flags

---

## Design system — Phosphor Noir

### Palette
| Token | Value | Use |
|---|---|---|
| `--bg-0` | `#0A0A0B` | App background |
| `--bg-1` | `#101013` | Panel fill |
| `--bg-2` | `#16161A` | Elevated / hover |
| `--bg-3` | `#1E1E24` | Input / active row |
| `--line` | `#26262E` | 1px hairline borders |
| `--line-bright` | `#3A3A44` | Focused border |
| `--fg-0` | `#F5F2E8` | Primary text (warm white) |
| `--fg-1` | `#B8B3A3` | Secondary text |
| `--fg-2` | `#6B6860` | Labels / tertiary |
| `--fg-3` | `#3E3C38` | Disabled / gridlines |
| `--amber` | `#FFB627` | Primary accent, KPIs, cursor |
| `--amber-dim` | `#8C6515` | Amber subdued |
| `--green` | `#4ADE80` | Positive delta |
| `--red` | `#FF5C5C` | Negative delta / anomaly |
| `--cyan` | `#5FD4E0` | Agent tool-call chips |
| `--violet` | `#A78BFA` | Projections / what-if |

### Typography
- **Mono (data)**: JetBrains Mono — all numbers, KPIs, txn rows, timestamps
- **Prose**: Inter — insights, agent replies, onboarding
- **Scale**: 11 / 12 / 13 / 15 / 20 / 28 / 44px
- **Rule**: tabular figures everywhere (`font-variant-numeric: tabular-nums`)

### Motion
- `120ms` hover/state, `200ms` reveal, `400ms` route
- One easing: `cubic-bezier(0.2, 0, 0, 1)`
- No bounces, no springs, no shadows

---

## Open questions / risks

1. **History window**: default 180 days on first sync. Adjust?
2. **Refunds/cancellations**: v1 = ignore. Confirm.
3. **Multi-currency**: v1 = skip non-INR, log to sync_attempts.
4. **OAuth unverified-app warning**: fine for dev/testing (up to 100 test users). Production needs Google brand verification + CASA security assessment for `gmail.readonly` restricted scope.
5. **Parser brittleness**: brands change templates. Mitigation = fixtures + unparsed queue + DeepSeek fallback.
6. **Grok tool call streaming**: confirmed supported. Watch for `reasoning_content` delta field — surface as `reasoning` SSE event.
