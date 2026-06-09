import Constants from "expo-constants";

// Points at the server-web Next.js app. On a physical device, replace
// localhost with your machine's LAN IP (e.g. http://192.168.1.20:3001) via
// app.json -> expo.extra.apiBaseUrl.
const BASE_URL: string =
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  "http://localhost:3001";

export type SessionUser = { id: string; email: string; name: string; role: string };

export type Trip = {
  id: string;
  status: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  fare?: number | null;
  distanceKm?: number | null;
  driver?: { name: string } | null;
  vehicle?: { plateNumber: string; make: string; model: string } | null;
};

// The current bearer token, injected by the auth provider after sign-in.
let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  baseUrl: BASE_URL,

  login(email: string, password: string) {
    return request<{ token: string; user: SessionUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  registerPushToken(pushToken: string) {
    return request<{ ok: boolean }>("/api/auth/push-token", {
      method: "POST",
      body: JSON.stringify({ pushToken }),
    });
  },

  requestTrip(input: {
    pickupAddress: string;
    dropoffAddress: string;
    pickupLat?: number;
    pickupLng?: number;
  }) {
    return request<Trip>("/api/trips", { method: "POST", body: JSON.stringify(input) });
  },

  getTrip(id: string) {
    return request<Trip>(`/api/trips/${id}`);
  },

  listTrips(params?: { status?: string; mine?: "rider" | "driver" }) {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.mine) q.set("mine", params.mine);
    const qs = q.toString();
    return request<Trip[]>(`/api/trips${qs ? `?${qs}` : ""}`);
  },

  tripAction(id: string, action: "assign" | "start" | "complete" | "cancel") {
    return request<Trip>(`/api/trips/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    });
  },
};
