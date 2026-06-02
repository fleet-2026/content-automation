# Creator OS — Setup Guide

> **Your personal AI content dashboard.** Handles daily post scripts, captions, ManyChat keyword automation, TikTok QR flows, carousel scheduling, and publishing to Instagram + TikTok.

---

## What you get

- **Daily post editor** — hook, script, caption, hashtags, ManyChat wiring, media upload
- **AI rating** — scores your script + caption on 10 dimensions, rewrites suggestions
- **Carousel builder** — drag-and-drop, reorder, schedule for future posting
- **Instagram keyword bot** — someone comments your keyword → bot auto-DMs them the guide
- **TikTok QR flow** — publish video → scan QR on phone → paste caption in TikTok
- **Compose + schedule** — single post or multi-platform queue
- **Drafts queue** — active vs posted, clean view

---

## 1-hour setup (5 steps)

---

### Step 1 — Clone and deploy to Vercel

1. Go to **https://vercel.com/new**
2. Import from GitHub: `https://github.com/fadiagulec/content-automation` *(you'll get your own copy)*
3. Framework preset: **Next.js** (auto-detected)
4. Click **Deploy** — it will fail first time, that's fine. You need the env vars.

---

### Step 2 — Set up a free database (Neon)

1. Go to **https://neon.tech** → create free account → new project
2. Copy the **Connection string** (starts with `postgresql://`)
3. Keep this tab open — you need it in Step 3

---

### Step 3 — Set environment variables on Vercel

In your Vercel project → **Settings → Environment Variables**, add all of these:

#### Required (the app won't start without these)
| Variable | Where to get it |
|----------|----------------|
| `DATABASE_URL` | Neon connection string from Step 2 |
| `AUTH_SECRET` | Run `openssl rand -base64 32` in terminal, paste result |
| `ADMIN_EMAIL` | Your email address |
| `AUTH_DEV_OPEN` | `1` (skips login — single user mode) |
| `NEXT_PUBLIC_APP_URL` | Your Vercel URL, e.g. `https://your-app.vercel.app` |

#### For AI features (get free keys)
| Variable | Where to get it |
|----------|----------------|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com → API Keys |
| `OPENAI_API_KEY` | https://platform.openai.com → API Keys |
| `GROQ_API_KEY` | https://console.groq.com → API Keys (free) |

#### For file uploads (Cloudflare R2 — free tier)
| Variable | Where to get it |
|----------|----------------|
| `R2_ACCOUNT_ID` | Cloudflare Dashboard → R2 |
| `R2_ACCESS_KEY_ID` | R2 → Manage API Tokens |
| `R2_SECRET_ACCESS_KEY` | R2 → Manage API Tokens |
| `R2_BUCKET` | Name of your R2 bucket |
| `R2_PUBLIC_URL` | Your R2 public bucket URL |

#### For Instagram/TikTok publishing
| Variable | Where to get it |
|----------|----------------|
| `META_APP_ID` | https://developers.facebook.com → Your App |
| `META_APP_SECRET` | Meta App Dashboard → Basic Settings |
| `TIKTOK_CLIENT_KEY` | https://developers.tiktok.com → Your App |
| `TIKTOK_CLIENT_SECRET` | TikTok Developer Portal → Your App |
| `TIKTOK_REDIRECT_URI` | `https://your-app.vercel.app/api/connect/tiktok/callback` |

#### For the Instagram keyword bot
| Variable | Value |
|----------|-------|
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | Any secret string, e.g. `myapp_webhook_2024` |

---

### Step 4 — Redeploy and run database setup

1. In Vercel → **Deployments** → click the latest → **Redeploy**
2. Once live, open terminal and run:

```bash
git clone https://github.com/YOUR_FORK/content-automation
cd content-automation/creator-os
npm install
npx prisma db push   # creates all tables
```

---

### Step 5 — Connect your Instagram bot

1. Go to **https://developers.facebook.com/apps/** → your app → **Webhooks → Instagram**
2. Add subscription:
   - **Callback URL:** `https://your-app.vercel.app/api/instagram/webhook`
   - **Verify token:** the value you set for `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
3. Subscribe fields: `comments`, `messages`, `messaging_postbacks`

**Done.** Your bot is live. Add keywords to any post in the dashboard and when someone comments that word on your Reel, the bot DMs them the guide automatically.

---

## How to use it

### Creating a post
1. Go to `/daily-post` → click **Add post** or pick an existing guide
2. Fill in hook, script, caption, hashtags
3. Set your ManyChat keyword (e.g. `STACK`)
4. Upload your video
5. Click **Publish to /guides** when ready
6. Use the **ManyChat wiring** section to copy the bot reply and guide URL

### Publishing to social
- From any daily post editor → scroll to **Publish** section → pick platforms → click **Publish**
- For TikTok: video uploads to your inbox → scan the QR code on your phone → paste caption → post

### Carousel posts
- Go to `/carousel` → upload images → drag to reorder → set caption + keyword → schedule or publish

### Adding keywords to your bot
- Every guide has a **trigger keyword** field in the ManyChat section
- Set it once → bot picks it up automatically (no code changes needed)

---

## Need help?

Email: fadiagulec@gmail.com
