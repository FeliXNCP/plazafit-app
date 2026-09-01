import { Stack } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import {
  useNotificationNavigation,
} from '../hooks/use-notification-navigation'
import {
  SessionProvider,
  useSession,
} from '../providers/session-provider'

function RootNavigator() {
  const { session, loading } = useSession()

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator
          size="large"
          color="#16a34a"
        />
      </View>
    )
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      {/*
       * Estas rutas deben permanecer fuera de los grupos protegidos:
       * - verify-recovery-code aún no tiene sesión.
       * - reset-password se usa con la sesión temporal creada por verifyOtp.
       */}
      <Stack.Screen
        name="verify-recovery-code"
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="reset-password"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  )
}

export default function RootLayout() {
  useNotificationNavigation()

  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
  },
})
