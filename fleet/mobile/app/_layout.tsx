import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "@/theme";

export default function Layout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.panel },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Fleet" }} />
        <Stack.Screen name="rider" options={{ title: "Book a trip" }} />
        <Stack.Screen name="driver" options={{ title: "Driver" }} />
      </Stack>
    </>
  );
}
