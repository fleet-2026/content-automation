import Constants from "expo-constants";

// Points at the server-web Next.js app. On a physical device, replace
// localhost with your machine's LAN IP (e.g. http://192.168.1.20:3001) via
// app.json -> expo.extra.apiBaseUrl.
const BASE_URL: string =
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  "http://localhost:3001";

export type Trip = {
  id: string;
  status: string;
  pickupAddress: string;
  dropoffAddress: string;
  fare?: number | null;
  distanceKm?: number | null;
  driver?: { name: string } | null;
  vehicle?: { plateNumber: string; make: string; model: string } | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  baseUrl: BASE_URL,

  requestTrip(input: { pickupAddress: string; dropoffAddress: string; riderId?: string }) {
    return request<Trip>("/api/trips", { method: "POST", body: JSON.stringify(input) });
  },

  getTrip(id: string) {
    return request<Trip>(`/api/trips/${id}`);
  },

  listTrips(status?: string) {
    return request<Trip[]>(`/api/trips${status ? `?status=${status}` : ""}`);
  },

  tripAction(id: string, action: "assign" | "start" | "complete" | "cancel") {
    return request<Trip>(`/api/trips/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    });
  },
};
