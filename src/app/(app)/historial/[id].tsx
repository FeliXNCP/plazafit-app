import Ionicons from '@expo/vector-icons/Ionicons'
import {
    router,
    useLocalSearchParams,
} from 'expo-router'
import {
    useEffect,
    useMemo,
    useState,
} from 'react'
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import type { Database } from '../../../types/database.types'

type WorkoutSession =
  Database['public']['Tables']['workout_sessions']['Row']

type WorkoutStep =
  Database['public']['Tables']['workout_session_steps']['Row']

type MissionReward = {
  id: string
  title: string
  xp_reward: number
}

type AchievementReward = {
  id: number
  name: string
  xp_reward: number
}

type PostRewardPayload = {
  base_xp?: number
  total_xp_awarded?: number

  completed_missions?:
    MissionReward[]

  unlocked_achievements?:
    AchievementReward[]
}

type RewardRow = {
  id: string
  title: string
  subtitle: string
  xp: number
  icon:
    | 'fitness-outline'
    | 'flag-outline'
    | 'trophy-outline'
}

function readPostRewardPayload(
  value: unknown
): PostRewardPayload | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return null
  }

  return value as PostRewardPayload
}

function formatDuration(
  totalSeconds: number | null
) {
  const seconds = Math.max(
    0,
    Number(totalSeconds ?? 0)
  )

  if (seconds < 60) {
    return `${seconds} s`
  }

  const hours = Math.floor(seconds / 3600)

  const minutes = Math.floor(
    (seconds % 3600) / 60
  )

  if (hours > 0) {
    return `${hours} h ${minutes} min`
  }

  return `${minutes} min`
}

function formatDateTime(
  dateString: string
) {
  return new Date(
    dateString
  ).toLocaleString('es-CL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTarget(
  step: WorkoutStep
) {
  const parts: string[] = []

  if (step.target_sets) {
    parts.push(
      `${step.target_sets} series`
    )
  }

  if (step.target_reps) {
    parts.push(
      `${step.target_reps} repeticiones`
    )
  }

  if (step.target_duration_seconds) {
    parts.push(
      formatDuration(
        step.target_duration_seconds
      )
    )
  }

  if (step.target_rest_seconds) {
    parts.push(
      `descanso ${step.target_rest_seconds} s`
    )
  }

  return parts.join(' · ')
}

export default function WorkoutHistoryDetailScreen() {
  const { id } =
    useLocalSearchParams<{
      id: string
    }>()

  const [session, setSession] =
    useState<WorkoutSession | null>(null)

  const [steps, setSteps] =
    useState<WorkoutStep[]>([])

  const [loading, setLoading] =
    useState(true)

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null)

  useEffect(() => {
    if (!id) return

    let cancelled = false

    void (async () => {
      try {
        setLoading(true)
        setErrorMessage(null)

        const [
          sessionResult,
          stepsResult,
        ] = await Promise.all([
          supabase
            .from('workout_sessions')
            .select('*')
            .eq('id', id)
            .single(),

          supabase
            .from('workout_session_steps')
            .select('*')
            .eq('session_id', id)
            .order('step_order', {
              ascending: true,
            }),
        ])

        if (sessionResult.error) {
          throw sessionResult.error
        }

        if (stepsResult.error) {
          throw stepsResult.error
        }

        if (cancelled) return

        setSession(sessionResult.data)
        setSteps(stepsResult.data ?? [])
      } catch (error: any) {
        if (cancelled) return

        setErrorMessage(
          error.message ??
            'No se pudo cargar la sesión.'
        )
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [id])

  const rewards = useMemo(
    () =>
      readPostRewardPayload(
        session?.post_rewards_payload
      ),
    [session?.post_rewards_payload]
  )

  const rewardRows = useMemo(() => {
    const rows: RewardRow[] = []

    const baseXp = Number(
      rewards?.base_xp ??
        session?.xp_awarded ??
        0
    )

    if (baseXp > 0) {
      rows.push({
        id: 'base',
        title: 'Entrenamiento válido',
        subtitle: 'Rutina completada',
        xp: baseXp,
        icon: 'fitness-outline',
      })
    }

    for (
      const mission of
        rewards?.completed_missions ?? []
    ) {
      rows.push({
        id: `mission-${mission.id}`,
        title: mission.title,
        subtitle: 'Misión semanal',
        xp: Number(
          mission.xp_reward ?? 0
        ),
        icon: 'flag-outline',
      })
    }

    for (
      const achievement of
        rewards?.unlocked_achievements ?? []
    ) {
      rows.push({
        id: `achievement-${achievement.id}`,
        title: achievement.name,
        subtitle: 'Logro desbloqueado',
        xp: Number(
          achievement.xp_reward ?? 0
        ),
        icon: 'trophy-outline',
      })
    }

    return rows
  }, [
    rewards,
    session?.xp_awarded,
  ])

  const totalXp = Number(
    rewards?.total_xp_awarded ??
      session?.xp_awarded ??
      0
  )

  const isAbandoned =
    session?.status === 'abandoned'

  const isValid =
    session?.status === 'completed' &&
    session?.reward_eligible === true

  const statusLabel = isAbandoned
    ? 'Abandonado'
    : isValid
      ? 'Entrenamiento válido'
      : 'Sesión sin XP'

  const statusColor = isAbandoned
    ? '#b91c1c'
    : isValid
      ? '#166534'
      : '#92400e'

  const statusBackground = isAbandoned
    ? '#fee2e2'
    : isValid
      ? '#dcfce7'
      : '#fef3c7'

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

  if (errorMessage || !session) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons
          name="alert-circle-outline"
          size={46}
          color="#dc2626"
        />

        <Text style={styles.errorTitle}>
          No se pudo abrir la sesión
        </Text>

        <Text style={styles.errorText}>
          {errorMessage ??
            'Sesión no encontrada.'}
        </Text>

        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>
            Volver
          </Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView
      style={styles.screen}
      edges={['bottom']}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  statusBackground,
              },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                {
                  color: statusColor,
                },
              ]}
            >
              {statusLabel}
            </Text>
          </View>

          <Text style={styles.title}>
            {session.routine_title_snapshot}
          </Text>

          <Text style={styles.plaza}>
            {session.plaza_name_snapshot}
          </Text>

          <Text style={styles.date}>
            {formatDateTime(
              session.completed_at ??
                session.abandoned_at ??
                session.started_at
            )}
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons
              name="time-outline"
              size={22}
              color="#16a34a"
            />

            <Text style={styles.statValue}>
              {formatDuration(
                session.workout_duration_seconds
              )}
            </Text>

            <Text style={styles.statLabel}>
              Duración activa
            </Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons
              name="checkmark-done-outline"
              size={22}
              color="#16a34a"
            />

            <Text style={styles.statValue}>
              {session.completed_steps}/
              {session.total_steps}
            </Text>

            <Text style={styles.statLabel}>
              Completados
            </Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons
              name="play-skip-forward-outline"
              size={22}
              color="#d97706"
            />

            <Text style={styles.statValue}>
              {session.skipped_steps}
            </Text>

            <Text style={styles.statLabel}>
              Saltados
            </Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons
              name="sparkles-outline"
              size={22}
              color={
                totalXp > 0
                  ? '#16a34a'
                  : '#9ca3af'
              }
            />

            <Text style={styles.statValue}>
              +{totalXp}
            </Text>

            <Text style={styles.statLabel}>
              XP obtenido
            </Text>
          </View>
        </View>

        {rewardRows.length > 0 ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              Recompensas obtenidas
            </Text>

            {rewardRows.map((reward) => (
              <View
                key={reward.id}
                style={styles.rewardRow}
              >
                <View style={styles.rewardIcon}>
                  <Ionicons
                    name={reward.icon}
                    size={18}
                    color="#166534"
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={styles.rewardTitle}
                  >
                    {reward.title}
                  </Text>

                  <Text
                    style={styles.rewardSubtitle}
                  >
                    {reward.subtitle}
                  </Text>
                </View>

                <Text style={styles.rewardXp}>
                  +{reward.xp} XP
                </Text>
              </View>
            ))}

            <View style={styles.rewardTotal}>
              <Text
                style={styles.rewardTotalLabel}
              >
                Total
              </Text>

              <Text
                style={styles.rewardTotalValue}
              >
                +{totalXp} XP
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.noRewardCard}>
            <Ionicons
              name="information-circle-outline"
              size={23}
              color="#92400e"
            />

            <View style={{ flex: 1 }}>
              <Text
                style={styles.noRewardTitle}
              >
                Sin recompensas
              </Text>

              <Text
                style={styles.noRewardText}
              >
                Esta sesión no cumplió los
                requisitos de gamificación.
              </Text>
            </View>
          </View>
        )}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            Pasos del entrenamiento
          </Text>

          {steps.map((step) => {
            const completed =
              step.status === 'completed'

            const skipped =
              step.status === 'skipped'

            const icon = completed
              ? 'checkmark-circle'
              : skipped
                ? 'close-circle'
                : 'ellipse-outline'

            const iconColor = completed
              ? '#16a34a'
              : skipped
                ? '#d97706'
                : '#9ca3af'

            const target =
              formatTarget(step)

            return (
              <View
                key={step.id}
                style={styles.stepRow}
              >
                <Ionicons
                  name={icon}
                  size={25}
                  color={iconColor}
                />

                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>
                    {step.step_order}.{' '}
                    {step.title_snapshot}
                  </Text>

                  {step.instruction_snapshot ? (
                    <Text
                      style={
                        styles.stepInstruction
                      }
                    >
                      {
                        step.instruction_snapshot
                      }
                    </Text>
                  ) : null}

                  {target ? (
                    <Text
                      style={styles.stepTarget}
                    >
                      Objetivo: {target}
                    </Text>
                  ) : null}

                  <Text
                    style={styles.stepActual}
                  >
                    Tiempo activo:{' '}
                    {formatDuration(
                      step.actual_duration_seconds
                    )}
                  </Text>

                  {step.machine_type_id ? (
                    <Pressable
                      style={styles.machineLink}
                      onPress={() =>
                        router.push({
                          pathname:
                            '/maquina/[id]',
                          params: {
                            id: String(
                              step.machine_type_id
                            ),
                            ...(session.plaza_id
                              ? {
                                  plazaId:
                                    String(
                                      session.plaza_id
                                    ),
                                }
                              : {}),
                          },
                        })
                      }
                    >
                      <Ionicons
                        name="barbell-outline"
                        size={15}
                        color="#166534"
                      />

                      <Text
                        style={
                          styles.machineLinkText
                        }
                      >
                        Ver máquina
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            )
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f0fdf4',
  },

  center: {
    flex: 1,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  container: {
    padding: 16,
    paddingBottom: 30,
    gap: 14,
  },

  heroCard: {
    backgroundColor: '#ffffff',

    borderWidth: 1,
    borderColor: '#dcfce7',
    borderRadius: 20,

    padding: 19,
  },

  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },

  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },

  title: {
    color: '#111827',
    fontSize: 25,
    fontWeight: '900',
    marginTop: 14,
  },

  plaza: {
    color: '#15803d',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 5,
  },

  date: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 8,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 11,
  },

  statCard: {
    width: '48%',

    backgroundColor: '#ffffff',

    borderWidth: 1,
    borderColor: '#dcfce7',
    borderRadius: 17,

    paddingVertical: 16,
    paddingHorizontal: 10,

    alignItems: 'center',
  },

  statValue: {
    color: '#111827',
    fontSize: 21,
    fontWeight: '900',
    marginTop: 7,
  },

  statLabel: {
    color: '#6b7280',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 3,
  },

  sectionCard: {
    backgroundColor: '#ffffff',

    borderWidth: 1,
    borderColor: '#dcfce7',
    borderRadius: 18,

    padding: 17,
  },

  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 7,
  },

  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,

    borderTopWidth: 1,
    borderTopColor: '#ecfdf5',

    paddingVertical: 11,
  },

  rewardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,

    backgroundColor: '#dcfce7',

    alignItems: 'center',
    justifyContent: 'center',
  },

  rewardTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },

  rewardSubtitle: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },

  rewardXp: {
    color: '#16a34a',
    fontSize: 14,
    fontWeight: '900',
  },

  rewardTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',

    borderTopWidth: 1,
    borderTopColor: '#86efac',

    paddingTop: 14,
    marginTop: 4,
  },

  rewardTotalLabel: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
  },

  rewardTotalValue: {
    color: '#16a34a',
    fontSize: 19,
    fontWeight: '900',
  },

  noRewardCard: {
    flexDirection: 'row',
    gap: 10,

    backgroundColor: '#fef3c7',

    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 17,

    padding: 16,
  },

  noRewardTitle: {
    color: '#92400e',
    fontSize: 15,
    fontWeight: '800',
  },

  noRewardText: {
    color: '#92400e',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },

  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,

    borderTopWidth: 1,
    borderTopColor: '#ecfdf5',

    paddingVertical: 14,
  },

  stepTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },

  stepInstruction: {
    color: '#4b5563',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },

  stepTarget: {
    color: '#15803d',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 7,
  },

  stepActual: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 4,
  },

  machineLink: {
    alignSelf: 'flex-start',

    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,

    backgroundColor: '#f0fdf4',

    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 999,

    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 9,
  },

  machineLinkText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
  },

  errorTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 13,
  },

  errorText: {
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 7,
  },

  backButton: {
    backgroundColor: '#16a34a',
    borderRadius: 13,
    paddingHorizontal: 22,
    paddingVertical: 13,
    marginTop: 18,
  },

  backButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },
})