import { router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps'
import { supabase } from '../../../lib/supabase'
import type { Database } from '../../../types/database.types'

type Plaza = Pick<
  Database['public']['Tables']['plazas']['Row'],
  'id' | 'nombre' | 'comuna' | 'lat' | 'lng'
>

const INITIAL_REGION = {
  latitude: -33.4489,
  longitude: -70.6693,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
}

const GREEN_MAP_STYLE = [
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
    featureType: 'transit',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'landscape',
    elementType: 'geometry',
    stylers: [{ color: '#e8f5e9' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#c8e6c9' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#dcedc8' }],
  },
]

export default function MapScreen() {
  const [plazas, setPlazas] = useState<Plaza[]>([])
  const [selectedPlaza, setSelectedPlaza] = useState<Plaza | null>(null)
  const [loading, setLoading] = useState(true)
  const mapRef = useRef<MapView | null>(null)

  useEffect(() => {
    fetchPlazas()
  }, [])

  useEffect(() => {
    if (!plazas.length) return

    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(
        plazas.map((plaza) => ({
          latitude: plaza.lat,
          longitude: plaza.lng,
        })),
        {
          edgePadding: {
            top: 80,
            right: 50,
            bottom: 180,
            left: 50,
          },
          animated: true,
        }
      )
    }, 400)

    return () => clearTimeout(timer)
  }, [plazas])

  async function fetchPlazas() {
    const { data, error } = await supabase
      .from('plazas')
      .select('id, nombre, comuna, lat, lng')
      .eq('activa', true)

    if (!error && data) setPlazas(data)
    setLoading(false)
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
        customMapStyle={GREEN_MAP_STYLE}
        onPress={handleMapPress}
      >
        {plazas.map((plaza) => (
          <Marker
            key={plaza.id}
            coordinate={{ latitude: plaza.lat, longitude: plaza.lng }}
            onPress={() => setSelectedPlaza(plaza)}
          >
            <View style={styles.markerWrap}>
              <View
                style={[
                  styles.markerDot,
                  selectedPlaza?.id === plaza.id && styles.markerDotActive,
                ]}
              />
            </View>
          </Marker>
        ))}
      </MapView>

      {selectedPlaza && (
        <View style={styles.bottomCard}>
          <View style={styles.cardHandle} />

          <Text style={styles.cardTitle}>{selectedPlaza.nombre}</Text>
          <Text style={styles.cardSubtitle}>{selectedPlaza.comuna}</Text>

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
  markerDotActive: {
    transform: [{ scale: 1.15 }],
    backgroundColor: '#15803d',
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
    marginBottom: 16,
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