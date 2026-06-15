# Creator OS 

Your single AI dashboard for everything you post and everyone you watch.

- **Your stuff** — IG / TikTok / YouTube posts, transcripts, hook performance, follower growth, best-time-to-post
- **Their stuff** — watch other creators, scrape their public posts (Apify for IG/TT, free official API for YT), transcribe their videos, ingest their hooks into your library
- **Trend layer** — Tavily-powered niche news + viral-velocity tracker
- **Q&A** — RAG chat over your posts, competitor posts, and news (with citations)
- **Compose** — write+schedule with AI hook A/B simulator predicting performance from your hook history
- **Daily morning brief** — generated 7am Central, surfaced on the dashboard
- **Wild adds** — content compounding map, repurpose detector, voice DNA hook constraints

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16, Tailwind v4, React 19, Recharts |
| DB | Postgres + pgvector (Neon) |
| Auth | NextAuth v5 + bcryptjs (single-user gate via `ADMIN_EMAIL`) |
| Workers | Inngest (durable cron + queue) |
| AI | Claude Sonnet 4.6 / Haiku 4.5 — script + chat + hook extraction |
| Transcription | Whisper-large-v3-turbo via Groq (~$0.04/audio-hr) |
| Embeddings | OpenAI text-embedding-3-small (1536 dim) |
| Storage | Cloudflare R2 (S3-compatible) |
| Scrapers | Apify (IG `apify/instagram-scraper`, TT `clockworks/free-tiktok-scraper`) + YouTube Data API |
| News | Tavily |

## What's done

| Phase | Status |
|---|---|
| 0 — Repo scaffold, schema, auth, dashboard shell | ✅ |
| 1 — IG/YT/TT OAuth, sync, transcripts, hook ranking, charts | ✅ |
| 2 — Compose UI, AI hook A/B simulator, multi-platform publish, drafts queue, scheduling | ✅ |
| 3 — Creator watchlist, Apify scrapers, niche hook DB, trend velocity | ✅ |
| 4 — RAG chat with citations, niche news, daily morning brief | ✅ |
| 5 — Content compounding map, voice DNA, repurpose detector | ✅ |

## Setup

```bash
npm install
cp .env.example .env.local
```

Generate secrets:

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -hex 32      # TOKEN_ENCRYPTION_KEY
```

In your Postgres console, once:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Push the schema and create your user:

```bash
npm run db:push
npm run seed:user
npm run dev
```

In another terminal, start the Inngest dev server:

```bash
npm run inngest:dev
```

## Required env vars

| Var | Required for | Where to get it |
|---|---|---|
| `DATABASE_URL` | Everything | Neon |
| `AUTH_SECRET` | Auth | `openssl rand -base64 32` |
| `ADMIN_EMAIL` | Auth gate | your email |
| `TOKEN_ENCRYPTION_KEY` | Token storage | `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | All AI | console.anthropic.com |
| `OPENAI_API_KEY` | Embeddings | platform.openai.com |
| `GROQ_API_KEY` | Transcription | console.groq.com |
| `META_APP_ID` / `META_APP_SECRET` | IG connect | developers.facebook.com |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | YT connect (own channel) | console.cloud.google.com |
| `YT_API_KEY` | YT competitor scraping | same project, create API key |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | TT connect | developers.tiktok.com |
| `APIFY_TOKEN` | IG/TT competitor scraping | apify.com |
| `TAVILY_API_KEY` | News + Trends page | tavily.com |
| `R2_*` | Media uploads (Compose page) | Cloudflare R2 |
| `INNGEST_*` | Production workers | inngest.com — leave blank for `inngest dev` |

OAuth callback URLs to register with each provider:

- Instagram: `${APP_URL}/api/connect/instagram/callback`
- YouTube: `${APP_URL}/api/connect/youtube/callback`
- TikTok: `${APP_URL}/api/connect/tiktok/callback`

## Cost (single user)

| Service | Cost |
|---|---|
| Vercel hobby | Free |
| Neon Postgres + pgvector | Free |
| Cloudflare R2 (10 GB) | Free |
| Inngest (50K runs/mo) | Free |
| Tavily (1K searches/mo) | Free |
| Apify (free $5 credit ≥ 10 watched creators) | Free |
| OpenAI embeddings | ~$0.10/mo |
| Groq Whisper | $0–0.50/mo |
| Claude API | $5–15/mo |

**~$5–15/mo realistic.**

## How everything connects

```
Cron 0 */6 * * *  syncMyPosts ──► fan-out per account ──► syncAccount()
                                                          ├─ snapshot followers
                                                          ├─ list posts via platform API
                                                          ├─ upsert + metric snapshot
                                                          └─ event: post.enrich  (per new post)

Event post.enrich ─► enrichPost
                     ├─ YouTube: pull free captions
                     ├─ IG / TikTok: download media → Whisper
                     ├─ embed transcript → pgvector
                     └─ extractHook (Claude) → dedupe via vector → attach to Post

Cron 0 6 * * *   scrapeCompetitorsCron ─► fan-out ─► scrapeAndIngest()
                                                     └─ event: competitor.enrich
                                                        (same pipeline as post.enrich, owner=NICHE)

Cron 0 7 * * *   pullNicheNews ─► tavilySearch → embed → news_items
Cron 0 13 * * *  morningBrief ──► velocity + viral + bestTime + news → Claude summary

Cron 0 5 * * *   recomputeHookStats ─► roll up hook averages from posts

UI /compose ─► AI hook suggester ─► kNN over hooks (yours 2× weight) ─► predicted ER
              ─► save Draft ─► publish now / schedule
                              ─► event: draft.schedule  (Inngest sleepUntil)
                              ─► safety net cron */5 * * * *

UI /chat ─► /api/chat/stream ─► ragRetrieve (own posts + competitors + news)
                              ─► Claude streaming with citations
```

## File map

```
src/
├── auth.ts                 # NextAuth v5 config
├── middleware.ts           # auth gate
├── lib/
│   ├── db.ts               # Prisma singleton
│   ├── crypto.ts           # AES-256-GCM
│   ├── analytics.ts        # follower growth, best-time, ranked hooks
│   ├── compound.ts         # content compounding map
│   ├── sync.ts             # YOUR-side sync orchestrator
│   ├── publish.ts          # multi-platform publish
│   ├── apify.ts            # Apify wrapper
│   ├── tavily.ts           # Tavily wrapper
│   ├── news.ts             # niche news ingestion
│   ├── rag.ts              # vector retrieval across sources
│   ├── brief.ts            # morning brief generator
│   ├── youtube-transcript.ts
│   ├── oauth-state.ts
│   ├── r2.ts
│   ├── ai/
│   │   ├── claude.ts hook-extractor.ts hook-suggester.ts
│   │   ├── chat-agent.ts repurpose.ts embed.ts transcribe.ts
│   ├── platforms/
│   │   ├── base.ts index.ts
│   │   ├── instagram.ts instagram-publish.ts
│   │   ├── youtube.ts   youtube-publish.ts
│   │   └── tiktok.ts    tiktok-publish.ts
│   └── competitors/
│       ├── scrapers.ts ingest.ts velocity.ts
├── app/
│   ├── (app)/{dashboard,posts,hooks,creators,trends,compose,drafts,chat}/
│   ├── api/
│   │   ├── auth/[...nextauth]/        # NextAuth handlers
│   │   ├── connect/{ig,yt,tt}/[+ callback]/
│   │   ├── disconnect/[platform]/
│   │   ├── sync/[platform]/
│   │   ├── upload/                     # R2 upload
│   │   ├── chat/stream/                # SSE streaming
│   │   └── inngest/                    # Inngest webhook
│   └── login/
├── components/
│   ├── nav.tsx connect-button.tsx charts.tsx morning-brief.tsx

inngest/
├── client.ts
└── functions.ts            # all 11 workers

prisma/schema.prisma        # ~300 lines, covers everything
scripts/create-admin-user.ts
```
