import Ionicons from '@expo/vector-icons/Ionicons'
import {
    router,
    useFocusEffect,
} from 'expo-router'
import {
    type ComponentProps,
    useCallback,
    useState,
} from 'react'
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import type { Database } from '../../../types/database.types'

type IoniconName =
  ComponentProps<typeof Ionicons>['name']

type WorkoutSessionRow =
  Database['public']['Tables']['workout_sessions']['Row']

type HistoryItem = Pick<
  WorkoutSessionRow,
  | 'id'
  | 'routine_title_snapshot'
  | 'plaza_name_snapshot'
  | 'status'
  | 'started_at'
  | 'completed_at'
  | 'abandoned_at'
  | 'workout_duration_seconds'
  | 'completed_steps'
  | 'skipped_steps'
  | 'total_steps'
  | 'completion_percentage'
  | 'reward_eligible'
  | 'xp_awarded'
  | 'post_rewards_payload'
>

type HistoryFilter =
  | 'all'
  | 'valid'
  | 'no_xp'
  | 'abandoned'

type PostRewardPayload = {
  total_xp_awarded?: number
}

const PAGE_SIZE = 20

const FILTERS: {
  key: HistoryFilter
  label: string
}[] = [
  {
    key: 'all',
    label: 'Todas',
  },
  {
    key: 'valid',
    label: 'Válidas',
  },
  {
    key: 'no_xp',
    label: 'Sin XP',
  },
  {
    key: 'abandoned',
    label: 'Abandonadas',
  },
]

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

function getSessionTotalXp(
  item: HistoryItem
) {
  const payload = readPostRewardPayload(
    item.post_rewards_payload
  )

  return Number(
    payload?.total_xp_awarded ??
      item.xp_awarded ??
      0
  )
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
  const date = new Date(dateString)

  const datePart = date.toLocaleDateString(
    'es-CL',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }
  )

  const timePart = date.toLocaleTimeString(
    'es-CL',
    {
      hour: '2-digit',
      minute: '2-digit',
    }
  )

  return `${datePart} · ${timePart}`
}

function getStatusAppearance(
  item: HistoryItem
): {
  label: string
  icon: IoniconName
  foreground: string
  background: string
} {
  if (item.status === 'abandoned') {
    return {
      label: 'Abandonado',
      icon: 'close-circle-outline',
      foreground: '#b91c1c',
      background: '#fee2e2',
    }
  }

  if (item.reward_eligible) {
    return {
      label: 'Válido',
      icon: 'checkmark-circle-outline',
      foreground: '#166534',
      background: '#dcfce7',
    }
  }

  return {
    label: 'Sin XP',
    icon: 'information-circle-outline',
    foreground: '#92400e',
    background: '#fef3c7',
  }
}

async function fetchHistoryPage(
  filter: HistoryFilter,
  offset: number
) {
  let query = supabase
    .from('workout_sessions')
    .select(
      `
      id,
      routine_title_snapshot,
      plaza_name_snapshot,
      status,
      started_at,
      completed_at,
      abandoned_at,
      workout_duration_seconds,
      completed_steps,
      skipped_steps,
      total_steps,
      completion_percentage,
      reward_eligible,
      xp_awarded,
      post_rewards_payload
    `,
      {
        count: 'exact',
      }
    )
    .order('started_at', {
      ascending: false,
    })
    .range(
      offset,
      offset + PAGE_SIZE - 1
    )

  if (filter === 'all') {
    query = query.in('status', [
      'completed',
      'abandoned',
    ])
  }

  if (filter === 'valid') {
    query = query
      .eq('status', 'completed')
      .eq('reward_eligible', true)
  }

  if (filter === 'no_xp') {
    query = query
      .eq('status', 'completed')
      .eq('reward_eligible', false)
  }

  if (filter === 'abandoned') {
    query = query.eq(
      'status',
      'abandoned'
    )
  }

  const {
    data,
    error,
    count,
  } = await query

  if (error) {
    throw error
  }

  return {
    items: (data ?? []) as HistoryItem[],
    count: Number(count ?? 0),
  }
}

export default function WorkoutHistoryScreen() {
  const [items, setItems] =
    useState<HistoryItem[]>([])

  const [activeFilter, setActiveFilter] =
    useState<HistoryFilter>('all')

  const [totalCount, setTotalCount] =
    useState(0)

  const [loading, setLoading] =
    useState(true)

  const [refreshing, setRefreshing] =
    useState(false)

  const [loadingMore, setLoadingMore] =
    useState(false)

  const [hasMore, setHasMore] =
    useState(false)

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null)

  const refreshHistory = useCallback(
    async (fullLoader = false) => {
      try {
        if (fullLoader) {
          setLoading(true)
        } else {
          setRefreshing(true)
        }

        setErrorMessage(null)

        const result =
          await fetchHistoryPage(
            activeFilter,
            0
          )

        setItems(result.items)
        setTotalCount(result.count)

        setHasMore(
          result.items.length <
            result.count
        )
      } catch (error: any) {
        setErrorMessage(
          error.message ??
            'No se pudo cargar el historial.'
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [activeFilter]
  )

  useFocusEffect(
    useCallback(() => {
      void refreshHistory(true)
    }, [refreshHistory])
  )

  const loadMore = useCallback(
    async () => {
      if (
        loading ||
        refreshing ||
        loadingMore ||
        !hasMore
      ) {
        return
      }

      try {
        setLoadingMore(true)

        const result =
          await fetchHistoryPage(
            activeFilter,
            items.length
          )

        setItems((current) => [
          ...current,
          ...result.items,
        ])

        setTotalCount(result.count)

        setHasMore(
          items.length +
            result.items.length <
            result.count
        )
      } catch (error: any) {
        setErrorMessage(
          error.message ??
            'No se pudieron cargar más sesiones.'
        )
      } finally {
        setLoadingMore(false)
      }
    },
    [
      activeFilter,
      hasMore,
      items.length,
      loading,
      loadingMore,
      refreshing,
    ]
  )

  function changeFilter(
    filter: HistoryFilter
  ) {
    if (filter === activeFilter) {
      return
    }

    setItems([])
    setTotalCount(0)
    setHasMore(false)
    setActiveFilter(filter)
  }

  function renderHistoryItem({
    item,
  }: {
    item: HistoryItem
  }) {
    const status =
      getStatusAppearance(item)

    const totalXp =
      getSessionTotalXp(item)

    return (
      <Pressable
        style={styles.sessionCard}
        onPress={() =>
          router.push({
            pathname: '/historial/[id]',
            params: {
              id: item.id,
            },
          })
        }
      >
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.statusIcon,
              {
                backgroundColor:
                  status.background,
              },
            ]}
          >
            <Ionicons
              name={status.icon}
              size={22}
              color={status.foreground}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text
              style={styles.sessionTitle}
              numberOfLines={2}
            >
              {item.routine_title_snapshot}
            </Text>

            <Text style={styles.plazaName}>
              {item.plaza_name_snapshot}
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={21}
            color="#16a34a"
          />
        </View>

        <View style={styles.metaRow}>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  status.background,
              },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                {
                  color: status.foreground,
                },
              ]}
            >
              {status.label}
            </Text>
          </View>

          <Text style={styles.dateText}>
            {formatDateTime(
              item.completed_at ??
                item.abandoned_at ??
                item.started_at
            )}
          </Text>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Ionicons
              name="time-outline"
              size={17}
              color="#16a34a"
            />

            <Text style={styles.metricText}>
              {formatDuration(
                item.workout_duration_seconds
              )}
            </Text>
          </View>

          <View style={styles.metric}>
            <Ionicons
              name="checkmark-done-outline"
              size={17}
              color="#16a34a"
            />

            <Text style={styles.metricText}>
              {item.completed_steps} de{' '}
              {item.total_steps}
            </Text>
          </View>

          <View style={styles.metric}>
            <Ionicons
              name="sparkles-outline"
              size={17}
              color={
                totalXp > 0
                  ? '#16a34a'
                  : '#9ca3af'
              }
            />

            <Text
              style={[
                styles.metricText,
                totalXp === 0 &&
                  styles.metricTextMuted,
              ]}
            >
              +{totalXp} XP
            </Text>
          </View>
        </View>
      </Pressable>
    )
  }

  if (loading && items.length === 0) {
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
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderHistoryItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.container,
          items.length === 0 &&
            styles.emptyContainer,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() =>
              void refreshHistory(false)
            }
            colors={['#16a34a']}
            tintColor="#16a34a"
          />
        }
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <View style={styles.summaryCard}>
              <View style={styles.summaryIcon}>
                <Ionicons
                  name="calendar-outline"
                  size={27}
                  color="#166534"
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.summaryEyebrow}>
                  Historial
                </Text>

                <Text style={styles.summaryTitle}>
                  {totalCount}{' '}
                  {totalCount === 1
                    ? 'sesión'
                    : 'sesiones'}
                </Text>
              </View>
            </View>

            <View style={styles.filtersRow}>
              {FILTERS.map((filter) => {
                const active =
                  activeFilter === filter.key

                return (
                  <Pressable
                    key={filter.key}
                    style={[
                      styles.filterChip,
                      active &&
                        styles.filterChipActive,
                    ]}
                    onPress={() =>
                      changeFilter(filter.key)
                    }
                  >
                    <Text
                      style={[
                        styles.filterText,
                        active &&
                          styles.filterTextActive,
                      ]}
                    >
                      {filter.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            {errorMessage ? (
              <View style={styles.errorCard}>
                <Ionicons
                  name="alert-circle-outline"
                  size={21}
                  color="#b91c1c"
                />

                <Text style={styles.errorText}>
                  {errorMessage}
                </Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name="fitness-outline"
                size={34}
                color="#16a34a"
              />
            </View>

            <Text style={styles.emptyTitle}>
              No hay sesiones en este filtro
            </Text>

            <Text style={styles.emptyText}>
              Tus entrenamientos aparecerán aquí
              cuando finalices o abandones una
              sesión.
            </Text>
          </View>
        }
        ListFooterComponent={
          hasMore ? (
            <Pressable
              style={styles.loadMoreButton}
              onPress={() =>
                void loadMore()
              }
              disabled={loadingMore}
            >
              {loadingMore ? (
                <ActivityIndicator
                  size="small"
                  color="#166534"
                />
              ) : (
                <Text
                  style={styles.loadMoreText}
                >
                  Cargar más
                </Text>
              )}
            </Pressable>
          ) : items.length > 0 ? (
            <Text style={styles.endText}>
              No hay más sesiones
            </Text>
          ) : null
        }
      />
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

  emptyContainer: {
    flexGrow: 1,
  },

  headerContent: {
    gap: 13,
    marginBottom: 1,
  },

  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,

    backgroundColor: '#166534',

    borderRadius: 20,
    padding: 18,
  },

  summaryIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,

    backgroundColor: '#dcfce7',

    alignItems: 'center',
    justifyContent: 'center',
  },

  summaryEyebrow: {
    color: '#bbf7d0',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },

  summaryTitle: {
    color: '#ffffff',
    fontSize: 23,
    fontWeight: '900',
    marginTop: 2,
  },

  filtersRow: {
    flexDirection: 'row',
    gap: 8,
  },

  filterChip: {
    flex: 1,
    minHeight: 40,

    backgroundColor: '#ffffff',

    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,

    alignItems: 'center',
    justifyContent: 'center',

    paddingHorizontal: 8,
  },

  filterChipActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },

  filterText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
  },

  filterTextActive: {
    color: '#ffffff',
  },

  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,

    backgroundColor: '#fee2e2',

    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 13,

    padding: 13,
  },

  errorText: {
    flex: 1,
    color: '#b91c1c',
    fontSize: 13,
  },

  sessionCard: {
    backgroundColor: '#ffffff',

    borderWidth: 1,
    borderColor: '#dcfce7',
    borderRadius: 18,

    padding: 16,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,

    alignItems: 'center',
    justifyContent: 'center',
  },

  sessionTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },

  plazaName: {
    color: '#15803d',
    fontSize: 13,
    marginTop: 3,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    gap: 10,
    marginTop: 14,
  },

  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },

  dateText: {
    flex: 1,
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'right',
  },

  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 13,

    borderTopWidth: 1,
    borderTopColor: '#ecfdf5',

    paddingTop: 13,
    marginTop: 13,
  },

  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  metricText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '700',
  },

  metricTextMuted: {
    color: '#9ca3af',
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',

    paddingHorizontal: 25,
    paddingVertical: 60,
  },

  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,

    backgroundColor: '#dcfce7',

    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',

    marginTop: 16,
  },

  emptyText: {
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',

    marginTop: 7,
  },

  loadMoreButton: {
    minHeight: 45,

    backgroundColor: '#ffffff',

    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 13,

    alignItems: 'center',
    justifyContent: 'center',

    marginTop: 4,
  },

  loadMoreText: {
    color: '#166534',
    fontWeight: '800',
  },

  endText: {
    color: '#9ca3af',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 14,
  },
})