// Full per-day content for the 30-day plan: the talking-head script, the
// complete social caption, hashtags, and the ManyChat DM auto-reply ("answer")
// that goes out when someone comments the day's keyword.
//
// plan.ts holds the short briefs (hook / on-screen / one-line caption). This
// file holds the finished, postable copy. seed.ts merges the two: a new plan
// guide is created pre-filled with this content, and backfillPlanContent()
// fills these fields into already-created plan rows that are still blank.

export type PlanContent = {
  /** Teleprompter-ready talking-head script: spoken hook → teach → spoken CTA. */
  script: string;
  /** Finished caption — written hook, structured body, and CTA. */
  caption: string;
  /** Hashtags, without the leading "#". */
  hashtags: string[];
  /** The DM the ManyChat bot replies with when someone comments the keyword. */
  dmReply: string;
};

// Themed hashtag sets reused across each module, kept tight (~12) so posts
// don't look spammy. A day can add one or two specific tags on top.
const TAGS_WEBSITE = [
  "claudecode", "buildwithai", "nocode", "webdesign", "aitools", "buildinpublic",
  "learntocode", "indiehacker", "sidehustle", "entrepreneur", "techtok", "codingforbeginners",
];
const TAGS_FUNNEL = [
  "claudecode", "marketingfunnel", "leadgeneration", "emailmarketing", "onlinebusiness",
  "salesfunnel", "digitalmarketing", "buildwithai", "entrepreneur", "sidehustle", "smallbusiness", "contentcreator",
];
const TAGS_APP = [
  "claudecode", "buildwithai", "appdevelopment", "saas", "indiehacker", "nocode",
  "startup", "buildinpublic", "softwaredevelopment", "techtok", "founder", "aitools",
];
const TAGS_GROW = [
  "claudecode", "buildinpublic", "startup", "indiehacker", "founder", "productlaunch",
  "saas", "entrepreneur", "growthhacking", "sidehustle", "marketing", "buildwithai",
];

export const PLAN_CONTENT: Record<string, PlanContent> = {
  // ───────────────────────── Module 1 · Website ─────────────────────────
  "30day-01-install-claude-code": {
    script:
      "You don't need to learn to code to build a website in 2026 — you just need to talk. I'm going to show you the exact tool I use: Claude Code. Step one — go to claude.com/code and install it. It's one line in your terminal and I'll walk you through it. Step two — make a new empty folder for your project and open it. Step three — type \"claude\" and hit enter. That's it. You now have an AI developer sitting inside your computer, ready to build whatever you describe. Tomorrow we tell it exactly what to make. If you want my free setup guide with the install steps and first prompts, comment BUILD and I'll DM it to you.",
    caption:
      "I built my entire website by typing in plain English. No bootcamp, no $5k developer. Here's Day 1 of 30 👇\n\nDay 1 is just getting set up:\n1️⃣ Install Claude Code (one line — I'll show you)\n2️⃣ Create an empty project folder\n3️⃣ Type \"claude\" and hit enter\n\nThat's it — you now have an AI developer living on your laptop. Tomorrow we describe the site and watch it appear.\n\nComment BUILD and I'll DM you the free setup guide 📩\nFollow for all 30 days.",
    hashtags: [...TAGS_WEBSITE, "30daychallenge", "aiwebsite"],
    dmReply:
      "Here's your free Claude Code setup guide 🚀 It's got the one-line install, how to open your first project, and the exact prompts I use on Day 1. Follow along with the whole 30-day build — and reply here if you get stuck, I read every message! 💬",
  },
  "30day-02-describe-your-site": {
    script:
      "Whatever website is in your head, you can describe it in three sentences and watch it appear. Here's the exact formula. Sentence one: what the site is and who it's for. Sentence two: the pages you want — home, about, contact. Sentence three: the vibe — modern, bold, minimal, whatever fits you. Paste that into Claude Code and hit enter. You're not designing, you're describing — the AI handles the rest. This one prompt is the difference between staring at a blank screen and having a real homepage in front of you. Comment PROMPT and I'll DM you the fill-in-the-blank template I use every time.",
    caption:
      "The 3-sentence prompt that turned my idea into a real homepage 👇\n\nThe formula:\n1️⃣ What it is + who it's for\n2️⃣ The pages you want\n3️⃣ The vibe (modern, bold, minimal…)\n\nPaste it into Claude Code, hit enter, watch it build. You're not designing — you're describing.\n\nComment PROMPT and I'll DM you the full template 📩\nDay 2 of 30 — follow for the rest.",
    hashtags: [...TAGS_WEBSITE, "promptengineering"],
    dmReply:
      "Here's the fill-in-the-blank prompt template 📝 Just swap in your business, your pages, and your vibe, paste it into Claude Code, and you'll have a homepage in minutes. Tag me when it builds — I'd love to see it! ✨",
  },
  "30day-03-generate-homepage": {
    script:
      "This is the moment a blank folder becomes an actual website on your screen. Yesterday you wrote the 3-sentence prompt — today you hit enter and watch it build. Claude Code writes every file, lays out the sections, adds placeholder text and buttons, and then you run one command to see it live on your laptop. The first time it loads, it genuinely feels illegal. If something looks off, you don't fix code — you just say \"make the header bigger\" or \"change this section to three columns\" and it updates. That's the whole loop: describe, look, refine. Follow so you don't miss tomorrow, when we make it actually look like your brand.",
    caption:
      "Hit enter once and a homepage appeared. No designer, no developer. 👇\n\nThe loop that builds it:\n• Describe what you want\n• Look at what it made\n• Refine in plain English (\"make the header bigger\")\n\nThat's it. No code, no Google rabbit holes.\n\nComment HOMEPAGE and I'll DM you the prompt that generated this one 📩\nDay 3 of 30.",
    hashtags: [...TAGS_WEBSITE, "websitebuilder"],
    dmReply:
      "Here's the exact homepage prompt 🏠 Paste it into Claude Code and tweak the wording to match your business. Remember: if anything looks off, just describe the change in plain English and it'll update. Following along? Day 4 makes it look like YOUR brand 🎨",
  },
  "30day-04-brand-colors-fonts": {
    script:
      "Your website looks generic? Two lines and it's suddenly yours. The trick is to give Claude Code your brand in plain language. Tell it your main color — paste the hex code if you have one — your accent color, and the font feeling you want: clean and modern, or warm and friendly. Say \"apply this across the whole site\" and every button, heading and link updates at once. No design software, no CSS. You go from a template anyone could have to something that feels unmistakably like your brand in about a minute. Drop your brand color in the comments and I'll tell you the exact prompt to make your site match it.",
    caption:
      "How I went from a template look to my exact brand in 60 seconds 👇\n\nTell Claude Code:\n🎨 Your main color (hex code)\n🎨 Your accent color\n🔤 The font feeling (clean / warm / bold)\n\nThen: \"apply this across the whole site.\" Every button, heading and link updates at once.\n\nDrop your brand color below 👇 or comment BRAND for the prompt 📩\nDay 4 of 30.",
    hashtags: [...TAGS_WEBSITE, "branding"],
    dmReply:
      "Here's the brand prompt 🎨 Swap in your colors and font feeling, tell it \"apply across the whole site,\" and watch everything update at once. Drop your hex code if you want me to sanity-check your combo! Day 5 we make it perfect on mobile 📱",
  },
  "30day-05-mobile-responsive": {
    script:
      "Eight out of ten people who visit your site are on their phone — so if it only looks good on a laptop, you're losing most of your audience. Here's the one instruction that fixes it. Tell Claude Code: \"make this fully responsive and mobile-first — stack the sections, make the text readable, and make the buttons easy to tap with a thumb.\" Then preview it at phone size. If a section feels cramped, you just say so and it adjusts. This is the step most beginners skip and it's the one that makes your site feel professional. Save this so you've got the exact instruction when you build yours.",
    caption:
      "The one instruction that makes any AI-built site look great on phones 👇\n\nTell Claude Code:\n\"Make this mobile-first — stack the sections, readable text, thumb-friendly buttons.\"\n\n📱 80% of your visitors are on mobile. This is the step that makes you look pro.\n\nComment MOBILE and I'll DM you the full responsive checklist 📩\nDay 5 of 30 — save this for build day.",
    hashtags: [...TAGS_WEBSITE, "mobilefirst"],
    dmReply:
      "Here's the mobile-first responsive checklist 📱 Run through it after Claude Code builds and your site will look sharp on every phone. Quick tip: always preview at phone size before you publish. Day 6 we add your About + Contact pages! 📄",
  },
  "30day-06-about-contact-pages": {
    script:
      "A website with one page looks like a hobby — a few more pages and it looks like a business. Today we add an About page and a Contact page, and it's one sentence each. Tell Claude Code: \"add an About page with my story and a photo, and a Contact page with a form that emails me.\" It builds the pages, wires them into your navigation menu, and sets up the form. You fill in your story, drop in a photo, and you're done. No plugins, no settings menus. Comment PAGES and I'll DM you my page-structure cheat sheet so you know exactly which pages every small business needs.",
    caption:
      "A one-page site looks like a hobby. Here's how to make it a business 👇\n\nOne sentence each:\n📄 \"Add an About page with my story + photo\"\n📬 \"Add a Contact page with a form that emails me\"\n\nClaude Code builds them AND adds them to your menu. No plugins.\n\nComment PAGES for my page-structure cheat sheet 📩\nDay 6 of 30.",
    hashtags: [...TAGS_WEBSITE, "smallbusiness"],
    dmReply:
      "Here's the page-structure cheat sheet 📄 It shows exactly which pages a small business site needs (and what goes on each one) so you never stare at a blank page. Build them with the one-liners from today's video. Day 7: your own custom domain! 🌐",
  },
  "30day-07-custom-domain": {
    script:
      "Stop sending people a long, ugly link — here's how to get yourname.com. Everyone overcomplicates this; it's about five minutes. Step one: buy your domain from somewhere like Namecheap or Cloudflare — usually around ten bucks a year. Step two: in your hosting dashboard, paste the domain in and it gives you two records to copy. Step three: paste those records back where you bought the domain, save, and wait a few minutes. That's it — your site now lives at a real web address you can put on a business card. Follow, because tomorrow we take it fully live for the whole world to see.",
    caption:
      "Connecting a real domain is the step everyone overcomplicates. It's 5 minutes 👇\n\n1️⃣ Buy yourname.com (~$10/yr)\n2️⃣ Copy the 2 records from your host\n3️⃣ Paste them back at your registrar → save\n\nDone. A real web address you can put on a card.\n\nComment DOMAIN and I'll DM you the step-by-step 📩\nDay 7 of 30 — tomorrow we go LIVE.",
    hashtags: [...TAGS_WEBSITE, "domainname"],
    dmReply:
      "Here's the step-by-step domain walkthrough 🌐 It covers where to buy, the exact records to copy, and how to know when it's connected. Don't overthink it — it really is ~5 minutes. Tomorrow (Day 8) your site goes LIVE for the world 🚀",
  },
  "30day-08-deploy-website": {
    script:
      "Today your website stops living on your laptop and goes live for the entire world. This used to be the scary part — servers, hosting, command lines. Now you just connect your project to a host like Vercel, click deploy, and ninety seconds later you have a real link anyone on earth can open. Tell Claude Code \"help me deploy this\" and it literally walks you through each click. Then you send that link to a friend and watch it load on their phone. Eight days ago this was an idea in your head. Comment LIVE and I'll personally review your site for free and tell you one thing to improve.",
    caption:
      "8 days ago this was an idea. Today it's a real website anyone can visit 👇\n\nGoing live now = \n• Connect to a host (Vercel)\n• Click deploy\n• Get a real link in ~90 seconds\n\nStuck? Tell Claude Code \"help me deploy this\" and it walks you through every click. 🚀\n\nComment LIVE and I'll review your site for FREE 📩\nDay 8 of 30 — Module 1 complete!",
    hashtags: [...TAGS_WEBSITE, "webdevelopment"],
    dmReply:
      "Amazing — you shipped a website in 8 days! 🚀 Drop your live link right here and I'll take a look and send you one specific thing to improve. Next up, Module 2: we turn this site into a funnel that actually makes money 💸",
  },

  // ───────────────────────── Module 2 · Funnel ─────────────────────────
  "30day-09-what-is-a-funnel": {
    script:
      "A pretty website that makes no money isn't a website — it's a hobby. Let's fix that. A funnel is just the path a stranger walks from \"who are you\" to \"take my money.\" Three steps. One: you offer something valuable for free to get their email. Two: a sequence of emails builds trust over a few days. Three: you make an offer, and the people who are ready, buy. Your website is the front door — the funnel is what happens after they walk in. Over the next six days we build the whole thing, piece by piece, with Claude Code. Save this so you've got the map before we start.",
    caption:
      "The difference between a website and a funnel is the difference between $0 and $10k 👇\n\nA funnel = the path from stranger → customer:\n1️⃣ Give value free → get their email\n2️⃣ Emails build trust\n3️⃣ Make the offer → they buy\n\nYour site is the front door. The funnel is what happens inside. 🏠➡️💸\n\nComment FUNNEL for the visual funnel map 📩\nDay 9 of 30.",
    hashtags: [...TAGS_FUNNEL, "passiveincome"],
    dmReply:
      "Here's the visual funnel map 🗺️ It lays out the 3 stages — lead magnet, email sequence, offer — so the next 6 days make total sense. Print it, stick it on your wall, and we'll build each piece together. Day 10: the landing page that does the selling 💰",
  },
  "30day-10-landing-page": {
    script:
      "This is the single page that does all the selling while you sleep. A landing page has one job and zero distractions — no menu, no links out, just one offer and one button. Here's the structure I tell Claude Code to build: a bold headline that names the result, three bullet points on what they get, a bit of proof, and one clear call-to-action button repeated top and bottom. You say \"build me a high-converting landing page for this offer\" and describe it. It lays out the whole thing. Then you sharpen the words. Comment PAGE and I'll DM you the exact converting-landing-page prompt I use.",
    caption:
      "I told Claude Code to build a high-converting landing page. Here's what it made 👇\n\nThe structure that converts:\n🎯 Headline = the result they want\n✅ 3 bullets = what they get\n⭐ A bit of proof\n🔘 One button (top + bottom)\n\nOne offer. Zero distractions. That's the money page.\n\nComment PAGE for the exact prompt 📩\nDay 10 of 30.",
    hashtags: [...TAGS_FUNNEL, "landingpage"],
    dmReply:
      "Here's the high-converting landing page prompt 🎯 It builds the headline, bullets, proof, and call-to-action in the right order — you just sharpen the words. Keep it to ONE offer and one button. Day 11 we capture every visitor's email 📧",
  },
  "30day-11-email-optin": {
    script:
      "If you're not collecting emails, you're letting customers walk out the door forever. Most visitors will never come back unless you have a way to reach them — that's what an email opt-in is for. Tell Claude Code: \"add an email opt-in form that collects a name and email and connects to my email tool.\" It drops a clean form onto your page. You connect it to something like ConvertKit or Mailchimp, and now every interested visitor becomes a contact you own. Traffic you don't capture is traffic you paid for once and lost. Follow so you don't lose another lead — tomorrow we make the freebie that gets them to say yes.",
    caption:
      "If you're not collecting emails, you're letting customers walk out the door forever 👇\n\nAdd an email opt-in:\n📧 \"Add a form that collects name + email and connects to my email tool\"\n\nNow every visitor becomes a contact you OWN — not a stranger who never returns.\n\nComment OPTIN for my opt-in setup guide 📩\nDay 11 of 30.",
    hashtags: [...TAGS_FUNNEL, "emaillist"],
    dmReply:
      "Here's the opt-in setup guide 📧 It covers adding the form, connecting ConvertKit/Mailchimp, and where to place it for the most signups. Your email list is the one asset no algorithm can take from you. Day 12: the freebie that makes them say YES 🧲",
  },
  "30day-12-lead-magnet": {
    script:
      "Nobody gives you their email for nothing — here's the free thing that makes them say yes. It's called a lead magnet, and the best ones solve one small, specific problem fast. A checklist, a template, a mini-guide, a swipe file. You can even build it with Claude Code — say \"write me a one-page checklist on this topic\" and it drafts it. Then you offer it on your opt-in: give me your email, get the checklist. Specific beats big every time — \"5-point launch checklist\" converts better than \"ultimate guide.\" Comment MAGNET and I'll DM you my list of lead-magnet ideas you can make this week.",
    caption:
      "The lead magnet that 3x'd my signups — and how I built it in an afternoon 👇\n\nBest lead magnets = one small problem, solved fast:\n📋 A checklist\n📄 A template\n📘 A mini-guide\n\nSpecific beats big. \"5-point launch checklist\" > \"ultimate guide.\"\n\nPS: Claude Code can draft it for you.\n\nComment MAGNET for my idea list 📩\nDay 12 of 30.",
    hashtags: [...TAGS_FUNNEL, "leadmagnet"],
    dmReply:
      "Here's my lead-magnet idea list 🧲 Pick one that solves a single problem for your audience — and remember, Claude Code can draft the whole thing for you in minutes. Keep it specific and quick to consume. Day 13: the forgotten page that makes extra sales 🙌",
  },
  "30day-13-thank-you-page": {
    script:
      "The page nobody builds is the one that makes the most extra sales — the thank-you page. After someone grabs your freebie, they land on a \"thanks, check your email\" page. Most people leave it blank. That's a wasted moment when attention is highest. Instead, tell Claude Code to build a thank-you page that confirms the freebie AND makes a small next-step offer — a low-price product, a call booking, or a follow. The person just said yes once; they're warm. This single page quietly adds revenue on autopilot. Save this before you launch yours so you don't leave that moment empty.",
    caption:
      "Most people skip the thank-you page. That's where the real money is 👇\n\nAfter someone grabs your freebie, don't leave it blank:\n✅ Confirm the freebie\n➕ Make ONE small next-step offer (tripwire, call, follow)\n\nThey just said yes — they're warm. This page adds revenue on autopilot.\n\nComment THANKYOU for the page prompt 📩\nDay 13 of 30.",
    hashtags: [...TAGS_FUNNEL, "salesfunnel"],
    dmReply:
      "Here's the thank-you page prompt 🙏 It confirms the freebie and adds one warm next-step offer — the move almost everyone skips. This is free money sitting in your funnel. Day 14 we set up emails that sell while you sleep 😴📧",
  },
  "30day-14-email-sequence": {
    script:
      "Imagine emails that sell for you on autopilot, 24/7, without you lifting a finger. That's a welcome sequence — five emails that go out automatically after someone joins your list. Here's the flow I use. Email one: deliver the freebie and say hi. Two: your story — why you do this. Three: teach something genuinely useful. Four: proof, a result or testimonial. Five: the offer. Claude Code will draft all five if you give it your audience and offer. You set it up once and it runs forever. Comment EMAILS and I'll DM you the exact 5-email welcome sequence template you can paste in and tweak.",
    caption:
      "I set up 5 emails once. They've been working for me ever since 👇\n\nThe welcome sequence that sells on autopilot:\n1️⃣ Deliver freebie + hi\n2️⃣ Your story\n3️⃣ Teach something useful\n4️⃣ Proof\n5️⃣ The offer\n\nSet it up once → runs forever. Claude Code drafts all 5.\n\nComment EMAILS for the template 📩\nDay 14 of 30.",
    hashtags: [...TAGS_FUNNEL, "emailmarketing"],
    dmReply:
      "Here's the 5-email welcome sequence template 📧 Paste it in, swap in your story and offer, and let Claude Code polish the wording. Set it live once and it sells for you on autopilot. Day 15: we add checkout so your funnel can take money 💸",
  },
  "30day-15-checkout-payments": {
    script:
      "Today your funnel can actually take money — and it's easier than you think. You don't need to build a payment system; you plug into Stripe. Tell Claude Code \"add a Stripe checkout for this product at this price\" and it wires up the button and the payment flow. You connect your Stripe account, hit test, and you can literally take your first dollar. Card details, receipts, security — Stripe handles all of it. The thing that used to need a developer and weeks of work is now one prompt and an afternoon. Comment PAY and I'll DM you the payment setup walkthrough so you can get paid this week.",
    caption:
      "Adding a checkout used to need a developer. I did it with one prompt 👇\n\n💳 \"Add a Stripe checkout for this product at this price\"\n\nClaude Code wires the button + payment flow. Stripe handles cards, receipts, security. Connect, test, take your first dollar. 💸\n\nComment PAY for the setup walkthrough 📩\nDay 15 of 30 — Module 2 complete!",
    hashtags: [...TAGS_FUNNEL, "stripe"],
    dmReply:
      "Here's the payment setup walkthrough 💳 It covers the Stripe connection, the checkout prompt, and how to run a test payment before you go live. You've now got a full funnel that takes money! Next, Module 3: we build an actual app — login, database, the works 📱",
  },

  // ───────────────────────── Module 3 · App ─────────────────────────
  "30day-16-app-spec": {
    script:
      "Everyone has a million-dollar app idea — here's the first step almost nobody takes. Before you build anything, you write a one-page spec. It sounds boring; it saves you weeks. Four things: who it's for, the one problem it solves, the three core features for version one, and what it should NOT do yet. That last one matters most — it stops you from building forever. Then you hand that page to Claude Code and it has a clear blueprint instead of guessing. A clear spec is the difference between an app you finish and an app you abandon. Comment SPEC and I'll DM you my one-page app spec template.",
    caption:
      "Everyone has a million-dollar app idea. Here's the step almost nobody takes 👇\n\nWrite a one-page spec FIRST:\n👤 Who it's for\n🎯 The ONE problem it solves\n⭐ 3 core features for v1\n🚫 What it should NOT do yet\n\nThat last line saves you weeks. Then hand it to Claude Code.\n\nComment SPEC for my template 📩\nDay 16 of 30.",
    hashtags: [...TAGS_APP, "startupidea"],
    dmReply:
      "Here's my one-page app spec template 📋 Fill in the who, the problem, your 3 v1 features, and what to leave out — then paste it into Claude Code as the blueprint. Clarity now = weeks saved later. Day 17 we watch the app skeleton appear 🤯",
  },
  "30day-17-scaffold-app": {
    script:
      "Watch a real, working app skeleton appear from a single description. This is scaffolding, and it's the part that still feels illegal. You give Claude Code your spec from yesterday and say \"scaffold this app — set up the project, the pages, and the navigation.\" In one go it creates the folders, the home screen, the routing between pages, the whole structure. You run it and click around a real, if empty, app. You didn't write a line of code — you described what you wanted and it built the frame. From here we just fill in the rooms. Follow, because it genuinely gets crazier from here.",
    caption:
      "From spec to a running app in one command. This still feels illegal 👇\n\nHand Claude Code your spec → \"scaffold this app: project, pages, navigation.\"\n\nIt builds the folders, screens, and routing. You click around a REAL app you didn't write a line of. 🤯\n\nComment SCAFFOLD for the scaffolding prompt 📩\nDay 17 of 30 — follow, it gets wilder.",
    hashtags: [...TAGS_APP, "coding"],
    dmReply:
      "Here's the scaffolding prompt 🏗️ Feed it your one-page spec and it sets up the project, screens, and navigation in one go. Don't worry that it's empty — that's exactly right, we fill it in next. Day 18: adding user logins (the \"scary\" part, made easy) 🔐",
  },
  "30day-18-user-login-auth": {
    script:
      "\"How do people sign up for my app?\" — that's the question that scares everyone off, and it's the one we kill today. It's called auth, and it used to take developers days. Now you tell Claude Code \"add user login and signup with email and Google\" and it sets up the whole thing — the forms, the secure password handling, the logged-in state. You test it by creating an account in your own app and logging in. The thing that used to end projects is now a single sentence. Save this for when you build yours, because the moment auth works, it actually feels like a real product.",
    caption:
      "Auth used to be the thing that killed projects. Now it's a sentence 👇\n\n🔐 \"Add user login + signup with email and Google\"\n\nClaude Code builds the forms, secure passwords, and logged-in state. You create an account in your OWN app and log in. Wild.\n\nComment AUTH for the login prompt 📩\nDay 18 of 30 — save this for build day.",
    hashtags: [...TAGS_APP, "webdev"],
    dmReply:
      "Here's the login/auth prompt 🔐 It sets up email + Google signup, secure passwords, and the logged-in state — the part that used to take days. Test it by making an account in your own app. The moment it works, it feels REAL. Day 19: the core feature 🚀",
  },
  "30day-19-core-feature": {
    script:
      "This is the one thing your app actually does — and today we build it. Everything else is decoration; this is the reason it exists. The trick is to scope it small with Claude Code. Don't say \"build the feature\" — break it into steps. \"First, let the user create an item. Now show it in a list. Now let them edit and delete it.\" One piece at a time, testing as you go. That way if something breaks you know exactly where. By the end you'll have the actual heart of your app working. Comment FEATURE and I'll DM you exactly how I scope a feature with Claude so it builds it right the first time.",
    caption:
      "Building the core feature of my app, narrated. Come build with me 👇\n\nThe secret: scope it SMALL.\nNot \"build the feature\" — instead:\n• \"Let the user create an item\"\n• \"Show it in a list\"\n• \"Let them edit + delete\"\n\nOne step at a time, test as you go. 🧩\n\nComment FEATURE for my scoping method 📩\nDay 19 of 30.",
    hashtags: [...TAGS_APP, "buildinpublic"],
    dmReply:
      "Here's exactly how I scope a feature with Claude Code 🧩 Break it into create → list → edit → delete and test each step. Small steps = fewer bugs and you always know where you are. Day 20 we give your app's data a home (a database) 🗄️",
  },
  "30day-20-add-database": {
    script:
      "Where does all your app's data actually live? Today we give it a home — a database. This sounds terrifying and it's genuinely not. Tell Claude Code \"add a database to store this\" and describe what you're saving — users, posts, orders, whatever. It sets up the database, connects it to your app, and updates your feature so things actually save. Now when someone creates something and refreshes the page, it's still there. That's the line between a toy and a real app. It took me four minutes and zero tears. Follow so you don't get stuck here — this is the step where most people quit, and you won't have to.",
    caption:
      "Adding a database sounds terrifying. It was 4 minutes and zero tears 👇\n\n🗄️ \"Add a database to store this\" + describe what you're saving\n\nClaude Code sets it up, connects it, and now data SURVIVES a refresh. That's the line between a toy and a real app.\n\nComment DATABASE for the setup prompt 📩\nDay 20 of 30 — don't quit here, I've got you.",
    hashtags: [...TAGS_APP, "database"],
    dmReply:
      "Here's the database setup prompt 🗄️ Tell Claude Code what you're storing and it handles the database + connection so your data survives a refresh. This is where most people quit — you just got past it. Day 21 we make the app actually beautiful 🎨",
  },
  "30day-21-style-the-ui": {
    script:
      "Functional but ugly? Here's how to make your app look like a real product people screenshot. The mistake is being vague — \"make it look nice\" gets you nothing. Instead give Claude Code a direction: \"make this clean and modern like Linear,\" or \"use a soft, friendly look with rounded corners and lots of spacing.\" Name an app whose style you love and it'll borrow the feel. Then refine piece by piece — spacing, colors, the buttons. Good design isn't talent here, it's good instructions. In one session your plain app turns into something that looks like a funded startup made it. Comment UI and I'll DM you my design prompt pack.",
    caption:
      "The prompts I use to turn a plain app into something people screenshot 👇\n\nDon't say \"make it nice.\" Give direction:\n🎨 \"Clean + modern like Linear\"\n🎨 \"Soft, friendly, rounded, lots of spacing\"\n\nName an app you love → it borrows the feel. Design = good instructions.\n\nComment UI for my design prompt pack 📩\nDay 21 of 30.",
    hashtags: [...TAGS_APP, "uidesign"],
    dmReply:
      "Here's my design prompt pack 🎨 It's full of copy-paste prompts that give Claude Code real direction — reference apps, spacing, color, components — so your app looks funded, not homemade. Be specific and it delivers. Day 22: fixing bugs without knowing how to code 🐞",
  },
  "30day-22-test-and-debug": {
    script:
      "Something's broken and you have no idea why? This used to be the moment beginners gave up. Not anymore. When you hit an error, don't panic and don't Google for an hour — just copy the whole error message, paste it into Claude Code, and say \"this broke, here's the error, fix it.\" It reads the message, finds the cause, explains it in plain English, and fixes it. I don't really debug anymore — I describe what's wrong, like \"the save button does nothing,\" and it hunts the problem down. Errors stop being scary and start being normal. Save this for your first scary red error message — you'll be glad you have it.",
    caption:
      "I don't debug anymore — I just describe what's wrong. Here's how 👇\n\nHit an error? Don't panic, don't Google for an hour:\n1️⃣ Copy the WHOLE error\n2️⃣ Paste into Claude Code\n3️⃣ \"This broke, here's the error, fix it\"\n\nIt finds the cause, explains it, fixes it. 🐞➡️✅\n\nComment DEBUG for my debugging playbook 📩\nDay 22 of 30.",
    hashtags: [...TAGS_APP, "debugging"],
    dmReply:
      "Here's my debugging playbook 🐞 The golden rule: paste the FULL error into Claude Code and describe what you expected. It'll find and fix it. Errors aren't scary — they're just the next prompt. Day 23: your app goes LIVE for real users 🚀",
  },
  "30day-23-deploy-app": {
    script:
      "Today your app leaves your laptop and goes live for real users. Same energy as launching the website, one more step because there's a database now. Tell Claude Code \"help me deploy this app to production\" and it walks you through connecting a host, setting up the live database, and adding your secret keys safely. A few clicks later you've got a real link — people can visit, sign up, and use the thing you built. Twenty-three days ago this was an idea on a one-page spec. Now it's software with logins and saved data. Comment APP and I'll check yours out and tell you what to build next.",
    caption:
      "23 days ago: an idea. Today: a real app people can sign into 👇\n\nGoing live:\n🚀 \"Help me deploy this app to production\"\n→ host + live database + secret keys, walked through click-by-click\n\nA real link. Real signups. Real saved data. You built software.\n\nComment APP and I'll check yours out 📩\nDay 23 of 30 — Module 3 done!",
    hashtags: [...TAGS_APP, "deployment"],
    dmReply:
      "Incredible — you deployed a real app! 🚀 Drop your link here and I'll sign up, take a look, and tell you the highest-impact thing to build next. Final stretch — Module 4: we launch it, get your first users, and grow 📈",
  },

  // ──────────────────────── Module 4 · Ship & Grow ────────────────────────
  "30day-24-ship-mvp": {
    script:
      "Done is better than perfect — today we hit publish even though it's scary. Your MVP doesn't need every feature; it needs to be in front of real people. Here's my launch-day checklist: the core feature works, signup works, there's one clear thing for a new user to do, and you've written one honest post about what you built and who it helps. Then you share it — your story, your audience, a relevant community. The version you're embarrassed by today is the one that teaches you everything. Perfect in private teaches you nothing. Comment SHIP and I'll DM you the full launch-day checklist so nothing slips.",
    caption:
      "Launching before you feel ready is the whole secret. Here's my launch checklist 👇\n\n✅ Core feature works\n✅ Signup works\n✅ One clear first action for new users\n✅ One honest post about what you built\n\nThen SHIP it. The version you're embarrassed by teaches you everything. 🚢\n\nComment SHIP for the full checklist 📩\nDay 24 of 30.",
    hashtags: [...TAGS_GROW, "mvp"],
    dmReply:
      "Here's the launch-day checklist 🚢 Run through it, then hit publish even though it feels early — that's the whole game. Shipping beats polishing in private every time. Tag me in your launch, I want to cheer you on! Day 25: turning users into your roadmap 🗣️",
  },
  "30day-25-collect-feedback": {
    script:
      "Your first users will tell you exactly what to build next — if you ask the right way. Don't ask \"what do you think,\" you'll get a polite \"it's nice\" that helps nobody. Ask these three instead. One: what almost stopped you from using this? Two: what's the one thing you wish it did? Three: would you be disappointed if it disappeared tomorrow? That last one tells you if you've built something people actually want. Talk to real humans, write down the exact words they use — those words become your marketing too. Save these three questions; they shape the entire product from here.",
    caption:
      "The 3 questions I ask every new user that shape the entire product 👇\n\n❌ Not \"what do you think?\" (useless)\n✅ \"What almost stopped you from using this?\"\n✅ \"What's the ONE thing you wish it did?\"\n✅ \"Would you be sad if it vanished tomorrow?\"\n\nTheir exact words = your roadmap AND your marketing.\n\nComment FEEDBACK for my user-interview script 📩\nDay 25 of 30.",
    hashtags: [...TAGS_GROW, "userfeedback"],
    dmReply:
      "Here's my full user-interview script 🗣️ Those 3 questions cut through the polite \"it's nice\" and tell you what to build next — plus the exact words to use in your marketing. Talk to 5 users this week. Day 26: see exactly what users do (analytics) 📊",
  },
  "30day-26-add-analytics": {
    script:
      "You can't grow what you can't see — so today we stop guessing. Analytics just means knowing what people actually do in your app instead of imagining it. Tell Claude Code \"add analytics so I can track signups and key actions\" and it wires up a tool like PostHog or Plausible. Now you can see how many people visit, how many sign up, and where they drop off. That drop-off point is gold — it's the exact thing to fix next. Five minutes of setup replaces months of guessing. Comment DATA and I'll DM you my simple analytics setup and the three numbers worth watching from day one.",
    caption:
      "Adding analytics in 5 minutes so I stop guessing and start knowing 👇\n\n📊 \"Add analytics to track signups + key actions\"\n\nNow you see: visitors → signups → where they drop off. That drop-off point = the exact thing to fix next. Gold.\n\nComment DATA for my setup + the 3 numbers to watch 📩\nDay 26 of 30.",
    hashtags: [...TAGS_GROW, "analytics"],
    dmReply:
      "Here's my simple analytics setup 📊 It covers wiring up PostHog/Plausible with Claude Code and the 3 numbers worth watching from day one (visitors, signups, drop-off). Find the drop-off, fix it, repeat. Day 27: turn building this into your marketing engine 🎥",
  },
  "30day-27-build-in-public": {
    script:
      "The best marketing for your product is showing yourself build it. Meta, right? It's called building in public, and it's the system behind this whole series. Every step you take is content: the win, the bug, the lesson, the before-and-after. You're not making marketing on top of your work — the work IS the marketing. My simple loop: build something, screen-record or note what happened, post it with one lesson. People follow the journey, get invested, and become your first users and biggest fans. You already did the hard part by building. Follow if building in public is your plan too — tomorrow we go get your first ten users.",
    caption:
      "Every video about building my product IS the marketing. Here's the system 👇\n\nBuilding in public = your work is your content:\n🎥 The win\n🐞 The bug\n💡 The lesson\n🔁 Before + after\n\nBuild → record → post one lesson. People follow the journey + become your first fans.\n\nComment CONTENT for my build-in-public content system 📩\nDay 27 of 30.",
    hashtags: [...TAGS_GROW, "contentstrategy"],
    dmReply:
      "Here's my build-in-public content system 🎥 It turns every build session into posts — wins, bugs, lessons, before/afters — so your marketing and your work become the same thing. Consistency wins here. Day 28: exactly where I found my first 10 users 🙌",
  },
  "30day-28-first-users": {
    script:
      "Your first ten users are the hardest and the most important — so here's exactly where to find them, no ad spend. Stop posting \"check out my app\" into the void. Instead, go where your people already hang out — a subreddit, a Discord, a Facebook group, a comment section — and be genuinely helpful first. When someone has the exact problem you solve, you reach out one-to-one: \"I built a tool for this, want to try it?\" Personal beats broadcast every single time. Ten real users who talk to you are worth more than a thousand silent followers. Comment USERS and I'll DM you the outreach scripts I used to get mine.",
    caption:
      "Exactly where I found my first 10 users (no ad spend) 👇\n\nStop shouting \"check out my app\" into the void.\n✅ Go where your people already are (subreddits, Discords, groups)\n✅ Be helpful FIRST\n✅ Reach out 1-to-1 when someone has the problem you solve\n\nPersonal > broadcast. Every time. 🙌\n\nComment USERS for my outreach scripts 📩\nDay 28 of 30.",
    hashtags: [...TAGS_GROW, "customeracquisition"],
    dmReply:
      "Here are the outreach scripts I used to get my first 10 users 🙌 Copy-paste DMs and comment templates that feel human, not spammy — plus where to find the people who already have the problem you solve. 10 real users > 1,000 silent followers. Day 29: the loop that compounds 🔁",
  },
  "30day-29-iterate": {
    script:
      "The magic isn't the launch — it's the loop. Build, learn, repeat. Here's how I turn one piece of feedback into the next version in a single day. A user tells me what's confusing. I take their exact words to Claude Code and say \"make this clearer\" or \"add this small thing.\" It ships in minutes, I tell that user it's fixed, and they become a fan for life. Small improvements, shipped fast, over and over — that compounds into a product people love. Most people launch once and stop. Winners just keep running the loop. Save this, because this loop is the whole game from here on out.",
    caption:
      "How I turn one piece of feedback into the next version in a day 👇\n\nThe loop that compounds:\n1️⃣ User says what's confusing\n2️⃣ Take their exact words to Claude Code → \"make this clearer\"\n3️⃣ Ship in minutes\n4️⃣ Tell them it's fixed → fan for life\n\nLaunch once = amateur. Run the loop = winner. 🔁\n\nComment ITERATE for my iteration system 📩\nDay 29 of 30.",
    hashtags: [...TAGS_GROW, "productdevelopment"],
    dmReply:
      "Here's my iteration system 🔁 Capture feedback, feed the user's exact words to Claude Code, ship the fix in minutes, and close the loop with that user. Small + fast + repeated = a product people love. One more day! Day 30: scale + monetize 🎉",
  },
  "30day-30-scale-monetize": {
    script:
      "Thirty days ago you couldn't code. Today you have a product that makes money. Let's recap what you built. A website you typed into existence. A funnel that captures leads and takes payments. A real app with logins and a database. And a launch that got you your first users. Now scaling is just doing more of what's already working — more content, more outreach, raising your price as you add value, and using Claude Code to ship faster than anyone around you. You didn't learn to code; you learned to build, and that skill compounds for the rest of your life. Comment 30 and I'll send you the full plan so you can do it all again, bigger.",
    caption:
      "Website → funnel → app → revenue, all in 30 days with Claude Code. Recap inside 👇\n\nYou built:\n🌐 A real website\n💸 A funnel that takes payments\n📱 An app with logins + database\n🚀 A launch + your first users\n\nScaling = more of what works + ship faster than everyone. You didn't learn to code — you learned to BUILD. 🎉\n\nComment 30 and I'll send you the full plan 📩\nDay 30 of 30 — you did it.",
    hashtags: [...TAGS_GROW, "monetization"],
    dmReply:
      "YOU DID IT — 30 days, website to revenue 🎉 Here's the complete plan so you can run it again on your next idea, bigger and faster. Reply and tell me what you built — I read every single one, and I'd genuinely love to see it. This is just the beginning 🚀",
  },
};
