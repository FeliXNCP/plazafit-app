import { Stack } from 'expo-router'

import {
  useWorkoutReminderSync,
} from '../../hooks/use-workout-reminder-sync'

import {
  useSession,
} from '../../providers/session-provider'



export default function AppLayout() {
    const { session } = useSession()

  useWorkoutReminderSync(
    session?.user?.id
  )

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

      <Stack.Screen
        name="recordatorios"
        options={{
          headerShown: true,
          title: 'Recordatorios',
          headerTintColor: '#166534',
          headerStyle: {
            backgroundColor: '#f0fdf4',
          },
          headerShadowVisible: false,
        }}
      />

      <Stack.Screen
        name="ejercicios-casa"
        options={{
          headerShown: true,
          title: 'Ejercicios para ti',
          headerTintColor: '#166534',
          headerStyle: {
            backgroundColor: '#f0fdf4',
          },
          headerShadowVisible: false,
        }}
      />

      <Stack.Screen
        name="plan-casa"
        options={{
          headerShown: true,
          title: 'Mi plan Home Gym',
          headerTintColor: '#166534',
          headerStyle: {
            backgroundColor: '#f0fdf4',
          },
          headerShadowVisible: false,
        }}
      />

      <Stack.Screen
        name="home-gym-ia"
        options={{
          headerShown: true,
          title: 'Propuesta con IA',
          headerTintColor: '#166534',
          headerStyle: { backgroundColor: '#f0fdf4' },
          headerShadowVisible: false,
        }}
      />


    </Stack>
  )
}