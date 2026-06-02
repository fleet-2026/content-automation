import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, type Trip } from "@/api";
import { colors, statusColor } from "@/theme";

export default function Rider() {
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll the trip status while one is active so the rider sees driver assignment.
  useEffect(() => {
    if (trip && trip.status !== "COMPLETED" && trip.status !== "CANCELLED") {
      poll.current = setInterval(async () => {
        try {
          setTrip(await api.getTrip(trip.id));
        } catch {
          /* keep last known state */
        }
      }, 3000);
    }
    return () => {
      if (poll.current) clearInterval(poll.current);
    };
  }, [trip?.id, trip?.status]);

  async function book() {
    if (!pickup.trim() || !dropoff.trim()) {
      setError("Enter both pickup and drop-off.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      setTrip(await api.requestTrip({ pickupAddress: pickup, dropoffAddress: dropoff }));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setTrip(null);
    setPickup("");
    setDropoff("");
  }

  if (trip) {
    return (
      <View style={styles.container}>
        <View style={styles.statusCard}>
          <Text style={[styles.status, { color: statusColor[trip.status] ?? colors.muted }]}>
            {trip.status.replace("_", " ")}
          </Text>
          <Text style={styles.route}>{trip.pickupAddress}</Text>
          <Text style={styles.routeArrow}>↓</Text>
          <Text style={styles.route}>{trip.dropoffAddress}</Text>

          {trip.driver ? (
            <View style={styles.driverBox}>
              <Text style={styles.driverName}>{trip.driver.name}</Text>
              {trip.vehicle && (
                <Text style={styles.muted}>
                  {trip.vehicle.make} {trip.vehicle.model} · {trip.vehicle.plateNumber}
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.driverBox}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.muted}>Finding a driver…</Text>
            </View>
          )}
        </View>

        <Pressable style={styles.secondary} onPress={reset}>
          <Text style={styles.secondaryText}>Book another trip</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Pickup</Text>
      <TextInput
        style={styles.input}
        placeholder="Where from?"
        placeholderTextColor={colors.muted}
        value={pickup}
        onChangeText={setPickup}
      />
      <Text style={styles.label}>Drop-off</Text>
      <TextInput
        style={styles.input}
        placeholder="Where to?"
        placeholderTextColor={colors.muted}
        value={dropoff}
        onChangeText={setDropoff}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={book} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Request trip</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 10 },
  label: { color: colors.muted, fontSize: 13, marginTop: 8 },
  input: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    color: colors.text,
    fontSize: 16,
  },
  button: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: colors.red, marginTop: 6 },
  statusCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 22,
    alignItems: "center",
  },
  status: { fontSize: 22, fontWeight: "800", marginBottom: 16 },
  route: { color: colors.text, fontSize: 16, fontWeight: "600", textAlign: "center" },
  routeArrow: { color: colors.muted, fontSize: 18, marginVertical: 4 },
  driverBox: {
    marginTop: 20,
    alignItems: "center",
    gap: 4,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 18,
    width: "100%",
  },
  driverName: { color: colors.text, fontSize: 18, fontWeight: "700" },
  muted: { color: colors.muted },
  secondary: { padding: 16, alignItems: "center", marginTop: 12 },
  secondaryText: { color: colors.brand, fontWeight: "600" },
});
