/**
 * Seed days 32-36 into the daily_guides table from Notion hub content.
 * Run: npx tsx scripts/seed-notion-days-32-36.ts
 * Idempotent — uses upsert keyed on slug.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const guides = [
  {
    slug: "claude-token-cheat-sheet",
    title: "Claude Token Cheat Sheet — Cut Your Spend in Half",
    index: 32,
    hook: "POV: you keep hitting your Claude limit by Wednesday and you have no idea why.",
    script:
      "Claude doesn't charge you per message. It charges you per token. Long chat means Claude re-reading a novel before answering, and your limit melts fast. Here are the 3 habits I use to stretch one Claude subscription way further. One — pick the right model. Opus burns your limit five times faster than Sonnet. Default to Sonnet for ninety percent of work. Two — squeeze long chats before they squeeze you. When a chat feels slow, paste the summary handoff prompt, copy the output, new chat. Same context, fraction of the tokens. Three — new topic equals new chat. If you're working on captions and then ask Claude for a sales email, don't do it in the same chat. Every message after the switch drags the entire caption thread with it. Pure token waste. Save this. Send to the friend who's been crying about hitting their Claude limit by Tuesday.",
    caption:
      "Claude doesn't charge you per message. It charges you per token — every word in your chat, plus every word it has to re-read each time you hit send.\n\nLong chat = Claude re-reading a novel before answering = your limit melting fast.\n\nHere are the 3 habits I use to stretch ONE Claude subscription way further 👇\n\n1. Pick the right model 🎯\nOpus burns through your weekly limit ~5x faster than Sonnet. Default to Sonnet for 90% of work. Only switch to Opus for the actually hard stuff.\n\n2. Squeeze long chats before they squeeze you ✂️\nWhen a chat feels slow, paste: \"Summarise this whole conversation into bullets I can paste into a fresh chat.\" Copy. New chat. Same context, fraction of the tokens.\n\n3. New topic = new chat 🪟\nIf you're working on captions and then ask Claude for a sales email, don't do it in the same chat. Every message after the switch drags the entire caption thread with it. Pure token waste.\n\nSave this. Send to the friend who's been crying about hitting their Claude limit by Tuesday 💛\n\n💌 Comment CHEATSHEET below and I'll DM you the full Notion (model chart + checklist + my exact prompts).\nFollow @earnaihub for daily AI tips that save you time, money + energy ✨",
    hashtags: [
      "#claudeai", "#claudetips", "#aitools", "#aitipsandtricks",
      "#aitipsforbeginners", "#promptengineering", "#aiproductivity",
      "#chatgptvsclaude", "#aiforcreators", "#aiforbusiness", "#anthropic",
      "#aihacks", "#aicheatsheet", "#contentcreatorlife", "#digitalcreator",
      "#womenintech", "#aiforwomen", "#solopreneur", "#onlinebusinesstips",
      "#productivityhacks", "#worksmarternotharder", "#techtips",
      "#aiworkflow", "#earnaihub", "#claudecode",
    ],
    manychatKeyword: "CHEATSHEET",
  },
  {
    slug: "7-claude-skills-creative-teams",
    title: "7 Claude Skills for Creative Teams",
    index: 33,
    hook: "7 Claude skills are running my entire content engine — research, writing, video, audio, ads, AND memory. I'm giving you the full setup. 👇",
    script:
      "This is the actual stack running behind my content. Not a vibe list — every install command, every API key. One — Voice DNA. Reads ten to twenty of your posts and extracts a reusable voice profile. Install this first. Every other skill reads it. Two — Content Engine. One pillar piece in, eight platform-ready formats out. Three — Deep Research. Tavily-powered. Cited brief plus five ready-to-film angles. Four — Competitor Ads Extractor. Pulls every active Meta and LinkedIn ad your competitors are running. Five — Remotion Video. Finished MP4 from a script. Six — ElevenLabs Podcast. Long-form post in, two-host podcast episode out. Seven — Supermemory. The one I forgot in the reel. Saves everything across sessions. If you only do one today — install Voice DNA. It multiplies every other skill.",
    caption:
      "This is the actual stack running behind my content. Not a vibe list — every install command, every API key, every SKILL.md 👇\n\n1. Voice DNA 🧬 — reads 10-20 of your posts and extracts a reusable voice profile. Install this FIRST. Every other skill reads it. (Free.)\n\n2. Content Engine ✍️ — one pillar piece in, 8 platform-ready formats out. Reads your Voice DNA. (Free.)\n\n3. Deep Research 🔍 — Tavily-powered. Cited brief + 5 ready-to-film angles. No hallucinated sources. (Free tier covers solo use.)\n\n4. Competitor Ads Extractor 🕵️ — pulls every active Meta + LinkedIn ad your competitors are running. Diffs week-over-week. ($39/mo Apify.)\n\n5. Remotion Video 🎬 — finished MP4 from a script. Text animations, brand colours. (Free.)\n\n6. ElevenLabs Podcast 🎙️ — long-form post in, two-host podcast episode out. ($22/mo.)\n\n7. Supermemory 🧠 — the one I forgot in the reel. Saves everything across sessions. (Free tier.)\n\nTotal at solo creator volume: ~$80-120/mo. Replaces about 5x that in SaaS.\n\nIf you only do ONE today: install Voice DNA. It multiplies every other skill.\n\nSave this. Send to the friend who keeps saying they don't have time to make content 💛\n\n💌 Comment CREATIVE below and I'll send you the full Notion (7 SKILL.md files + every install command + the API keys list).\nFollow @earnaihub for daily AI tips that save you time, money + energy ✨",
    hashtags: [
      "#claudeai", "#claudeskills", "#aitools", "#aiforcreators",
      "#contentcreatorlife", "#aiproductivity", "#aicontentcreation",
      "#promptengineering", "#anthropic", "#aiworkflow", "#aiautomation",
      "#creatoreconomy", "#digitalcreator", "#marketingwithai",
      "#aicheatsheet", "#aiforbusiness", "#solopreneur", "#aihacks",
      "#aiagents", "#elevenlabs", "#remotion", "#tavily", "#supermemory",
      "#earnaihub", "#aitipsandtricks",
    ],
    manychatKeyword: "CREATIVE",
  },
  {
    slug: "instagram-carousel-generator",
    title: "Instagram Carousel Generator — Claude Project Prompt",
    index: 34,
    hook: "I haven't opened Canva in 6 weeks. This one Claude project turns a single sentence into a fully designed, swipeable Instagram carousel — 1080×1350, export-ready, every time. 👇",
    script:
      "Nobody told you Claude can design carousels, not just write the captions. I built a Claude project — not a chat, a project — that takes one sentence like three ways to use Claude for content planning and spits out a fully designed seven-slide carousel. It builds at Instagram's exact dimensions so you can post straight from the export. It derives a full six-color palette from your one brand color. It picks a heading plus body font pairing from Google Fonts based on your vibe. It alternates light and dark slides so the swipe-through has actual rhythm. Setup is two minutes. Claude dot AI, Projects, New Project, paste the system prompt, save. From then on you just type your topic. Don't like slide four? Just say change slide four headline to X and it patches only that slide.",
    caption:
      "Nobody told you Claude can DESIGN carousels, not just write the captions 👀\n\nI built a Claude project (not a chat — a project) that takes one sentence like \"3 ways to use Claude for content planning\" and spits out a fully designed 7-slide carousel.\n\nHere's what it does:\n✅ Builds at Instagram's exact dimensions (1080×1350)\n✅ Derives a full 6-color palette from your ONE brand color\n✅ Picks a heading + body font pairing from Google Fonts\n✅ Alternates light + dark slides for visual rhythm\n✅ Bakes the progress bar + swipe arrow INTO each slide\n✅ Has a Playwright export script built in\n\nSetup is 2 minutes:\n1. Claude.ai → Projects → New Project\n2. Name it \"Instagram Carousel\"\n3. Paste the system prompt into the project instructions\n4. Save\n\nFrom then on you just type your topic. Don't like slide 4? Just say \"change slide 4 headline to X\" and it patches only that slide.\n\nThis is the exact prompt I use 👇\n\n💌 Comment CAROUSEL below and I'll send you the full Notion (the entire project prompt + the Playwright export script).\nFollow @earnaihub for daily AI tips that save you time, money + energy ✨",
    hashtags: [
      "#claudeai", "#claudeprojects", "#aitools", "#instagramcarousel",
      "#carouseldesign", "#aiforcreators", "#contentcreatorlife",
      "#aiproductivity", "#aicontentcreation", "#promptengineering",
      "#anthropic", "#aidesign", "#instagramcontent", "#contentmarketing",
      "#digitalcreator", "#marketingwithai", "#replacingcanva",
      "#canvaalternative", "#aihacks", "#aicheatsheet", "#aiforbusiness",
      "#aiworkflow", "#solopreneur", "#earnaihub", "#aitipsandtricks",
    ],
    manychatKeyword: "CAROUSEL",
  },
  {
    slug: "claude-full-time-designer",
    title: "Turn Claude Into Your Full-Time Designer",
    index: 35,
    hook: "6 free Claude skills just replaced my designer. Real landing pages. Real .pptx decks. Real PDFs. From one chat. 👇",
    script:
      "Nobody told you Claude could design, not just write. These are the six free skills that turn Claude into a full-time designer. Real outputs, not text shaped like slides, from one chat. One — UI-UX Pro Max. 161 design rules, 67 UI styles, 161 color palettes, 57 font pairings. Best for landing pages and sales pages. Two — App Store Design. Production-ready App Store and Play Store screenshots. Three — PPTX. Official Anthropic skill. Generates real dot-pptx files. Four — PDF. Lead magnets, swipe files, prompt packs, client deliverables. Pays for your Claude sub on day one. Five — GStack. Built by Garry Tan, President of Y Combinator. 23 slash commands. Six — Skill Creator. The unlock. Builds custom Claude skills for any workflow you repeat. My honest take — start with Skill Creator plus PDF. Everything else can wait.",
    caption:
      "Nobody told you Claude could DESIGN, not just write 👀\n\nThese are the 6 free skills that turn Claude into a full-time designer. Real outputs — not text shaped like slides — from ONE chat.\n\n1. UI-UX Pro Max 🎨 — 161 design rules, 67 UI styles, 161 color palettes, 57 font pairings. Best for landing pages + sales pages.\n\n2. App Store Design 📱 — production-ready App Store + Play Store screenshots.\n\n3. PPTX (PowerPoint) 📊 — official Anthropic skill. Generates REAL .pptx files.\n\n4. PDF 📄 — official Anthropic skill. Lead magnets, swipe files, prompt packs. Pays for your Claude sub on day 1.\n\n5. GStack ⚡ — built by Garry Tan (President of Y Combinator). 23 slash commands.\n\n6. Skill Creator 🔑 — the unlock. Builds CUSTOM Claude skills for any workflow you repeat.\n\nMy honest take: start with Skill Creator + PDF. Everything else can wait.\n\nSkill Creator unlocks the rest. PDF pays for your sub on day one.\n\nSave this. Send to the friend who's still paying Canva $15/mo 💛\n\n💌 Comment DESIGNER below and I'll send you the full Notion (install commands for all 6 + which 2 to start with).\nFollow @earnaihub for daily AI tips that save you time, money + energy ✨",
    hashtags: [
      "#claudeai", "#claudeskills", "#aitools", "#aidesign", "#aiforcreators",
      "#aiproductivity", "#aicontentcreation", "#promptengineering",
      "#anthropic", "#aiworkflow", "#aiautomation", "#landingpagedesign",
      "#powerpointdesign", "#pdfdesign", "#leadmagnet", "#marketingwithai",
      "#canvaalternative", "#figmaalternative", "#aiforbusiness",
      "#solopreneur", "#digitalmarketing", "#aihacks", "#aicheatsheet",
      "#earnaihub", "#aimarketingsociety",
    ],
    manychatKeyword: "DESIGNER",
  },
  {
    slug: "100-secret-claude-codes",
    title: "100 Secret Claude Codes — The Cheat Sheet",
    index: 36,
    hook: "I found 100 secret codes you can type into Claude that completely change what it gives you back. Like cheat codes in a video game. Here are the 5 that changed everything for me. 👇",
    script:
      "I found 100 secret codes you can type into Claude that completely change what it gives you back. Think cheat codes in a video game — same Claude, different mode. Here are the five that changed everything for me. One — GHOST. Humanises Claude's output. No em-dashes, no in conclusion, no AI tells. Pastes through AI detectors clean. Two — ARTIFACTS. Drop this after your prompt and Claude builds a working app, game, dashboard, or interactive tool live inside the chat. Three — OODA. Runs the military Observe Orient Decide Act decision loop on your problem and tells you exactly what to do next. Four — L99. Top one percent senior expert mode. Twenty plus years of experience, no hand-holding. Five — GODMODE. Unlocks Claude's most aggressive, comprehensive, no-holds-barred response. The real cheat code? Stack them. Ghost plus L99 is my weekly LinkedIn move — expert-level depth, zero AI tells.",
    caption:
      "I found 100 secret codes you can type into Claude that completely change what it gives you back 🤯\n\nLike cheat codes in a video game — same Claude, different mode.\n\nHere are the 5 that changed everything for me:\n\n1. /GHOST — humanises Claude's output. No em-dashes, no \"in conclusion,\" no AI tells. Pastes through AI detectors clean.\n\n2. ARTIFACTS — drop this after your prompt and Claude builds a working app, game, or dashboard live inside the chat.\n\n3. OODA — runs the military Observe-Orient-Decide-Act decision loop. Tells you exactly what to do next.\n\n4. L99 — top-1% senior expert mode. 20+ years of experience, no hand-holding.\n\n5. /GODMODE — unlocks Claude's most aggressive, comprehensive response. Use sparingly 🔥\n\nThe REAL cheat code? Stack them.\n/GHOST + L99 = expert-level depth, zero AI tells. That's my weekly LinkedIn move.\n\nFull list of all 100 in my Notion 👇\n\n💌 Comment CODES below and I'll DM you the full cheat sheet (all 100 codes, organised by category, with stacking combos).\nFollow @earnaihub for daily AI tips that save you time, money + energy ✨",
    hashtags: [
      "#claudeai", "#claudetips", "#claudecodes", "#aitools",
      "#aitipsandtricks", "#promptengineering", "#aihacks", "#aicheatsheet",
      "#aiforcreators", "#aiproductivity", "#anthropic", "#chatgptvsclaude",
      "#aiforbeginners", "#contentcreatorlife", "#digitalcreator",
      "#womenintech", "#aiforwomen", "#solopreneur", "#onlinebusinesstips",
      "#worksmarternotharder", "#techtips", "#aiworkflow", "#aiforbusiness",
      "#earnaihub", "#aitipsforbeginners",
    ],
    manychatKeyword: "CODES",
  },
];

async function main() {
  let upserted = 0;
  for (const g of guides) {
    await prisma.dailyGuide.upsert({
      where: { slug: g.slug },
      update: {
        title: g.title,
        index: g.index,
        hook: g.hook,
        script: g.script,
        caption: g.caption,
        hashtags: g.hashtags,
        manychatKeyword: g.manychatKeyword,
      },
      create: {
        slug: g.slug,
        title: g.title,
        index: g.index,
        hook: g.hook,
        script: g.script,
        caption: g.caption,
        hashtags: g.hashtags,
        manychatKeyword: g.manychatKeyword,
        body: "",
        videoPrompt: "",
        isPublished: false,
      },
    });
    upserted++;
    console.log(`✅ Day ${g.index}: ${g.title} (${g.slug})`);
  }
  console.log(`\nDone — ${upserted} guides upserted.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
