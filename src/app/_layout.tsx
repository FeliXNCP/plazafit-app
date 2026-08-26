import { Stack } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { SessionProvider, useSession } from '../providers/session-provider'

import {
  useNotificationNavigation,
} from '../hooks/use-notification-navigation'

function RootNavigator() {
  const { session, loading } = useSession()

  
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
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