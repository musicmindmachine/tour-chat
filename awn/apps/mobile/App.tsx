import { ConvexProvider, useMutation, useQuery } from "convex/react";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { api } from "@awn/convex/convex/api";
import { BoardFeed } from "./src/components/board-feed";
import { Button } from "./src/components/ui/button";
import { convex } from "./src/lib/convex";
import { useWorkOSMobileAuth } from "./src/lib/workos-auth";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function PushRegistration({ enabled }: { enabled: boolean }) {
  const convexApi = api as any;
  const recordPushToken = useMutation(convexApi.notifications.recordPushToken);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const register = async () => {
      if (!Device.isDevice) {
        return;
      }

      const { status: currentStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = currentStatus;

      if (currentStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        return;
      }

      const token = await Notifications.getExpoPushTokenAsync();
      await recordPushToken({ token: token.data });
    };

    void register();
  }, [enabled, recordPushToken]);

  return null;
}

function SignedInApp({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const convexApi = api as any;
  const syncCurrentUser = useMutation(convexApi.users.syncCurrentUser);
  const viewer = useQuery(convexApi.users.current);

  const hasSynced = useRef(false);

  useEffect(() => {
    if (hasSynced.current) {
      return;
    }

    hasSynced.current = true;
    void syncCurrentUser({});
  }, [syncCurrentUser]);

  if (viewer === undefined) {
    return (
      <View style={styles.centered}>
        <Text style={styles.subheading}>Loading account…</Text>
      </View>
    );
  }

  if (!viewer) {
    return (
      <View style={styles.centered}>
        <Text style={styles.subheading}>Finishing sign-in…</Text>
      </View>
    );
  }

  const isActive = viewer.status === "active";

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Awn mobile</Text>
        <Text style={styles.subheading}>Signed in as @{viewer.username}</Text>
        <View style={styles.headerButtons}>
          <Button label="Sign out" variant="outline" onPress={() => void onSignOut()} />
        </View>
      </View>

      <PushRegistration enabled={isActive} />
      <BoardFeed />
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

function AuthGate() {
  const auth = useWorkOSMobileAuth();
  const { isAuthenticated, fetchAccessToken } = auth;

  useEffect(() => {
    if (isAuthenticated) {
      convex.setAuth(({ forceRefreshToken }) => fetchAccessToken({ forceRefreshToken }));
      return;
    }

    convex.clearAuth();
  }, [fetchAccessToken, isAuthenticated]);

  if (auth.isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.heading}>Awn mobile</Text>
          <Text style={styles.subheading}>Preparing authentication…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.heading}>Awn mobile</Text>
          <Text style={styles.subheading}>Sign in with WorkOS to access your boards.</Text>
          <View style={styles.signInButton}>
            <Button label="Sign in with WorkOS" onPress={() => void auth.signIn()} />
          </View>
          {auth.error ? <Text style={styles.errorText}>{auth.error}</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  return <SignedInApp onSignOut={auth.signOut} />;
}

export default function App() {
  return (
    <ConvexProvider client={convex}>
      <AuthGate />
    </ConvexProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 10,
  },
  header: {
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
  heading: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
  },
  subheading: {
    color: "#64748b",
    textAlign: "center",
  },
  headerButtons: {
    alignItems: "flex-end",
    marginTop: 8,
  },
  signInButton: {
    marginTop: 10,
    minWidth: 220,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
  },
});
