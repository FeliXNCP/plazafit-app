import { useMemo } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { supabase } from '../../../lib/supabase'
import { useSession } from '../../../providers/session-provider'

export default function ProfileScreen() {
  const { session } = useSession()

  const email = useMemo(() => session?.user?.email ?? 'Sin email', [session])

  async function handleLogout() {
    const { error } = await supabase.auth.signOut()
    if (error) {
      Alert.alert('Error', error.message)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.label}>Correo</Text>
        <Text style={styles.email}>{email}</Text>

        <Pressable style={styles.button} onPress={handleLogout}>
          <Text style={styles.buttonText}>Cerrar sesión</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16a34a',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  email: {
    fontSize: 16,
    color: '#111827',
  },
  button: {
    marginTop: 24,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
})