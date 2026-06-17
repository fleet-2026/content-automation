// 30-day "Claude Code Summer" content plan. Static teaching plan — one entry
// per day, grouped into four modules. Each day is a short-form video brief:
// the teaching step plus the four scripting beats (verbal hook, on-screen text,
// caption hook, CTA). These ALSO seed real, postable DailyGuide rows
// (source = PLAN_SOURCE) via the /30-days "Set up" action.

export type PlanDay = {
  day: number;
  slug: string;
  keyword: string;
  step: string;
  hook: string;
  onScreen: string;
  caption: string;
  cta: string;
};

export type PlanModule = {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  days: PlanDay[];
};

export const PLAN_SOURCE = "30days";

export const PLAN: PlanModule[] = [
  {
    id: "start",
    number: 1,
    title: "Get Started",
    subtitle: "Install Claude Code and learn how it actually works.",
    days: [
      {
        day: 1,
        slug: "ccs-01-what-is-claude-code",
        keyword: "LEARN",
        step: "What is Claude Code",
        hook: "What is Claude Code?",
        onScreen: "Day 1 · What is Claude Code",
        caption: "Day 1 of Claude Code Summer. What is Claude Code? It's not just a chatbot - it's an AI agent that helps you build: it reads your files, runs commands, and works inside the tools you already use. Comment LEARN for the 3 key ideas to use it well.",
        cta: "Comment \"LEARN\" and I'll DM you the 3 key ideas to use Claude Code well.",
      },
      {
        day: 2,
        slug: "ccs-02-install-claude-code",
        keyword: "BUILD",
        step: "Install Claude Code",
        hook: "How to install Claude Code in under two minutes.",
        onScreen: "Day 2 · Install Claude Code",
        caption: "Day 2 of Claude Code Summer. Install Claude Code in under 2 minutes - even if you've never touched code. Sign up at claude.ai, open Terminal, paste one command, type 'claude,' and authorize. Save it, and comment BUILD for your first app next.",
        cta: "Comment \"BUILD\" and I'll DM you how to build your first app in under 5 minutes.",
      },
      {
        day: 3,
        slug: "ccs-03-how-it-works-the-agentic-loop",
        keyword: "PERMISSION",
        step: "How it works (the agentic loop)",
        hook: "How does Claude Code actually work?",
        onScreen: "Day 3 · How it works (the agentic loop)",
        caption: "Day 3 of Claude Code Summer. How does Claude Code actually work? It runs in an 'agentic loop': you set a goal, it gathers context, takes action, then checks its own work - repeating until it's right. Plus memory, tools, and permission modes. Comment PERMISSION for the breakdown.",
        cta: "Comment \"PERMISSION\" and I'll DM you the simple breakdown of permission modes.",
      },
      {
        day: 4,
        slug: "ccs-04-first-prompt",
        keyword: "",
        step: "First prompt",
        hook: "How to prompt Claude Code for the first time.",
        onScreen: "Day 4 · First prompt",
        caption: "Day 4 of Claude Code Summer. How to prompt Claude Code for the first time - you just talk to it in plain English. Two modes to know: auto-accept edits (fewer interruptions) and plan mode (it researches first, then hands you a plan). Hit Shift+Tab to switch. Save this for your first session.",
        cta: "Save this post for your first Claude Code session.",
      },
      {
        day: 5,
        slug: "ccs-05-don-t-code-first-explore-plan",
        keyword: "WORKFLOW",
        step: "Don't code first (explore + plan)",
        hook: "Don't let Claude Code write code first.",
        onScreen: "Day 5 · Don't code first (explore + plan)",
        caption: "Day 5 of Claude Code Summer. The #1 mistake? Telling Claude Code to build something the second you open it - that's how you fix it 20 times. Use Anthropic's workflow: explore -> plan -> code -> commit. Today: start in plan mode, and use /init to explore any project. Comment WORKFLOW for the full flow.",
        cta: "Comment \"WORKFLOW\" and I'll DM you the full explore → plan → code → commit workflow.",
      },
      {
        day: 6,
        slug: "ccs-06-status-bar",
        keyword: "STATUS",
        step: "Status bar",
        hook: "I have a status bar that tells me everything I need while using Claude Code.",
        onScreen: "Day 6 · Status bar",
        caption: "Day 6 of Claude Code Summer. This little status bar tells me everything at a glance: my folder, my Git branch, how much context I've used (so I know when to compact), and which model I'm running. Set it up in seconds with /statusline. Comment STATUS for the exact prompt.",
        cta: "Comment \"STATUS\" and I'll DM you the exact /statusline prompt to copy-paste.",
      },
      {
        day: 7,
        slug: "ccs-07-claude-md",
        keyword: "SEND",
        step: "CLAUDE.md",
        hook: "CLAUDE.md - and how to use it.",
        onScreen: "Day 7 · CLAUDE.md",
        caption: "Day 7 of Claude Code Summer. Meet CLAUDE.md - a memo file Claude Code reads at the start of every session, so it already knows how you work. Four rules that 10x your results: plan before executing, use subagents, self-improve after corrections, and verify before done. Comment SEND for the file.",
        cta: "Comment \"SEND\" and I'll DM you the ready-to-use CLAUDE.md file.",
      },
      {
        day: 8,
        slug: "ccs-08-slash-commands",
        keyword: "COMMANDS",
        step: "Slash commands",
        hook: "Slash commands - your shortcuts menu.",
        onScreen: "Day 8 · Slash commands",
        caption: "Day 8 of Claude Code Summer. You're not really using Claude Code until you're using slash commands. Type '/' and a menu pops up. My 5 go-tos: /help, /clear (fresh start), /compact (tidy long sessions), /diff (see every change), /rewind (undo + go back). Comment COMMANDS for the full cheat sheet.",
        cta: "Comment \"COMMANDS\" and I'll DM you my full slash-command cheat sheet.",
      },
    ],
  },
  {
    id: "core",
    number: 2,
    title: "Core Skills",
    subtitle: "The everyday commands and features that make Claude Code click.",
    days: [
      {
        day: 9,
        slug: "ccs-09-cost-track-your-spending",
        keyword: "COST",
        step: "/cost - track your spending",
        hook: "Know exactly what you're spending.",
        onScreen: "Day 9 · /cost - track your spending",
        caption: "Day 9 of Claude Code Summer. Using Claude Code but not watching your spend? Type /cost - it shows your usage and running total for the session, so no surprises. My habit: check /cost before long sessions, and run /compact if it's climbing. Comment COST for my keep-it-low routine.",
        cta: "Comment \"COST\" and I'll DM you my simple routine for keeping your spend low.",
      },
      {
        day: 10,
        slug: "ccs-10-create-your-own-slash-commands",
        keyword: "CUSTOM",
        step: "Create your own slash commands",
        hook: "Make your own shortcuts.",
        onScreen: "Day 10 · Create your own slash commands",
        caption: "Day 10 of Claude Code Summer. The real power move: make your OWN slash commands. Drop a text file in .claude/commands and it becomes a shortcut you can run anytime - no retyping. Comment CUSTOM for 3 ready-made commands to start with.",
        cta: "Comment \"CUSTOM\" and I'll DM you 3 ready-made custom slash commands to start with.",
      },
      {
        day: 11,
        slug: "ccs-11-permission-modes-incl-hard-deny",
        keyword: "PERMISSION",
        step: "Permission modes (incl. hard deny)",
        hook: "Permission modes - how to stay in control.",
        onScreen: "Day 11 · Permission modes (incl. hard deny)",
        caption: "Day 11 of Claude Code Summer. Stay in control with permission modes. Shift+Tab cycles them: normal (asks first), auto-accept edits (edits freely, still checks before commands), and plan mode (read-only). Plus 'hard deny' for actions Claude should NEVER take. Comment PERMISSION for my mode-by-mode guide.",
        cta: "Comment \"PERMISSION\" and I'll DM you my mode-by-mode permissions guide.",
      },
      {
        day: 12,
        slug: "ccs-12-subagents-your-ai-team",
        keyword: "AGENTS",
        step: "Subagents (your AI team)",
        hook: "Subagents - your AI team.",
        onScreen: "Day 12 · Subagents (your AI team)",
        caption: "Day 12 of Claude Code Summer. Meet subagents - your AI team. Instead of one helper doing everything, spin up specialists: a code reviewer, security checker, test writer, and more, each with a name. Right helper, right job. Comment AGENTS for my starter set.",
        cta: "Comment \"AGENTS\" and I'll DM you my starter set of subagents.",
      },
      {
        day: 13,
        slug: "ccs-13-connect-your-tools-mcp",
        keyword: "CONNECT",
        step: "Connect your tools (MCP)",
        hook: "Connect Claude Code to your other tools.",
        onScreen: "Day 13 · Connect your tools (MCP)",
        caption: "Day 13 of Claude Code Summer. MCP = plugging Claude Code into the apps you already use, so it works with your real info instead of copy-paste. Connect one tool you'd use daily and grow from there. Comment CONNECT for beginner-friendly tools to try first.",
        cta: "Comment \"CONNECT\" and I'll DM you a beginner-friendly list of tools to connect first.",
      },
      {
        day: 14,
        slug: "ccs-14-show-don-t-tell-images-as-input",
        keyword: "SHOW",
        step: "Show, don't tell (images as input)",
        hook: "Show, don't tell.",
        onScreen: "Day 14 · Show, don't tell (images as input)",
        caption: "Day 14 of Claude Code Summer. Don't describe it - SHOW it. Drag a screenshot or photo right into Claude Code and it works from the picture. Got an error? Show it and say 'fix this.' Comment SHOW for my favorite ways to use images.",
        cta: "Comment \"SHOW\" and I'll DM you my favorite ways to use images with Claude Code.",
      },
      {
        day: 15,
        slug: "ccs-15-undo-rewind-checkpoints",
        keyword: "UNDO",
        step: "Undo, rewind & checkpoints",
        hook: "Never fear a mistake again.",
        onScreen: "Day 15 · Undo, rewind & checkpoints",
        caption: "Day 15 of Claude Code Summer. Scared of breaking something? Claude Code saves checkpoints as you go - and you can rewind to undo changes and step back in the conversation. Experiment freely; if it goes sideways, rewind. Comment UNDO for the step-by-step.",
        cta: "Comment \"UNDO\" and I'll DM you the step-by-step on rewind and checkpoints.",
      },
      {
        day: 16,
        slug: "ccs-16-make-claude-think-harder",
        keyword: "THINK",
        step: "Make Claude think harder",
        hook: "Make Claude think harder.",
        onScreen: "Day 16 · Make Claude think harder",
        caption: "Day 16 of Claude Code Summer. For tricky tasks, make Claude think harder. Add 'think' or 'think hard' to your prompt and it slows down and reasons step by step - better plans, better fixes. Save it for the hard stuff. Comment THINK for the exact phrases.",
        cta: "Comment \"THINK\" and I'll DM you the exact phrases that make Claude think harder.",
      },
    ],
  },
  {
    id: "levelup",
    number: 3,
    title: "Level Up",
    subtitle: "Workflows and habits that take you from dabbling to building.",
    days: [
      {
        day: 17,
        slug: "ccs-17-a-claude-md-for-every-project",
        keyword: "RULES",
        step: "A CLAUDE.md for every project",
        hook: "A different CLAUDE.md for every project.",
        onScreen: "Day 17 · A CLAUDE.md for every project",
        caption: "Day 17 of Claude Code Summer. Give every project its own CLAUDE.md so Claude knows that project's rules the moment you open it - no re-explaining. Plus personal preferences that apply everywhere. Comment RULES for a copy-paste template.",
        cta: "Comment \"RULES\" and I'll DM you a copy-paste CLAUDE.md template.",
      },
      {
        day: 18,
        slug: "ccs-18-automate-with-hooks",
        keyword: "AUTO",
        step: "Automate with hooks",
        hook: "Automate the boring stuff with hooks.",
        onScreen: "Day 18 · Automate with hooks",
        caption: "Day 18 of Claude Code Summer. Automate the boring stuff with hooks: 'every time X happens, automatically do Y' - like running tests after each edit. Set it once, Claude handles it. Comment AUTO for beginner-friendly hook ideas.",
        cta: "Comment \"AUTO\" and I'll DM you beginner-friendly automation hook ideas.",
      },
      {
        day: 19,
        slug: "ccs-19-where-to-run-claude-code",
        keyword: "WHERE",
        step: "Where to run Claude Code",
        hook: "Where can you use Claude Code?",
        onScreen: "Day 19 · Where to run Claude Code",
        caption: "Day 19 of Claude Code Summer. Claude Code meets you where you work: the terminal, an editor like VS Code, the desktop app, or right in your browser. Same Claude - pick your comfiest home. Comment WHERE and I'll help you choose.",
        cta: "Comment \"WHERE\" and I'll DM you help picking the best place to run Claude Code.",
      },
      {
        day: 20,
        slug: "ccs-20-your-first-real-project",
        keyword: "PROJECT",
        step: "Your first real project",
        hook: "Your first real project, the Claude Code way.",
        onScreen: "Day 20 · Your first real project",
        caption: "Day 20 of Claude Code Summer. Your first real project, the Claude Code way: explore -> plan -> code -> commit. Approve each step and you'll amaze yourself - even with zero coding background. Comment PROJECT for a simple first idea to try this weekend.",
        cta: "Comment \"PROJECT\" and I'll DM you a simple first-project idea to try this weekend.",
      },
      {
        day: 21,
        slug: "ccs-21-save-your-work-git-github",
        keyword: "GIT",
        step: "Save your work (Git & GitHub)",
        hook: "Save your work safely - Git and GitHub, the simple version.",
        onScreen: "Day 21 · Save your work (Git & GitHub)",
        caption: "Day 21 of Claude Code Summer. Save your work without learning commands. Git = snapshots of your work; GitHub = where they live online. Just tell Claude in plain English: 'commit my changes' or 'put this on GitHub.' Comment GIT for the 3 phrases I use most.",
        cta: "Comment \"GIT\" and I'll DM you the 3 plain-English Git phrases I use most.",
      },
      {
        day: 22,
        slug: "ccs-22-review-changes-with-diff",
        keyword: "REVIEW",
        step: "Review changes with /diff",
        hook: "Always look before you save - the /diff habit.",
        onScreen: "Day 22 · Review changes with /diff",
        caption: "Day 22 of Claude Code Summer. Before you save, look. Type /diff to see every change Claude made - added and removed, line by line - so you approve the good and catch the rest. Review, then save. Comment REVIEW to read a diff without the overwhelm.",
        cta: "Comment \"REVIEW\" and I'll DM you how to read a /diff without the tech overwhelm.",
      },
      {
        day: 23,
        slug: "ccs-23-pick-up-where-you-left-off",
        keyword: "RESUME",
        step: "Pick up where you left off",
        hook: "Pick up right where you left off.",
        onScreen: "Day 23 · Pick up where you left off",
        caption: "Day 23 of Claude Code Summer. Closed your laptop mid-project? You haven't lost your place. Resume a past session and Claude remembers the whole thing - build in little pockets of time, never start over. Comment RESUME for the exact way to jump back in.",
        cta: "Comment \"RESUME\" and I'll DM you the exact way to resume a past session.",
      },
    ],
  },
  {
    id: "master",
    number: 4,
    title: "Master It",
    subtitle: "Debug, optimize, and run Claude Code like a pro.",
    days: [
      {
        day: 24,
        slug: "ccs-24-don-t-get-lost-in-a-big-project",
        keyword: "BIG",
        step: "Don't get lost in a big project",
        hook: "Don't get lost in a big project.",
        onScreen: "Day 24 · Don't get lost in a big project",
        caption: "Day 24 of Claude Code Summer. Big project, can't find anything? Just ask: 'where's the login part?' or 'how is this organized?' Claude reads it all and points you there. /init helps too. Comment BIG for my go-to questions to understand any project fast.",
        cta: "Comment \"BIG\" and I'll DM you my go-to questions to understand any big project fast.",
      },
      {
        day: 25,
        slug: "ccs-25-debugging-with-claude",
        keyword: "FIX",
        step: "Debugging with Claude",
        hook: "Let Claude fix your mistakes.",
        onScreen: "Day 25 · Debugging with Claude",
        caption: "Day 25 of Claude Code Summer. Something broke? Paste the error or say 'this isn't working' - Claude finds the problem, fixes it, and explains so you learn. You can even show it a screenshot. Comment FIX for the exact words to say when something breaks.",
        cta: "Comment \"FIX\" and I'll DM you the exact words to say when something breaks.",
      },
      {
        day: 26,
        slug: "ccs-26-shortcuts-tips",
        keyword: "TIPS",
        step: "Shortcuts & tips",
        hook: "Little shortcuts that make Claude Code feel easy.",
        onScreen: "Day 26 · Shortcuts & tips",
        caption: "Day 26 of Claude Code Summer. Little shortcuts, big difference: Shift+Tab (modes), up arrow (reuse last message), '/' (command menu), Esc (stop and steer), drag an image to show not tell. Comment TIPS for my one-page cheat sheet.",
        cta: "Comment \"TIPS\" and I'll DM you my one-page shortcuts cheat sheet.",
      },
      {
        day: 27,
        slug: "ccs-27-keep-your-costs-low",
        keyword: "SAVE",
        step: "Keep your costs low",
        hook: "Smart habits to keep your costs low.",
        onScreen: "Day 27 · Keep your costs low",
        caption: "Day 27 of Claude Code Summer. Keep Claude fast and your costs low: /clear for new tasks, /compact on long sessions, check /cost, and be specific in prompts. Tidy sessions = happy sessions. Comment SAVE for my simple weekly routine.",
        cta: "Comment \"SAVE\" and I'll DM you my simple weekly cost-saving routine.",
      },
      {
        day: 28,
        slug: "ccs-28-beginner-mistakes-to-avoid",
        keyword: "MISTAKES",
        step: "Beginner mistakes to avoid",
        hook: "Beginner mistakes to avoid with Claude Code.",
        onScreen: "Day 28 · Beginner mistakes to avoid",
        caption: "Day 28 of Claude Code Summer. 5 beginner mistakes to avoid: building before planning, skipping plan mode, never checking changes (/diff!), letting one chat run forever, and being vague. Avoid these and you're ahead of most. Comment MISTAKES for the full checklist.",
        cta: "Comment \"MISTAKES\" and I'll DM you the full beginner-mistakes checklist.",
      },
      {
        day: 29,
        slug: "ccs-29-my-favorite-workflow-start-to-finish",
        keyword: "FLOW",
        step: "My favorite workflow, start to finish",
        hook: "My favorite Claude Code workflow, start to finish.",
        onScreen: "Day 29 · My favorite workflow, start to finish",
        caption: "Day 29 of Claude Code Summer. My exact workflow: plan mode -> describe & answer questions -> review the plan -> approve & build (watch with /diff) -> verify -> save -> rewind if needed. Explore, plan, code, check, save. Comment FLOW for the printable one-pager.",
        cta: "Comment \"FLOW\" and I'll DM you my full workflow as a printable one-pager.",
      },
      {
        day: 30,
        slug: "ccs-30-recap-what-to-learn-next",
        keyword: "NEXT",
        step: "Recap + what to learn next",
        hook: "That's a wrap on Claude Code Summer!",
        onScreen: "Day 30 · Recap + what to learn next",
        caption: "Day 30 - that's a wrap on Claude Code Summer! You now know what Claude Code is, how to install and use it, the workflow, slash commands, CLAUDE.md, subagents, MCP and more - no tech background required. Keep building, save this, share it with a friend, and comment NEXT for where to go from here. Thank you for spending the summer with me!",
        cta: "Comment \"NEXT\" and I'll DM you where to go next after Claude Code Summer.",
      },
    ],
  },
];

export function allPlanDays(): PlanDay[] {
  return PLAN.flatMap((m) => m.days);
}

export function planDayBySlug(slug: string): PlanDay | undefined {
  return allPlanDays().find((d) => d.slug === slug);
}
