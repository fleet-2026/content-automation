import { promises as fs } from "fs";
import path from "path";

export type GeneratedFields = {
  hook: string;
  script: string;
  caption: string;
  hashtags: string[];
  keyword: string;
};

export type DailyPost = {
  slug: string;
  title: string;
  url: string;
  file?: string;
  index?: number;
  generated?: GeneratedFields;
  generated_at?: string;
  model?: string;
};

// Where generate_post_content.py writes its output.
// Override with FADIA_POSTS_DIR env var if your path differs.
export const POSTS_DIR =
  process.env.FADIA_POSTS_DIR ?? "C:/Users/serka/namaha/data/posts";

export async function listPosts(): Promise<DailyPost[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(POSTS_DIR);
  } catch {
    return [];
  }
  const posts: DailyPost[] = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(POSTS_DIR, name), "utf8");
      posts.push(JSON.parse(raw));
    } catch {
      // skip bad files
    }
  }
  posts.sort((a, b) => (a.index ?? 999) - (b.index ?? 999));
  return posts;
}

export async function getPost(slug: string): Promise<DailyPost | null> {
  const safe = slug.replace(/[^a-z0-9_-]/gi, "");
  if (!safe) return null;
  const p = path.join(POSTS_DIR, `${safe}.json`);
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function savePost(slug: string, patch: Partial<GeneratedFields>): Promise<boolean> {
  const post = await getPost(slug);
  if (!post) return false;
  post.generated = {
    hook: post.generated?.hook ?? "",
    script: post.generated?.script ?? "",
    caption: post.generated?.caption ?? "",
    hashtags: post.generated?.hashtags ?? [],
    keyword: post.generated?.keyword ?? "",
    ...patch,
  };
  const safe = slug.replace(/[^a-z0-9_-]/gi, "");
  const p = path.join(POSTS_DIR, `${safe}.json`);
  await fs.writeFile(p, JSON.stringify(post, null, 2), "utf8");
  return true;
}
