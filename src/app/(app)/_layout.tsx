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


      <Stack.Screen
        name="logros"
        options={{
          headerShown: true,
          title: 'Logros',
          headerTintColor: '#166534',
          headerStyle: {
            backgroundColor: '#f0fdf4',
          },
          headerShadowVisible: false,
        }}
      />

      <Stack.Screen
        name="misiones"
        options={{
          headerShown: true,
          title: 'Misiones semanales',
          headerTintColor: '#166534',
          headerStyle: {
            backgroundColor: '#f0fdf4',
          },
          headerShadowVisible: false,
        }}
      />


      <Stack.Screen
        name="historial/index"
        options={{
          headerShown: true,
          title: 'Historial',
          headerTintColor: '#166534',
          headerStyle: {
            backgroundColor: '#f0fdf4',
          },
          headerShadowVisible: false,
        }}
      />

      <Stack.Screen
        name="historial/[id]"
        options={{
          headerShown: true,
          title: 'Detalle del entrenamiento',
          headerTintColor: '#166534',
          headerStyle: {
            backgroundColor: '#f0fdf4',
          },
          headerShadowVisible: false,
        }}
      />

    </Stack>
  )
}