import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme";

export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>FleetOS</Text>
      <Text style={styles.subtitle}>Book a ride from your company fleet</Text>

      <Link href="/rider" style={[styles.card, styles.brandCard]}>
        <Text style={styles.cardTitle}>I&apos;m a rider</Text>
        <Text style={styles.cardSub}>Request a trip and track your driver</Text>
      </Link>

      <Link href="/driver" style={styles.card}>
        <Text style={styles.cardTitle}>I&apos;m a driver</Text>
        <Text style={styles.cardSub}>See assigned trips, start & complete them</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 14 },
  title: { color: colors.text, fontSize: 34, fontWeight: "800", marginTop: 20 },
  subtitle: { color: colors.muted, fontSize: 15, marginBottom: 16 },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 20,
  },
  brandCard: { borderColor: colors.brand },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  cardSub: { color: colors.muted, marginTop: 4 },
});
