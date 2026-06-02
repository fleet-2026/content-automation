/**
 * Add the LAUNCHEDPOST launch post to Creator OS tracker (Day 54).
 * Trigger keyword: OS.
 *
 * Sells LaunchedPost (launchedpost.com) — self-host one-time, $99.
 * The bot DMs the guide page; the guide body carries the buy button.
 * Swap [BUY_LINK] for the live Gumroad/checkout URL once it exists.
 *
 * Run: npx tsx scripts/add-launchedpost-launch.ts
 */
import { PrismaClient } from "@prisma/client";

const SLUG = "launchedpost-launch";
const KEYWORD = "OS";
const BUY_LINK = "https://www.launchedpost.com"; // swap for Gumroad checkout when live
const PRICE = "$99";

(async () => {
  const p = new PrismaClient();
  const existing = await p.dailyGuide.findUnique({ where: { slug: SLUG } });
  if (existing) {
    console.log(`[skip] LAUNCHEDPOST already exists: ${existing.id}`);
    await p.$disconnect();
    return;
  }

  const hook =
    "Every post you've watched me make runs through one dashboard I built myself.";

  const script = `Every post you've watched me make… runs through one dashboard I built myself.

A few months ago I was drowning. Captions in one tab. ManyChat in another. A scheduler I was paying for every month. Scripts screenshotted on my phone. I was spending more time managing content than actually making it.

So I did the thing I always do now — I opened Claude, and I started building. One piece at a time.

Now it writes my captions. Rates them A through F before they go out. Fixes the weak ones. Posts to my platforms. And when someone comments a keyword on my reel, it DMs them automatically. No ManyChat. It's all mine.

I never planned to sell it. But every week someone asks "what do you use to run all this?"

So I packaged it. It's called LaunchedPost. You deploy your own copy and own it forever — ${PRICE} once, not monthly.

Comment OS and I'll send you everything.`;

  const caption = `Every post you've watched me make runs through one dashboard I built myself 👇

A few months ago I was drowning.

Captions in one tab. ManyChat in another. A scheduler I paid for every month. Scripts screenshotted on my phone.

I was spending more time managing my content than making it.

So I did the thing I always do now — I opened Claude and started building. One piece at a time.

Now it:
✦ Writes my captions
✦ Rates them A–F before they post
✦ Fixes the weak ones automatically
✦ Posts to my platforms
✦ And auto-DMs anyone who comments a keyword (no ManyChat — it's all mine)

I never planned to sell it.

But every week someone asks "what do you actually use to run all this?"

So I packaged it. It's called LaunchedPost.

You deploy your own copy and own it forever — ${PRICE} once, not monthly. 🤍

Comment OS and the bot will send you everything.`;

  const responseText = `You said OS! Here it is 🤩

This is LaunchedPost — the exact dashboard I run my whole content engine on. Caption writing, A–F rating, auto-fix, multi-platform posting, and the keyword→DM bot that's messaging you right now.

You own your copy outright — ${PRICE} once, no monthly fee.

Tap the button below for everything. Any questions, just reply here 🤍`;

  const body = `# LaunchedPost — The Dashboard I Run My Content On

Every post you've seen me make runs through one place. I built it myself because I was drowning in tabs and tools that didn't talk to each other.

## What it does

- **Compose** — write your caption, drop in your media, done
- **Rate** — Claude scores your post A–F across 6 dimensions before it goes live
- **Fix** — one click and Claude rewrites the weak parts
- **Post** — publishes to your platforms in one shot
- **Schedule** — queue posts; a daily cron publishes them for you
- **History** — every post you've shipped, archived with its rating
- **Keyword bot** — someone comments your keyword → it auto-DMs them. No ManyChat. You own it.

## Why it's different

It's **yours**. You deploy your own copy, plug in your own accounts, and own it outright. No $40/month subscription that disappears if you stop paying. **${PRICE}, once.**

## Get it

👉 **[Get LaunchedPost — ${PRICE}](${BUY_LINK})**

Or comment **OS** on the launch post and the bot will DM you the link.`;

  const guide = await p.dailyGuide.create({
    data: {
      slug: SLUG,
      title: "Launching LaunchedPost — The Dashboard I Run My Content On",
      hook,
      script,
      caption,
      hashtags: [
        "#LaunchedPost",
        "#ClaudeAI",
        "#ContentSystem",
        "#AIWorkflow",
        "#ContentAutomation",
        "#Anthropic",
        "#AITools",
        "#CreatorEconomy",
        "#Solopreneur",
        "#BuildInPublic",
        "#AIForCreators",
        "#WomenInAI",
      ],
      manychatKeyword: KEYWORD,
      responseText,
      body,
      videoUrl: null,
      imageUrls: [],
      videoPrompt: "",
      sourceUrl: BUY_LINK,
      isPublished: true,
      source: "tracker",
      index: 54,
    },
  });

  console.log(`✓ LAUNCHEDPOST → ${guide.id}`);
  console.log(`  /daily-post/${guide.slug}`);
  console.log(`  /guides/${guide.slug}`);
  console.log(`  Day 54 in /tracker`);
  console.log(`  Keyword: ${KEYWORD} · Price: ${PRICE}`);
  console.log(`  ⚠ Swap BUY_LINK (${BUY_LINK}) for the Gumroad checkout when live.`);

  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
