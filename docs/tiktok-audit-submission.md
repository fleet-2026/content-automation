# TikTok Audit Submission — `video.publish` scope

**Goal:** unlock TikTok's **Direct Post API** so the dashboard can publish to TikTok with the caption, hashtags, and privacy settings already filled in — no manual "open the app and tap Post" step.

**Time estimate:** 1-4 weeks for TikTok to review.
**Status:** not yet submitted.

---

## Where to go

1. https://developers.tiktok.com → **Manage apps** → your Creator OS app
2. Left sidebar → **Add products** → enable **Content Posting API**
3. Under Content Posting API → request **`video.publish`** scope (the "Direct Post" capability)
4. Fill in the audit form (fields + suggested copy below)
5. Upload the demo screencast

---

## Form field copy (paste directly)

### App name
Creator OS

### Short description (one line)
A creator content dashboard that helps solo founders compose, schedule, and publish vertical short-form video to Instagram, TikTok, and Facebook from a single editor.

### Detailed description / use case
Creator OS is a content-automation dashboard for solo creators and small teams. The user writes a caption + selects a hook + uploads a vertical video, then clicks "Publish now" to send it to every connected social platform in one action. Captions, hashtags, and a ManyChat link are unified across platforms so the creator doesn't have to manually re-type each time.

For TikTok specifically, we currently use the Inbox API (`video.upload` scope) which delivers the raw video to the user's TikTok app drafts but cannot pre-fill the caption — the user has to open the TikTok app, paste the caption manually, and tap Post. This breaks the cross-platform "one-click publish" flow that's the core value of the dashboard.

We are requesting `video.publish` (Direct Post) so users can finalize the entire post in one action from the dashboard, with their caption, hashtags, and privacy setting already set when the video lands on TikTok.

### Privacy levels we'll use
PUBLIC_TO_EVERYONE, MUTUAL_FOLLOW_FRIENDS, SELF_ONLY — the dashboard surfaces a single dropdown to the user before each publish.

### Disclose video source (yes/no fields)
- **Auto-add music**: No
- **Branded content disclosure**: No (user toggles per post if applicable)
- **Promotional content disclosure**: No (user toggles per post if applicable)
- **Video originates from URL**: No — we upload the bytes via FILE_UPLOAD chunked transfer
- **Tag others / mentions**: No
- **Use third-party video editors**: No — the video file is the user's own recorded MP4 or a HeyGen-generated avatar talking-head MP4 that the user authored

### Platforms / regions
Web (Vercel-hosted Next.js app, custom domain). Users worldwide; no restrictions.

### Privacy policy URL
https://creator-os-delta.vercel.app/privacy   *(create this if it doesn't exist — TikTok requires a working URL)*

### Terms of service URL
https://creator-os-delta.vercel.app/terms     *(same — must be a working URL)*

### Data deletion / user data handling
We store the user's OAuth access token (encrypted at rest with AES-256-GCM, key in environment variable), their TikTok openId, and the publish status of each video we send. We do NOT store the video file itself on our servers — it streams from R2 (the user's Cloudflare R2 bucket) into TikTok's upload endpoint and is deleted from our temporary buffer immediately after the upload PUT completes.

Users can disconnect their TikTok account at any time from the dashboard's Settings page; on disconnect we delete the access token + refresh token + openId from our DB. Full account deletion is supported via a "Delete my account" link in Settings.

---

## Required screencast (record this video before submitting)

TikTok requires a screen recording (1-3 minutes, MP4, ≤ 100 MB) demonstrating the integration. Suggested scene-by-scene:

| Scene | Duration | What to show |
|---|---|---|
| 1 | 0:00-0:15 | Dashboard homepage — narrate: "This is Creator OS, a content dashboard for solo creators. We're going to publish a video to TikTok with the caption filled in." |
| 2 | 0:15-0:30 | Click **Connect TikTok** → OAuth screen → grant scope. Show the scope list including `video.publish`. |
| 3 | 0:30-0:55 | Click **Compose new post** → type caption + hashtags → upload an MP4. |
| 4 | 0:55-1:15 | Click **Publish now** → modal shows TikTok with ✓ Posted (no "finalize in app" prompt). |
| 5 | 1:15-1:35 | Switch to TikTok app on phone — show the new post appears on the user's profile with the EXACT caption from the dashboard. |
| 6 | 1:35-1:50 | Back to dashboard — show the post in /posts feed with the live TikTok link. |

Record at 1080p, voice-over in English explaining each step. Save as `creator-os-tiktok-demo.mp4`.

---

## Test credentials for TikTok reviewers

TikTok will want to log into the dashboard themselves to verify. Set up a **dedicated reviewer account** before submitting:

1. Visit `/login` on the deployed dashboard
2. Create account: `tiktok-review@creator-os-delta.vercel.app` (or similar)
3. Connect a fresh TikTok account (a test account, not your real one)
4. Put a few sample drafts in `/drafts` so the reviewer can try Publish now without authoring content

Add these credentials to the audit form's "test account" section:

```
URL:      https://creator-os-delta.vercel.app
Email:    tiktok-review@creator-os-delta.vercel.app
Password: [whatever you set]
```

Tell reviewers to:
1. Log in
2. Connect TikTok (the test account)
3. Go to /drafts → click any draft → Publish now
4. Verify the post lands on TikTok with the caption pre-filled

---

## Code changes once approved

Once TikTok grants `video.publish`, two changes get the user the direct-post flow:

1. **Add `video.publish` to `TT_SCOPES`** in `src/lib/platforms/tiktok.ts` — existing users will need to reconnect once to grant it. New users get it automatically.

2. **Switch the publish endpoint** in `src/lib/platforms/tiktok-publish.ts`:
   - From: `POST /v2/post/publish/inbox/video/init/`
   - To:   `POST /v2/post/publish/video/init/` (note: no "inbox")
   - Add a `post_info` block with `title` (caption), `privacy_level`, `disable_duet`, `disable_comment`, `disable_stitch`.

I'll wire both changes the moment you tell me TikTok has approved the scope. No work for you until then.

---

## Common rejection reasons (avoid these)

- **Privacy / Terms URLs return 404** — TikTok bots check them. Create real pages.
- **Screencast doesn't show user flow** — make sure the OAuth grant + actual publish + the post appearing on TikTok are ALL in the video.
- **Demo uses a stock/copyrighted video** — record fresh content for the demo.
- **No way for reviewer to test** — the dedicated test account is critical.
- **Description sounds spammy** — keep the language plain and creator-focused, NOT "growth hacker" / "engagement booster" / etc.

---

## Submit checklist

- [ ] Screencast recorded (1-3 min, MP4, 1080p)
- [ ] Privacy + Terms pages live on the domain
- [ ] Test reviewer account created with sample drafts
- [ ] All form fields filled per copy above
- [ ] Submit through https://developers.tiktok.com → your app → Content Posting API
- [ ] Watch for approval email (1-4 weeks)
