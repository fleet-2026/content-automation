import { Platform, type SocialAccount } from "@prisma/client";
import { decrypt } from "@/lib/crypto";
import { InstagramClient } from "./instagram";
import { YouTubeClient } from "./youtube";
import { TikTokClient } from "./tiktok";
import type { PlatformClient } from "./base";

/**
 * Build a read-capable platform client from a stored SocialAccount.
 * Decrypts tokens and returns the right subclass per platform.
 */
export function clientFor(account: SocialAccount): PlatformClient {
  const accessToken = decrypt(account.accessToken);
  const refreshToken = account.refreshToken ? decrypt(account.refreshToken) : null;
  const expiresAt = account.tokenExpiry;

  switch (account.platform) {
    case Platform.INSTAGRAM: {
      // platformUserId stores the IG business account id
      return new InstagramClient(accessToken, account.platformUserId);
    }
    case Platform.YOUTUBE: {
      const meta = (account.metadata ?? {}) as { uploadsPlaylistId?: string };
      return new YouTubeClient(
        { accessToken, refreshToken, expiresAt },
        meta.uploadsPlaylistId,
      );
    }
    case Platform.TIKTOK: {
      return new TikTokClient({ accessToken, refreshToken, expiresAt });
    }
    default:
      throw new Error(`Unsupported platform: ${account.platform}`);
  }
}

export * from "./base";
