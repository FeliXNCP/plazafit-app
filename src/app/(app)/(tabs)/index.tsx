import Ionicons from '@expo/vector-icons/Ionicons'
import * as Location from 'expo-location'
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
} from 'react-native-maps'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { useSession } from '../../../providers/session-provider'
import {
  computeWalkingRoute,
} from '../../../services/routing/walking-route-service'
import type { Database } from '../../../types/database.types'
import { getDistanceInMeters } from '../../../utils/distance'
import {
  decodeGooglePolyline,
  type MapCoordinate,
} from '../../../utils/polyline'

type PlazaBase = Pick<
  Database['public']['Tables']['plazas']['Row'],
  'id' | 'nombre' | 'comuna' | 'direccion' | 'lat' | 'lng'
>

type FavoriteRow = {
  plaza_id: number
}

type PlazaMapItem = PlazaBase & {
  isFavorite: boolean
}

type UserMapLocation = {
  latitude: number
  longitude: number
  accuracy: number | null
  timestamp: number
}

type NearestPlazaResult = {
  plaza: PlazaMapItem
  distanceMeters: number
}

type ActiveWalkingRoute = {
  destination: PlazaMapItem
  origin: UserMapLocation
  coordinates: MapCoordinate[]
  distanceMeters: number
  durationSeconds: number
}

type LocationRequestOptions = {
  centerOnResult?: boolean
  preferFresh?: boolean
}

const INITIAL_REGION = {
  latitude: -33.4489,
  longitude: -70.6693,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
}

const USER_REGION_DELTA = 0.015
const PLAZA_REGION_DELTA = 0.02

const PLAZAFIT_LIGHT_MAP_STYLE = [
  {
    elementType: 'geometry',
    stylers: [{ color: '#f7faf7' }],
  },
  {
    elementType: 'labels.text.fill',
    stylers: [{ color: '#4b5563' }],
  },
  {
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#ffffff' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#ffffff' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#d1d5db' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#e5e7eb' }],
  },
  {
    featureType: 'landscape',
    elementType: 'geometry',
    stylers: [{ color: '#f0fdf4' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.business',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#dcfce7' }],
  },
  {
    featureType: 'transit',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#dbeafe' }],
  },
]

function formatDistance(distanceMeters: number) {
  const safeDistance = Math.max(0, distanceMeters)

  if (safeDistance < 1000) {
    return `${Math.round(safeDistance)} m`
  }

  const distanceKm = safeDistance / 1000

  return `${
    distanceKm < 10
      ? distanceKm.toFixed(1)
      : Math.round(distanceKm)
  } km`
}

function formatRouteDuration(durationSeconds: number) {
  const totalMinutes = Math.max(
    1,
    Math.ceil(Math.max(0, durationSeconds) / 60)
  )

  if (totalMinutes < 60) {
    return `${totalMinutes} min`
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return minutes > 0
    ? `${hours} h ${minutes} min`
    : `${hours} h`
}

export default function MapScreen() {
  const { session } = useSession()

  const {
    routeToPlazaId,
    routeRequestId,
  } = useLocalSearchParams<{
    routeToPlazaId?: string
    routeRequestId?: string
  }>()

  const [plazas, setPlazas] =
    useState<PlazaMapItem[]>([])

  const [selectedPlaza, setSelectedPlaza] =
    useState<PlazaMapItem | null>(null)

  const [searchText, setSearchText] =
    useState('')

  const [showOnlyFavorites, setShowOnlyFavorites] =
    useState(false)

  const [loading, setLoading] =
    useState(true)

  const [userLocation, setUserLocation] =
    useState<UserMapLocation | null>(null)

  const [locating, setLocating] =
    useState(false)

  const [routeDestination, setRouteDestination] =
    useState<PlazaMapItem | null>(null)

  const [activeRoute, setActiveRoute] =
    useState<ActiveWalkingRoute | null>(null)

  const [routeLoading, setRouteLoading] =
    useState(false)

  const [routeError, setRouteError] =
    useState<string | null>(null)

  /*
   * Android puede perder la capa nativa de overlays
   * de react-native-maps al cambiar de pestaña.
   * Este contador permite volver a montar únicamente
   * marcadores y polylines al recuperar el foco, sin
   * recargar plazas ni reiniciar el estado de la ruta.
   */
  const [overlayRevision, setOverlayRevision] =
    useState(0)

  const mapRef = useRef<MapView | null>(null)
  const processedRouteRequestRef =
    useRef<string | null>(null)
  const routeOperationRef = useRef(0)

  const insets = useSafeAreaInsets()

  useFocusEffect(
    useCallback(() => {
      /*
       * Esperamos a que la pestaña vuelva a estar
       * completamente visible antes de recrear los
       * overlays nativos. Esto evita el caso en que
       * el mapa reaparece, pero sus marcadores quedan
       * fuera de la capa de Google Maps en Android.
       */
      const timer = setTimeout(() => {
        setOverlayRevision(
          (current) => current + 1
        )
      }, 120)

      return () => clearTimeout(timer)
    }, [])
  )

  const fetchMapData = useCallback(async () => {
    if (!session?.user?.id) return

    try {
      setLoading(true)

      const [plazasRes, favoritesRes] =
        await Promise.all([
          supabase
            .from('plazas')
            .select(
              'id, nombre, comuna, direccion, lat, lng'
            )
            .eq('activa', true),

          supabase
            .from('favorite_plazas')
            .select('plaza_id')
            .eq(
              'user_id',
              session.user.id
            ),
        ])

      if (plazasRes.error) {
        throw plazasRes.error
      }

      if (favoritesRes.error) {
        throw favoritesRes.error
      }

      const favoriteIds = new Set(
        (
          (favoritesRes.data ?? []) as FavoriteRow[]
        ).map(
          (favorite) => favorite.plaza_id
        )
      )

      const merged = (
        (plazasRes.data ?? []) as PlazaBase[]
      ).map((plaza) => ({
        ...plaza,
        isFavorite: favoriteIds.has(plaza.id),
      }))

      setPlazas(merged)
    } catch (error) {
      console.error(
        'Error loading map data:',
        error
      )
    } finally {
      setLoading(false)
    }
  }, [session?.user?.id])

  useEffect(() => {
    void fetchMapData()
  }, [fetchMapData])

  const filteredPlazas = useMemo(() => {
    const query = searchText
      .trim()
      .toLowerCase()

    return plazas.filter((plaza) => {
      const matchesSearch =
        query.length === 0 ||
        plaza.nombre
          .toLowerCase()
          .includes(query) ||
        plaza.comuna
          .toLowerCase()
          .includes(query) ||
        (plaza.direccion ?? '')
          .toLowerCase()
          .includes(query)

      const matchesFavorite =
        showOnlyFavorites
          ? plaza.isFavorite
          : true

      return (
        matchesSearch && matchesFavorite
      )
    })
  }, [
    plazas,
    searchText,
    showOnlyFavorites,
  ])

  const hasActiveFilter =
    searchText.trim().length > 0 ||
    showOnlyFavorites

  const displayedPlazas = useMemo(
    () =>
      routeDestination
        ? [routeDestination]
        : filteredPlazas,
    [filteredPlazas, routeDestination]
  )

  useEffect(() => {
    if (
      routeDestination ||
      !hasActiveFilter ||
      filteredPlazas.length !== 1
    ) {
      return
    }

    const [plaza] = filteredPlazas

    const timer = setTimeout(() => {
      mapRef.current?.animateToRegion(
        {
          latitude: plaza.lat,
          longitude: plaza.lng,
          latitudeDelta: PLAZA_REGION_DELTA,
          longitudeDelta: PLAZA_REGION_DELTA,
        },
        500
      )
    }, 250)

    return () => clearTimeout(timer)
  }, [
    filteredPlazas,
    hasActiveFilter,
    routeDestination,
  ])

  useEffect(() => {
    if (
      !selectedPlaza ||
      routeDestination
    ) {
      return
    }

    const stillVisible =
      filteredPlazas.some(
        (plaza) =>
          plaza.id === selectedPlaza.id
      )

    if (!stillVisible) {
      setSelectedPlaza(null)
    }
  }, [
    filteredPlazas,
    routeDestination,
    selectedPlaza,
  ])

  const nearestPlaza =
    useMemo<NearestPlazaResult | null>(
      () => {
        if (
          !userLocation ||
          plazas.length === 0
        ) {
          return null
        }

        let nearest:
          | NearestPlazaResult
          | null = null

        for (const plaza of plazas) {
          const distanceMeters =
            getDistanceInMeters(
              userLocation.latitude,
              userLocation.longitude,
              plaza.lat,
              plaza.lng
            )

          if (
            !nearest ||
            distanceMeters <
              nearest.distanceMeters
          ) {
            nearest = {
              plaza,
              distanceMeters,
            }
          }
        }

        return nearest
      },
      [plazas, userLocation]
    )

  const selectedPlazaDistance =
    useMemo(() => {
      if (
        !selectedPlaza ||
        !userLocation
      ) {
        return null
      }

      return getDistanceInMeters(
        userLocation.latitude,
        userLocation.longitude,
        selectedPlaza.lat,
        selectedPlaza.lng
      )
    }, [selectedPlaza, userLocation])

  const centerOnUserLocation = useCallback(
    (location: UserMapLocation) => {
      mapRef.current?.animateToRegion(
        {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: USER_REGION_DELTA,
          longitudeDelta: USER_REGION_DELTA,
        },
        500
      )
    },
    []
  )

  const obtainUserLocation = useCallback(
    async (
      options: LocationRequestOptions = {}
    ): Promise<UserMapLocation | null> => {
      const {
        centerOnResult = false,
        preferFresh = false,
      } = options

      const servicesEnabled =
        await Location.hasServicesEnabledAsync()

      if (!servicesEnabled) {
        Alert.alert(
          'Ubicación desactivada',
          'Activa la ubicación del dispositivo para mostrar tu posición y calcular la ruta.'
        )

        return null
      }

      let permission =
        await Location.getForegroundPermissionsAsync()

      if (permission.status !== 'granted') {
        permission =
          await Location.requestForegroundPermissionsAsync()
      }

      if (permission.status !== 'granted') {
        if (permission.canAskAgain) {
          Alert.alert(
            'Permiso de ubicación necesario',
            'PlazaFit necesita acceso a tu ubicación mientras usas la app para mostrar dónde estás y calcular rutas.'
          )
        } else {
          Alert.alert(
            'Permiso de ubicación necesario',
            'El permiso está desactivado para PlazaFit. Puedes habilitarlo desde la configuración de la aplicación.',
            [
              {
                text: 'Cancelar',
                style: 'cancel',
              },
              {
                text: 'Abrir configuración',
                onPress: () => {
                  void Linking.openSettings()
                },
              },
            ]
          )
        }

        return null
      }

      let location:
        | Location.LocationObject
        | null = null

      if (!preferFresh) {
        location =
          await Location.getLastKnownPositionAsync({
            maxAge: 60 * 1000,
            requiredAccuracy: 200,
          })
      }

      if (!location) {
        try {
          location =
            await Location.getCurrentPositionAsync({
              accuracy:
                Location.Accuracy.Balanced,
            })
        } catch (currentError) {
          if (preferFresh) {
            location =
              await Location.getLastKnownPositionAsync({
                maxAge: 5 * 60 * 1000,
                requiredAccuracy: 500,
              })
          }

          if (!location) {
            throw currentError
          }
        }
      }

      const nextLocation: UserMapLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        timestamp: location.timestamp,
      }

      setUserLocation(nextLocation)

      if (centerOnResult) {
        centerOnUserLocation(nextLocation)
      }

      return nextLocation
    },
    [centerOnUserLocation]
  )

  const fitWalkingRoute = useCallback(
    (coordinates: MapCoordinate[]) => {
      if (coordinates.length < 2) return

      setTimeout(() => {
        mapRef.current?.fitToCoordinates(
          coordinates,
          {
            edgePadding: {
              top: insets.top + 130,
              right: 45,
              bottom: insets.bottom + 300,
              left: 45,
            },
            animated: true,
          }
        )
      }, 120)
    },
    [insets.bottom, insets.top]
  )

  const startRouteToPlaza = useCallback(
    async (plaza: PlazaMapItem) => {
      const operationId =
        routeOperationRef.current + 1

      routeOperationRef.current = operationId

      setRouteDestination(plaza)
      setSelectedPlaza(null)
      setSearchText('')
      setShowOnlyFavorites(false)
      setActiveRoute(null)
      setRouteError(null)
      setRouteLoading(true)

      try {
        const origin =
          await obtainUserLocation({
            centerOnResult: false,
            preferFresh: true,
          })

        if (
          operationId !==
          routeOperationRef.current
        ) {
          return
        }

        if (!origin) {
          setRouteError(
            'Necesitamos tu ubicación para calcular una ruta a pie.'
          )
          return
        }

        const route =
          await computeWalkingRoute(
            {
              latitude: origin.latitude,
              longitude: origin.longitude,
            },
            {
              latitude: plaza.lat,
              longitude: plaza.lng,
            }
          )

        if (
          operationId !==
          routeOperationRef.current
        ) {
          return
        }

        const decodedCoordinates =
          decodeGooglePolyline(
            route.encodedPolyline
          )

        const routeCoordinates =
          decodedCoordinates.length >= 2
            ? decodedCoordinates
            : [
                {
                  latitude: origin.latitude,
                  longitude: origin.longitude,
                },
                {
                  latitude: plaza.lat,
                  longitude: plaza.lng,
                },
              ]

        const nextRoute: ActiveWalkingRoute = {
          destination: plaza,
          origin,
          coordinates: routeCoordinates,
          distanceMeters:
            route.distanceMeters,
          durationSeconds:
            route.durationSeconds,
        }

        setActiveRoute(nextRoute)
        fitWalkingRoute([
          {
            latitude: origin.latitude,
            longitude: origin.longitude,
          },
          ...routeCoordinates,
          {
            latitude: plaza.lat,
            longitude: plaza.lng,
          },
        ])
      } catch (error: any) {
        if (
          operationId !==
          routeOperationRef.current
        ) {
          return
        }

        setRouteError(
          error?.message ??
            'No se pudo calcular la ruta.'
        )
      } finally {
        if (
          operationId ===
          routeOperationRef.current
        ) {
          setRouteLoading(false)
        }
      }
    },
    [
      fitWalkingRoute,
      obtainUserLocation,
    ]
  )

  useEffect(() => {
    if (
      !routeToPlazaId ||
      plazas.length === 0
    ) {
      return
    }

    const requestKey =
      routeRequestId || routeToPlazaId

    if (
      processedRouteRequestRef.current ===
      requestKey
    ) {
      return
    }

    processedRouteRequestRef.current =
      requestKey

    const plazaId = Number(routeToPlazaId)

    const destination = plazas.find(
      (plaza) => plaza.id === plazaId
    )

    if (!destination) {
      Alert.alert(
        'Plaza no disponible',
        'No encontramos la plaza seleccionada en el mapa.'
      )
      return
    }

    router.setParams({
      routeToPlazaId: '',
      routeRequestId: '',
    })

    void startRouteToPlaza(destination)
  }, [
    plazas,
    routeRequestId,
    routeToPlazaId,
    startRouteToPlaza,
  ])

  const handleLocateUser = useCallback(
    async () => {
      if (locating) return

      try {
        setLocating(true)

        await obtainUserLocation({
          centerOnResult: true,
          preferFresh: false,
        })
      } catch (error: any) {
        Alert.alert(
          'Ubicación no disponible',
          error?.message ??
            'No pudimos obtener tu ubicación. Comprueba el GPS e intenta nuevamente.'
        )
      } finally {
        setLocating(false)
      }
    },
    [locating, obtainUserLocation]
  )

  const cancelRoute = useCallback(() => {
    routeOperationRef.current += 1

    const destination = routeDestination

    setRouteDestination(null)
    setActiveRoute(null)
    setRouteError(null)
    setRouteLoading(false)

    if (destination) {
      setSelectedPlaza(destination)
    }
  }, [routeDestination])

  const openExternalDirections = useCallback(
    async (plaza: PlazaMapItem) => {
      const destination =
        `${plaza.lat},${plaza.lng}`

      const url =
        `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
          destination
        )}&travelmode=walking`

      try {
        const supported =
          await Linking.canOpenURL(url)

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
          'No se pudo abrir Google Maps',
          error?.message ??
            'Intenta nuevamente.'
        )
      }
    },
    []
  )

  function focusPlaza(plaza: PlazaMapItem) {
    setSelectedPlaza(plaza)

    mapRef.current?.animateToRegion(
      {
        latitude: plaza.lat,
        longitude: plaza.lng,
        latitudeDelta: PLAZA_REGION_DELTA,
        longitudeDelta: PLAZA_REGION_DELTA,
      },
      500
    )
  }

  function handleFocusNearestPlaza() {
    if (!nearestPlaza) return

    setSearchText('')
    setShowOnlyFavorites(false)
    focusPlaza(nearestPlaza.plaza)
  }

  function handleOpenDetail() {
    if (!selectedPlaza) return

    router.push({
      pathname: '/plaza/[id]',
      params: {
        id: String(selectedPlaza.id),
      },
    })
  }

  function handleMapPress(event: any) {
    if (
      event?.nativeEvent?.action ===
      'marker-press'
    ) {
      return
    }

    if (routeDestination) return

    setSelectedPlaza(null)
  }

  const floatingButtonBottom =
    (routeDestination
      ? 305
      : selectedPlaza
        ? 255
        : 82) + insets.bottom

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#16a34a"
        />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={INITIAL_REGION}
        userInterfaceStyle="light"
        mapType="standard"
        customMapStyle={
          PLAZAFIT_LIGHT_MAP_STYLE
        }
        onPress={handleMapPress}
      >
        {activeRoute ? (
          <>
            <Polyline
              key={`route-outline-${overlayRevision}`}
              coordinates={
                activeRoute.coordinates
              }
              strokeColor="rgba(255,255,255,0.95)"
              strokeWidth={9}
              zIndex={4}
            />

            <Polyline
              key={`route-main-${overlayRevision}`}
              coordinates={
                activeRoute.coordinates
              }
              strokeColor="#16a34a"
              strokeWidth={5}
              zIndex={5}
            />
          </>
        ) : null}

        {displayedPlazas.map((plaza) => {
          const isRouteDestination =
            routeDestination?.id === plaza.id

          return (
            <Marker
              key={`${overlayRevision}-plaza-${plaza.id}`}
              coordinate={{
                latitude: plaza.lat,
                longitude: plaza.lng,
              }}
              onPress={() => {
                if (routeDestination) return

                setSelectedPlaza(plaza)
              }}
              zIndex={
                isRouteDestination ? 120 : 20
              }
            >
              {isRouteDestination ? (
                <View
                  style={
                    styles.routeDestinationMarker
                  }
                >
                  <Ionicons
                    name="flag"
                    size={19}
                    color="#ffffff"
                  />
                </View>
              ) : (
                <View style={styles.markerWrap}>
                  <View
                    style={[
                      styles.markerDot,
                      plaza.isFavorite &&
                        styles.markerDotFavorite,
                      selectedPlaza?.id ===
                        plaza.id &&
                        styles.markerDotActive,
                    ]}
                  />
                </View>
              )}
            </Marker>
          )
        })}

        {userLocation ? (
          <Marker
            key={`user-location-${overlayRevision}`}
            coordinate={{
              latitude:
                userLocation.latitude,
              longitude:
                userLocation.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={150}
          >
            <View
              style={styles.userMarkerOuter}
            >
              <View
                style={styles.userMarkerInner}
              />
            </View>
          </Marker>
        ) : null}
      </MapView>

      {routeDestination ? (
        <View
          style={[
            styles.routeTopOverlay,
            { top: insets.top + 8 },
          ]}
        >
          <View style={styles.routeTopBar}>
            <View
              style={styles.routeTopBarIcon}
            >
              <Ionicons
                name="walk-outline"
                size={20}
                color="#166534"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={
                  styles.routeTopBarEyebrow
                }
              >
                Ruta a pie
              </Text>

              <Text
                style={styles.routeTopBarTitle}
                numberOfLines={1}
              >
                {routeDestination.nombre}
              </Text>
            </View>

            <Pressable
              style={styles.routeCloseButton}
              onPress={cancelRoute}
              accessibilityRole="button"
              accessibilityLabel="Cancelar ruta"
            >
              <Ionicons
                name="close"
                size={22}
                color="#166534"
              />
            </Pressable>
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.topOverlay,
            { top: insets.top + 8 },
          ]}
        >
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Ionicons
                name="search-outline"
                size={18}
                color="#6b7280"
              />

              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Buscar plaza o comuna"
                placeholderTextColor="#6b7280"
                style={styles.searchInput}
              />

              {searchText.length > 0 ? (
                <Pressable
                  onPress={() =>
                    setSearchText('')
                  }
                >
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color="#6b7280"
                  />
                </Pressable>
              ) : null}
            </View>

            <Pressable
              style={[
                styles.favoriteFilterButton,
                showOnlyFavorites &&
                  styles.favoriteFilterButtonActive,
              ]}
              onPress={() =>
                setShowOnlyFavorites(
                  (previous) => !previous
                )
              }
            >
              <Ionicons
                name={
                  showOnlyFavorites
                    ? 'heart'
                    : 'heart-outline'
                }
                size={18}
                color={
                  showOnlyFavorites
                    ? '#ffffff'
                    : '#166534'
                }
              />
            </Pressable>

            <Pressable
              style={styles.refreshMapButton}
              onPress={() => {
                void fetchMapData()
              }}
            >
              <Ionicons
                name="refresh-outline"
                size={18}
                color="#166534"
              />
            </Pressable>
          </View>

          <View style={styles.mapInfoColumn}>
            <View style={styles.resultBadge}>
              <Text style={styles.resultText}>
                {filteredPlazas.length}{' '}
                {filteredPlazas.length === 1
                  ? 'plaza encontrada'
                  : 'plazas encontradas'}
              </Text>
            </View>

            {filteredPlazas.length === 0 ? (
              <View style={styles.emptyStateInline}>
                <Ionicons
                  name="search-outline"
                  size={21}
                  color="#166534"
                />

                <View style={{ flex: 1 }}>
                  <Text
                    style={
                      styles.emptyStateTitle
                    }
                  >
                    No encontramos plazas
                  </Text>

                  <Text
                    style={
                      styles.emptyStateText
                    }
                  >
                    Prueba con otro nombre,
                    comuna o desactiva el filtro
                    de favoritas.
                  </Text>
                </View>
              </View>
            ) : nearestPlaza &&
              !hasActiveFilter ? (
              <Pressable
                style={styles.nearestBadge}
                onPress={
                  handleFocusNearestPlaza
                }
              >
                <View
                  style={
                    styles.nearestBadgeIcon
                  }
                >
                  <Ionicons
                    name="navigate-outline"
                    size={16}
                    color="#166534"
                  />
                </View>

                <View
                  style={
                    styles.nearestBadgeContent
                  }
                >
                  <Text
                    style={
                      styles.nearestBadgeLabel
                    }
                  >
                    Plaza más cercana
                  </Text>

                  <Text
                    style={
                      styles.nearestBadgeText
                    }
                    numberOfLines={1}
                  >
                    {nearestPlaza.plaza.nombre}
                    {' · '}
                    {formatDistance(
                      nearestPlaza.distanceMeters
                    )}
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={17}
                  color="#16a34a"
                />
              </Pressable>
            ) : null}
          </View>
        </View>
      )}

      <Pressable
        style={[
          styles.locationButton,
          {
            bottom: floatingButtonBottom,
          },
          userLocation &&
            styles.locationButtonActive,
        ]}
        onPress={() => {
          void handleLocateUser()
        }}
        disabled={locating}
        accessibilityRole="button"
        accessibilityLabel="Mostrar mi ubicación"
      >
        {locating ? (
          <ActivityIndicator
            size="small"
            color={
              userLocation
                ? '#ffffff'
                : '#166534'
            }
          />
        ) : (
          <Ionicons
            name={
              userLocation
                ? 'locate'
                : 'locate-outline'
            }
            size={23}
            color={
              userLocation
                ? '#ffffff'
                : '#166534'
            }
          />
        )}
      </Pressable>

      {routeDestination ? (
        <View style={styles.routeCard}>
          {routeLoading ? (
            <View
              style={styles.routeLoadingContent}
            >
              <ActivityIndicator
                size="large"
                color="#16a34a"
              />

              <Text
                style={styles.routeLoadingTitle}
              >
                Calculando ruta
              </Text>

              <Text
                style={styles.routeLoadingText}
              >
                Buscando el recorrido peatonal
                hasta {routeDestination.nombre}.
              </Text>
            </View>
          ) : routeError ? (
            <View>
              <View style={styles.routeCardHeader}>
                <View
                  style={styles.routeErrorIcon}
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={25}
                    color="#b91c1c"
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={styles.routeErrorTitle}
                  >
                    No se pudo calcular la ruta
                  </Text>

                  <Text
                    style={styles.routeErrorText}
                  >
                    {routeError}
                  </Text>
                </View>
              </View>

              <View style={styles.routeActions}>
                <Pressable
                  style={styles.routeSecondaryButton}
                  onPress={() =>
                    void openExternalDirections(
                      routeDestination
                    )
                  }
                >
                  <Text
                    style={
                      styles.routeSecondaryButtonText
                    }
                  >
                    Google Maps
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.routePrimaryButton}
                  onPress={() =>
                    void startRouteToPlaza(
                      routeDestination
                    )
                  }
                >
                  <Text
                    style={
                      styles.routePrimaryButtonText
                    }
                  >
                    Reintentar
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : activeRoute ? (
            <View>
              <View style={styles.routeCardHeader}>
                <View
                  style={styles.routeSummaryIcon}
                >
                  <Ionicons
                    name="walk-outline"
                    size={24}
                    color="#166534"
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={styles.routeSummaryEyebrow}
                  >
                    Ruta peatonal
                  </Text>

                  <Text
                    style={styles.routeSummaryTitle}
                    numberOfLines={1}
                  >
                    {activeRoute.destination.nombre}
                  </Text>
                </View>

                <Pressable
                  style={styles.routeRefreshButton}
                  onPress={() =>
                    void startRouteToPlaza(
                      activeRoute.destination
                    )
                  }
                  accessibilityLabel="Actualizar ruta"
                >
                  <Ionicons
                    name="refresh-outline"
                    size={20}
                    color="#166534"
                  />
                </Pressable>
              </View>

              <View style={styles.routeMetricsRow}>
                <View style={styles.routeMetric}>
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color="#166534"
                  />

                  <View>
                    <Text
                      style={styles.routeMetricValue}
                    >
                      {formatRouteDuration(
                        activeRoute.durationSeconds
                      )}
                    </Text>

                    <Text
                      style={styles.routeMetricLabel}
                    >
                      Tiempo estimado
                    </Text>
                  </View>
                </View>

                <View style={styles.routeMetric}>
                  <Ionicons
                    name="navigate-outline"
                    size={18}
                    color="#166534"
                  />

                  <View>
                    <Text
                      style={styles.routeMetricValue}
                    >
                      {formatDistance(
                        activeRoute.distanceMeters
                      )}
                    </Text>

                    <Text
                      style={styles.routeMetricLabel}
                    >
                      Por calles
                    </Text>
                  </View>
                </View>
              </View>

              <Text style={styles.routeDisclaimer}>
                Ruta referencial. Verifica cruces,
                accesos y condiciones peatonales.
              </Text>

              <View style={styles.routeActions}>
                <Pressable
                  style={styles.routeSecondaryButton}
                  onPress={cancelRoute}
                >
                  <Text
                    style={
                      styles.routeSecondaryButtonText
                    }
                  >
                    Cancelar
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.routePrimaryButton}
                  onPress={() =>
                    void openExternalDirections(
                      activeRoute.destination
                    )
                  }
                >
                  <Ionicons
                    name="open-outline"
                    size={17}
                    color="#ffffff"
                  />

                  <Text
                    style={
                      styles.routePrimaryButtonText
                    }
                  >
                    Google Maps
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : selectedPlaza ? (
        <View style={styles.bottomCard}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>
                {selectedPlaza.nombre}
              </Text>

              <Text style={styles.cardSubtitle}>
                {selectedPlaza.comuna}
              </Text>
            </View>

            <Pressable
              style={styles.cardCloseButton}
              onPress={() =>
                setSelectedPlaza(null)
              }
              accessibilityLabel="Cerrar plaza seleccionada"
            >
              <Ionicons
                name="close"
                size={20}
                color="#6b7280"
              />
            </Pressable>
          </View>

          <View style={styles.cardMetaRow}>
            {selectedPlaza.isFavorite ? (
              <View style={styles.favoriteBadge}>
                <Ionicons
                  name="heart"
                  size={14}
                  color="#ffffff"
                />

                <Text
                  style={styles.favoriteBadgeText}
                >
                  Favorita
                </Text>
              </View>
            ) : null}

            {selectedPlazaDistance !== null ? (
              <View style={styles.distanceBadge}>
                <Ionicons
                  name="walk-outline"
                  size={14}
                  color="#166534"
                />

                <Text
                  style={styles.distanceBadgeText}
                >
                  Aprox.{' '}
                  {formatDistance(
                    selectedPlazaDistance
                  )}
                </Text>
              </View>
            ) : null}

            {nearestPlaza?.plaza.id ===
            selectedPlaza.id ? (
              <View
                style={styles.nearestMiniBadge}
              >
                <Ionicons
                  name="navigate"
                  size={13}
                  color="#1d4ed8"
                />

                <Text
                  style={
                    styles.nearestMiniBadgeText
                  }
                >
                  Más cercana
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.cardActions}>
            <Pressable
              style={styles.directionsButton}
              onPress={() =>
                void startRouteToPlaza(
                  selectedPlaza
                )
              }
            >
              <Ionicons
                name="navigate-outline"
                size={17}
                color="#166534"
              />

              <Text
                style={styles.directionsButtonText}
              >
                Cómo llegar
              </Text>
            </Pressable>

            <Pressable
              style={styles.primaryButton}
              onPress={handleOpenDetail}
            >
              <Text
                style={styles.primaryButtonText}
              >
                Ver detalle
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  map: {
    flex: 1,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
  },

  topOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 20,
  },

  routeTopOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 24,
  },

  routeTopBar: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 17,
    paddingHorizontal: 11,
    paddingVertical: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 9,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 6,
  },

  routeTopBarIcon: {
    width: 39,
    height: 39,
    borderRadius: 20,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  routeTopBarEyebrow: {
    color: '#16a34a',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },

  routeTopBarTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },

  routeCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchRow: {
    flexDirection: 'row',
    gap: 10,
  },

  searchBox: {
    flex: 1,
    minHeight: 46,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dcfce7',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 4,
  },

  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },

  favoriteFilterButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 4,
  },

  favoriteFilterButtonActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },

  refreshMapButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 4,
  },

  mapInfoColumn: {
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
  },

  resultBadge: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dcfce7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  resultText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#166534',
  },

  emptyStateInline: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dcfce7',
    padding: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 4,
  },

  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },

  emptyStateText: {
    fontSize: 13,
    color: '#4b5563',
    marginTop: 3,
    lineHeight: 18,
  },

  nearestBadge: {
    width: '100%',
    maxWidth: 310,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 4,
  },

  nearestBadgeIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  nearestBadgeContent: {
    flex: 1,
  },

  nearestBadgeLabel: {
    color: '#16a34a',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },

  nearestBadgeText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },

  markerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  markerDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#16a34a',
    borderWidth: 4,
    borderColor: '#dcfce7',
  },

  markerDotFavorite: {
    backgroundColor: '#15803d',
    borderColor: '#bbf7d0',
  },

  markerDotActive: {
    transform: [{ scale: 1.15 }],
  },

  routeDestinationMarker: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#16a34a',
    borderWidth: 4,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 7,
  },

  userMarkerOuter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor:
      'rgba(37, 99, 235, 0.20)',
    borderWidth: 1,
    borderColor:
      'rgba(37, 99, 235, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  userMarkerInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2563eb',
    borderWidth: 3,
    borderColor: '#ffffff',
  },

  locationButton: {
    position: 'absolute',
    right: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    elevation: 9,
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 9,
    shadowOffset: {
      width: 0,
      height: 4,
    },
  },

  locationButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },

  bottomCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 88,
    zIndex: 25,
    elevation: 10,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dcfce7',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4,
    },
  },

  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },

  cardCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },

  cardSubtitle: {
    fontSize: 15,
    color: '#15803d',
    marginTop: 4,
  },

  cardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    marginBottom: 16,
  },

  favoriteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16a34a',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  favoriteBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  distanceBadgeText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
  },

  nearestMiniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#dbeafe',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  nearestMiniBadgeText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '700',
  },

  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },

  directionsButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
    borderRadius: 13,
  },

  directionsButtonText: {
    color: '#166534',
    fontWeight: '800',
  },

  primaryButton: {
    flex: 1,
    minHeight: 48,
    backgroundColor: '#16a34a',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },

  routeCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 88,
    zIndex: 26,
    elevation: 11,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#86efac',
    padding: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 5,
    },
  },

  routeLoadingContent: {
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },

  routeLoadingTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 12,
  },

  routeLoadingText: {
    color: '#6b7280',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 5,
  },

  routeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  routeSummaryIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  routeSummaryEyebrow: {
    color: '#16a34a',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },

  routeSummaryTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },

  routeRefreshButton: {
    width: 39,
    height: 39,
    borderRadius: 20,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  routeMetricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },

  routeMetric: {
    flex: 1,
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#f0fdf4',
    borderRadius: 14,
    paddingHorizontal: 12,
  },

  routeMetricValue: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
  },

  routeMetricLabel: {
    color: '#6b7280',
    fontSize: 10,
    marginTop: 2,
  },

  routeDisclaimer: {
    color: '#6b7280',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 11,
  },

  routeActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },

  routeSecondaryButton: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },

  routeSecondaryButtonText: {
    color: '#166534',
    fontWeight: '800',
  },

  routePrimaryButton: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#16a34a',
    borderRadius: 13,
  },

  routePrimaryButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },

  routeErrorIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  routeErrorTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
  },

  routeErrorText: {
    color: '#6b7280',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
})
