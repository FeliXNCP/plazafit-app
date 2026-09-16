import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect } from 'expo-router'
import {
    type ComponentProps,
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
    TextInput,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'

type IoniconName = ComponentProps<typeof Ionicons>['name']

type EquipmentItem = {
  code: string
  name: string
  icon_name: string
}

type HomeExercise = {
  id: number
  code: string
  name: string
  description: string
  instructions: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  exercise_mode: 'repetitions' | 'duration'
  movement_pattern: string
  primary_focus: string
  impact_level: 'low' | 'moderate' | 'high'
  default_sets: number | null
  default_reps: number | null
  default_duration_seconds: number | null
  default_rest_seconds: number
  estimated_seconds_per_set: number | null
  estimated_work_seconds: number
  icon_name: string
  image_storage_path: string | null
  equipment: EquipmentItem[]
}

type CatalogResponse = {
  profile: {
    goal: string
    fitness_level: string
    days_per_week: number
    session_minutes: number
  }
  available_count: number
  exercises: HomeExercise[]
}

type CatalogFilter = 'all' | 'bodyweight' | 'equipment'

const EMPTY_CATALOG: CatalogResponse = {
  profile: {
    goal: '',
    fitness_level: '',
    days_per_week: 0,
    session_minutes: 0,
  },
  available_count: 0,
  exercises: [],
}

function normalizeCatalog(value: unknown): CatalogResponse {
  const raw = (value ?? {}) as Partial<CatalogResponse>

  const exercises = Array.isArray(raw.exercises)
    ? raw.exercises.map((item) => ({
        ...item,
        id: Number(item.id ?? 0),
        default_sets:
          item.default_sets == null ? null : Number(item.default_sets),
        default_reps:
          item.default_reps == null ? null : Number(item.default_reps),
        default_duration_seconds:
          item.default_duration_seconds == null
            ? null
            : Number(item.default_duration_seconds),
        default_rest_seconds: Number(item.default_rest_seconds ?? 0),
        estimated_seconds_per_set:
          item.estimated_seconds_per_set == null
            ? null
            : Number(item.estimated_seconds_per_set),
        estimated_work_seconds: Number(item.estimated_work_seconds ?? 0),
        equipment: Array.isArray(item.equipment) ? item.equipment : [],
      }))
    : []

  return {
    profile: {
      goal: String(raw.profile?.goal ?? ''),
      fitness_level: String(raw.profile?.fitness_level ?? ''),
      days_per_week: Number(raw.profile?.days_per_week ?? 0),
      session_minutes: Number(raw.profile?.session_minutes ?? 0),
    },
    available_count: Number(raw.available_count ?? exercises.length),
    exercises,
  }
}

function goalLabel(value: string) {
  switch (value) {
    case 'stay_active':
      return 'Mantenerme activo'
    case 'general_fitness':
      return 'Condición física general'
    case 'strength':
      return 'Ganar fuerza'
    case 'endurance':
      return 'Mejorar resistencia'
    case 'mobility':
      return 'Mejorar movilidad'
    default:
      return 'Objetivo Home Gym'
  }
}

function levelLabel(value: string) {
  switch (value) {
    case 'beginner':
      return 'Principiante'
    case 'intermediate':
      return 'Intermedio'
    case 'advanced':
      return 'Avanzado'
    default:
      return 'Nivel'
  }
}

function difficultyLabel(value: HomeExercise['difficulty']) {
  return levelLabel(value)
}

function focusLabel(value: string) {
  switch (value) {
    case 'legs':
      return 'Piernas'
    case 'glutes':
      return 'Glúteos'
    case 'chest':
      return 'Pecho'
    case 'back':
      return 'Espalda'
    case 'shoulders':
      return 'Hombros'
    case 'arms':
      return 'Brazos'
    case 'core':
      return 'Core'
    case 'full_body':
      return 'Cuerpo completo'
    case 'cardio':
      return 'Cardio'
    case 'mobility':
      return 'Movilidad'
    default:
      return value
  }
}

function formatSeconds(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  if (minutes === 0) return `${seconds} s`
  if (seconds === 0) return `${minutes} min`
  return `${minutes} min ${seconds} s`
}

function exerciseTarget(exercise: HomeExercise) {
  if (exercise.exercise_mode === 'duration') {
    return formatSeconds(exercise.default_duration_seconds ?? 0)
  }

  return `${exercise.default_sets ?? 0} × ${exercise.default_reps ?? 0} repeticiones`
}

function exerciseIcon(value: string): IoniconName {
  return (value || 'fitness-outline') as IoniconName
}

export default function HomeExerciseCatalogScreen() {
  const [catalog, setCatalog] = useState<CatalogResponse>(EMPTY_CATALOG)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [filter, setFilter] = useState<CatalogFilter>('all')

  const loadCatalog = useCallback(async (initial = false) => {
    try {
      if (initial) setLoading(true)
      else setRefreshing(true)

      const { data, error } = await supabase.rpc(
        'get_my_home_gym_exercise_catalog'
      )

      if (error) throw error

      setCatalog(normalizeCatalog(data))
    } catch (error: any) {
      Alert.alert(
        'No se pudo cargar el catálogo',
        error.message ?? 'Revisa tu perfil Home Gym e intenta nuevamente.'
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadCatalog(true)
    }, [loadCatalog])
  )

  const filteredExercises = useMemo(() => {
    const query = searchText.trim().toLowerCase()

    return catalog.exercises.filter((exercise) => {
      const matchesSearch =
        query.length === 0 ||
        exercise.name.toLowerCase().includes(query) ||
        exercise.description.toLowerCase().includes(query) ||
        focusLabel(exercise.primary_focus).toLowerCase().includes(query)

      const matchesFilter =
        filter === 'all' ||
        (filter === 'bodyweight' && exercise.equipment.length === 0) ||
        (filter === 'equipment' && exercise.equipment.length > 0)

      return matchesSearch && matchesFilter
    })
  }, [catalog.exercises, filter, searchText])

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="library-outline" size={29} color="#166534" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.heroEyebrow}>Catálogo compatible</Text>
            <Text style={styles.heroTitle}>
              {catalog.available_count} ejercicios disponibles
            </Text>
            <Text style={styles.heroDescription}>
              {goalLabel(catalog.profile.goal)} ·{' '}
              {levelLabel(catalog.profile.fitness_level)}
            </Text>
          </View>

          <Pressable
            style={styles.refreshButton}
            onPress={() => void loadCatalog(false)}
            disabled={refreshing}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#166534" />
            ) : (
              <Ionicons name="refresh-outline" size={20} color="#166534" />
            )}
          </Pressable>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark-outline" size={22} color="#166534" />
          <Text style={styles.infoText}>
            Esta lista ya fue filtrada por tu objetivo, nivel y equipamiento.
            El generador —y más adelante la IA— solo podrá seleccionar ejercicios
            de este catálogo aprobado.
          </Text>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={19} color="#6b7280" />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Buscar ejercicio o zona"
            placeholderTextColor="#6b7280"
            style={styles.searchInput}
          />
          {searchText.length > 0 ? (
            <Pressable onPress={() => setSearchText('')} hitSlop={8}>
              <Ionicons name="close-circle" size={19} color="#6b7280" />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filtersRow}>
          {(
            [
              ['all', 'Todos'],
              ['bodyweight', 'Peso corporal'],
              ['equipment', 'Con equipo'],
            ] as const
          ).map(([value, label]) => {
            const active = filter === value

            return (
              <Pressable
                key={value}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(value)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <Text style={styles.resultText}>
          {filteredExercises.length}{' '}
          {filteredExercises.length === 1 ? 'resultado' : 'resultados'}
        </Text>

        {filteredExercises.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="search-outline" size={34} color="#16a34a" />
            <Text style={styles.emptyTitle}>No hay ejercicios en este filtro</Text>
            <Text style={styles.emptyText}>
              Cambia la búsqueda o edita tu equipamiento desde Home Gym.
            </Text>
          </View>
        ) : (
          filteredExercises.map((exercise) => (
            <View key={exercise.id} style={styles.exerciseCard}>
              <View style={styles.exerciseHeader}>
                <View style={styles.exerciseIcon}>
                  <Ionicons
                    name={exerciseIcon(exercise.icon_name)}
                    size={24}
                    color="#166534"
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.exerciseName}>{exercise.name}</Text>
                  <Text style={styles.exerciseMeta}>
                    {focusLabel(exercise.primary_focus)} ·{' '}
                    {difficultyLabel(exercise.difficulty)}
                  </Text>
                </View>

                <View style={styles.targetBadge}>
                  <Text style={styles.targetBadgeText}>
                    {exerciseTarget(exercise)}
                  </Text>
                </View>
              </View>

              <Text style={styles.exerciseDescription}>
                {exercise.description}
              </Text>

              <View style={styles.detailRow}>
                <View style={styles.detailItem}>
                  <Ionicons name="time-outline" size={16} color="#16a34a" />
                  <Text style={styles.detailText}>
                    Aprox. {formatSeconds(exercise.estimated_work_seconds)}
                  </Text>
                </View>

                <View style={styles.detailItem}>
                  <Ionicons name="pause-outline" size={16} color="#16a34a" />
                  <Text style={styles.detailText}>
                    Descanso {exercise.default_rest_seconds} s
                  </Text>
                </View>
              </View>

              <View style={styles.equipmentRow}>
                {exercise.equipment.length === 0 ? (
                  <View style={styles.equipmentChip}>
                    <Ionicons name="body-outline" size={15} color="#166534" />
                    <Text style={styles.equipmentChipText}>Peso corporal</Text>
                  </View>
                ) : (
                  exercise.equipment.map((equipment) => (
                    <View key={equipment.code} style={styles.equipmentChip}>
                      <Ionicons
                        name={exerciseIcon(equipment.icon_name)}
                        size={15}
                        color="#166534"
                      />
                      <Text style={styles.equipmentChipText}>
                        {equipment.name}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          ))
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
    paddingBottom: 34,
    gap: 13,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#166534',
    borderRadius: 20,
    padding: 18,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEyebrow: {
    color: '#86efac',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  heroDescription: {
    color: '#dcfce7',
    fontSize: 12,
    marginTop: 4,
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 16,
    padding: 14,
  },
  infoText: {
    flex: 1,
    color: '#166534',
    fontSize: 13,
    lineHeight: 19,
  },
  searchBox: {
    minHeight: 49,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 14,
    paddingHorizontal: 13,
  },
  searchInput: {
    flex: 1,
    color: '#111827',
    fontSize: 14,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    flex: 1,
    minHeight: 39,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  filterChipActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  filterChipText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  resultText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  exerciseCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dcfce7',
    borderRadius: 18,
    padding: 16,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  exerciseIcon: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseName: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
  },
  exerciseMeta: {
    color: '#15803d',
    fontSize: 12,
    marginTop: 3,
  },
  targetBadge: {
    maxWidth: 105,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  targetBadgeText: {
    color: '#166534',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  exerciseDescription: {
    color: '#4b5563',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
  },
  detailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  detailText: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '700',
  },
  equipmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: '#ecfdf5',
    paddingTop: 12,
    marginTop: 12,
  },
  equipmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  equipmentChipText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '800',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dcfce7',
    borderRadius: 18,
    padding: 28,
  },
  emptyTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 12,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 6,
  },
})
