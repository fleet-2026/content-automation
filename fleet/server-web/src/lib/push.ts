// Minimal Expo push sender. Expo accepts a batch of messages at this endpoint
// and handles APNs/FCM delivery for us — no native key management for the MVP.
// Docs: https://docs.expo.dev/push-notifications/sending-notifications/

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type PushMessage = {
  to: string; // Expo push token, e.g. ExponentPushToken[xxx]
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export async function sendPush(messages: PushMessage[]): Promise<void> {
  const valid = messages.filter((m) => m.to && m.to.startsWith("ExponentPushToken"));
  if (valid.length === 0) return;
  try {
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(valid),
    });
  } catch (err) {
    // Never let a failed notification break the request that triggered it.
    console.error("[push] send failed:", err);
  }
}
