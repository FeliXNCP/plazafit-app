import { Stack } from 'expo-router'

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      
      <Stack.Screen
        name="plaza/[id]"
        options={{ headerShown: true, title: 'Detalle de plaza' }}
      />

      <Stack.Screen
        name="entrenamiento/[id]"
        options={{ headerShown: false,}}
      />

    </Stack>
  )
}