/**
 * Demo mode — hardcoded sample data so the UI looks alive without any DB or
 * API keys. Toggle with DEMO_MODE=true in .env.local.
 */

import type { MorningBrief } from "./brief";

export const DEMO = process.env.DEMO_MODE === "true";

export const demoAccounts = [
  {
    platform: "INSTAGRAM" as const,
    username: "yourname",
    displayName: "Your Name",
    lastSyncedAt: new Date(Date.now() - 12 * 60_000),
  },
  {
    platform: "YOUTUBE" as const,
    username: "yourname",
    displayName: "Your Name",
    lastSyncedAt: new Date(Date.now() - 48 * 60_000),
  },
  {
    platform: "TIKTOK" as const,
    username: "yourname",
    displayName: "Your Name",
    lastSyncedAt: new Date(Date.now() - 6 * 60_000),
  },
];

export const demoCounts = {
  postCount: 47,
  totalViews: 1_284_300,
  totalLikes: 89_450,
  draftCount: 4,
  creatorCount: 6,
};

// Deterministic seeded PRNG so the same demo data appears every time.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export const demoFollowerGrowth = (() => {
  const rand = seeded(42);
  const out: { date: string; followers: number }[] = [];
  let f = 8200;
  for (let i = 60; i >= 0; i--) {
    f += Math.round((rand() - 0.3) * 80) + 25;
    out.push({
      date: new Date(Date.now() - i * 86400_000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      followers: f,
    });
  }
  return out;
})();

export const demoBestTime: { hour: number; avgER: number }[] = (() => {
  const rand = seeded(7);
  return Array.from({ length: 24 }, (_, h) => {
    // Simulate a typical creator: peaks at 7-9am and 6-9pm
    const base = 1.0;
    const morning = 2.0 * Math.exp(-Math.pow(h - 8, 2) / 4);
    const evening = 3.2 * Math.exp(-Math.pow(h - 19, 2) / 5);
    return { hour: h, avgER: +(base + morning + evening + rand() * 0.3).toFixed(2) };
  });
})();

export const demoCompounding = [
  { a: "ai", b: "productivity", n: 4, avg_er: 8.4, lift: 2.7 },
  { a: "ai", b: "automation", n: 3, avg_er: 7.9, lift: 2.5 },
  { a: "agents", b: "workflow", n: 3, avg_er: 7.1, lift: 2.3 },
  { a: "ai", b: "writing", n: 5, avg_er: 6.8, lift: 2.2 },
  { a: "claude", b: "developer", n: 2, avg_er: 6.2, lift: 2.0 },
  { a: "automation", b: "saas", n: 2, avg_er: 5.6, lift: 1.8 },
];

export const demoBrief: MorningBrief = {
  generatedAt: new Date().toISOString(),
  trendingTopics: [
    { topic: "ai voice agents", lift: 4.2, recentViews: 280_000 },
    { topic: "claude artifacts", lift: 3.8, recentViews: 156_000 },
    { topic: "n8n workflows", lift: 2.6, recentViews: 92_000 },
  ],
  viralPosts: [
    {
      handle: "matthewberman",
      platform: "YOUTUBE",
      hookText: "I built an AI agent that does my entire job",
      views: 412_000,
      url: "https://youtube.com/",
    },
    {
      handle: "rileybrown",
      platform: "INSTAGRAM",
      hookText: "This 1-prompt trick changes how I use Claude",
      views: 198_400,
      url: "https://instagram.com/",
    },
  ],
  bestPostHourToday: 19,
  recentNews: [
    {
      title: "Anthropic ships Claude 4.7 with 1M context",
      url: "https://www.anthropic.com/news",
      source: "anthropic.com",
    },
    {
      title: "OpenAI's new agent framework hits 50K stars in a week",
      url: "https://github.com/",
      source: "github.com",
    },
    {
      title: "How creators are using AI to 10x output",
      url: "https://example.com/article",
      source: "example.com",
    },
  ],
  summary:
    "AI voice agents are the breakout topic this week — competitor median views up 4.2× vs. last week. Your strongest concept pair is AI + productivity (2.7× your average). Post around 7pm tonight; that's where your engagement peaks. Two viral posts in your niche use a first-person 'I built this' hook — try one for tomorrow's video.",
};

export const demoPosts = [
  {
    id: "p1",
    platform: "YOUTUBE",
    mediaType: "SHORT",
    publishedAt: daysAgo(2),
    url: "https://youtube.com/",
    caption: "I built an AI that writes my emails for me. Here's how.",
    hookText: "Stop writing emails — train an AI to do it",
    thumbnailUrl: thumb("orange", "AI EMAIL"),
    views: 84_200,
    likes: 6_120,
    comments: 312,
    engagementRate: 7.6,
    hook: { id: "h1", pattern: "command" },
  },
  {
    id: "p2",
    platform: "INSTAGRAM",
    mediaType: "REEL",
    publishedAt: daysAgo(5),
    url: "https://instagram.com/",
    caption: "The 5-minute morning routine that changed everything for me.",
    hookText: "Your first 5 minutes decide your whole day",
    thumbnailUrl: thumb("pink", "MORNING"),
    views: 124_800,
    likes: 9_410,
    comments: 488,
    engagementRate: 8.0,
    hook: { id: "h2", pattern: "promise" },
  },
  {
    id: "p3",
    platform: "TIKTOK",
    mediaType: "VIDEO",
    publishedAt: daysAgo(8),
    url: "https://tiktok.com/",
    caption: "Most people use Claude wrong. Do this instead.",
    hookText: "Most people use Claude wrong",
    thumbnailUrl: thumb("purple", "CLAUDE"),
    views: 312_600,
    likes: 28_900,
    comments: 1_240,
    engagementRate: 9.6,
    hook: { id: "h3", pattern: "callout" },
  },
  {
    id: "p4",
    platform: "YOUTUBE",
    mediaType: "VIDEO",
    publishedAt: daysAgo(12),
    url: "https://youtube.com/",
    caption: "Building a $10k/mo SaaS in one weekend with AI agents.",
    hookText: "$10k MRR in 48 hours, all from one prompt",
    thumbnailUrl: thumb("emerald", "$10K"),
    views: 198_300,
    likes: 14_200,
    comments: 891,
    engagementRate: 7.6,
    hook: { id: "h4", pattern: "stat" },
  },
  {
    id: "p5",
    platform: "INSTAGRAM",
    mediaType: "REEL",
    publishedAt: daysAgo(15),
    url: "https://instagram.com/",
    caption: "Why I stopped using ChatGPT after 2 years.",
    hookText: "I stopped using ChatGPT — here's what I use now",
    thumbnailUrl: thumb("amber", "WHY?"),
    views: 92_100,
    likes: 7_840,
    comments: 612,
    engagementRate: 9.2,
    hook: { id: "h5", pattern: "controversy" },
  },
  {
    id: "p6",
    platform: "TIKTOK",
    mediaType: "VIDEO",
    publishedAt: daysAgo(20),
    url: "https://tiktok.com/",
    caption: "Three Claude features nobody talks about.",
    hookText: "Three Claude features nobody talks about",
    thumbnailUrl: thumb("blue", "3 TIPS"),
    views: 156_700,
    likes: 12_400,
    comments: 720,
    engagementRate: 8.4,
    hook: { id: "h6", pattern: "numbered" },
  },
];

export const demoHooks = [
  { id: "h3", text: "Most people use Claude wrong", pattern: "callout", uses: 4, avg_er: 9.6, best_views: 312_600 },
  { id: "h5", text: "I stopped using ChatGPT — here's what I use now", pattern: "controversy", uses: 2, avg_er: 9.2, best_views: 92_100 },
  { id: "h6", text: "Three Claude features nobody talks about", pattern: "numbered", uses: 3, avg_er: 8.4, best_views: 156_700 },
  { id: "h2", text: "Your first 5 minutes decide your whole day", pattern: "promise", uses: 3, avg_er: 8.0, best_views: 124_800 },
  { id: "h1", text: "Stop writing emails — train an AI to do it", pattern: "command", uses: 2, avg_er: 7.6, best_views: 84_200 },
  { id: "h4", text: "$10k MRR in 48 hours, all from one prompt", pattern: "stat", uses: 1, avg_er: 7.6, best_views: 198_300 },
  { id: "h7", text: "What if you never wrote another line of code", pattern: "question", uses: 2, avg_er: 6.8, best_views: 65_300 },
  { id: "h8", text: "I gave Claude my full inbox. Then this happened.", pattern: "story", uses: 1, avg_er: 6.4, best_views: 41_200 },
];

export const demoCreators = [
  { id: "c1", handle: "matthewberman", platform: "YOUTUBE", displayName: "Matthew Berman", niche: "ai", lastScrapedAt: hoursAgo(3), _count: { posts: 18 } },
  { id: "c2", handle: "rileybrown", platform: "INSTAGRAM", displayName: "Riley Brown", niche: "ai", lastScrapedAt: hoursAgo(5), _count: { posts: 24 } },
  { id: "c3", handle: "alexhormozi", platform: "TIKTOK", displayName: "Alex Hormozi", niche: "business", lastScrapedAt: hoursAgo(8), _count: { posts: 31 } },
  { id: "c4", handle: "yossarian", platform: "YOUTUBE", displayName: "Yossarian", niche: "ai", lastScrapedAt: hoursAgo(11), _count: { posts: 12 } },
  { id: "c5", handle: "_jasonzhou", platform: "TIKTOK", displayName: "Jason Zhou", niche: "ai", lastScrapedAt: hoursAgo(2), _count: { posts: 28 } },
  { id: "c6", handle: "thealexbanks", platform: "INSTAGRAM", displayName: "Alex Banks", niche: "ai", lastScrapedAt: hoursAgo(14), _count: { posts: 19 } },
];

export const demoVelocity = [
  { topic: "ai voice agents", recent_views: 280_000, prior_views: 67_000, n_recent: 14, lift: 4.2 },
  { topic: "claude artifacts", recent_views: 156_000, prior_views: 41_000, n_recent: 9, lift: 3.8 },
  { topic: "browser automation", recent_views: 124_000, prior_views: 38_000, n_recent: 7, lift: 3.3 },
  { topic: "n8n workflows", recent_views: 92_000, prior_views: 35_000, n_recent: 11, lift: 2.6 },
  { topic: "vibe coding", recent_views: 88_000, prior_views: 36_000, n_recent: 8, lift: 2.4 },
  { topic: "claude code", recent_views: 76_000, prior_views: 38_000, n_recent: 12, lift: 2.0 },
];

export const demoViralPosts = [
  {
    id: "vp1",
    platform: "YOUTUBE",
    publishedAt: daysAgo(2),
    caption: "I built an AI agent that does my entire job — here's the prompt.",
    hookText: "I built an AI agent that does my entire job",
    views: 412_000,
    likes: 28_400,
    comments: 1_840,
    isViral: true,
    url: "https://youtube.com/",
    creator: { handle: "matthewberman", platform: "YOUTUBE", displayName: "Matthew Berman", profileImage: null },
  },
  {
    id: "vp2",
    platform: "INSTAGRAM",
    publishedAt: daysAgo(3),
    caption: "This 1-prompt trick changes how I use Claude.",
    hookText: "This 1-prompt trick changes how I use Claude",
    views: 198_400,
    likes: 14_900,
    comments: 612,
    isViral: true,
    url: "https://instagram.com/",
    creator: { handle: "rileybrown", platform: "INSTAGRAM", displayName: "Riley Brown", profileImage: null },
  },
  {
    id: "vp3",
    platform: "TIKTOK",
    publishedAt: daysAgo(4),
    caption: "Stop hiring developers. Do this instead.",
    hookText: "Stop hiring developers",
    views: 184_200,
    likes: 16_300,
    comments: 1_240,
    isViral: true,
    url: "https://tiktok.com/",
    creator: { handle: "_jasonzhou", platform: "TIKTOK", displayName: "Jason Zhou", profileImage: null },
  },
  {
    id: "vp4",
    platform: "YOUTUBE",
    publishedAt: daysAgo(5),
    caption: "The Claude prompt that broke my brain.",
    hookText: "The Claude prompt that broke my brain",
    views: 142_800,
    likes: 11_200,
    comments: 894,
    isViral: true,
    url: "https://youtube.com/",
    creator: { handle: "yossarian", platform: "YOUTUBE", displayName: "Yossarian", profileImage: null },
  },
  {
    id: "vp5",
    platform: "INSTAGRAM",
    publishedAt: daysAgo(1),
    caption: "I made $40k last month using only Claude. Here's the system.",
    hookText: "I made $40k last month using only Claude",
    views: 524_000,
    likes: 42_100,
    comments: 2_890,
    isViral: true,
    url: "https://instagram.com/",
    creator: { handle: "alexhormozi", platform: "INSTAGRAM", displayName: "Alex Hormozi", profileImage: null },
  },
  {
    id: "vp6",
    platform: "TIKTOK",
    publishedAt: daysAgo(2),
    caption: "Most AI courses are scams. Watch this instead.",
    hookText: "Most AI courses are scams",
    views: 386_400,
    likes: 31_800,
    comments: 4_240,
    isViral: true,
    url: "https://tiktok.com/",
    creator: { handle: "thealexbanks", platform: "TIKTOK", displayName: "Alex Banks", profileImage: null },
  },
  {
    id: "vp7",
    platform: "YOUTUBE",
    publishedAt: daysAgo(6),
    caption: "Cursor vs Claude Code: I tested both for 30 days.",
    hookText: "Cursor vs Claude Code — 30 days later",
    views: 268_900,
    likes: 19_400,
    comments: 1_320,
    isViral: true,
    url: "https://youtube.com/",
    creator: { handle: "matthewberman", platform: "YOUTUBE", displayName: "Matthew Berman", profileImage: null },
  },
  {
    id: "vp8",
    platform: "INSTAGRAM",
    publishedAt: daysAgo(3),
    caption: "She built a $120k/year SaaS with no code. Here's how.",
    hookText: "She built a $120k/yr SaaS with no code",
    views: 312_700,
    likes: 24_800,
    comments: 1_890,
    isViral: true,
    url: "https://instagram.com/",
    creator: { handle: "rileybrown", platform: "INSTAGRAM", displayName: "Riley Brown", profileImage: null },
  },
  {
    id: "vp9",
    platform: "TIKTOK",
    publishedAt: daysAgo(4),
    caption: "POV: you finally figured out Claude artifacts.",
    hookText: "POV: you finally figured out Claude artifacts",
    views: 247_300,
    likes: 22_100,
    comments: 1_640,
    isViral: true,
    url: "https://tiktok.com/",
    creator: { handle: "_jasonzhou", platform: "TIKTOK", displayName: "Jason Zhou", profileImage: null },
  },
  {
    id: "vp10",
    platform: "YOUTUBE",
    publishedAt: daysAgo(5),
    caption: "The 5-tool stack that runs my entire one-person business.",
    hookText: "The 5-tool stack running my whole business",
    views: 219_800,
    likes: 16_700,
    comments: 1_120,
    isViral: true,
    url: "https://youtube.com/",
    creator: { handle: "yossarian", platform: "YOUTUBE", displayName: "Yossarian", profileImage: null },
  },
  {
    id: "vp11",
    platform: "INSTAGRAM",
    publishedAt: daysAgo(2),
    caption: "Why I deleted ChatGPT yesterday.",
    hookText: "Why I deleted ChatGPT yesterday",
    views: 178_500,
    likes: 14_200,
    comments: 2_410,
    isViral: true,
    url: "https://instagram.com/",
    creator: { handle: "thealexbanks", platform: "INSTAGRAM", displayName: "Alex Banks", profileImage: null },
  },
  {
    id: "vp12",
    platform: "TIKTOK",
    publishedAt: daysAgo(6),
    caption: "Three Claude features 99% of people miss.",
    hookText: "Three Claude features 99% of people miss",
    views: 164_200,
    likes: 13_900,
    comments: 940,
    isViral: true,
    url: "https://tiktok.com/",
    creator: { handle: "alexhormozi", platform: "TIKTOK", displayName: "Alex Hormozi", profileImage: null },
  },
];

// ─── Viral posts discovered in the niche (broader than your watchlist) ───
// In production these come from hashtag/topic-level scraping (Apify hashtag
// actors for IG/TT, YouTube search) rather than per-creator scraping.

export const demoNicheViral = [
  {
    id: "nv1",
    handle: "ai_explained",
    platform: "TIKTOK",
    publishedAt: hoursAgo(14),
    hookText: "AI just learned to use a computer better than you",
    caption: "Anthropic's computer-use agent finally went mainstream. This is wild.",
    views: 1_240_000,
    likes: 142_000,
    comments: 8_900,
    thumbnailUrl: thumb("orange", "AI"),
    url: "https://tiktok.com/",
    discoveredVia: "#ai",
  },
  {
    id: "nv2",
    handle: "openai",
    platform: "INSTAGRAM",
    publishedAt: hoursAgo(28),
    hookText: "We just shipped this. You won't believe it.",
    caption: "GPT can now book flights, send emails, and manage your calendar autonomously.",
    views: 894_000,
    likes: 78_300,
    comments: 4_120,
    thumbnailUrl: thumb("emerald", "GPT"),
    url: "https://instagram.com/",
    discoveredVia: "#aiagents",
  },
  {
    id: "nv3",
    handle: "dailydevtips",
    platform: "TIKTOK",
    publishedAt: daysAgo(2),
    hookText: "I fired my entire dev team. Here's why.",
    caption: "Claude Code does 80% of what 5 engineers used to do.",
    views: 612_000,
    likes: 48_900,
    comments: 12_400,
    thumbnailUrl: thumb("purple", "FIRED"),
    url: "https://tiktok.com/",
    discoveredVia: "#claudecode",
  },
  {
    id: "nv4",
    handle: "indiehackers",
    platform: "YOUTUBE",
    publishedAt: daysAgo(2),
    hookText: "She built a $50k MRR SaaS in 30 days using only Cursor",
    caption: "Solo founder, no team, no funding. The full breakdown.",
    views: 482_000,
    likes: 38_400,
    comments: 2_840,
    thumbnailUrl: thumb("amber", "$50K"),
    url: "https://youtube.com/",
    discoveredVia: "#indiehacker",
  },
  {
    id: "nv5",
    handle: "voicelabs",
    platform: "INSTAGRAM",
    publishedAt: daysAgo(3),
    hookText: "This AI voice fooled my own mother",
    caption: "Voice cloning is now indistinguishable. Here's the demo.",
    views: 1_180_000,
    likes: 124_000,
    comments: 16_200,
    thumbnailUrl: thumb("pink", "VOICE"),
    url: "https://instagram.com/",
    discoveredVia: "#aivoice",
  },
  {
    id: "nv6",
    handle: "n8n_io",
    platform: "TIKTOK",
    publishedAt: daysAgo(4),
    hookText: "Replace 6 SaaS subscriptions with 1 n8n workflow",
    caption: "Free, self-hosted, and 10× more powerful.",
    views: 412_000,
    likes: 31_200,
    comments: 4_120,
    thumbnailUrl: thumb("blue", "n8n"),
    url: "https://tiktok.com/",
    discoveredVia: "#automation",
  },
  {
    id: "nv7",
    handle: "agentcoach",
    platform: "YOUTUBE",
    publishedAt: daysAgo(5),
    hookText: "The 4-prompt system that 10x'd my output",
    caption: "I tested this on 50 creators. The results shocked me.",
    views: 318_000,
    likes: 24_100,
    comments: 1_890,
    thumbnailUrl: thumb("indigo", "4×"),
    url: "https://youtube.com/",
    discoveredVia: "#productivity",
  },
  {
    id: "nv8",
    handle: "buildsomething",
    platform: "INSTAGRAM",
    publishedAt: daysAgo(6),
    hookText: "Stop 'learning AI'. Build with it.",
    caption: "Why most AI courses are wasting your time.",
    views: 284_000,
    likes: 21_800,
    comments: 3_410,
    thumbnailUrl: thumb("teal", "BUILD"),
    url: "https://instagram.com/",
    discoveredVia: "#aiforcreators",
  },
  {
    id: "nv9",
    handle: "promptengineer",
    platform: "TIKTOK",
    publishedAt: hoursAgo(20),
    hookText: "I asked Claude to fire me — what it said was insane",
    caption: "Tried to get an AI to be honest about my replaceability.",
    views: 798_000,
    likes: 91_400,
    comments: 7_240,
    thumbnailUrl: thumb("orange", "FIRE"),
    url: "https://tiktok.com/",
    discoveredVia: "#claude",
  },
  {
    id: "nv10",
    handle: "agenticfuture",
    platform: "YOUTUBE",
    publishedAt: daysAgo(2),
    hookText: "The first fully-autonomous AI company just hit $1M ARR",
    caption: "Zero human employees. Run by 17 specialized agents.",
    views: 542_000,
    likes: 41_200,
    comments: 5_890,
    thumbnailUrl: thumb("emerald", "$1M"),
    url: "https://youtube.com/",
    discoveredVia: "#aiagents",
  },
  {
    id: "nv11",
    handle: "lovable",
    platform: "INSTAGRAM",
    publishedAt: daysAgo(2),
    hookText: "I shipped 7 apps in 24 hours. None of it I coded.",
    caption: "Lovable + Cursor + Claude = unstoppable.",
    views: 456_000,
    likes: 38_700,
    comments: 4_120,
    thumbnailUrl: thumb("pink", "7 APPS"),
    url: "https://instagram.com/",
    discoveredVia: "#vibecoding",
  },
  {
    id: "nv12",
    handle: "veo3official",
    platform: "TIKTOK",
    publishedAt: daysAgo(3),
    hookText: "Veo 3 just made Hollywood obsolete",
    caption: "60-second cinematic short, 100% AI generated.",
    views: 1_640_000,
    likes: 178_000,
    comments: 14_300,
    thumbnailUrl: thumb("indigo", "VEO 3"),
    url: "https://tiktok.com/",
    discoveredVia: "#aivideo",
  },
  {
    id: "nv13",
    handle: "cursor_ai",
    platform: "INSTAGRAM",
    publishedAt: daysAgo(4),
    hookText: "Why every junior dev is about to lose their job",
    caption: "Hot take: senior eng is an even better bet than ever.",
    views: 384_000,
    likes: 28_900,
    comments: 9_840,
    thumbnailUrl: thumb("amber", "JR DEV"),
    url: "https://instagram.com/",
    discoveredVia: "#cursor",
  },
  {
    id: "nv14",
    handle: "agentopsv2",
    platform: "YOUTUBE",
    publishedAt: daysAgo(4),
    hookText: "I built an AI that runs a Twitter account fully autonomously",
    caption: "It posts, replies, even DMs. 4 weeks zero intervention.",
    views: 326_000,
    likes: 22_400,
    comments: 3_180,
    thumbnailUrl: thumb("blue", "AUTO"),
    url: "https://youtube.com/",
    discoveredVia: "#aiagents",
  },
  {
    id: "nv15",
    handle: "claudecore",
    platform: "TIKTOK",
    publishedAt: daysAgo(5),
    hookText: "Claude 4.7 has a hidden mode nobody is talking about",
    caption: "Extended thinking + 1M context = god mode.",
    views: 712_000,
    likes: 84_200,
    comments: 6_420,
    thumbnailUrl: thumb("purple", "HIDDEN"),
    url: "https://tiktok.com/",
    discoveredVia: "#claude47",
  },
  {
    id: "nv16",
    handle: "thefutureislocal",
    platform: "INSTAGRAM",
    publishedAt: daysAgo(5),
    hookText: "Stop paying for ChatGPT — run it locally instead",
    caption: "Llama 3.3 on your MacBook = unlimited free AI.",
    views: 298_000,
    likes: 24_100,
    comments: 5_120,
    thumbnailUrl: thumb("teal", "LOCAL"),
    url: "https://instagram.com/",
    discoveredVia: "#localllm",
  },
  {
    id: "nv17",
    handle: "shipfastdude",
    platform: "TIKTOK",
    publishedAt: daysAgo(6),
    hookText: "$0 to $10k MRR in 3 weeks — no marketing",
    caption: "Built it with Claude, launched on PH, here's the playbook.",
    views: 412_000,
    likes: 36_800,
    comments: 4_840,
    thumbnailUrl: thumb("emerald", "$10K"),
    url: "https://tiktok.com/",
    discoveredVia: "#indiehacker",
  },
  {
    id: "nv18",
    handle: "elevenlabs",
    platform: "INSTAGRAM",
    publishedAt: daysAgo(6),
    hookText: "AI voices just crossed the uncanny valley",
    caption: "Listen to this. You'll never trust audio again.",
    views: 924_000,
    likes: 102_000,
    comments: 12_400,
    thumbnailUrl: thumb("orange", "VOICE"),
    url: "https://instagram.com/",
    discoveredVia: "#aivoice",
  },
];

// ─── Trending audio (TikTok / Instagram Reels) ───
// In production these come from TikTok Creative Center API or Apify trending
// sound scrapers + IG Reels audio scraping.

export const demoTrendingAudio = [
  {
    id: "a1",
    title: "Espresso (sped up)",
    artist: "Sabrina Carpenter",
    platform: "TIKTOK",
    postsUsing: 184_000,
    growth: 320, // % week-over-week
    duration: 15,
    cover: thumb("pink", "♪"),
    category: "pop",
    fitsNiche: true,
  },
  {
    id: "a2",
    title: "Original sound — @ai_explained",
    artist: "@ai_explained",
    platform: "TIKTOK",
    postsUsing: 92_400,
    growth: 480,
    duration: 22,
    cover: thumb("orange", "♬"),
    category: "voice meme",
    fitsNiche: true,
  },
  {
    id: "a3",
    title: "Suno-generated 'Late Night Lo-Fi'",
    artist: "AI Producer",
    platform: "INSTAGRAM",
    postsUsing: 41_200,
    growth: 612,
    duration: 30,
    cover: thumb("indigo", "lo-fi"),
    category: "lo-fi",
    fitsNiche: true,
  },
  {
    id: "a4",
    title: "Good Luck, Babe!",
    artist: "Chappell Roan",
    platform: "INSTAGRAM",
    postsUsing: 312_000,
    growth: 84,
    duration: 18,
    cover: thumb("purple", "♪"),
    category: "pop",
    fitsNiche: false,
  },
  {
    id: "a5",
    title: "Original sound — @dailydevtips",
    artist: "@dailydevtips",
    platform: "TIKTOK",
    postsUsing: 38_800,
    growth: 1240,
    duration: 12,
    cover: thumb("emerald", "</>"),
    category: "tech voice",
    fitsNiche: true,
  },
  {
    id: "a6",
    title: "Riff — That cinematic build",
    artist: "Hans Zimmer-style",
    platform: "TIKTOK",
    postsUsing: 124_000,
    growth: 220,
    duration: 20,
    cover: thumb("amber", "🎬"),
    category: "cinematic",
    fitsNiche: true,
  },
  {
    id: "a7",
    title: "Mona Lisa (slowed)",
    artist: "Lola Young",
    platform: "TIKTOK",
    postsUsing: 89_200,
    growth: 156,
    duration: 16,
    cover: thumb("blue", "♪"),
    category: "alt pop",
    fitsNiche: false,
  },
  {
    id: "a8",
    title: "AI explainer beat",
    artist: "@beatmaker",
    platform: "INSTAGRAM",
    postsUsing: 28_400,
    growth: 412,
    duration: 25,
    cover: thumb("teal", "♬"),
    category: "explainer",
    fitsNiche: true,
  },
];

export const demoNews = [
  {
    id: "n1",
    title: "Anthropic ships Claude 4.7 with 1M context window",
    url: "https://www.anthropic.com/news",
    source: "anthropic.com",
    publishedAt: hoursAgo(8),
    summary: "Claude 4.7 supports 1 million tokens of context with maintained accuracy across the full window.",
  },
  {
    id: "n2",
    title: "OpenAI's new agent framework hits 50K stars in a week",
    url: "https://github.com/",
    source: "github.com",
    publishedAt: hoursAgo(22),
    summary: "Developers are flocking to the new agent SDK with built-in tool use and memory primitives.",
  },
  {
    id: "n3",
    title: "How AI creators are 10x'ing their output",
    url: "https://example.com/article-1",
    source: "creatoreconomy.com",
    publishedAt: daysAgo(2),
    summary: "Top AI creators are generating, filming, and editing entire short-form videos in under 10 minutes.",
  },
  {
    id: "n4",
    title: "Apify open-sources their TikTok scraper",
    url: "https://example.com/article-2",
    source: "apify.com",
    publishedAt: daysAgo(3),
    summary: "Free, unlimited TikTok scraping for research and analytics now available.",
  },
];

export const demoCompetitorPosts = [
  // Used on a creator's detail page. Same shape as demoViralPosts but more of them.
  ...demoViralPosts,
  {
    id: "cp5",
    platform: "YOUTUBE",
    publishedAt: daysAgo(7),
    caption: "Building agents with Claude — full tutorial",
    hookText: "If you can write English, you can build agents",
    views: 78_400,
    likes: 6_120,
    comments: 412,
    isViral: false,
    url: "https://youtube.com/",
    thumbnailUrl: thumb("indigo", "TUTORIAL"),
  },
  {
    id: "cp6",
    platform: "YOUTUBE",
    publishedAt: daysAgo(10),
    caption: "Claude vs ChatGPT — the honest comparison",
    hookText: "Claude vs ChatGPT — the honest comparison",
    views: 64_200,
    likes: 4_810,
    comments: 612,
    isViral: false,
    url: "https://youtube.com/",
    thumbnailUrl: thumb("teal", "VS"),
  },
];

export const demoHookVariants = [
  { text: "Stop hiring developers — train an AI agent instead", pattern: "command", predictedER: 8.4, similarHookIds: ["h1", "h3"], reasoning: "Strong command + controversy hook" },
  { text: "I gave Claude my entire inbox and didn't expect this", pattern: "story", predictedER: 7.8, similarHookIds: ["h8"], reasoning: "Personal story angle, curiosity gap" },
  { text: "Most people are using Claude completely wrong", pattern: "callout", predictedER: 7.2, similarHookIds: ["h3"], reasoning: "Mirrors your top hook structure" },
  { text: "Three Claude features that 10x your output", pattern: "numbered", predictedER: 6.8, similarHookIds: ["h6"], reasoning: "Numbered hooks consistently outperform" },
  { text: "What if your AI could do your entire job", pattern: "question", predictedER: 6.2, similarHookIds: ["h7"], reasoning: "Open-loop question style" },
  { text: "$10k in 48 hours with one Claude prompt", pattern: "stat", predictedER: 5.9, similarHookIds: ["h4"], reasoning: "Stat hook with concrete number" },
];

// ─── SCHEDULE / AUTOMATIONS ────────────────────────────────────

export type DemoScheduledItem = {
  id: string;
  scheduledAt: Date;
  hookText: string;
  caption: string;
  platforms: ("INSTAGRAM" | "TIKTOK" | "YOUTUBE")[];
  status: "SCHEDULED" | "DRAFT" | "PUBLISHING" | "PUBLISHED" | "FAILED";
  mediaType: "VIDEO" | "REEL" | "SHORT" | "IMAGE" | "TEXT";
};

export const demoScheduled: DemoScheduledItem[] = [
  {
    id: "s1",
    scheduledAt: scheduleAt(0, 19, 0), // today 7pm
    hookText: "Three Claude features 99% of people miss",
    caption: "Most people only use Claude for chat. Here's what they're missing.",
    platforms: ["TIKTOK", "INSTAGRAM"],
    status: "SCHEDULED",
    mediaType: "REEL",
  },
  {
    id: "s2",
    scheduledAt: scheduleAt(1, 9, 0),
    hookText: "I deleted ChatGPT. Here's what I use now.",
    caption: "After 2 years, I switched. The reason will surprise you.",
    platforms: ["INSTAGRAM"],
    status: "SCHEDULED",
    mediaType: "REEL",
  },
  {
    id: "s3",
    scheduledAt: scheduleAt(2, 19, 0),
    hookText: "$10k MRR in 30 days with one Claude prompt",
    caption: "Solo founder. No team. Here's the exact playbook.",
    platforms: ["YOUTUBE"],
    status: "SCHEDULED",
    mediaType: "VIDEO",
  },
  {
    id: "s4",
    scheduledAt: scheduleAt(4, 19, 0),
    hookText: "Stop hiring developers — train this AI agent instead",
    caption: "Walkthrough of an autonomous coding agent that actually works.",
    platforms: ["TIKTOK", "INSTAGRAM", "YOUTUBE"],
    status: "DRAFT",
    mediaType: "VIDEO",
  },
  {
    id: "s5",
    scheduledAt: scheduleAt(6, 9, 0),
    hookText: "POV: you finally figured out Claude artifacts",
    caption: "Visual demo of building something live in 30 seconds.",
    platforms: ["TIKTOK"],
    status: "DRAFT",
    mediaType: "REEL",
  },
  {
    id: "s6",
    scheduledAt: scheduleAt(7, 19, 0),
    hookText: "AI just made the coding interview obsolete",
    caption: "I tested it. Here's what that means for you.",
    platforms: ["TIKTOK", "INSTAGRAM"],
    status: "DRAFT",
    mediaType: "REEL",
  },
  {
    id: "s7",
    scheduledAt: scheduleAt(9, 19, 0),
    hookText: "The 4-prompt system that 10x'd my output",
    caption: "Full walkthrough of the workflow I use every single day.",
    platforms: ["YOUTUBE"],
    status: "DRAFT",
    mediaType: "VIDEO",
  },
];

export type DemoRecurringSlot = {
  id: string;
  label: string;
  dayMask: number[]; // 0=Sun..6=Sat
  hour: number;
  minute: number;
  platforms: ("INSTAGRAM" | "TIKTOK" | "YOUTUBE")[];
  active: boolean;
};

export const demoRecurringSlots: DemoRecurringSlot[] = [
  {
    id: "r1",
    label: "Prime time short — TikTok + IG Reel",
    dayMask: [1, 3, 5], // Mon/Wed/Fri
    hour: 19,
    minute: 0,
    platforms: ["TIKTOK", "INSTAGRAM"],
    active: true,
  },
  {
    id: "r2",
    label: "Morning thought — Instagram",
    dayMask: [2, 4], // Tue/Thu
    hour: 9,
    minute: 0,
    platforms: ["INSTAGRAM"],
    active: true,
  },
  {
    id: "r3",
    label: "Long-form weekly — YouTube",
    dayMask: [0], // Sun
    hour: 17,
    minute: 0,
    platforms: ["YOUTUBE"],
    active: true,
  },
  {
    id: "r4",
    label: "Saturday extras",
    dayMask: [6],
    hour: 11,
    minute: 0,
    platforms: ["TIKTOK"],
    active: false,
  },
];

export type DemoAutomation = {
  id: string;
  name: string;
  description: string;
  schedule: string; // cron-like description
  lastRunAt: Date;
  lastStatus: "success" | "failed" | "skipped";
  active: boolean;
  category: "ingestion" | "ai" | "publish" | "intel";
};

export const demoAutomations: DemoAutomation[] = [
  {
    id: "a1",
    name: "Sync my posts",
    description: "Pulls Instagram / YouTube / TikTok posts + metric snapshots from connected accounts.",
    schedule: "Every 6 hours",
    lastRunAt: hoursAgo(2),
    lastStatus: "success",
    active: true,
    category: "ingestion",
  },
  {
    id: "a2",
    name: "Scrape watched creators",
    description: "Daily scrape of all creators on your watchlist via Apify + YouTube API.",
    schedule: "Daily at 06:00",
    lastRunAt: hoursAgo(8),
    lastStatus: "success",
    active: true,
    category: "intel",
  },
  {
    id: "a3",
    name: "Niche news pull",
    description: "Tavily search for fresh articles in your niche; embeds for chat retrieval.",
    schedule: "Daily at 07:00",
    lastRunAt: hoursAgo(7),
    lastStatus: "success",
    active: true,
    category: "intel",
  },
  {
    id: "a4",
    name: "Morning brief",
    description: "Generates a daily one-paragraph briefing from velocity + viral + best-time + news.",
    schedule: "Daily at 07:00 CT",
    lastRunAt: hoursAgo(6),
    lastStatus: "success",
    active: true,
    category: "ai",
  },
  {
    id: "a5",
    name: "Recompute hook stats",
    description: "Rolls up average engagement + best post per hook in your library.",
    schedule: "Daily at 05:00",
    lastRunAt: hoursAgo(9),
    lastStatus: "success",
    active: true,
    category: "ai",
  },
  {
    id: "a6",
    name: "Publish due drafts",
    description: "Polls every 5 minutes for scheduled drafts whose time has come and publishes them.",
    schedule: "Every 5 minutes",
    lastRunAt: hoursAgo(0),
    lastStatus: "success",
    active: true,
    category: "publish",
  },
  {
    id: "a7",
    name: "Auto-flip viral creator posts",
    description: "When a watched creator hits viral velocity, auto-draft a flipped script via FlipIt.",
    schedule: "Triggered on viral detect",
    lastRunAt: hoursAgo(14),
    lastStatus: "success",
    active: false,
    category: "ai",
  },
  {
    id: "a8",
    name: "Refresh trending audio",
    description: "Pulls trending sounds from TikTok Creative Center + Apify.",
    schedule: "Every 12 hours",
    lastRunAt: hoursAgo(4),
    lastStatus: "success",
    active: true,
    category: "intel",
  },
];

function scheduleAt(daysFromNow: number, hour: number, minute: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export const demoChatAnswer = `Looking at your data, your strongest hook pattern is "callout" — your top hook ("Most people use Claude wrong") drove 9.6% engagement, well above your 7.4% average. The shared pattern: directly contradicting a perceived norm in the first 5 words.

Three of your top 5 posts open with a corrective claim. Your "story" hooks (e.g. "I gave Claude my full inbox") underperform — averaging 6.4%. That's a real gap.

For your next short, I'd lead with a callout pattern around AI voice agents (currently 4.2× lift in your niche). Something like "Most AI voice demos are completely fake" — uses your proven structure, rides the trending topic.`;

// ─── helpers ──────────────────────────────────────────────

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 86400_000);
}

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3_600_000);
}

function thumb(color: string, label: string): string {
  // Inline SVG data-URL — no network needed.
  const palette: Record<string, [string, string]> = {
    orange: ["#f97316", "#7c2d12"],
    pink: ["#ec4899", "#831843"],
    purple: ["#a855f7", "#581c87"],
    emerald: ["#10b981", "#064e3b"],
    amber: ["#f59e0b", "#78350f"],
    blue: ["#3b82f6", "#1e3a8a"],
    indigo: ["#6366f1", "#312e81"],
    teal: ["#14b8a6", "#134e4a"],
  };
  const [a, b] = palette[color] ?? palette.orange;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'><defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient></defs><rect width='320' height='180' fill='url(%23g)'/><text x='160' y='100' font-family='Inter,sans-serif' font-size='32' font-weight='800' fill='white' text-anchor='middle'>${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${svg.replace(/#/g, "%23")}`;
}
