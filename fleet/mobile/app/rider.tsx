import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import * as Location from "expo-location";
import { api, type Trip } from "@/api";
import { colors, statusColor } from "@/theme";

const FALLBACK_REGION: Region = {
  latitude: 30.0444, // Cairo
  longitude: 31.2357,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export default function Rider() {
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [region, setRegion] = useState<Region>(FALLBACK_REGION);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  // On open, grab the device location and reverse-geocode it into the pickup field.
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({});
      const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setCoords(c);
      setRegion({ ...c, latitudeDelta: 0.02, longitudeDelta: 0.02 });
      try {
        const [place] = await Location.reverseGeocodeAsync(c);
        if (place) {
          setPickup([place.name, place.street, place.city].filter(Boolean).join(", "));
        }
      } catch {
        /* address is optional */
      }
    })();
  }, []);

  // Poll the trip while it's active so the rider sees the driver get assigned.
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
      // Best-effort geocode of the pickup if we don't already have GPS coords.
      let pLat = coords?.latitude;
      let pLng = coords?.longitude;
      if (pLat == null) {
        try {
          const [g] = await Location.geocodeAsync(pickup);
          if (g) {
            pLat = g.latitude;
            pLng = g.longitude;
          }
        } catch {
          /* coords are optional */
        }
      }
      setTrip(
        await api.requestTrip({
          pickupAddress: pickup,
          dropoffAddress: dropoff,
          pickupLat: pLat,
          pickupLng: pLng,
        })
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setTrip(null);
    setDropoff("");
  }

  return (
    <View style={styles.container}>
      <MapView style={styles.map} region={region}>
        {coords && <Marker coordinate={coords} title="Pickup" pinColor={colors.brand} />}
      </MapView>

      {trip ? (
        <View style={styles.sheet}>
          <Text style={[styles.status, { color: statusColor[trip.status] ?? colors.muted }]}>
            {trip.status.replace("_", " ")}
          </Text>
          <Text style={styles.route}>{trip.pickupAddress} → {trip.dropoffAddress}</Text>
          {trip.driver ? (
            <Text style={styles.driver}>
              {trip.driver.name}
              {trip.vehicle ? ` · ${trip.vehicle.plateNumber}` : ""}
            </Text>
          ) : (
            <View style={styles.findingRow}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.muted}>Finding a driver…</Text>
            </View>
          )}
          <Pressable style={styles.secondary} onPress={reset}>
            <Text style={styles.secondaryText}>Book another trip</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.sheet}>
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  sheet: {
    backgroundColor: colors.panel,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    padding: 20,
    gap: 8,
  },
  label: { color: colors.muted, fontSize: 13 },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 13,
    color: colors.text,
    fontSize: 16,
  },
  button: { backgroundColor: colors.brand, borderRadius: 10, padding: 15, alignItems: "center", marginTop: 10 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: colors.red },
  status: { fontSize: 18, fontWeight: "800" },
  route: { color: colors.text, fontSize: 15, fontWeight: "600" },
  driver: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 4 },
  findingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  muted: { color: colors.muted },
  secondary: { paddingVertical: 12, alignItems: "center" },
  secondaryText: { color: colors.brand, fontWeight: "600" },
});
