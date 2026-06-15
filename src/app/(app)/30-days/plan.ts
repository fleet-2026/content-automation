// 30-day "Claude Code" content plan. Static teaching plan — one entry per
// day — grouped into four modules (Website → Funnel → App → Ship & Grow).
// Each day is a short-form video brief: the teaching step plus the four
// scripting beats (verbal hook, on-screen text, caption hook, CTA).
//
// These entries are ALSO the seed for real, postable guide records: the
// /30-days "Set up the plan" action upserts one DailyGuide per day (tagged
// source = PLAN_SOURCE) so each day opens in the same editor as Daily post
// and posts to social through the same pipeline. `slug` is the stable key
// that ties a plan day to its guide row; `keyword` seeds the ManyChat keyword.

export type PlanDay = {
  /** Global day number, 1–30. */
  day: number;
  /** Stable slug — the DailyGuide row's primary key for this day. */
  slug: string;
  /** ManyChat keyword seeded onto the guide. */
  keyword: string;
  /** The teaching step — what the viewer learns to do that day. Seeds title. */
  step: string;
  /** Spoken opening line that stops the scroll. Seeds the guide hook. */
  hook: string;
  /** Big on-screen text overlay for the clip. */
  onScreen: string;
  /** First line of the caption — the written hook. Seeds the guide caption. */
  caption: string;
  /** Call to action that closes the video / caption. */
  cta: string;
};

export type PlanModule = {
  /** URL-safe id, used for anchors and React keys. */
  id: string;
  /** Module number, 1–4. */
  number: number;
  /** Module name. */
  title: string;
  /** One-line description of what the module builds. */
  subtitle: string;
  days: PlanDay[];
};

/** `source` value stamped on every plan guide row. Used to list them on
 *  /30-days and to keep them out of the main Daily post library. */
export const PLAN_SOURCE = "30days";

export const PLAN: PlanModule[] = [
  {
    id: "website",
    number: 1,
    title: "Website",
    subtitle: "Go from blank screen to a live website you typed into existence.",
    days: [
      {
        day: 1,
        slug: "30day-01-install-claude-code",
        keyword: "BUILD",
        step: "Install Claude Code & open your first project",
        hook: "You don't need to learn to code to build a website in 2026 — you just need to talk.",
        onScreen: "Day 1 · Install Claude Code",
        caption: "I built my entire website by typing in plain English. Here's day 1 👇",
        cta: "Comment \"BUILD\" and I'll DM you the free setup guide.",
      },
      {
        day: 2,
        slug: "30day-02-describe-your-site",
        keyword: "PROMPT",
        step: "Describe your dream site in one prompt",
        hook: "Whatever website is in your head — you can describe it in 3 sentences and watch it appear.",
        onScreen: "Day 2 · Describe it, don't design it",
        caption: "The 3-sentence prompt that turned my idea into a real homepage.",
        cta: "Save this so you don't forget the prompt formula.",
      },
      {
        day: 3,
        slug: "30day-03-generate-homepage",
        keyword: "HOMEPAGE",
        step: "Generate your homepage",
        hook: "This is the moment a blank folder becomes an actual website on your screen.",
        onScreen: "Day 3 · Your first homepage",
        caption: "Hit enter once and a homepage appeared. No designer, no developer.",
        cta: "Follow so you don't miss tomorrow's brand step.",
      },
      {
        day: 4,
        slug: "30day-04-brand-colors-fonts",
        keyword: "BRAND",
        step: "Add your brand colors & fonts",
        hook: "Your website looks generic? Two lines and it's suddenly yours.",
        onScreen: "Day 4 · Make it yours",
        caption: "How I went from a template look to my exact brand in 60 seconds.",
        cta: "Drop your brand color in the comments — I'll tell you the prompt.",
      },
      {
        day: 5,
        slug: "30day-05-mobile-responsive",
        keyword: "MOBILE",
        step: "Make it responsive on mobile",
        hook: "80% of your visitors are on their phone — here's how to make sure it looks perfect there.",
        onScreen: "Day 5 · Mobile-perfect",
        caption: "The one instruction that makes any AI-built site look great on phones.",
        cta: "Save this for when you build yours.",
      },
      {
        day: 6,
        slug: "30day-06-about-contact-pages",
        keyword: "PAGES",
        step: "Add an About & Contact page",
        hook: "A website with one page looks like a hobby. Here's how to make it a business.",
        onScreen: "Day 6 · More pages, zero stress",
        caption: "Adding pages used to mean a developer. Now it's one sentence.",
        cta: "Comment \"PAGES\" for my page-structure cheat sheet.",
      },
      {
        day: 7,
        slug: "30day-07-custom-domain",
        keyword: "DOMAIN",
        step: "Connect a custom domain",
        hook: "Stop sending people a long ugly link — here's how to get yourname.com.",
        onScreen: "Day 7 · Your own domain",
        caption: "Connecting a real domain is the step everyone overcomplicates. It's 5 minutes.",
        cta: "Follow — tomorrow we put it LIVE.",
      },
      {
        day: 8,
        slug: "30day-08-deploy-website",
        keyword: "LIVE",
        step: "Deploy your website live",
        hook: "Today your website stops being on your laptop and goes live for the whole world.",
        onScreen: "Day 8 · Website is LIVE 🚀",
        caption: "8 days ago this was an idea. Today it's a real website anyone can visit.",
        cta: "Comment \"LIVE\" and I'll review your site for free.",
      },
    ],
  },
  {
    id: "funnel",
    number: 2,
    title: "Funnel",
    subtitle: "Turn that website into a machine that captures leads and gets paid.",
    days: [
      {
        day: 9,
        slug: "30day-09-what-is-a-funnel",
        keyword: "FUNNEL",
        step: "Understand what a funnel actually is",
        hook: "A pretty website that makes no money isn't a website — it's a hobby. Let's fix that.",
        onScreen: "Day 9 · Funnels, explained",
        caption: "The difference between a website and a funnel is the difference between $0 and $10k.",
        cta: "Save this — the next 6 days build the whole thing.",
      },
      {
        day: 10,
        slug: "30day-10-landing-page",
        keyword: "PAGE",
        step: "Build a landing page that converts",
        hook: "This is the single page that does all the selling while you sleep.",
        onScreen: "Day 10 · The money page",
        caption: "I told Claude Code to build a high-converting landing page. Here's what it made.",
        cta: "Comment \"PAGE\" for the converting-landing-page prompt.",
      },
      {
        day: 11,
        slug: "30day-11-email-optin",
        keyword: "OPTIN",
        step: "Add an email opt-in",
        hook: "If you're not collecting emails, you're letting customers walk out the door forever.",
        onScreen: "Day 11 · Capture every visitor",
        caption: "Adding an email capture form took 2 minutes and changed everything.",
        cta: "Follow so you don't lose another lead.",
      },
      {
        day: 12,
        slug: "30day-12-lead-magnet",
        keyword: "MAGNET",
        step: "Create a lead magnet",
        hook: "Nobody gives their email for nothing — here's the free thing that makes them say yes.",
        onScreen: "Day 12 · The irresistible freebie",
        caption: "The lead magnet that 3x'd my signups — and how I built it in an afternoon.",
        cta: "Comment \"MAGNET\" for my lead-magnet idea list.",
      },
      {
        day: 13,
        slug: "30day-13-thank-you-page",
        keyword: "THANKYOU",
        step: "Wire up the thank-you page",
        hook: "The page nobody builds is the one that makes the most extra sales.",
        onScreen: "Day 13 · The forgotten page",
        caption: "Most people skip the thank-you page. That's where the real money is.",
        cta: "Save this before you launch yours.",
      },
      {
        day: 14,
        slug: "30day-14-email-sequence",
        keyword: "EMAILS",
        step: "Set up an automated email sequence",
        hook: "Imagine emails that sell for you on autopilot, 24/7, without you lifting a finger.",
        onScreen: "Day 14 · Sells while you sleep",
        caption: "I set up 5 emails once. They've been working for me ever since.",
        cta: "Comment \"EMAILS\" for the 5-email welcome sequence.",
      },
      {
        day: 15,
        slug: "30day-15-checkout-payments",
        keyword: "PAY",
        step: "Add checkout & payments",
        hook: "Today your funnel can actually take money — let me show you how easy it is.",
        onScreen: "Day 15 · Get paid 💸",
        caption: "Adding a checkout used to need a developer. I did it with one prompt.",
        cta: "Comment \"PAY\" and I'll send the payment setup walkthrough.",
      },
    ],
  },
  {
    id: "app",
    number: 3,
    title: "App",
    subtitle: "Build an actual software product — login, database, the works.",
    days: [
      {
        day: 16,
        slug: "30day-16-app-spec",
        keyword: "SPEC",
        step: "Turn your idea into an app spec",
        hook: "Everyone has a million-dollar app idea. Here's the first step almost nobody takes.",
        onScreen: "Day 16 · Idea → spec",
        caption: "Before you build the app, you write this. It saves you weeks.",
        cta: "Comment \"SPEC\" for my one-page app spec template.",
      },
      {
        day: 17,
        slug: "30day-17-scaffold-app",
        keyword: "SCAFFOLD",
        step: "Scaffold the app with Claude Code",
        hook: "Watch a real, working app skeleton appear from a single description.",
        onScreen: "Day 17 · The app appears",
        caption: "From spec to a running app in one command. This still feels illegal.",
        cta: "Follow — it gets crazier from here.",
      },
      {
        day: 18,
        slug: "30day-18-user-login-auth",
        keyword: "AUTH",
        step: "Add user login & auth",
        hook: "\"How do people sign up for my app?\" — the scary part, made simple.",
        onScreen: "Day 18 · Logins, done",
        caption: "Auth used to be the thing that killed projects. Now it's a sentence.",
        cta: "Save this for when you build yours.",
      },
      {
        day: 19,
        slug: "30day-19-core-feature",
        keyword: "FEATURE",
        step: "Build the core feature",
        hook: "This is the one thing your app actually does — and today we build it.",
        onScreen: "Day 19 · The main event",
        caption: "Building the core feature of my app, narrated. Come build with me.",
        cta: "Comment \"FEATURE\" for how I scope a feature with Claude.",
      },
      {
        day: 20,
        slug: "30day-20-add-database",
        keyword: "DATABASE",
        step: "Add a database",
        hook: "Where does all your app's data actually live? Let's give it a home.",
        onScreen: "Day 20 · Save the data",
        caption: "Adding a database sounds terrifying. It was 4 minutes and zero tears.",
        cta: "Follow so you don't get stuck here.",
      },
      {
        day: 21,
        slug: "30day-21-style-the-ui",
        keyword: "UI",
        step: "Style the UI",
        hook: "Functional but ugly? Here's how to make your app look like a real product.",
        onScreen: "Day 21 · Make it beautiful",
        caption: "The prompts I use to turn a plain app into something people screenshot.",
        cta: "Comment \"UI\" for my design prompt pack.",
      },
      {
        day: 22,
        slug: "30day-22-test-and-debug",
        keyword: "DEBUG",
        step: "Test & fix bugs with Claude",
        hook: "Something's broken and you have no idea why? Watch this.",
        onScreen: "Day 22 · Squash the bugs",
        caption: "I don't debug anymore — I just describe what's wrong. Here's how.",
        cta: "Save this for your first scary error.",
      },
      {
        day: 23,
        slug: "30day-23-deploy-app",
        keyword: "APP",
        step: "Deploy your app",
        hook: "Today your app leaves your laptop and goes live for real users.",
        onScreen: "Day 23 · App is LIVE 🚀",
        caption: "23 days ago: an idea. Today: a real app people can sign into.",
        cta: "Comment \"APP\" and I'll check yours out.",
      },
    ],
  },
  {
    id: "ship-grow",
    number: 4,
    title: "Ship & Grow",
    subtitle: "Launch it, get users, and turn it into something that grows.",
    days: [
      {
        day: 24,
        slug: "30day-24-ship-mvp",
        keyword: "SHIP",
        step: "Ship your MVP publicly",
        hook: "Done is better than perfect — today we hit publish even though it's scary.",
        onScreen: "Day 24 · Ship it 🚢",
        caption: "Launching before you feel ready is the whole secret. Here's my launch checklist.",
        cta: "Comment \"SHIP\" for the launch-day checklist.",
      },
      {
        day: 25,
        slug: "30day-25-collect-feedback",
        keyword: "FEEDBACK",
        step: "Collect user feedback",
        hook: "Your first users will tell you exactly what to build next — if you ask right.",
        onScreen: "Day 25 · Listen first",
        caption: "The 3 questions I ask every new user that shape the entire product.",
        cta: "Save these 3 questions.",
      },
      {
        day: 26,
        slug: "30day-26-add-analytics",
        keyword: "DATA",
        step: "Add analytics",
        hook: "You can't grow what you can't see — here's how to know exactly what users do.",
        onScreen: "Day 26 · See everything",
        caption: "Adding analytics in 5 minutes so I stop guessing and start knowing.",
        cta: "Comment \"DATA\" for my analytics setup.",
      },
      {
        day: 27,
        slug: "30day-27-build-in-public",
        keyword: "CONTENT",
        step: "Build a content engine around building it",
        hook: "The best marketing for your product is showing yourself build it. Meta, right?",
        onScreen: "Day 27 · Build in public",
        caption: "Every video about building my product IS the marketing. Here's the system.",
        cta: "Follow if building in public is your plan too.",
      },
      {
        day: 28,
        slug: "30day-28-first-users",
        keyword: "USERS",
        step: "Get your first 10 users",
        hook: "Your first 10 users are the hardest and the most important — here's where to find them.",
        onScreen: "Day 28 · First 10 users",
        caption: "Exactly where I found my first 10 users (no ad spend).",
        cta: "Comment \"USERS\" for the outreach scripts.",
      },
      {
        day: 29,
        slug: "30day-29-iterate",
        keyword: "ITERATE",
        step: "Iterate from feedback",
        hook: "The magic isn't the launch — it's the loop. Build, learn, repeat.",
        onScreen: "Day 29 · The loop",
        caption: "How I turn one piece of feedback into the next version in a day.",
        cta: "Save this — it's the whole game.",
      },
      {
        day: 30,
        slug: "30day-30-scale-monetize",
        keyword: "SCALE",
        step: "Scale & monetize",
        hook: "30 days ago you couldn't code. Today you have a product that makes money.",
        onScreen: "Day 30 · You did it 🎉",
        caption: "Website → funnel → app → revenue, all in 30 days with Claude Code. Recap inside.",
        cta: "Comment \"30\" and I'll send you the full plan to do it yourself.",
      },
    ],
  },
];

/** Flat list of all 30 days, in order. */
export function allPlanDays(): PlanDay[] {
  return PLAN.flatMap((m) => m.days);
}

/** Look up a plan day by its slug. */
export function planDayBySlug(slug: string): PlanDay | undefined {
  return allPlanDays().find((d) => d.slug === slug);
}
