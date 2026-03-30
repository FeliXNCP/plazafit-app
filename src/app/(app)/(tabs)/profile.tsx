import { useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { supabase } from '../../../lib/supabase'
import { useSession } from '../../../providers/session-provider'

type RecentCheckin = {
  id: number
  created_at: string
  points: number
  plazas: {
    nombre: string
    comuna: string
  } | null
}

type FavoritePlaza = {
  id: number
  plazas: {
    id: number
    nombre: string
    comuna: string
  } | null
}

export default function ProfileScreen() {
  const { session } = useSession()

  const email = useMemo(() => session?.user?.email ?? 'Sin email', [session])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [totalPoints, setTotalPoints] = useState(0)
  const [totalVisits, setTotalVisits] = useState(0)
  const [recentCheckins, setRecentCheckins] = useState<RecentCheckin[]>([])
  const [favorites, setFavorites] = useState<FavoritePlaza[]>([])

  useFocusEffect(
    useCallback(() => {
      if (!session?.user?.id) return
      fetchProfileData(true)
    }, [session?.user?.id])
  )

  async function fetchProfileData(isInitialLoad = false) {
    if (!session?.user?.id) return

    try {
      if (isInitialLoad) setLoading(true)
      else setRefreshing(true)

      const [checkinsRes, favoritesRes] = await Promise.all([
        supabase
          .from('plaza_checkins')
          .select(
            `
            id,
            created_at,
            points,
            plazas (
              nombre,
              comuna
            )
          `
          )
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false }),

        supabase
          .from('favorite_plazas')
          .select(
            `
            id,
            plazas (
              id,
              nombre,
              comuna
            )
          `
          )
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false }),
      ])

      if (checkinsRes.error) throw checkinsRes.error
      if (favoritesRes.error) throw favoritesRes.error

      const checkins = (checkinsRes.data ?? []) as RecentCheckin[]
      const favoritePlazas = (favoritesRes.data ?? []) as FavoritePlaza[]

      setRecentCheckins(checkins.slice(0, 10))
      setTotalVisits(checkins.length)
      setTotalPoints(checkins.reduce((acc, item) => acc + item.points, 0))
      setFavorites(favoritePlazas)
    } catch (error: any) {
      Alert.alert('Error', error.message ?? 'No se pudo cargar el perfil')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }





  async function handleLogout() {
    const { error } = await supabase.auth.signOut()
    if (error) {
      Alert.alert('Error', error.message)
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString)
    return date.toLocaleDateString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Perfil</Text>

          <Pressable
            style={styles.refreshButton}
            onPress={() => fetchProfileData(false)}
            disabled={refreshing}
          >
            <Text style={styles.refreshButtonText}>
              {refreshing ? 'Actualizando...' : 'Actualizar'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Correo</Text>
        <Text style={styles.email}>{email}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalPoints}</Text>
          <Text style={styles.statLabel}>Puntos</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalVisits}</Text>
          <Text style={styles.statLabel}>Visitas</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Plazas favoritas</Text>

        {favorites.length === 0 ? (
          <Text style={styles.emptyText}>Todavía no tienes plazas favoritas.</Text>
        ) : (
          favorites.map((favorite) => (
            <View key={favorite.id} style={styles.checkinItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.checkinTitle}>
                  {favorite.plazas?.nombre ?? 'Plaza'}
                </Text>
                <Text style={styles.checkinSubtitle}>
                  {favorite.plazas?.comuna ?? 'Sin comuna'}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>


      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Últimas visitas</Text>

        {recentCheckins.length === 0 ? (
          <Text style={styles.emptyText}>Todavía no has registrado visitas.</Text>
        ) : (
          recentCheckins.map((checkin) => (
            <View key={checkin.id} style={styles.checkinItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.checkinTitle}>
                  {checkin.plazas?.nombre ?? 'Plaza'}
                </Text>
                <Text style={styles.checkinSubtitle}>
                  {checkin.plazas?.comuna ?? 'Sin comuna'}
                </Text>
                <Text style={styles.checkinDate}>
                  {formatDate(checkin.created_at)}
                </Text>
              </View>

              <Text style={styles.checkinPoints}>+{checkin.points}</Text>
            </View>
          ))
        )}
      </View>

      <Pressable style={styles.button} onPress={handleLogout}>
        <Text style={styles.buttonText}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f0fdf4',
  },
  container: {
    padding: 24,
    gap: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  refreshButton: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshButtonText: {
    color: '#166534',
    fontWeight: '700',
    fontSize: 13,
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
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#dcfce7',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#16a34a',
  },
  statLabel: {
    marginTop: 6,
    fontSize: 14,
    color: '#374151',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#6b7280',
  },
  checkinItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#ecfdf5',
  },
  checkinTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  checkinSubtitle: {
    fontSize: 14,
    color: '#15803d',
    marginTop: 2,
  },
  checkinDate: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  checkinPoints: {
    fontSize: 18,
    fontWeight: '700',
    color: '#16a34a',
    marginLeft: 12,
  },
  button: {
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