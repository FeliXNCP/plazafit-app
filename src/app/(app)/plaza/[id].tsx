import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
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
type PlazaImage = Database['public']['Tables']['plaza_images']['Row']

type PlazaMachineRaw = {
  id: number
  quantity: number
  notes: string | null
  machine_types:
    | {
        name: string
        category: string | null
      }
    | {
        name: string
        category: string | null
      }[]
    | null
}

type NormalizedMachine = {
  id: number
  quantity: number
  notes: string | null
  name: string
  category: string | null
}

export default function PlazaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useSession()

  const [plaza, setPlaza] = useState<Plaza | null>(null)
  const [images, setImages] = useState<PlazaImage[]>([])
  const [machines, setMachines] = useState<NormalizedMachine[]>([])
  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(false)
  const [checkedInToday, setCheckedInToday] = useState(false)
  const [isFavorite, setIsFavorite] = useState(false)
  const [favoriteLoading, setFavoriteLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    fetchDetailData()
  }, [id])

  useEffect(() => {
    if (!id || !session?.user?.id) return
    checkTodayCheckin()
  }, [id, session?.user?.id])

  useEffect(() => {
  if (!id || !session?.user?.id) return
  checkFavoriteStatus()
  }, [id, session?.user?.id])

  async function fetchDetailData() {
    try {
      setLoading(true)

      const plazaId = Number(id)

      const [plazaRes, imagesRes, machinesRes] = await Promise.all([
        supabase.from('plazas').select('*').eq('id', plazaId).single(),
        supabase
          .from('plaza_images')
          .select('*')
          .eq('plaza_id', plazaId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('plaza_machines')
          .select(
            `
            id,
            quantity,
            notes,
            machine_types (
              name,
              category
            )
          `
          )
          .eq('plaza_id', plazaId),
      ])

      if (plazaRes.error) throw plazaRes.error
      if (imagesRes.error) throw imagesRes.error
      if (machinesRes.error) throw machinesRes.error

      setPlaza(plazaRes.data ?? null)
      setImages(imagesRes.data ?? [])

      const normalizedMachines = ((machinesRes.data ?? []) as PlazaMachineRaw[]).map(
        (item) => {
          const machineType = Array.isArray(item.machine_types)
            ? item.machine_types[0]
            : item.machine_types

          return {
            id: item.id,
            quantity: item.quantity,
            notes: item.notes,
            name: machineType?.name ?? 'Máquina',
            category: machineType?.category ?? null,
          }
        }
      )

      setMachines(normalizedMachines)
    } catch (error: any) {
      Alert.alert('Error', error.message ?? 'No se pudo cargar la plaza.')
    } finally {
      setLoading(false)
    }
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

    if (!error && data) setCheckedInToday(true)
    else setCheckedInToday(false)
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

  async function checkFavoriteStatus() {
  if (!session?.user?.id || !id) return

  const { data, error } = await supabase
    .from('favorite_plazas')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('plaza_id', Number(id))
    .maybeSingle()

  if (!error && data) setIsFavorite(true)
  else setIsFavorite(false)
}

async function handleToggleFavorite() {
  if (!session?.user?.id || !plaza) return

  try {
    setFavoriteLoading(true)

    if (isFavorite) {
      const { error } = await supabase
        .from('favorite_plazas')
        .delete()
        .eq('user_id', session.user.id)
        .eq('plaza_id', plaza.id)

      if (error) throw error
      setIsFavorite(false)
    } else {
      const { error } = await supabase.from('favorite_plazas').insert({
        user_id: session.user.id,
        plaza_id: plaza.id,
      })

      if (error) throw error
      setIsFavorite(true)
    }
  } catch (error: any) {
    Alert.alert('Error', error.message ?? 'No se pudo actualizar favorito.')
  } finally {
    setFavoriteLoading(false)
  }
}

  function getPublicImageUrl(path: string) {
    const { data } = supabase.storage.from('plaza-images').getPublicUrl(path)
    return data.publicUrl
  }

  const coverImage = useMemo(() => {
    if (!images.length) return null
    return images.find((img) => img.is_cover) ?? images[0]
  }, [images])

  const galleryImages = useMemo(() => {
    if (!images.length) return []
    return images.filter((img) => !coverImage || img.id !== coverImage.id)
  }, [images, coverImage])

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
      {coverImage ? (
        <Image
          source={{ uri: getPublicImageUrl(coverImage.storage_path) }}
          style={styles.image}
        />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.imagePlaceholderText}>Sin imagen</Text>
        </View>
      )}

      <Text style={styles.title}>{plaza.nombre}</Text>
      <Text style={styles.subtitle}>{plaza.comuna}</Text>

      <Pressable
        style={[
          styles.favoriteButton,
          isFavorite && styles.favoriteButtonActive,
        ]}
        onPress={handleToggleFavorite}
        disabled={favoriteLoading}
      >
        <Ionicons
          name={isFavorite ? 'heart' : 'heart-outline'}
          size={18}
          color={isFavorite ? '#fff' : '#166534'}
        />
        <Text
          style={[
            styles.favoriteButtonText,
            isFavorite && styles.favoriteButtonTextActive,
          ]}
        >
          {favoriteLoading
            ? 'Actualizando...'
            : isFavorite
            ? 'Quitar de favoritos'
            : 'Guardar en favoritos'}
        </Text>
      </Pressable>


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

      {galleryImages.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.label}>Galería</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.galleryRow}
          >
            {galleryImages.map((img) => (
              <Image
                key={img.id}
                source={{ uri: getPublicImageUrl(img.storage_path) }}
                style={styles.galleryImage}
              />
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>Máquinas disponibles</Text>

        {machines.length === 0 ? (
          <Text style={styles.emptyText}>No hay máquinas registradas todavía.</Text>
        ) : (
          machines.map((machine) => (
            <View key={machine.id} style={styles.machineItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.machineName}>{machine.name}</Text>

                {machine.category ? (
                  <Text style={styles.machineCategory}>{machine.category}</Text>
                ) : null}

                {machine.notes ? (
                  <Text style={styles.machineNotes}>{machine.notes}</Text>
                ) : null}
              </View>

              <View style={styles.quantityBadge}>
                <Text style={styles.quantityText}>x{machine.quantity}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Dirección</Text>
        <Text style={styles.value}>
          {plaza.direccion ?? 'Sin dirección registrada'}
        </Text>
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
    height: 240,
    borderRadius: 16,
    backgroundColor: '#dcfce7',
  },
  imagePlaceholder: {
    width: '100%',
    height: 240,
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
    marginBottom: 10,
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
  galleryRow: {
    gap: 10,
  },
  galleryImage: {
    width: 160,
    height: 110,
    borderRadius: 12,
    backgroundColor: '#dcfce7',
  },
  emptyText: {
    fontSize: 15,
    color: '#6b7280',
  },
  machineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#ecfdf5',
  },
  machineName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  machineCategory: {
    fontSize: 13,
    color: '#15803d',
    marginTop: 2,
  },
  machineNotes: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  quantityBadge: {
    minWidth: 42,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  quantityText: {
    color: '#166534',
    fontWeight: '700',
  },
  favoriteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 14,
    paddingVertical: 14,
  },
  favoriteButtonActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  favoriteButtonText: {
    color: '#166534',
    fontWeight: '700',
    fontSize: 15,
  },
  favoriteButtonTextActive: {
    color: '#fff',
  },
})