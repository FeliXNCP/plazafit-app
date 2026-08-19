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

type AchievementItem = {
  id: number
  code: string
  name: string
  description: string
  category: string
  metric_key: string

  target_value: number
  current_value: number
  progress_percentage: number

  xp_reward: number
  icon_name: string
  sort_order: number

  unlocked: boolean
  unlocked_at: string | null
}

type AchievementEvaluation = {
  summary: {
    total: number
    unlocked: number
  }

  newly_unlocked: AchievementItem[]

  achievements: AchievementItem[]
}

const EMPTY_EVALUATION: AchievementEvaluation = {
  summary: {
    total: 0,
    unlocked: 0,
  },
  newly_unlocked: [],
  achievements: [],
}

function normalizeEvaluation(
  value: unknown
): AchievementEvaluation {
  const raw =
    (value ?? {}) as Partial<AchievementEvaluation>

  const achievements =
    Array.isArray(raw.achievements)
      ? raw.achievements.map((item) => ({
          ...item,
          id: Number(item.id),
          target_value:
            Number(item.target_value ?? 0),
          current_value:
            Number(item.current_value ?? 0),
          progress_percentage: Math.min(
            100,
            Math.max(
              0,
              Number(
                item.progress_percentage ?? 0
              )
            )
          ),
          xp_reward:
            Number(item.xp_reward ?? 0),
          unlocked:
            Boolean(item.unlocked),
        }))
      : []

  return {
    summary: {
      total: Number(
        raw.summary?.total ??
          achievements.length
      ),
      unlocked: Number(
        raw.summary?.unlocked ??
          achievements.filter(
            (item) => item.unlocked
          ).length
      ),
    },

    newly_unlocked:
      Array.isArray(raw.newly_unlocked)
        ? raw.newly_unlocked
        : [],

    achievements,
  }
}

function getAchievementIcon(
  value: string
): IoniconName {
  return (
    value || 'trophy-outline'
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
      return 'Logro'
  }
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

export default function AchievementsScreen() {
  const [evaluation, setEvaluation] =
    useState<AchievementEvaluation>(
      EMPTY_EVALUATION
    )

  const [loading, setLoading] =
    useState(true)

  const loadAchievements =
    useCallback(async () => {
      try {
        setLoading(true)

        const { data, error } =
          await supabase.rpc(
            'evaluate_my_achievements'
          )

        if (error) throw error

        setEvaluation(
          normalizeEvaluation(data)
        )
      } catch (error: any) {
        Alert.alert(
          'No se pudieron cargar los logros',
          error.message ??
            'Intenta nuevamente.'
        )
      } finally {
        setLoading(false)
      }
    }, [])

  useFocusEffect(
    useCallback(() => {
      void loadAchievements()
    }, [loadAchievements])
  )

  const overallProgress =
    evaluation.summary.total > 0
      ? (
          evaluation.summary.unlocked /
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
          <View style={styles.summaryTop}>
            <View style={styles.summaryIcon}>
              <Ionicons
                name="trophy-outline"
                size={30}
                color="#166534"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.summaryEyebrow}>
                Colección de logros
              </Text>

              <Text style={styles.summaryTitle}>
                {evaluation.summary.unlocked} de{' '}
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
            Completa entrenamientos, descubre
            plazas y mantén tu constancia para
            desbloquearlos todos.
          </Text>
        </View>

        {evaluation.achievements.map(
          (achievement) => {
            const progressWidth =
                toPercentageWidth(
                    achievement.progress_percentage
                )

            return (
              <View
                key={achievement.id}
                style={[
                  styles.achievementCard,
                  achievement.unlocked &&
                    styles.achievementCardUnlocked,
                ]}
              >
                <View style={styles.cardHeader}>
                  <View
                    style={[
                      styles.iconContainer,
                      achievement.unlocked
                        ? styles.iconUnlocked
                        : styles.iconLocked,
                    ]}
                  >
                    <Ionicons
                      name={getAchievementIcon(
                        achievement.icon_name
                      )}
                      size={26}
                      color={
                        achievement.unlocked
                          ? '#ffffff'
                          : '#6b7280'
                      }
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.category}>
                      {getCategoryLabel(
                        achievement.category
                      )}
                    </Text>

                    <Text style={styles.name}>
                      {achievement.name}
                    </Text>
                  </View>

                  <View
                    style={styles.rewardBadge}
                  >
                    <Text
                      style={styles.rewardText}
                    >
                      +{achievement.xp_reward} XP
                    </Text>
                  </View>
                </View>

                <Text style={styles.description}>
                  {achievement.description}
                </Text>

                <View style={styles.progressHeader}>
                  <Text style={styles.progressText}>
                    {achievement.unlocked
                      ? 'Desbloqueado'
                      : `${achievement.current_value} de ${achievement.target_value}`}
                  </Text>

                  <Text
                    style={
                      styles.progressPercent
                    }
                  >
                    {Math.round(
                      achievement
                        .progress_percentage
                    )}
                    %
                  </Text>
                </View>

                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      achievement.unlocked &&
                        styles.progressFillUnlocked,
                      {
                        width: progressWidth,
                      },
                    ]}
                  />
                </View>

                {achievement.unlocked ? (
                  <View style={styles.unlockedRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={17}
                      color="#16a34a"
                    />

                    <Text
                      style={styles.unlockedText}
                    >
                      Logro conseguido
                    </Text>
                  </View>
                ) : null}
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
  summaryTop: {
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
  achievementCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 17,
    opacity: 0.82,
  },
  achievementCardUnlocked: {
    borderColor: '#86efac',
    opacity: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  iconContainer: {
    width: 49,
    height: 49,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnlocked: {
    backgroundColor: '#16a34a',
  },
  iconLocked: {
    backgroundColor: '#f3f4f6',
  },
  category: {
    color: '#16a34a',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  name: {
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
  progressFillUnlocked: {
    backgroundColor: '#16a34a',
  },
  unlockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 11,
  },
  unlockedText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
  },
})