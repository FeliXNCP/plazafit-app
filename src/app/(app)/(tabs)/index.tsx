import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { useSession } from '../../../providers/session-provider'
import type { Database } from '../../../types/database.types'

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

const INITIAL_REGION = {
  latitude: -33.4489,
  longitude: -70.6693,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
}

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

export default function MapScreen() {
  const { session } = useSession()

  const [plazas, setPlazas] = useState<PlazaMapItem[]>([])
  const [selectedPlaza, setSelectedPlaza] = useState<PlazaMapItem | null>(null)
  const [searchText, setSearchText] = useState('')
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false)
  const [loading, setLoading] = useState(true)

  const mapRef = useRef<MapView | null>(null)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (!session?.user?.id) return
    fetchMapData()
  }, [session?.user?.id])

  const filteredPlazas = useMemo(() => {
    const query = searchText.trim().toLowerCase()

    return plazas.filter((plaza) => {
      const matchesSearch =
        query.length === 0 ||
        plaza.nombre.toLowerCase().includes(query) ||
        plaza.comuna.toLowerCase().includes(query) ||
        (plaza.direccion ?? '').toLowerCase().includes(query)

      const matchesFavorite = showOnlyFavorites ? plaza.isFavorite : true

      return matchesSearch && matchesFavorite
    })
  }, [plazas, searchText, showOnlyFavorites])

  const hasActiveFilter =
    searchText.trim().length > 0 || showOnlyFavorites

  useEffect(() => {
    /*
     * No ajustamos la cámara para intentar mostrar todas las plazas.
     * Si hay marcadores muy distantes, fitToCoordinates aleja el mapa
     * hasta mostrar incluso regiones o países completos.
     *
     * Solo centramos automáticamente cuando una búsqueda o el filtro
     * de favoritas deja exactamente un resultado. En cualquier otro
     * caso conservamos la región elegida por el usuario.
     */
    if (!hasActiveFilter || filteredPlazas.length !== 1) return

    const [plaza] = filteredPlazas

    const timer = setTimeout(() => {
      mapRef.current?.animateToRegion(
        {
          latitude: plaza.lat,
          longitude: plaza.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        500
      )
    }, 250)

    return () => clearTimeout(timer)
  }, [filteredPlazas, hasActiveFilter])

  useEffect(() => {
    if (!selectedPlaza) return

    const stillVisible = filteredPlazas.some((plaza) => plaza.id === selectedPlaza.id)

    if (!stillVisible) {
      setSelectedPlaza(null)
    }
  }, [filteredPlazas, selectedPlaza])

  async function fetchMapData() {
    if (!session?.user?.id) return

    try {
      setLoading(true)
      setSelectedPlaza(null)

      const [plazasRes, favoritesRes] = await Promise.all([
        supabase
          .from('plazas')
          .select('id, nombre, comuna, direccion, lat, lng')
          .eq('activa', true),
        supabase
          .from('favorite_plazas')
          .select('plaza_id')
          .eq('user_id', session.user.id),
      ])

      if (plazasRes.error) throw plazasRes.error
      if (favoritesRes.error) throw favoritesRes.error

      const favoriteIds = new Set(
        ((favoritesRes.data ?? []) as FavoriteRow[]).map((fav) => fav.plaza_id)
      )

      const merged = ((plazasRes.data ?? []) as PlazaBase[]).map((plaza) => ({
        ...plaza,
        isFavorite: favoriteIds.has(plaza.id),
      }))

      setPlazas(merged)
    } catch (error) {
      console.error('Error loading map data:', error)
    } finally {
      setLoading(false)
    }
  }

  function handleOpenDetail() {
    if (!selectedPlaza) return

    router.push({
      pathname: '/plaza/[id]',
      params: { id: String(selectedPlaza.id) },
    })
  }

  function handleMapPress(event: any) {
    if (event?.nativeEvent?.action === 'marker-press') return
    setSelectedPlaza(null)
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
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
        customMapStyle={PLAZAFIT_LIGHT_MAP_STYLE}
        onPress={handleMapPress}
      >
        {filteredPlazas.map((plaza) => (
          <Marker
            key={plaza.id}
            coordinate={{ latitude: plaza.lat, longitude: plaza.lng }}
            onPress={() => setSelectedPlaza(plaza)}
          >
            <View style={styles.markerWrap}>
              <View
                style={[
                  styles.markerDot,
                  plaza.isFavorite && styles.markerDotFavorite,
                  selectedPlaza?.id === plaza.id && styles.markerDotActive,
                ]}
              />
            </View>
          </Marker>
        ))}
      </MapView>

      <View style={[styles.topOverlay, { top: insets.top + 8 }]}>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color="#6b7280" />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Buscar plaza o comuna"
              placeholderTextColor="#6b7280"
              style={styles.searchInput}
            />
            {searchText.length > 0 && (
              <Pressable onPress={() => setSearchText('')}>
                <Ionicons name="close-circle" size={18} color="#6b7280" />
              </Pressable>
            )}
          </View>

          <Pressable
            style={[
              styles.favoriteFilterButton,
              showOnlyFavorites && styles.favoriteFilterButtonActive,
            ]}
            onPress={() => setShowOnlyFavorites((prev) => !prev)}
          >
            <Ionicons
              name={showOnlyFavorites ? 'heart' : 'heart-outline'}
              size={18}
              color={showOnlyFavorites ? '#fff' : '#166534'}
            />
          </Pressable>

          <Pressable
            style={styles.refreshMapButton}
            onPress={fetchMapData}
          >
            <Ionicons name="refresh-outline" size={18} color="#166534" />
          </Pressable>
        </View>

        <View style={styles.resultBadge}>
          <Text style={styles.resultText}>
            {filteredPlazas.length}{' '}
            {filteredPlazas.length === 1 ? 'plaza encontrada' : 'plazas encontradas'}
          </Text>
        </View>
      </View>

      {filteredPlazas.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>No encontramos plazas</Text>
          <Text style={styles.emptyStateText}>
            Prueba con otro nombre, comuna o desactiva el filtro de favoritas.
          </Text>
        </View>
      )}

      {selectedPlaza && (
        <View style={styles.bottomCard}>
          <View style={styles.cardHandle} />

          <Text style={styles.cardTitle}>{selectedPlaza.nombre}</Text>
          <Text style={styles.cardSubtitle}>{selectedPlaza.comuna}</Text>

          <View style={styles.cardMetaRow}>
            {selectedPlaza.isFavorite && (
              <View style={styles.favoriteBadge}>
                <Ionicons name="heart" size={14} color="#fff" />
                <Text style={styles.favoriteBadgeText}>Favorita</Text>
              </View>
            )}
          </View>

          <View style={styles.cardActions}>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => setSelectedPlaza(null)}
            >
              <Text style={styles.secondaryButtonText}>Cerrar</Text>
            </Pressable>

            <Pressable style={styles.primaryButton} onPress={handleOpenDetail}>
              <Text style={styles.primaryButtonText}>Ver detalle</Text>
            </Pressable>
          </View>
        </View>
      )}
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
  },
  topOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 20,
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
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
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
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
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
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  resultBadge: {
    alignSelf: 'flex-start',
    marginTop: 10,
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
  emptyState: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 108,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dcfce7',
    padding: 16,
    zIndex: 19,
  },
  emptyStateTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#4b5563',
    marginTop: 6,
    lineHeight: 20,
  },
  bottomCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 88,
    zIndex: 20,
    elevation: 10,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dcfce7',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  cardHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#d1d5db',
    alignSelf: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  cardSubtitle: {
    fontSize: 15,
    color: '#15803d',
    marginTop: 4,
  },
  cardMetaRow: {
    flexDirection: 'row',
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
    alignSelf: 'flex-start',
  },
  favoriteBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#166534',
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
})