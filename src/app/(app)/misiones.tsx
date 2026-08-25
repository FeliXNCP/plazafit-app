import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect } from 'expo-router'
import {
    type ComponentProps,
    useCallback,
    useState,
} from 'react'
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'

type IoniconName =
  ComponentProps<typeof Ionicons>['name']

type WeeklyMission = {
  id: string
  code: string
  title: string
  description: string
  category: string
  metric_key: string

  target_value: number
  current_value: number
  progress_percentage: number

  xp_reward: number
  icon_name: string

  status:
    | 'active'
    | 'completed'
    | 'expired'

  completed_at: string | null
}

type WeeklyMissionEvaluation = {
  week_start: string
  week_end: string
  days_remaining: number

  summary: {
    total: number
    completed: number
  }

  newly_completed: WeeklyMission[]
  missions: WeeklyMission[]
}

const EMPTY_EVALUATION: WeeklyMissionEvaluation = {
  week_start: '',
  week_end: '',
  days_remaining: 0,

  summary: {
    total: 0,
    completed: 0,
  },

  newly_completed: [],
  missions: [],
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

function normalizeEvaluation(
  value: unknown
): WeeklyMissionEvaluation {
  const raw =
    (value ?? {}) as Partial<WeeklyMissionEvaluation>

  const missions = Array.isArray(raw.missions)
    ? raw.missions.map((mission) => ({
        ...mission,

        target_value:
          Number(mission.target_value ?? 0),

        current_value:
          Number(mission.current_value ?? 0),

        progress_percentage: Math.min(
          100,
          Math.max(
            0,
            Number(
              mission.progress_percentage ?? 0
            )
          )
        ),

        xp_reward:
          Number(mission.xp_reward ?? 0),
      }))
    : []

  return {
    week_start:
      String(raw.week_start ?? ''),

    week_end:
      String(raw.week_end ?? ''),

    days_remaining:
      Number(raw.days_remaining ?? 0),

    summary: {
      total: Number(
        raw.summary?.total ??
          missions.length
      ),

      completed: Number(
        raw.summary?.completed ??
          missions.filter(
            (mission) =>
              mission.status === 'completed'
          ).length
      ),
    },

    newly_completed:
      Array.isArray(raw.newly_completed)
        ? raw.newly_completed
        : [],

    missions,
  }
}

function getMissionIcon(
  iconName: string
): IoniconName {
  return (
    iconName || 'flag-outline'
  ) as IoniconName
}

function getCategoryLabel(
  category: string
) {
  switch (category) {
    case 'training':
      return 'Entrenamiento'

    case 'exploration':
      return 'Exploración'

    case 'consistency':
      return 'Constancia'

    default:
      return 'Misión'
  }
}

function formatDate(
  dateString: string
) {
  if (!dateString) return ''

  return new Date(
    `${dateString}T12:00:00`
  ).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'long',
  })
}

export default function WeeklyMissionsScreen() {
  const [evaluation, setEvaluation] =
    useState<WeeklyMissionEvaluation>(
      EMPTY_EVALUATION
    )

  const [loading, setLoading] =
    useState(true)

  const loadMissions =
    useCallback(async () => {
      try {
        setLoading(true)

        const { data, error } =
          await supabase.rpc(
            'evaluate_my_weekly_missions'
          )

        if (error) throw error

        const result =
          normalizeEvaluation(data)

        setEvaluation(result)

        if (
          result.newly_completed.length > 0
        ) {
          const message =
            result.newly_completed
              .map(
                (mission) =>
                  `${mission.title} (+${mission.xp_reward} XP)`
              )
              .join('\n')

          Alert.alert(
            result.newly_completed.length === 1
              ? '¡Misión completada!'
              : '¡Misiones completadas!',
            message
          )
        }
      } catch (error: any) {
        Alert.alert(
          'No se pudieron cargar las misiones',
          error.message ??
            'Intenta nuevamente.'
        )
      } finally {
        setLoading(false)
      }
    }, [])

  useFocusEffect(
    useCallback(() => {
      void loadMissions()
    }, [loadMissions])
  )

  const overallProgress =
    evaluation.summary.total > 0
      ? (
          evaluation.summary.completed /
          evaluation.summary.total
        ) * 100
      : 0

  const overallProgressWidth =
    toPercentageWidth(overallProgress)

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
      edges={['bottom']}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryIcon}>
              <Ionicons
                name="flag-outline"
                size={29}
                color="#166534"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.summaryEyebrow}>
                Semana actual
              </Text>

              <Text style={styles.summaryTitle}>
                {evaluation.summary.completed} de{' '}
                {evaluation.summary.total}
              </Text>
            </View>

            <Text style={styles.summaryPercent}>
              {Math.round(overallProgress)}%
            </Text>
          </View>

          <View style={styles.summaryTrack}>
            <View
              style={[
                styles.summaryFill,
                {
                  width: overallProgressWidth,
                },
              ]}
            />
          </View>

          <Text style={styles.summaryDescription}>
            Las misiones cambian cada semana y
            entregan XP adicional.
          </Text>

          <Text style={styles.summaryDeadline}>
            Vencen el{' '}
            {formatDate(evaluation.week_end)}
          </Text>
        </View>

        {evaluation.missions.map(
          (mission) => {
            const completed =
              mission.status === 'completed'

            const progressWidth =
              toPercentageWidth(
                mission.progress_percentage
              )

            return (
              <View
                key={mission.id}
                style={[
                  styles.missionCard,
                  completed &&
                    styles.missionCardCompleted,
                ]}
              >
                <View style={styles.cardHeader}>
                  <View
                    style={[
                      styles.missionIcon,
                      completed
                        ? styles.missionIconCompleted
                        : styles.missionIconActive,
                    ]}
                  >
                    <Ionicons
                      name={getMissionIcon(
                        mission.icon_name
                      )}
                      size={25}
                      color={
                        completed
                          ? '#ffffff'
                          : '#166534'
                      }
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.category}>
                      {getCategoryLabel(
                        mission.category
                      )}
                    </Text>

                    <Text style={styles.title}>
                      {mission.title}
                    </Text>
                  </View>

                  <View style={styles.rewardBadge}>
                    <Text style={styles.rewardText}>
                      +{mission.xp_reward} XP
                    </Text>
                  </View>
                </View>

                <Text style={styles.description}>
                  {mission.description}
                </Text>

                <View style={styles.progressHeader}>
                  <Text style={styles.progressText}>
                    {completed
                      ? 'Completada'
                      : `${Math.min(
                          mission.current_value,
                          mission.target_value
                        )} de ${mission.target_value}`}
                  </Text>

                  <Text
                    style={styles.progressPercent}
                  >
                    {Math.round(
                      mission.progress_percentage
                    )}
                    %
                  </Text>
                </View>

                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      completed &&
                        styles.progressFillCompleted,
                      {
                        width: progressWidth,
                      },
                    ]}
                  />
                </View>

                {completed ? (
                  <View style={styles.completedRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={17}
                      color="#16a34a"
                    />

                    <Text
                      style={styles.completedText}
                    >
                      Recompensa obtenida
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.deadlineText}>
                    Disponible hasta el domingo
                  </Text>
                )}
              </View>
            )
          }
        )}
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
  },
  container: {
    padding: 16,
    paddingBottom: 30,
    gap: 13,
  },
  summaryCard: {
    backgroundColor: '#166534',
    borderRadius: 20,
    padding: 18,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryEyebrow: {
    color: '#bbf7d0',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  summaryTitle: {
    color: '#ffffff',
    fontSize: 25,
    fontWeight: '900',
    marginTop: 2,
  },
  summaryPercent: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
  },
  summaryTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor:
      'rgba(255,255,255,0.22)',
    overflow: 'hidden',
    marginTop: 18,
  },
  summaryFill: {
    height: '100%',
    backgroundColor: '#86efac',
    borderRadius: 999,
  },
  summaryDescription: {
    color: '#dcfce7',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 11,
  },
  summaryDeadline: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 7,
  },
  missionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dcfce7',
    padding: 17,
  },
  missionCardCompleted: {
    borderColor: '#86efac',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  missionIcon: {
    width: 49,
    height: 49,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionIconActive: {
    backgroundColor: '#dcfce7',
  },
  missionIconCompleted: {
    backgroundColor: '#16a34a',
  },
  category: {
    color: '#16a34a',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 2,
  },
  rewardBadge: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  rewardText: {
    color: '#92400e',
    fontSize: 11,
    fontWeight: '800',
  },
  description: {
    color: '#4b5563',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 13,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
    marginBottom: 8,
  },
  progressText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  progressPercent: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: '900',
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#9ca3af',
    borderRadius: 999,
  },
  progressFillCompleted: {
    backgroundColor: '#16a34a',
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 11,
  },
  completedText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
  },
  deadlineText: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 10,
  },
})