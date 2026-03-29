import { useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { supabase } from '../../../lib/supabase'
import type { Database } from '../../../types/database.types'

type Plaza = Database['public']['Tables']['plazas']['Row']

export default function PlazaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [plaza, setPlaza] = useState<Plaza | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    fetchPlaza()
  }, [id])

  async function fetchPlaza() {
    const { data } = await supabase
      .from('plazas')
      .select('*')
      .eq('id', Number(id))
      .single()

    setPlaza(data ?? null)
    setLoading(false)
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
  card: {
    backgroundColor: '#fff',
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