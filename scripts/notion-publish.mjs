#!/usr/bin/env node
/**
 * notion-publish.mjs
 *
 * Publishes the Markdown prompt guides in ./notion-prompts/ into a Notion
 * workspace as nested pages (one sub-page per guide file), converting the
 * Markdown into native Notion blocks (headings, bullets, quotes, dividers,
 * with bold/italic/code inline formatting).
 *
 * USAGE
 *   NOTION_TOKEN=ntn_xxx NOTION_PARENT=<page-url-or-id> node scripts/notion-publish.mjs
 *
 *   # validate parsing without touching Notion (no token needed):
 *   node scripts/notion-publish.mjs --dry-run
 *
 * REQUIREMENTS
 *   - Node 18+ (uses global fetch). This repo runs Node 22.
 *   - A Notion internal integration token (https://www.notion.so/my-integrations)
 *   - The parent page shared with that integration (page ••• -> Connections -> add)
 *
 * No external dependencies.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GUIDES_DIR = join(__dirname, "..", "notion-prompts");
const NOTION_VERSION = "2022-06-28";
const API = "https://api.notion.com/v1";

const DRY_RUN = process.argv.includes("--dry-run");
const TOKEN = process.env.NOTION_TOKEN;
const PARENT_RAW = process.env.NOTION_PARENT || process.argv.find((a) => !a.startsWith("-") && (a.includes("notion.so") || /[0-9a-f]{32}/i.test(a)));

// ----------------------------- helpers --------------------------------------

/** Extract a 32-char Notion id from a URL or raw id and dash-format it. */
function toPageId(input) {
  if (!input) return null;
  const compact = input.replace(/-/g, "");
  const m = compact.match(/[0-9a-f]{32}/i);
  if (!m) return null;
  const id = m[0];
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

/** Convert inline markdown (**bold**, *italic*, `code`) into Notion rich_text. */
function richText(text) {
  if (!text) return [];
  const out = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(plain(text.slice(last, m.index)));
    if (m[2] !== undefined) out.push(plain(m[2], { bold: true }));
    else if (m[3] !== undefined) out.push(plain(m[3], { italic: true }));
    else if (m[4] !== undefined) out.push(plain(m[4], { code: true }));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(plain(text.slice(last)));
  // Notion caps a single text content at 2000 chars; our lines are far shorter.
  return out.filter((t) => t.text.content.length > 0);
}

function plain(content, annotations = {}) {
  return { type: "text", text: { content }, annotations };
}

function block(type, richTextArr, extra = {}) {
  return { object: "block", type, [type]: { rich_text: richTextArr, ...extra } };
}

/** Parse one markdown document into an array of Notion blocks. */
function mdToBlocks(md) {
  const lines = md.split("\n");
  const blocks = [];
  let lastListBlock = null; // for one level of nesting

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (trimmed.startsWith("<!--")) continue; // html comment separators
    const indent = line.length - line.trimStart().length;

    if (trimmed === "---" || trimmed === "***") {
      blocks.push({ object: "block", type: "divider", divider: {} });
      lastListBlock = null;
      continue;
    }

    let m;
    if ((m = trimmed.match(/^#{4,6}\s+(.*)$/))) {
      blocks.push(block("heading_3", richText(m[1])));
      lastListBlock = null;
    } else if ((m = trimmed.match(/^###\s+(.*)$/))) {
      blocks.push(block("heading_3", richText(m[1])));
      lastListBlock = null;
    } else if ((m = trimmed.match(/^##\s+(.*)$/))) {
      blocks.push(block("heading_2", richText(m[1])));
      lastListBlock = null;
    } else if ((m = trimmed.match(/^#\s+(.*)$/))) {
      blocks.push(block("heading_1", richText(m[1])));
      lastListBlock = null;
    } else if ((m = trimmed.match(/^>\s?(.*)$/))) {
      blocks.push(block("quote", richText(m[1])));
      lastListBlock = null;
    } else if ((m = trimmed.match(/^[-*]\s+(.*)$/))) {
      const b = block("bulleted_list_item", richText(m[1]));
      if (indent >= 2 && lastListBlock) {
        (lastListBlock[lastListBlock.type].children ||= []).push(b);
      } else {
        blocks.push(b);
        lastListBlock = b;
      }
    } else if ((m = trimmed.match(/^\d+\.\s+(.*)$/))) {
      const b = block("numbered_list_item", richText(m[1]));
      if (indent >= 2 && lastListBlock) {
        (lastListBlock[lastListBlock.type].children ||= []).push(b);
      } else {
        blocks.push(b);
        lastListBlock = b;
      }
    } else {
      blocks.push(block("paragraph", richText(trimmed)));
      lastListBlock = null;
    }
  }
  return blocks;
}

/** First H1 in the doc becomes the page title; returns {title, body}. */
function splitTitle(md) {
  const lines = md.split("\n");
  let title = "Untitled";
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(/^#\s+(.*)$/);
    if (m) {
      title = m[1].replace(/\*\*/g, "").trim();
      idx = i;
      break;
    }
  }
  const body = idx >= 0 ? lines.slice(idx + 1).join("\n") : md;
  return { title, body };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ----------------------------- Notion API -----------------------------------

async function notion(path, method, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion ${method} ${path} -> ${res.status}: ${text}`);
  }
  return res.json();
}

async function createPage(parentId, title, blocks) {
  const first = blocks.slice(0, 100);
  const rest = blocks.slice(100);
  const page = await notion("/pages", "POST", {
    parent: { type: "page_id", page_id: parentId },
    properties: { title: { title: richText(title) } },
    children: first,
  });
  for (const batch of chunk(rest, 100)) {
    await notion(`/blocks/${page.id}/children`, "PATCH", { children: batch });
  }
  return page;
}

// ----------------------------- main -----------------------------------------

function guideFiles() {
  return readdirSync(GUIDES_DIR)
    .filter((f) => /^\d+-.*\.md$/.test(f) && !f.startsWith("00-"))
    .sort();
}

async function main() {
  const files = guideFiles();
  if (files.length === 0) {
    console.error(`No guide files found in ${GUIDES_DIR}`);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log(`DRY RUN — parsing ${files.length} guides (no Notion calls)\n`);
    let totalBlocks = 0;
    for (const f of files) {
      const md = readFileSync(join(GUIDES_DIR, f), "utf8");
      const { title, body } = splitTitle(md);
      const blocks = mdToBlocks(body);
      const counts = blocks.reduce((a, b) => ((a[b.type] = (a[b.type] || 0) + 1), a), {});
      totalBlocks += blocks.length;
      console.log(`• ${f}`);
      console.log(`    title: "${title}"`);
      console.log(`    blocks: ${blocks.length} ${JSON.stringify(counts)}`);
    }
    console.log(`\nParsed OK. ${files.length} pages, ${totalBlocks} total blocks.`);
    console.log("Run for real with: NOTION_TOKEN=... NOTION_PARENT=<page url> node scripts/notion-publish.mjs");
    return;
  }

  if (!TOKEN) {
    console.error("Missing NOTION_TOKEN env var. Get one at https://www.notion.so/my-integrations");
    process.exit(1);
  }
  const parentId = toPageId(PARENT_RAW);
  if (!parentId) {
    console.error("Missing/invalid NOTION_PARENT (pass the parent page URL or id). It must be shared with your integration.");
    process.exit(1);
  }

  console.log(`Publishing ${files.length} guides into Notion parent ${parentId}\n`);
  const created = [];
  for (const f of files) {
    const md = readFileSync(join(GUIDES_DIR, f), "utf8");
    const { title, body } = splitTitle(md);
    const blocks = mdToBlocks(body);
    process.stdout.write(`  → ${title} (${blocks.length} blocks)… `);
    const page = await createPage(parentId, title, blocks);
    created.push({ title, url: page.url });
    console.log("done");
  }

  console.log(`\n✅ Created ${created.length} pages:`);
  for (const c of created) console.log(`   - ${c.title}: ${c.url}`);
}

main().catch((e) => {
  console.error("\n❌ " + e.message);
  process.exit(1);
});
