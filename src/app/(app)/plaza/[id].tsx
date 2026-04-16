import Ionicons from '@expo/vector-icons/Ionicons'
import * as Location from 'expo-location'
import { router, useLocalSearchParams } from 'expo-router'
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
import { getDistanceInMeters } from '../../../utils/distance'

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
  machineTypeId: number
  quantity: number
  notes: string | null
  name: string
  category: string | null
}

type PlazaRoutine = {
  id: number
  title: string
  description: string | null
  goal: string | null
  difficulty: string | null
  estimated_minutes: number | null
  is_featured: boolean
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
  const [distanceToPlaza, setDistanceToPlaza] = useState<number | null>(null)
  const [routines, setRoutines] = useState<PlazaRoutine[]>([])

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

      const [plazaRes, imagesRes, machinesRes, routinesRes] = await Promise.all([
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
            machine_type_id,
            quantity,
            notes,
            machine_types (
              name,
              category
            )
          `
          )
          .eq('plaza_id', plazaId),
        supabase
          .from('plaza_routines')
          .select('*')
          .eq('plaza_id', plazaId)
          .order('is_featured', { ascending: false })
          .order('created_at', { ascending: true }),
      ])

      if (plazaRes.error) throw plazaRes.error
      if (imagesRes.error) throw imagesRes.error
      if (machinesRes.error) throw machinesRes.error
      if (routinesRes.error) throw routinesRes.error

      setPlaza(plazaRes.data ?? null)
      setImages(imagesRes.data ?? [])
      setRoutines((routinesRes.data ?? []) as PlazaRoutine[])

      const normalizedMachines = ((machinesRes.data ?? []) as any[]).map((item) => {
        const machineType = Array.isArray(item.machine_types)
          ? item.machine_types[0]
          : item.machine_types

        return {
          id: item.id,
          machineTypeId: item.machine_type_id,
          quantity: item.quantity,
          notes: item.notes,
          name: machineType?.name ?? 'Máquina',
          category: machineType?.category ?? null,
        }
      })


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

    const servicesEnabled = await Location.hasServicesEnabledAsync()
    if (!servicesEnabled) {
      Alert.alert(
        'Ubicación desactivada',
        'Activa la ubicación del dispositivo para registrar tu visita.'
      )
      return
    }

    const permission = await Location.requestForegroundPermissionsAsync()
    if (permission.status !== 'granted') {
      Alert.alert(
        'Permiso necesario',
        'Necesitamos acceso a tu ubicación para validar la visita.'
      )
      return
    }

    let userLocation = await Location.getLastKnownPositionAsync({
      maxAge: 60 * 1000,
      requiredAccuracy: 100,
    })

    if (!userLocation) {
      userLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
    }

    const distance = getDistanceInMeters(
      userLocation.coords.latitude,
      userLocation.coords.longitude,
      plaza.lat,
      plaza.lng
    )

    setDistanceToPlaza(distance)

    const MAX_DISTANCE_METERS = 100

    if (distance > MAX_DISTANCE_METERS) {
      Alert.alert(
        'Demasiado lejos',
        `Debes estar a menos de ${MAX_DISTANCE_METERS} m de la plaza para registrar tu visita. Distancia actual: ${distance} m.`
      )
      return
    }

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
    Alert.alert('Visita registrada', `Ganaste 10 puntos. Distancia: ${distance} m.`)
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

      <Text style={styles.checkinHelpText}>
        Necesitas estar cerca de esta plaza para registrar la visita.
      </Text>

      {distanceToPlaza !== null && (
        <Text style={styles.distanceText}>
          Distancia detectada: {distanceToPlaza} m
        </Text>
      )}

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
        <Text style={styles.label}>Rutinas disponibles</Text>

        {routines.length === 0 ? (
          <Text style={styles.emptyText}>No hay rutinas registradas todavía.</Text>
        ) : (
          routines.map((routine) => (
            <Pressable
              key={routine.id}
              style={styles.routineCard}
              onPress={() =>
                router.push({
                  pathname: '/rutina/[id]',
                  params: { id: String(routine.id) },
                })
              }
            >
              <View style={{ flex: 1 }}>
                <View style={styles.routineHeaderRow}>
                  <Text style={styles.routineTitle}>{routine.title}</Text>

                  {routine.is_featured ? (
                    <View style={styles.featuredBadge}>
                      <Text style={styles.featuredBadgeText}>Destacada</Text>
                    </View>
                  ) : null}
                </View>

                {routine.description ? (
                  <Text style={styles.routineDescription}>{routine.description}</Text>
                ) : null}

                <View style={styles.routineMetaRow}>
                  {routine.goal ? (
                    <Text style={styles.routineMeta}>{routine.goal}</Text>
                  ) : null}

                  {routine.difficulty ? (
                    <Text style={styles.routineMeta}>{routine.difficulty}</Text>
                  ) : null}

                  {routine.estimated_minutes ? (
                    <Text style={styles.routineMeta}>{routine.estimated_minutes} min</Text>
                  ) : null}
                </View>
              </View>
            </Pressable>
          ))
        )}
      </View>



      <View style={styles.card}>
        <Text style={styles.label}>Máquinas disponibles</Text>

        {machines.length === 0 ? (
          <Text style={styles.emptyText}>No hay máquinas registradas todavía.</Text>
        ) : (
          machines.map((machine) => (
            <Pressable
              key={machine.id}
              style={styles.machineItem}
              onPress={() =>
                router.push({
                  pathname: '/maquina/[id]',
                  params: { 
                    id: String(machine.machineTypeId),
                    plazaId: String(plaza.id),
                   },
                })
              }
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.machineName}>{machine.name}</Text>

                {machine.category ? (
                  <Text style={styles.machineCategory}>{machine.category}</Text>
                ) : null}

                {machine.notes ? (
                  <Text style={styles.machineNotes}>{machine.notes}</Text>
                ) : null}
              </View>

              <View style={styles.machineRight}>
                <View style={styles.quantityBadge}>
                  <Text style={styles.quantityText}>x{machine.quantity}</Text>
                </View>
              </View>
            </Pressable>
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
  checkinHelpText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: -4,
  },
  distanceText: {
    fontSize: 14,
    color: '#166534',
    textAlign: 'center',
    fontWeight: '600',
  },
  machineRight: {
    marginLeft: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routineCard: {
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#ecfdf5',
  },
  routineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  routineTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  routineDescription: {
    fontSize: 14,
    color: '#4b5563',
    marginTop: 6,
    lineHeight: 20,
  },
  routineMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  routineMeta: {
    fontSize: 12,
    color: '#166534',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  featuredBadge: {
    backgroundColor: '#16a34a',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  featuredBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
})