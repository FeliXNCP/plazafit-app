import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect } from 'expo-router'
import {
  useCallback,
  useMemo,
  useState,
} from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { useSession } from '../../../providers/session-provider'

type PlazaRelation = {
  id?: number
  nombre: string
  comuna: string
}

type RecentCheckin = {
  id: number
  created_at: string
  plazas:
    | PlazaRelation
    | PlazaRelation[]
    | null
}

type FavoritePlaza = {
  id: number
  plazas:
    | PlazaRelation
    | PlazaRelation[]
    | null
}

type GamificationRpcResult = {
  total_xp: number
  current_level: number
  current_level_name: string
  current_level_min_xp: number

  next_level: number | null
  next_level_name: string | null
  next_level_min_xp: number | null

  xp_into_level: number
  xp_to_next_level: number
  level_progress: number

  completed_workouts: number
  training_seconds: number
}

type GamificationSummary = {
  totalXp: number
  currentLevel: number
  currentLevelName: string
  currentLevelMinXp: number

  nextLevel: number | null
  nextLevelName: string | null
  nextLevelMinXp: number | null

  xpIntoLevel: number
  xpToNextLevel: number
  levelProgress: number

  completedWorkouts: number
  trainingSeconds: number
}

const EMPTY_GAMIFICATION: GamificationSummary = {
  totalXp: 0,
  currentLevel: 1,
  currentLevelName: 'Inicio',
  currentLevelMinXp: 0,

  nextLevel: 2,
  nextLevelName: 'En movimiento',
  nextLevelMinXp: 60,

  xpIntoLevel: 0,
  xpToNextLevel: 60,
  levelProgress: 0,

  completedWorkouts: 0,
  trainingSeconds: 0,
}

function getRelatedPlaza(
  relation:
    | PlazaRelation
    | PlazaRelation[]
    | null
) {
  if (!relation) return null

  if (Array.isArray(relation)) {
    return relation[0] ?? null
  }

  return relation
}

function normalizeGamificationSummary(
  value: unknown
): GamificationSummary {
  const raw =
    (value ?? {}) as Partial<GamificationRpcResult>

  return {
    totalXp:
      Number(raw.total_xp ?? 0),

    currentLevel:
      Number(raw.current_level ?? 1),

    currentLevelName:
      String(raw.current_level_name ?? 'Inicio'),

    currentLevelMinXp:
      Number(raw.current_level_min_xp ?? 0),

    nextLevel:
      raw.next_level == null
        ? null
        : Number(raw.next_level),

    nextLevelName:
      raw.next_level_name == null
        ? null
        : String(raw.next_level_name),

    nextLevelMinXp:
      raw.next_level_min_xp == null
        ? null
        : Number(raw.next_level_min_xp),

    xpIntoLevel:
      Number(raw.xp_into_level ?? 0),

    xpToNextLevel:
      Number(raw.xp_to_next_level ?? 0),

    levelProgress:
      Math.min(
        100,
        Math.max(
          0,
          Number(raw.level_progress ?? 0)
        )
      ),

    completedWorkouts:
      Number(raw.completed_workouts ?? 0),

    trainingSeconds:
      Number(raw.training_seconds ?? 0),
  }
}

export default function ProfileScreen() {
  const { session } = useSession()

  const email = useMemo(
    () => session?.user?.email ?? 'Sin correo',
    [session]
  )

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] =
    useState(false)

  const [totalVisits, setTotalVisits] =
    useState(0)

  const [recentCheckins, setRecentCheckins] =
    useState<RecentCheckin[]>([])

  const [favorites, setFavorites] =
    useState<FavoritePlaza[]>([])

  const [gamification, setGamification] =
    useState<GamificationSummary>(
      EMPTY_GAMIFICATION
    )

  const fetchProfileData = useCallback(
    async (initialLoad = false) => {
      if (!session?.user?.id) return

      try {
        if (initialLoad) {
          setLoading(true)
        } else {
          setRefreshing(true)
        }

        const [
          checkinsRes,
          favoritesRes,
          gamificationRes,
        ] = await Promise.all([
          supabase
            .from('plaza_checkins')
            .select(
              `
              id,
              created_at,
              plazas (
                nombre,
                comuna
              )
            `
            )
            .eq('user_id', session.user.id)
            .order(
              'created_at',
              { ascending: false }
            ),

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
            .order(
              'created_at',
              { ascending: false }
            ),

          supabase.rpc(
            'get_my_gamification_summary'
          ),
        ])

        if (checkinsRes.error) {
          throw checkinsRes.error
        }

        if (favoritesRes.error) {
          throw favoritesRes.error
        }

        if (gamificationRes.error) {
          throw gamificationRes.error
        }

        const checkins =
          (checkinsRes.data ?? []) as RecentCheckin[]

        const favoritePlazas =
          (favoritesRes.data ?? []) as FavoritePlaza[]

        setRecentCheckins(checkins.slice(0, 10))
        setTotalVisits(checkins.length)
        setFavorites(favoritePlazas)

        setGamification(
          normalizeGamificationSummary(
            gamificationRes.data
          )
        )
      } catch (error: any) {
        Alert.alert(
          'Error',
          error.message ??
            'No se pudo cargar el perfil.'
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [session?.user?.id]
  )

  useFocusEffect(
    useCallback(() => {
      void fetchProfileData(true)
    }, [fetchProfileData])
  )

  async function handleLogout() {
    const { error } =
      await supabase.auth.signOut()

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

  const trainingMinutes = Math.max(
    0,
    Math.round(
      gamification.trainingSeconds / 60
    )
  )

  const progressWidth =
    `${gamification.levelProgress}%` as const

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#16a34a"
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView
      style={styles.screen}
      edges={['top']}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.profileTitle}>
                Perfil
              </Text>

              <Text style={styles.profileSubtitle}>
                Tu progreso en PlazaFit
              </Text>
            </View>

            <Pressable
              style={styles.refreshButton}
              onPress={() =>
                void fetchProfileData(false)
              }
              disabled={refreshing}
            >
              {refreshing ? (
                <ActivityIndicator
                  size="small"
                  color="#166534"
                />
              ) : (
                <Ionicons
                  name="refresh-outline"
                  size={20}
                  color="#166534"
                />
              )}
            </Pressable>
          </View>

          <View style={styles.emailRow}>
            <Ionicons
              name="mail-outline"
              size={17}
              color="#16a34a"
            />

            <Text style={styles.email}>
              {email}
            </Text>
          </View>
        </View>

        <View style={styles.levelCard}>
          <View style={styles.levelTopRow}>
            <View style={styles.levelIdentity}>
              <View style={styles.levelIcon}>
                <Ionicons
                  name="trophy-outline"
                  size={27}
                  color="#166534"
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.levelEyebrow}>
                  Nivel {gamification.currentLevel}
                </Text>

                <Text style={styles.levelName}>
                  {gamification.currentLevelName}
                </Text>
              </View>
            </View>

            <View style={styles.xpTotalContainer}>
              <Text style={styles.xpTotal}>
                {gamification.totalXp}
              </Text>

              <Text style={styles.xpTotalLabel}>
                XP totales
              </Text>
            </View>
          </View>

          <View style={styles.levelProgressHeader}>
            <Text style={styles.levelProgressText}>
              {gamification.nextLevel
                ? `${gamification.xpIntoLevel} XP en este nivel`
                : 'Nivel máximo actual'}
            </Text>

            <Text style={styles.levelProgressPercent}>
              {Math.round(
                gamification.levelProgress
              )}
              %
            </Text>
          </View>

          <View style={styles.levelProgressTrack}>
            <View
              style={[
                styles.levelProgressFill,
                { width: progressWidth },
              ]}
            />
          </View>

          <Text style={styles.nextLevelText}>
            {gamification.nextLevel
              ? `${gamification.xpToNextLevel} XP para alcanzar Nivel ${gamification.nextLevel} · ${gamification.nextLevelName}`
              : 'Has alcanzado el nivel máximo disponible.'}
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={styles.statIcon}>
              <Ionicons
                name="fitness-outline"
                size={21}
                color="#16a34a"
              />
            </View>

            <Text style={styles.statValue}>
              {gamification.completedWorkouts}
            </Text>

            <Text style={styles.statLabel}>
              Entrenamientos
            </Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIcon}>
              <Ionicons
                name="time-outline"
                size={21}
                color="#16a34a"
              />
            </View>

            <Text style={styles.statValue}>
              {trainingMinutes}
            </Text>

            <Text style={styles.statLabel}>
              Minutos
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={styles.statIcon}>
              <Ionicons
                name="location-outline"
                size={21}
                color="#16a34a"
              />
            </View>

            <Text style={styles.statValue}>
              {totalVisits}
            </Text>

            <Text style={styles.statLabel}>
              Visitas
            </Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIcon}>
              <Ionicons
                name="heart-outline"
                size={21}
                color="#16a34a"
              />
            </View>

            <Text style={styles.statValue}>
              {favorites.length}
            </Text>

            <Text style={styles.statLabel}>
              Favoritas
            </Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            Plazas favoritas
          </Text>

          {favorites.length === 0 ? (
            <Text style={styles.emptyText}>
              Todavía no tienes plazas favoritas.
            </Text>
          ) : (
            favorites.map((favorite) => {
              const plaza = getRelatedPlaza(
                favorite.plazas
              )

              return (
                <View
                  key={favorite.id}
                  style={styles.listItem}
                >
                  <View style={styles.listIcon}>
                    <Ionicons
                      name="heart"
                      size={17}
                      color="#16a34a"
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.listTitle}>
                      {plaza?.nombre ?? 'Plaza'}
                    </Text>

                    <Text style={styles.listSubtitle}>
                      {plaza?.comuna ??
                        'Sin comuna'}
                    </Text>
                  </View>
                </View>
              )
            })
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            Últimas visitas
          </Text>

          {recentCheckins.length === 0 ? (
            <Text style={styles.emptyText}>
              Todavía no has registrado visitas.
            </Text>
          ) : (
            recentCheckins.map((checkin) => {
              const plaza = getRelatedPlaza(
                checkin.plazas
              )

              return (
                <View
                  key={checkin.id}
                  style={styles.listItem}
                >
                  <View style={styles.listIcon}>
                    <Ionicons
                      name="location"
                      size={17}
                      color="#16a34a"
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.listTitle}>
                      {plaza?.nombre ?? 'Plaza'}
                    </Text>

                    <Text style={styles.listSubtitle}>
                      {plaza?.comuna ??
                        'Sin comuna'}
                    </Text>

                    <Text style={styles.listDate}>
                      {formatDate(
                        checkin.created_at
                      )}
                    </Text>
                  </View>
                </View>
              )
            })
          )}
        </View>

        <Pressable
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Ionicons
            name="log-out-outline"
            size={19}
            color="#b91c1c"
          />

          <Text style={styles.logoutButtonText}>
            Cerrar sesión
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f0fdf4',
  },
  container: {
    padding: 18,
    paddingBottom: 30,
    gap: 14,
  },
  center: {
    flex: 1,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  profileTitle: {
    fontSize: 27,
    fontWeight: '800',
    color: '#111827',
  },
  profileSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 3,
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  email: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
  },
  levelCard: {
    backgroundColor: '#166534',
    borderRadius: 20,
    padding: 18,
  },
  levelTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  levelIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  levelIcon: {
    width: 49,
    height: 49,
    borderRadius: 25,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelEyebrow: {
    color: '#bbf7d0',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  levelName: {
    color: '#ffffff',
    fontSize: 21,
    fontWeight: '800',
    marginTop: 2,
  },
  xpTotalContainer: {
    alignItems: 'flex-end',
  },
  xpTotal: {
    color: '#ffffff',
    fontSize: 29,
    fontWeight: '900',
  },
  xpTotalLabel: {
    color: '#bbf7d0',
    fontSize: 11,
    fontWeight: '700',
  },
  levelProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 9,
  },
  levelProgressText: {
    color: '#dcfce7',
    fontSize: 12,
    fontWeight: '700',
  },
  levelProgressPercent: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  levelProgressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  levelProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#86efac',
  },
  nextLevelText: {
    color: '#dcfce7',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 17,
    paddingVertical: 17,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#dcfce7',
    alignItems: 'center',
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 27,
    fontWeight: '900',
    color: '#16a34a',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 3,
    textAlign: 'center',
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: '#ecfdf5',
  },
  listIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  listSubtitle: {
    fontSize: 13,
    color: '#15803d',
    marginTop: 2,
  },
  listDate: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 3,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 14,
    paddingVertical: 14,
  },
  logoutButtonText: {
    color: '#b91c1c',
    fontWeight: '800',
  },
})