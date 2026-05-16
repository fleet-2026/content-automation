import { ApifyClient } from "apify-client";

let _client: ApifyClient | null = null;
export function apify(): ApifyClient {
  if (_client) return _client;
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is not set");
  _client = new ApifyClient({ token });
  return _client;
}

/** Run an Apify actor and return the dataset items when finished. */
export async function runActor<T = unknown>(
  actorId: string,
  input: Record<string, unknown>,
  options?: { timeoutSec?: number; memoryMbytes?: number },
): Promise<T[]> {
  const run = await apify().actor(actorId).call(input, {
    timeout: options?.timeoutSec ?? 600,
    memory: options?.memoryMbytes ?? 1024,
  });
  if (!run.defaultDatasetId) return [];
  const { items } = await apify().dataset(run.defaultDatasetId).listItems();
  return items as T[];
}
