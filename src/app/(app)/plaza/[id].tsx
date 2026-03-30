import { useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { supabase } from '../../../lib/supabase'
import { useSession } from '../../../providers/session-provider'
import type { Database } from '../../../types/database.types'

type Plaza = Database['public']['Tables']['plazas']['Row']

export default function PlazaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useSession()

  const [plaza, setPlaza] = useState<Plaza | null>(null)
  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(false)
  const [checkedInToday, setCheckedInToday] = useState(false)

  useEffect(() => {
    if (!id) return
    fetchPlaza()
  }, [id])

  useEffect(() => {
    if (!id || !session?.user?.id) return
    checkTodayCheckin()
  }, [id, session?.user?.id])

  async function fetchPlaza() {
    const { data } = await supabase
      .from('plazas')
      .select('*')
      .eq('id', Number(id))
      .single()

    setPlaza(data ?? null)
    setLoading(false)
  }

  async function checkTodayCheckin() {
    if (!session?.user?.id || !id) return

    const today = new Date().toISOString().slice(0, 10)

    const { data, error } = await supabase
      .from('plaza_checkins')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('plaza_id', Number(id))
      .eq('checkin_day', today)
      .maybeSingle()

    if (!error && data) {
      setCheckedInToday(true)
    } else {
      setCheckedInToday(false)
    }
  }

  async function handleCheckin() {
    if (!session?.user?.id || !plaza) return

    try {
      setRegistering(true)

      const { error } = await supabase.from('plaza_checkins').insert({
        user_id: session.user.id,
        plaza_id: plaza.id,
        points: 10,
      })

      if (error) {
        if (error.code === '23505') {
          setCheckedInToday(true)
          Alert.alert('Ya registrado', 'Ya registraste una visita en esta plaza hoy.')
          return
        }

        throw error
      }

      setCheckedInToday(true)
      Alert.alert('Visita registrada', 'Ganaste 10 puntos.')
    } catch (error: any) {
      Alert.alert('Error', error.message ?? 'No se pudo registrar la visita.')
    } finally {
      setRegistering(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (!plaza) {
    return (
      <View style={styles.center}>
        <Text>No se encontró la plaza.</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {plaza.imagen_url ? (
        <Image source={{ uri: plaza.imagen_url }} style={styles.image} />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.imagePlaceholderText}>Sin imagen</Text>
        </View>
      )}

      <Text style={styles.title}>{plaza.nombre}</Text>
      <Text style={styles.subtitle}>{plaza.comuna}</Text>

      <Pressable
        style={[
          styles.checkinButton,
          checkedInToday && styles.checkinButtonDisabled,
        ]}
        onPress={handleCheckin}
        disabled={registering || checkedInToday}
      >
        <Text style={styles.checkinButtonText}>
          {checkedInToday
            ? 'Visita ya registrada hoy'
            : registering
            ? 'Registrando...'
            : 'Registrar visita (+10 puntos)'}
        </Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.label}>Dirección</Text>
        <Text style={styles.value}>
          {plaza.direccion ?? 'Sin dirección registrada'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Máquinas</Text>
        <Text style={styles.value}>{plaza.cantidad_maquinas}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Descripción</Text>
        <Text style={styles.description}>
          {plaza.descripcion ?? 'Sin descripción disponible'}
        </Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f0fdf4',
  },
  container: {
    padding: 16,
    gap: 14,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    backgroundColor: '#dcfce7',
  },
  imagePlaceholder: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    color: '#15803d',
    fontSize: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 16,
    color: '#15803d',
    marginTop: -6,
  },
  checkinButton: {
    backgroundColor: '#16a34a',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  checkinButtonDisabled: {
    backgroundColor: '#86efac',
  },
  checkinButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16a34a',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  value: {
    fontSize: 17,
    color: '#111827',
  },
  description: {
    fontSize: 16,
    color: '#111827',
    lineHeight: 24,
  },
})