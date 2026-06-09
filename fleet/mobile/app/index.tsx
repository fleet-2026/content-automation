import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth";
import { colors } from "@/theme";

export default function Home() {
  const { user, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hi, {user?.name?.split(" ")[0] ?? "there"} 👋</Text>
      <Text style={styles.subtitle}>Book a ride from your company fleet</Text>

      <Link href="/rider" style={[styles.card, styles.brandCard]}>
        <Text style={styles.cardTitle}>Book a trip</Text>
        <Text style={styles.cardSub}>Request a ride and track your driver live</Text>
      </Link>

      {(user?.role === "DRIVER" || user?.role === "ADMIN") && (
        <Link href="/driver" style={styles.card}>
          <Text style={styles.cardTitle}>Driver mode</Text>
          <Text style={styles.cardSub}>See assigned trips, start & complete them</Text>
        </Link>
      )}

      <Pressable onPress={signOut} style={styles.signout}>
        <Text style={styles.signoutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 14 },
  title: { color: colors.text, fontSize: 30, fontWeight: "800", marginTop: 16 },
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
  signout: { marginTop: "auto", padding: 14, alignItems: "center" },
  signoutText: { color: colors.muted, fontWeight: "600" },
});
