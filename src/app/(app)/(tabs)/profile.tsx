import Ionicons from '@expo/vector-icons/Ionicons'
import { router, useFocusEffect } from 'expo-router'
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


//TIPOS
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

  completed_sessions: number

  weekly_workout_goal: number
  current_week_workouts: number
  weekly_progress: number
  weekly_goal_completed: boolean
  current_streak_weeks: number

  current_week_start: string
  current_week_end: string
  timezone: string
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

  completedSessions: number

  weeklyWorkoutGoal: number
  currentWeekWorkouts: number
  weeklyProgress: number
  weeklyGoalCompleted: boolean
  currentStreakWeeks: number

  currentWeekStart: string
  currentWeekEnd: string
  timezone: string  
}

type NewlyUnlockedAchievement = {
  id: number
  code: string
  name: string
  description: string
  xp_reward: number
  icon_name: string
  unlocked_at: string
}

type AchievementEvaluationResult = {
  summary: {
    total: number
    unlocked: number
  }

  newly_unlocked:
    NewlyUnlockedAchievement[]
}

type NewlyCompletedMission = {
  id: string
  code: string
  title: string
  description: string
  xp_reward: number
  icon_name: string
  completed_at: string
}

type WeeklyMissionEvaluationResult = {
  summary: {
    total: number
    completed: number
  }

  newly_completed:
    NewlyCompletedMission[]
}



//FUNCIONES FUERA DEL COMPONENTE
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

  completedSessions: 0,

  weeklyWorkoutGoal: 3,
  currentWeekWorkouts: 0,
  weeklyProgress: 0,
  weeklyGoalCompleted: false,
  currentStreakWeeks: 0,

  currentWeekStart: '',
  currentWeekEnd: '',
  timezone: 'America/Santiago',
}

function toPercentageWidth(
  value: number
): `${number}%` {
  const safeValue = Math.min(
    100,
    Math.max(0, value)
  )

  return `${safeValue}%` as `${number}%`
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


    completedSessions:
      Number(raw.completed_sessions ?? 0),

    weeklyWorkoutGoal:
      Number(raw.weekly_workout_goal ?? 3),

    currentWeekWorkouts:
      Number(raw.current_week_workouts ?? 0),

    weeklyProgress:
      Math.min(
        100,
        Math.max(
          0,
          Number(raw.weekly_progress ?? 0)
        )
      ),

    weeklyGoalCompleted:
      Boolean(raw.weekly_goal_completed),

    currentStreakWeeks:
      Number(raw.current_streak_weeks ?? 0),

    currentWeekStart:
      String(raw.current_week_start ?? ''),

    currentWeekEnd:
      String(raw.current_week_end ?? ''),

    timezone:
      String(
        raw.timezone ?? 'America/Santiago'
      ),
  }
}



//COMPONENTE PROFILE SCREEN
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

  const [achievementOverview, setAchievementOverview] =
    useState({
      total: 0,
      unlocked: 0,
    })



  const [
    missionOverview,
    setMissionOverview,
  ] = useState({
    total: 0,
    completed: 0,
  })



  const [updatingWeeklyGoal, setUpdatingWeeklyGoal] =
    useState<number | null>(null)

  const fetchProfileData = useCallback(
    async (initialLoad = false) => {
      if (!session?.user?.id) return

      try {
        if (initialLoad) {
          setLoading(true)
        } else {
          setRefreshing(true)
        }

//EVALUADOR DE MISIONES SEMANALES
        const {
          data: missionData,
          error: missionError,
        } = await supabase.rpc(
          'evaluate_my_weekly_missions'
        )

        if (missionError) {
          throw missionError
        }

        const missionEvaluation =
          (missionData ?? {
            summary: {
              total: 0,
              completed: 0,
            },
            newly_completed: [],
          }) as WeeklyMissionEvaluationResult

        /*
         * evaluamos los logros.
         * Este RPC puede entregar XP nuevo.
         */
        const {
          data: achievementData,
          error: achievementError,
        } = await supabase.rpc(
          'evaluate_my_achievements'
        )

        if (achievementError) {
          throw achievementError
        }

        const achievementEvaluation =
          (achievementData ?? {
            summary: {
              total: 0,
              unlocked: 0,
            },
            newly_unlocked: [],
          }) as AchievementEvaluationResult


 

        /*
         * Después consultamos el resumen.
         * Así el XP de los logros recién
         * desbloqueados ya estará incluido.
         */
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
            .eq(
              'user_id',
              session.user.id
            )
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
            .eq(
              'user_id',
              session.user.id
            )
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

        /*
         * Actualización de todos los estados.
         */
        setRecentCheckins(
          checkins.slice(0, 10)
        )

        setTotalVisits(checkins.length)

        setFavorites(favoritePlazas)

        setGamification(
          normalizeGamificationSummary(
            gamificationRes.data
          )
        )

        setAchievementOverview({
          total: Number(
            achievementEvaluation
              .summary?.total ?? 0
          ),
          unlocked: Number(
            achievementEvaluation
              .summary?.unlocked ?? 0
          ),
        })

        //ACTUALIZAR ESTADO MISIONES
        setMissionOverview({
          total: Number(
            missionEvaluation.summary?.total ?? 0
          ),

          completed: Number(
            missionEvaluation.summary?.completed ?? 0
          ),
        })



        /*
         * ALERTA DE LOGROS Y MISIONES
         */
        const newlyCompletedMissions =
          Array.isArray(
            missionEvaluation.newly_completed
          )
            ? missionEvaluation.newly_completed
            : []

        const newlyUnlockedAchievements =
          Array.isArray(
            achievementEvaluation.newly_unlocked
          )
            ? achievementEvaluation.newly_unlocked
            : []

        const rewardMessages = [
          ...newlyCompletedMissions.map(
            (mission) =>
              `${mission.title} (+${mission.xp_reward} XP)`
          ),

          ...newlyUnlockedAchievements.map(
            (achievement) =>
              `${achievement.name} (+${achievement.xp_reward} XP)`
          ),
        ]

        if (rewardMessages.length > 0) {
          Alert.alert(
            '¡Recompensas desbloqueadas!',
            rewardMessages.join('\n')
          )
        }
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


  async function handleWeeklyGoalChange(
    goal: number
  ) {
    if (
      updatingWeeklyGoal !== null ||
      goal === gamification.weeklyWorkoutGoal
    ) {
      return
    }

    try {
      setUpdatingWeeklyGoal(goal)

      const { error } = await supabase.rpc(
        'set_my_weekly_workout_goal',
        {
          p_goal: goal,
        }
      )

      if (error) throw error

      await fetchProfileData(false)
    } catch (error: any) {
      Alert.alert(
        'No se pudo actualizar',
        error.message ??
        'No se pudo cambiar el objetivo semanal.'
      )
    } finally {
      setUpdatingWeeklyGoal(null)
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

  const progressWidth = toPercentageWidth(
    gamification.levelProgress
  )

  const weeklyProgressWidth = toPercentageWidth(
    gamification.weeklyProgress
  )

  //TARJETA RESUMIDA DEBAJO DEL OBJETIVO SEMANAL
  const missionProgress =
    missionOverview.total > 0
      ? (
        missionOverview.completed /
        missionOverview.total
      ) * 100
      : 0

  const missionProgressWidth =
    `${Math.min(
      100,
      Math.max(0, missionProgress)
    )}%` as `${number}%`






  const achievementProgressWidth =
    toPercentageWidth(
      achievementOverview.total > 0
        ? (
            achievementOverview.unlocked /
            achievementOverview.total
          ) * 100
        : 0
    )

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




        <View style={styles.weeklyCard}>
          <View style={styles.weeklyHeader}>
            <View style={styles.weeklyIdentity}>
              <View style={styles.weeklyIcon}>
                <Ionicons
                  name="calendar-outline"
                  size={23}
                  color="#166534"
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.weeklyEyebrow}>
                  Objetivo semanal
                </Text>

                <Text style={styles.weeklyTitle}>
                  {gamification.currentWeekWorkouts} de{' '}
                  {gamification.weeklyWorkoutGoal}{' '}
                  entrenamientos
                </Text>
              </View>
            </View>

            <View style={styles.streakBadge}>
              <Ionicons
                name="flame-outline"
                size={17}
                color="#c2410c"
              />

              <Text style={styles.streakText}>
                {gamification.currentStreakWeeks}
              </Text>
            </View>
          </View>

          <View style={styles.weeklyProgressHeader}>
            <Text style={styles.weeklyProgressText}>
              {gamification.weeklyGoalCompleted
                ? 'Objetivo cumplido'
                : `${Math.max(
                  gamification.weeklyWorkoutGoal -
                  gamification.currentWeekWorkouts,
                  0
                )} entrenamiento${Math.max(
                  gamification.weeklyWorkoutGoal -
                  gamification.currentWeekWorkouts,
                  0
                ) === 1
                  ? ''
                  : 's'
                } pendiente${Math.max(
                  gamification.weeklyWorkoutGoal -
                  gamification.currentWeekWorkouts,
                  0
                ) === 1
                  ? ''
                  : 's'
                }`}
            </Text>

            <Text style={styles.weeklyProgressPercent}>
              {Math.round(
                gamification.weeklyProgress
              )}
              %
            </Text>
          </View>

          <View style={styles.weeklyProgressTrack}>
            <View
              style={[
                styles.weeklyProgressFill,
                { width: weeklyProgressWidth },
              ]}
            />
          </View>

          <Text style={styles.streakDescription}>
            {gamification.currentStreakWeeks > 0
              ? `🔥 ${gamification.currentStreakWeeks} semana${gamification.currentStreakWeeks === 1
                ? ''
                : 's'
              } consecutiva${gamification.currentStreakWeeks === 1
                ? ''
                : 's'
              } cumpliendo tu objetivo.`
              : 'Cumple tu objetivo para comenzar una racha semanal.'}
          </Text>

          <Text style={styles.goalSelectorLabel}>
            Entrenamientos por semana
          </Text>

          <View style={styles.goalSelector}>
            {[1, 2, 3, 4, 5].map((goal) => {
              const active =
                gamification.weeklyWorkoutGoal === goal

              const updating =
                updatingWeeklyGoal === goal

              return (
                <Pressable
                  key={goal}
                  style={[
                    styles.goalChip,
                    active && styles.goalChipActive,
                  ]}
                  onPress={() =>
                    void handleWeeklyGoalChange(goal)
                  }
                  disabled={
                    updatingWeeklyGoal !== null
                  }
                >
                  {updating ? (
                    <ActivityIndicator
                      size="small"
                      color="#ffffff"
                    />
                  ) : (
                    <Text
                      style={[
                        styles.goalChipText,
                        active &&
                        styles.goalChipTextActive,
                      ]}
                    >
                      {goal}
                    </Text>
                  )}
                </Pressable>
              )
            })}
          </View>
        </View>

        <Pressable
          style={styles.missionsCard}
          onPress={() => router.push('/misiones')}
        >
          <View style={styles.missionsIcon}>
            <Ionicons
              name="flag-outline"
              size={25}
              color="#166534"
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.missionsEyebrow}>
              Misiones de esta semana
            </Text>

            <Text style={styles.missionsTitle}>
              {missionOverview.completed} de{' '}
              {missionOverview.total} completadas
            </Text>

            <View style={styles.missionsTrack}>
              <View
                style={[
                  styles.missionsFill,
                  {
                    width: missionProgressWidth,
                  },
                ]}
              />
            </View>
          </View>

          <Ionicons
            name="chevron-forward"
            size={22}
            color="#16a34a"
          />
        </Pressable>




        <Pressable
          style={styles.achievementsCard}
          onPress={() => router.push('/logros')}
        >
          <View style={styles.achievementsIcon}>
            <Ionicons
              name="trophy-outline"
              size={26}
              color="#166534"
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.achievementsEyebrow}>
              Logros
            </Text>

            <Text style={styles.achievementsTitle}>
              {achievementOverview.unlocked} de{' '}
              {achievementOverview.total}{' '}
              desbloqueados
            </Text>

            <View style={styles.achievementsTrack}>
              <View
                style={[
                  styles.achievementsFill,
                  {
                    width: achievementProgressWidth,
                  },
                ]}
              />
            </View>
          </View>

          <Ionicons
            name="chevron-forward"
            size={22}
            color="#16a34a"
          />
        </Pressable>


















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
              Entrenamientos válidos
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




        <Pressable
          style={styles.historyCard}
          onPress={() =>
            router.push('/historial')
          }
        >
          <View style={styles.historyIcon}>
            <Ionicons
              name="calendar-outline"
              size={25}
              color="#166534"
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.historyEyebrow}>
              Actividad
            </Text>

            <Text style={styles.historyTitle}>
              Historial de entrenamientos
            </Text>

            <Text style={styles.historyDescription}>
              Revisa tus rutinas, pasos, duración y XP.
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={22}
            color="#16a34a"
          />
        </Pressable>




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
  weeklyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  weeklyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  weeklyIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  weeklyIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weeklyEyebrow: {
    color: '#16a34a',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  weeklyTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffedd5',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  streakText: {
    color: '#c2410c',
    fontWeight: '900',
  },
  weeklyProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 9,
  },
  weeklyProgressText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
  },
  weeklyProgressPercent: {
    color: '#16a34a',
    fontSize: 13,
    fontWeight: '900',
  },
  weeklyProgressTrack: {
    height: 10,
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    overflow: 'hidden',
  },
  weeklyProgressFill: {
    height: '100%',
    backgroundColor: '#16a34a',
    borderRadius: 999,
  },
  streakDescription: {
    color: '#4b5563',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
  },
  goalSelectorLabel: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 17,
    marginBottom: 9,
  },
  goalSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  goalChip: {
    flex: 1,
    height: 39,
    borderRadius: 12,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalChipActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  goalChipText: {
    color: '#166534',
    fontWeight: '800',
  },
  goalChipTextActive: {
    color: '#ffffff',
  },
  achievementsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dcfce7',
    borderRadius: 18,
    padding: 17,
  },
  achievementsIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  achievementsEyebrow: {
    color: '#16a34a',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  achievementsTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  achievementsTrack: {
    height: 7,
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 9,
  },
  achievementsFill: {
    height: '100%',
    backgroundColor: '#16a34a',
    borderRadius: 999,
  },
  missionsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dcfce7',
    borderRadius: 18,
    padding: 17,
  },
  missionsIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionsEyebrow: {
    color: '#16a34a',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  missionsTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  missionsTrack: {
    height: 7,
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 9,
  },
  missionsFill: {
    height: '100%',
    backgroundColor: '#16a34a',
    borderRadius: 999,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,

    backgroundColor: '#ffffff',

    borderWidth: 1,
    borderColor: '#dcfce7',
    borderRadius: 18,

    padding: 17,
  },

  historyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,

    backgroundColor: '#dcfce7',

    alignItems: 'center',
    justifyContent: 'center',
  },

  historyEyebrow: {
    color: '#16a34a',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },

  historyTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },

  historyDescription: {
    color: '#6b7280',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
})