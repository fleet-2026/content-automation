import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * SSRF-safe fetch.
 *
 * Use this whenever the URL came from user input. Blocks:
 *  - Non-http(s) schemes
 *  - Localhost / link-local / private IP ranges (IPv4 + IPv6)
 *  - Cloud metadata endpoints (169.254.169.254, fd00:ec2::254, etc.)
 *  - Responses larger than maxBytes
 *  - Redirects that resolve to private addresses (re-validates each hop)
 *
 * If you only need an allowlist (e.g. trusted CDN), pass `allowedHosts`.
 */

export type SafeFetchOptions = {
  /** Hard cap on response size. Default 8 MB. */
  maxBytes?: number;
  /** Connection + read timeout. Default 20s. */
  timeoutMs?: number;
  /** Optional host allowlist (exact match, case-insensitive, no port). */
  allowedHosts?: string[];
  /** Max redirect hops. Default 3. */
  maxRedirects?: number;
};

const DEFAULTS: Required<SafeFetchOptions> = {
  maxBytes: 8 * 1024 * 1024,
  timeoutMs: 20_000,
  allowedHosts: [],
  maxRedirects: 3,
};

export class SafeFetchError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "SafeFetchError";
  }
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // malformed — treat as unsafe
  }
  const [a, b] = parts;
  // 0.0.0.0/8
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local + AWS metadata)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 100.64.0.0/10 (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 224.0.0.0/4 (multicast)
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 (reserved)
  if (a >= 240) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("ff")) return true; // multicast
  // ::ffff:127.0.0.1 etc — IPv4-mapped
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice(7);
    if (net.isIPv4(v4)) return isPrivateIPv4(v4);
  }
  // GCP metadata: ::ffff:169.254.169.254 already covered above
  return false;
}

function isPrivateAddress(addr: string): boolean {
  if (net.isIPv4(addr)) return isPrivateIPv4(addr);
  if (net.isIPv6(addr)) return isPrivateIPv6(addr);
  return true; // unknown family → unsafe
}

async function assertSafeUrl(rawUrl: string, allowedHosts: string[]): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SafeFetchError(`Invalid URL: ${rawUrl.slice(0, 200)}`, "invalid_url");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SafeFetchError(`Disallowed scheme: ${parsed.protocol}`, "bad_scheme");
  }
  if (parsed.username || parsed.password) {
    throw new SafeFetchError("URL credentials not allowed", "url_credentials");
  }

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "ip6-localhost" || host === "ip6-loopback") {
    throw new SafeFetchError("localhost is blocked", "private_host");
  }

  if (allowedHosts.length > 0) {
    const ok = allowedHosts.some((h) => host === h.toLowerCase() || host.endsWith("." + h.toLowerCase()));
    if (!ok) {
      throw new SafeFetchError(`Host not in allowlist: ${host}`, "host_not_allowed");
    }
  }

  // If host is a literal IP, validate directly.
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new SafeFetchError(`Private IP blocked: ${host}`, "private_ip");
    }
    return parsed;
  }

  // Otherwise resolve all addresses (A + AAAA) and reject if any is private.
  let resolved: { address: string; family: number }[];
  try {
    resolved = await lookup(host, { all: true });
  } catch {
    throw new SafeFetchError(`DNS lookup failed for ${host}`, "dns_failed");
  }
  if (resolved.length === 0) {
    throw new SafeFetchError(`No addresses for ${host}`, "no_addresses");
  }
  for (const r of resolved) {
    if (isPrivateAddress(r.address)) {
      throw new SafeFetchError(`${host} resolves to private address ${r.address}`, "private_ip");
    }
  }

  return parsed;
}

export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions & { headers?: Record<string, string> } = {},
): Promise<{ buffer: Buffer; contentType: string; status: number; finalUrl: string }> {
  const opts = { ...DEFAULTS, ...options };

  let currentUrl = rawUrl;
  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    const url = await assertSafeUrl(currentUrl, opts.allowedHosts);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        redirect: "manual", // we handle redirects ourselves so we can re-validate
        signal: ctrl.signal,
        headers: options.headers,
      });
    } catch (e) {
      clearTimeout(timer);
      throw new SafeFetchError(
        `Fetch failed: ${(e as Error).message}`,
        (e as Error).name === "AbortError" ? "timeout" : "fetch_failed",
      );
    } finally {
      clearTimeout(timer);
    }

    // Manual redirect handling
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        throw new SafeFetchError(`Redirect with no Location header`, "bad_redirect");
      }
      // Resolve relative redirects against current URL
      currentUrl = new URL(loc, url).toString();
      continue;
    }

    if (!res.ok) {
      throw new SafeFetchError(
        `Upstream ${res.status} ${res.statusText}`,
        "upstream_error",
      );
    }

    // Streamed read with size cap.
    const reader = res.body?.getReader();
    if (!reader) {
      throw new SafeFetchError("Response had no body stream", "no_body");
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > opts.maxBytes) {
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
          throw new SafeFetchError(
            `Response exceeds ${opts.maxBytes} bytes`,
            "too_large",
          );
        }
        chunks.push(value);
      }
    }
    return {
      buffer: Buffer.concat(chunks),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
      status: res.status,
      finalUrl: url.toString(),
    };
  }

  throw new SafeFetchError("Too many redirects", "too_many_redirects");
}
