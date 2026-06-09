import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api, type Trip } from "@/api";
import { colors, statusColor } from "@/theme";

// Shows the signed-in driver's assigned / in-progress trips (scoped server-side
// via ?mine=driver).
const ACTIVE = ["ASSIGNED", "EN_ROUTE", "IN_PROGRESS"];

export default function Driver() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await api.listTrips({ mine: "driver" });
      setTrips(all.filter((t) => ACTIVE.includes(t.status)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(t: Trip, action: "start" | "complete") {
    await api.tripAction(t.id, action);
    load();
  }

  if (loading && trips.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      data={trips}
      keyExtractor={(t) => t.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
      ListEmptyComponent={<Text style={styles.empty}>No active trips. Pull to refresh.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={[styles.status, { color: statusColor[item.status] ?? colors.muted }]}>
            {item.status.replace("_", " ")}
          </Text>
          <Text style={styles.route}>{item.pickupAddress}</Text>
          <Text style={styles.muted}>→ {item.dropoffAddress}</Text>
          {item.vehicle && (
            <Text style={styles.muted}>{item.vehicle.plateNumber}</Text>
          )}
          <View style={styles.actions}>
            {item.status === "ASSIGNED" && (
              <Pressable style={styles.button} onPress={() => act(item, "start")}>
                <Text style={styles.buttonText}>Start trip</Text>
              </Pressable>
            )}
            {item.status === "IN_PROGRESS" && (
              <Pressable style={[styles.button, styles.complete]} onPress={() => act(item, "complete")}>
                <Text style={styles.buttonText}>Complete</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
  },
  status: { fontWeight: "800", fontSize: 13, marginBottom: 8, letterSpacing: 0.5 },
  route: { color: colors.text, fontSize: 16, fontWeight: "600" },
  muted: { color: colors.muted, marginTop: 2 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  button: { backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20 },
  complete: { backgroundColor: colors.green },
  buttonText: { color: "#fff", fontWeight: "700" },
  empty: { color: colors.muted, textAlign: "center", marginTop: 40 },
});
