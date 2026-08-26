import Ionicons from '@expo/vector-icons/Ionicons'
import * as Location from 'expo-location'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { ImageViewerModal } from '../../../components/media/ImageViewerModal'
import { supabase } from '../../../lib/supabase'
import { useSession } from '../../../providers/session-provider'
import type { Database } from '../../../types/database.types'
import { getDistanceInMeters } from '../../../utils/distance'

type Plaza = Database['public']['Tables']['plazas']['Row']
type PlazaImage = Database['public']['Tables']['plaza_images']['Row']

type PlazaMachineRaw = {
  id: number
  machine_type_id: number
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

function getPlazaImageUrl(path: string) {
  const { data } = supabase.storage.from('plaza-images').getPublicUrl(path)
  return data.publicUrl
}

function getLocationText(plaza: Plaza) {
  const address = plaza.direccion?.trim()
  const commune = plaza.comuna?.trim()

  if (!address) {
    return commune || 'Ubicación sin registrar'
  }

  if (
    commune &&
    !address.toLocaleLowerCase('es-CL').includes(
      commune.toLocaleLowerCase('es-CL')
    )
  ) {
    return `${address}, ${commune}`
  }

  return address
}

export default function PlazaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useSession()

  const [plaza, setPlaza] = useState<Plaza | null>(null)
  const [images, setImages] = useState<PlazaImage[]>([])
  const [machines, setMachines] = useState<NormalizedMachine[]>([])
  const [routines, setRoutines] = useState<PlazaRoutine[]>([])

  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(false)
  const [checkedInToday, setCheckedInToday] = useState(false)
  const [isFavorite, setIsFavorite] = useState(false)
  const [favoriteLoading, setFavoriteLoading] = useState(false)
  const [distanceToPlaza, setDistanceToPlaza] = useState<number | null>(null)

  const [imageViewerVisible, setImageViewerVisible] = useState(false)
  const [imageViewerIndex, setImageViewerIndex] = useState(0)

  const fetchDetailData = useCallback(async () => {
    if (!id) return

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

      const normalizedMachines = (
        (machinesRes.data ?? []) as PlazaMachineRaw[]
      ).map((item) => {
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
  }, [id])

  const checkTodayCheckin = useCallback(async () => {
    if (!session?.user?.id || !id) return

    const today = new Date().toISOString().slice(0, 10)

    const { data, error } = await supabase
      .from('plaza_checkins')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('plaza_id', Number(id))
      .eq('checkin_day', today)
      .maybeSingle()

    setCheckedInToday(!error && Boolean(data))
  }, [id, session?.user?.id])

  const checkFavoriteStatus = useCallback(async () => {
    if (!session?.user?.id || !id) return

    const { data, error } = await supabase
      .from('favorite_plazas')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('plaza_id', Number(id))
      .maybeSingle()

    setIsFavorite(!error && Boolean(data))
  }, [id, session?.user?.id])

  useEffect(() => {
    void fetchDetailData()
  }, [fetchDetailData])

  useEffect(() => {
    void checkTodayCheckin()
  }, [checkTodayCheckin])

  useEffect(() => {
    void checkFavoriteStatus()
  }, [checkFavoriteStatus])

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
          Alert.alert(
            'Ya registrado',
            'Ya registraste una visita en esta plaza hoy.'
          )
          return
        }

        throw error
      }

      setCheckedInToday(true)
      Alert.alert(
        'Visita registrada',
        `Ganaste 10 puntos. Distancia: ${distance} m.`
      )
    } catch (error: any) {
      Alert.alert('Error', error.message ?? 'No se pudo registrar la visita.')
    } finally {
      setRegistering(false)
    }
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
      Alert.alert(
        'Error',
        error.message ?? 'No se pudo actualizar favorito.'
      )
    } finally {
      setFavoriteLoading(false)
    }
  }

  async function handleDirections() {
    if (!plaza) return

    const destination = `${plaza.lat},${plaza.lng}`
    const url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=walking`

    try {
      const supported = await Linking.canOpenURL(url)

      if (!supported) {
        Alert.alert(
          'No se pudo abrir el mapa',
          'No encontramos una aplicación compatible para mostrar la ruta.'
        )
        return
      }

      await Linking.openURL(url)
    } catch (error: any) {
      Alert.alert(
        'No se pudo abrir la ruta',
        error.message ?? 'Intenta nuevamente.'
      )
    }
  }


  const coverImage = useMemo(() => {
    if (images.length === 0) return null
    return images.find((image) => image.is_cover) ?? images[0]
  }, [images])

  const orderedImages = useMemo(() => {
    if (!coverImage) return []

    return [
      coverImage,
      ...images.filter((image) => image.id !== coverImage.id),
    ]
  }, [coverImage, images])

  const galleryImages = useMemo(
    () => orderedImages.slice(1),
    [orderedImages]
  )

  const imageUrls = useMemo(
    () => orderedImages.map((image) => getPlazaImageUrl(image.storage_path)),
    [orderedImages]
  )

  const featuredRoutine = useMemo(
    () => routines.find((routine) => routine.is_featured) ?? routines[0] ?? null,
    [routines]
  )

  const otherRoutines = useMemo(
    () =>
      featuredRoutine
        ? routines.filter((routine) => routine.id !== featuredRoutine.id)
        : routines,
    [featuredRoutine, routines]
  )

  function openImageViewer(index: number) {
    if (imageUrls.length === 0) return

    setImageViewerIndex(index)
    setImageViewerVisible(true)
  }

  function openRoutine(routineId: number) {
    router.push({
      pathname: '/rutina/[id]',
      params: { id: String(routineId) },
    })
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
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

  const locationText = getLocationText(plaza)

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroWrapper}>
          {coverImage ? (
            <Pressable
              style={styles.heroPressable}
              onPress={() => openImageViewer(0)}
            >
              <Image
                source={{ uri: imageUrls[0] }}
                style={styles.heroImage}
              />
            </Pressable>
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="image-outline" size={42} color="#15803d" />
              <Text style={styles.imagePlaceholderText}>Sin imagen</Text>
            </View>
          )}

          <Pressable
            style={[
              styles.favoriteFloatingButton,
              isFavorite && styles.favoriteFloatingButtonActive,
            ]}
            onPress={() => void handleToggleFavorite()}
            disabled={favoriteLoading}
            accessibilityRole="button"
            accessibilityLabel={
              isFavorite ? 'Quitar plaza de favoritos' : 'Guardar plaza en favoritos'
            }
          >
            {favoriteLoading ? (
              <ActivityIndicator
                size="small"
                color={isFavorite ? '#ffffff' : '#166534'}
              />
            ) : (
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={22}
                color={isFavorite ? '#ffffff' : '#166534'}
              />
            )}
          </Pressable>

          {imageUrls.length > 0 ? (
            <Pressable
              style={styles.photoCountBadge}
              onPress={() => openImageViewer(0)}
            >
              <Ionicons name="images-outline" size={15} color="#ffffff" />
              <Text style={styles.photoCountText}>
                {imageUrls.length} {imageUrls.length === 1 ? 'foto' : 'fotos'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.identityBlock}>
          <Text style={styles.title}>{plaza.nombre}</Text>

          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={18} color="#15803d" />
            <Text style={styles.locationText}>{locationText}</Text>
          </View>

          <View style={styles.summaryBadgesRow}>
            <View style={styles.summaryBadge}>
              <Ionicons name="fitness-outline" size={14} color="#166534" />
              <Text style={styles.summaryBadgeText}>
                {routines.length} {routines.length === 1 ? 'rutina' : 'rutinas'}
              </Text>
            </View>

            <View style={styles.summaryBadge}>
              <Ionicons name="barbell-outline" size={14} color="#166534" />
              <Text style={styles.summaryBadgeText}>
                {machines.length} {machines.length === 1 ? 'tipo' : 'tipos'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            style={[
              styles.checkinAction,
              checkedInToday && styles.checkinActionCompleted,
            ]}
            onPress={() => void handleCheckin()}
            disabled={registering || checkedInToday}
          >
            {registering ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons
                name={checkedInToday ? 'checkmark-circle' : 'location-outline'}
                size={19}
                color={checkedInToday ? '#166534' : '#ffffff'}
              />
            )}

            <Text
              style={[
                styles.checkinActionText,
                checkedInToday && styles.checkinActionTextCompleted,
              ]}
            >
              {checkedInToday
                ? 'Visita registrada'
                : registering
                  ? 'Validando...'
                  : 'Registrar visita'}
            </Text>
          </Pressable>

          <Pressable
            style={styles.directionsAction}
            onPress={() => void handleDirections()}
          >
            <Ionicons name="navigate-outline" size={19} color="#166534" />
            <Text style={styles.directionsActionText}>Cómo llegar</Text>
          </Pressable>
        </View>

        <Text style={styles.checkinHelpText}>
          Necesitas estar a menos de 100 m para registrar la visita.
        </Text>

        {distanceToPlaza !== null ? (
          <Text style={styles.distanceText}>
            Distancia detectada: {distanceToPlaza} m
          </Text>
        ) : null}

        {featuredRoutine ? (
          <View style={styles.featuredRoutineCard}>
            <View style={styles.featuredRoutineHeader}>
              <View style={styles.featuredRoutineIcon}>
                <Ionicons name="flash-outline" size={22} color="#166534" />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.featuredRoutineEyebrow}>
                  Rutina recomendada
                </Text>
                <Text style={styles.featuredRoutineTitle}>
                  {featuredRoutine.title}
                </Text>
              </View>
            </View>

            {featuredRoutine.description ? (
              <Text style={styles.featuredRoutineDescription}>
                {featuredRoutine.description}
              </Text>
            ) : null}

            <View style={styles.featuredRoutineMetaRow}>
              {featuredRoutine.goal ? (
                <Text style={styles.featuredRoutineMeta}>
                  {featuredRoutine.goal}
                </Text>
              ) : null}

              {featuredRoutine.difficulty ? (
                <Text style={styles.featuredRoutineMeta}>
                  {featuredRoutine.difficulty}
                </Text>
              ) : null}

              {featuredRoutine.estimated_minutes ? (
                <Text style={styles.featuredRoutineMeta}>
                  {featuredRoutine.estimated_minutes} min
                </Text>
              ) : null}
            </View>

            <Pressable
              style={styles.featuredRoutineButton}
              onPress={() => openRoutine(featuredRoutine.id)}
            >
              <Ionicons name="play" size={18} color="#166534" />
              <Text style={styles.featuredRoutineButtonText}>
                Comenzar rutina
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.label}>Rutinas</Text>
            <Text style={styles.emptyText}>
              Esta plaza todavía no tiene rutinas disponibles.
            </Text>
          </View>
        )}

        {otherRoutines.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.label}>Más rutinas</Text>

            {otherRoutines.map((routine) => (
              <Pressable
                key={routine.id}
                style={styles.routineCard}
                onPress={() => openRoutine(routine.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.routineTitle}>{routine.title}</Text>

                  {routine.description ? (
                    <Text style={styles.routineDescription} numberOfLines={2}>
                      {routine.description}
                    </Text>
                  ) : null}

                  <View style={styles.routineMetaRow}>
                    {routine.goal ? (
                      <Text style={styles.routineMeta}>{routine.goal}</Text>
                    ) : null}

                    {routine.difficulty ? (
                      <Text style={styles.routineMeta}>
                        {routine.difficulty}
                      </Text>
                    ) : null}

                    {routine.estimated_minutes ? (
                      <Text style={styles.routineMeta}>
                        {routine.estimated_minutes} min
                      </Text>
                    ) : null}
                  </View>
                </View>

                <Ionicons name="chevron-forward" size={21} color="#16a34a" />
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.label}>Máquinas disponibles</Text>

          {machines.length === 0 ? (
            <Text style={styles.emptyText}>
              No hay máquinas registradas todavía.
            </Text>
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
                      plazaMachineId: String(machine.id),
                      origin: 'map',
                    },
                  })
                }
              >
                <View style={styles.machineIcon}>
                  <Ionicons name="barbell-outline" size={20} color="#166534" />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.machineName}>{machine.name}</Text>

                  {machine.category ? (
                    <Text style={styles.machineCategory}>
                      {machine.category}
                    </Text>
                  ) : null}

                  {machine.notes ? (
                    <Text style={styles.machineNotes}>{machine.notes}</Text>
                  ) : null}
                </View>

                <View style={styles.machineRight}>
                  <View style={styles.quantityBadge}>
                    <Text style={styles.quantityText}>x{machine.quantity}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#16a34a" />
                </View>
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Acerca de la plaza</Text>
          <Text style={styles.description}>
            {plaza.descripcion ?? 'Sin descripción disponible'}
          </Text>
        </View>

        {galleryImages.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.label, styles.labelWithoutMargin]}>
                Galería
              </Text>
              <Text style={styles.sectionCount}>{imageUrls.length} fotos</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.galleryRow}
            >
              {galleryImages.map((image, index) => (
                <Pressable
                  key={image.id}
                  onPress={() => openImageViewer(index + 1)}
                >
                  <Image
                    source={{ uri: imageUrls[index + 1] }}
                    style={styles.galleryImage}
                  />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>

      <ImageViewerModal
        visible={imageViewerVisible}
        images={imageUrls}
        initialIndex={imageViewerIndex}
        title={plaza.nombre}
        onClose={() => setImageViewerVisible(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f0fdf4',
  },
  scrollView: {
    flex: 1,
  },
  container: {
    padding: 16,
    paddingBottom: 34,
    gap: 14,
  },
  center: {
    flex: 1,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroWrapper: {
    height: 250,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#dcfce7',
    position: 'relative',
  },
  heroPressable: {
    flex: 1,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imagePlaceholderText: {
    color: '#15803d',
    fontSize: 15,
    fontWeight: '700',
  },
  favoriteFloatingButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  favoriteFloatingButtonActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  photoCountBadge: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(17,24,39,0.78)',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  photoCountText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  identityBlock: {
    gap: 8,
  },
  title: {
    color: '#111827',
    fontSize: 29,
    fontWeight: '900',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  locationText: {
    flex: 1,
    color: '#4b5563',
    fontSize: 14,
    lineHeight: 20,
  },
  summaryBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  summaryBadgeText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  checkinAction: {
    flex: 1,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  checkinActionCompleted: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  checkinActionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  checkinActionTextCompleted: {
    color: '#166534',
  },
  directionsAction: {
    flex: 1,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  directionsActionText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '800',
  },
  checkinHelpText: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
    marginTop: -5,
  },
  distanceText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: -6,
  },
  featuredRoutineCard: {
    backgroundColor: '#166534',
    borderRadius: 20,
    padding: 18,
  },
  featuredRoutineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  featuredRoutineIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredRoutineEyebrow: {
    color: '#86efac',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  featuredRoutineTitle: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '900',
    marginTop: 2,
  },
  featuredRoutineDescription: {
    color: '#dcfce7',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 13,
  },
  featuredRoutineMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 13,
  },
  featuredRoutineMeta: {
    color: '#166534',
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '800',
  },
  featuredRoutineButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderRadius: 13,
    marginTop: 16,
  },
  featuredRoutineButtonText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '900',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 17,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  label: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 9,
  },
  labelWithoutMargin: {
    marginBottom: 0,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },
  sectionCount: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 20,
  },
  routineCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#ecfdf5',
    paddingVertical: 13,
  },
  routineTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  routineDescription: {
    color: '#4b5563',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  routineMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 8,
  },
  routineMeta: {
    color: '#166534',
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '700',
  },
  machineItem: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#ecfdf5',
    paddingVertical: 12,
  },
  machineIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  machineName: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },
  machineCategory: {
    color: '#15803d',
    fontSize: 12,
    marginTop: 2,
  },
  machineNotes: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 3,
  },
  machineRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  quantityBadge: {
    minWidth: 40,
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 7,
    alignItems: 'center',
  },
  quantityText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '900',
  },
  description: {
    color: '#374151',
    fontSize: 15,
    lineHeight: 23,
  },
  galleryRow: {
    gap: 10,
  },
  galleryImage: {
    width: 170,
    height: 115,
    borderRadius: 13,
    backgroundColor: '#dcfce7',
  },
})
