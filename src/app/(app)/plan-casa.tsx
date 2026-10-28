import Ionicons from '@expo/vector-icons/Ionicons'
import { PlanGenerationSheet } from '../../components/home-gym/PlanGenerationSheet'
import { planOriginLabel } from '../../services/home-gym/generation-ui-policy'
import { router, useFocusEffect } from 'expo-router'
import {
  type ComponentProps,
  useCallback,
  useMemo,
  useRef,
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
import { supabase } from '../../lib/supabase'

type IoniconName = ComponentProps<typeof Ionicons>['name']

type GoalCode =
  | 'stay_active'
  | 'general_fitness'
  | 'strength'
  | 'endurance'
  | 'mobility'

type FitnessLevel =
  | 'beginner'
  | 'intermediate'
  | 'advanced'

type CurrentProfile = {
  goal: GoalCode
  fitness_level: FitnessLevel
  days_per_week: number
  session_minutes: number
  updated_at: string
}

type PlanEquipment = {
  code: string
  name: string
  icon_name: string
}

type HomePlanStep = {
  id: number
  step_order: number
  exercise_id: number | null
  exercise_code: string | null
  exercise_name: string
  instructions: string
  target_sets: number | null
  target_reps: number | null
  target_duration_seconds: number | null
  target_rest_seconds: number
  difficulty: FitnessLevel | null
  movement_pattern: string | null
  primary_focus: string | null
  icon_name: string
  estimated_seconds: number
  equipment: PlanEquipment[]
}

type HomePlanDay = {
  id: string
  day_number: number
  title: string
  focus: string
  estimated_minutes: number
  steps: HomePlanStep[]
}

type HomeWorkoutPlan = {
  id: string
  name: string
  goal_snapshot: GoalCode
  fitness_level_snapshot: FitnessLevel
  days_per_week_snapshot: number
  session_minutes_snapshot: number
  equipment_codes_snapshot: string[]
  generation_source: 'deterministic' | 'ai' | 'manual'
  generator_version: string
  generation_metadata: Record<string, unknown>
  status: 'draft' | 'active' | 'archived'
  version: number
  created_at: string
  updated_at: string
  total_days: number
  total_steps: number
  total_estimated_minutes: number
  days: HomePlanDay[]
}

type HomePlanEnvelope = {
  configured: boolean
  hasActivePlan: boolean
  matchesCurrentProfile: boolean
  staleReasons: string[]
  currentProfile: CurrentProfile | null
  selectedEquipmentCodes: string[]
  plan: HomeWorkoutPlan | null
}

type ActiveWorkoutSummary = {
  id: string
  workout_source: 'plaza' | 'home_gym'
  home_plan_id: string | null
  home_plan_day_id: string | null
  routine_id: number | null
  routine_title_snapshot: string
  plaza_name_snapshot: string
  started_at: string
}

type HomeDayExecution = {
  plan_day_id: string
  day_number: number
  completed_this_week: boolean
  completed_count: number
  last_completed_at: string | null
  best_completion_percentage: number
}

type HomeExecutionState = {
  activeWorkout: ActiveWorkoutSummary | null
  weekStart: string
  weekEnd: string
  timezone: string
  completedDaysThisWeek: number
  totalDays: number
  days: HomeDayExecution[]
}

type StartHomeWorkoutResult = {
  status: 'started' | 'existing'
  session_id: string
  workout_source: 'plaza' | 'home_gym'
  home_plan_id: string | null
  home_plan_day_id: string | null
  same_home_day: boolean
  routine_title_snapshot: string
  plaza_name_snapshot: string
}

const EMPTY_PLAN_DATA: HomePlanEnvelope = {
  configured: false,
  hasActivePlan: false,
  matchesCurrentProfile: false,
  staleReasons: [],
  currentProfile: null,
  selectedEquipmentCodes: [],
  plan: null,
}

const EMPTY_EXECUTION_STATE: HomeExecutionState = {
  activeWorkout: null,
  weekStart: '',
  weekEnd: '',
  timezone: 'America/Santiago',
  completedDaysThisWeek: 0,
  totalDays: 0,
  days: [],
}

function normalizeExecutionState(value: unknown): HomeExecutionState {
  const raw = (value ?? {}) as {
    active_session?: Partial<ActiveWorkoutSummary> | null
    week_start?: unknown
    week_end?: unknown
    timezone?: unknown
    completed_days_this_week?: unknown
    total_days?: unknown
    days?: unknown
  }

  const activeWorkout = raw.active_session
    ? {
        id: String(raw.active_session.id ?? ''),
        workout_source: String(
          raw.active_session.workout_source ?? 'plaza'
        ) as ActiveWorkoutSummary['workout_source'],
        home_plan_id:
          raw.active_session.home_plan_id == null
            ? null
            : String(raw.active_session.home_plan_id),
        home_plan_day_id:
          raw.active_session.home_plan_day_id == null
            ? null
            : String(raw.active_session.home_plan_day_id),
        routine_id:
          raw.active_session.routine_id == null
            ? null
            : Number(raw.active_session.routine_id),
        routine_title_snapshot: String(
          raw.active_session.routine_title_snapshot ?? 'Entrenamiento'
        ),
        plaza_name_snapshot: String(
          raw.active_session.plaza_name_snapshot ?? 'PlazaFit'
        ),
        started_at: String(raw.active_session.started_at ?? ''),
      }
    : null

  const days = Array.isArray(raw.days)
    ? raw.days.map((value) => {
        const day = value as Partial<HomeDayExecution>

        return {
          plan_day_id: String(day.plan_day_id ?? ''),
          day_number: Number(day.day_number ?? 0),
          completed_this_week: Boolean(day.completed_this_week),
          completed_count: Number(day.completed_count ?? 0),
          last_completed_at:
            day.last_completed_at == null
              ? null
              : String(day.last_completed_at),
          best_completion_percentage: Number(
            day.best_completion_percentage ?? 0
          ),
        }
      })
    : []

  return {
    activeWorkout,
    weekStart: String(raw.week_start ?? ''),
    weekEnd: String(raw.week_end ?? ''),
    timezone: String(raw.timezone ?? 'America/Santiago'),
    completedDaysThisWeek: Number(raw.completed_days_this_week ?? 0),
    totalDays: Number(raw.total_days ?? 0),
    days,
  }
}

function normalizeStartResult(value: unknown): StartHomeWorkoutResult {
  const raw = (value ?? {}) as Partial<StartHomeWorkoutResult>

  const sessionId = String(raw.session_id ?? '')

  if (!sessionId) {
    throw new Error('La sesión fue creada sin un identificador válido.')
  }

  return {
    status: String(raw.status ?? 'started') as StartHomeWorkoutResult['status'],
    session_id: sessionId,
    workout_source: String(
      raw.workout_source ?? 'home_gym'
    ) as StartHomeWorkoutResult['workout_source'],
    home_plan_id:
      raw.home_plan_id == null ? null : String(raw.home_plan_id),
    home_plan_day_id:
      raw.home_plan_day_id == null
        ? null
        : String(raw.home_plan_day_id),
    same_home_day: Boolean(raw.same_home_day),
    routine_title_snapshot: String(
      raw.routine_title_snapshot ?? 'Entrenamiento'
    ),
    plaza_name_snapshot: String(
      raw.plaza_name_snapshot ?? 'PlazaFit'
    ),
  }
}

function normalizePlanEnvelope(value: unknown): HomePlanEnvelope {
  const raw = (value ?? {}) as {
    configured?: unknown
    has_active_plan?: unknown
    matches_current_profile?: unknown
    stale_reasons?: unknown
    current_profile?: Partial<CurrentProfile> | null
    selected_equipment_codes?: unknown
    plan?: Partial<HomeWorkoutPlan> | null
  }

  const currentProfile = raw.current_profile
    ? {
        goal: String(raw.current_profile.goal ?? 'stay_active') as GoalCode,
        fitness_level: String(
          raw.current_profile.fitness_level ?? 'beginner'
        ) as FitnessLevel,
        days_per_week: Number(raw.current_profile.days_per_week ?? 3),
        session_minutes: Number(raw.current_profile.session_minutes ?? 30),
        updated_at: String(raw.current_profile.updated_at ?? ''),
      }
    : null

  const plan = raw.plan
    ? {
        id: String(raw.plan.id ?? ''),
        name: String(raw.plan.name ?? 'Plan semanal Home Gym'),
        goal_snapshot: String(
          raw.plan.goal_snapshot ?? 'stay_active'
        ) as GoalCode,
        fitness_level_snapshot: String(
          raw.plan.fitness_level_snapshot ?? 'beginner'
        ) as FitnessLevel,
        days_per_week_snapshot: Number(
          raw.plan.days_per_week_snapshot ?? 0
        ),
        session_minutes_snapshot: Number(
          raw.plan.session_minutes_snapshot ?? 0
        ),
        equipment_codes_snapshot: Array.isArray(
          raw.plan.equipment_codes_snapshot
        )
          ? raw.plan.equipment_codes_snapshot.map(String)
          : [],
        generation_source: String(
          raw.plan.generation_source ?? 'deterministic'
        ) as HomeWorkoutPlan['generation_source'],
        generator_version: String(
          raw.plan.generator_version ?? 'deterministic-v1'
        ),
        generation_metadata:
          raw.plan.generation_metadata &&
          typeof raw.plan.generation_metadata === 'object' &&
          !Array.isArray(raw.plan.generation_metadata)
            ? (raw.plan.generation_metadata as Record<string, unknown>)
            : {},
        status: String(raw.plan.status ?? 'active') as HomeWorkoutPlan['status'],
        version: Number(raw.plan.version ?? 1),
        created_at: String(raw.plan.created_at ?? ''),
        updated_at: String(raw.plan.updated_at ?? ''),
        total_days: Number(raw.plan.total_days ?? 0),
        total_steps: Number(raw.plan.total_steps ?? 0),
        total_estimated_minutes: Number(
          raw.plan.total_estimated_minutes ?? 0
        ),
        days: Array.isArray(raw.plan.days)
          ? raw.plan.days.map((dayValue) => {
              const day = dayValue as Partial<HomePlanDay>

              return {
                id: String(day.id ?? ''),
                day_number: Number(day.day_number ?? 0),
                title: String(day.title ?? 'Sesión Home Gym'),
                focus: String(day.focus ?? 'mixed'),
                estimated_minutes: Number(day.estimated_minutes ?? 0),
                steps: Array.isArray(day.steps)
                  ? day.steps.map((stepValue) => {
                      const step = stepValue as Partial<HomePlanStep>

                      return {
                        id: Number(step.id ?? 0),
                        step_order: Number(step.step_order ?? 0),
                        exercise_id:
                          step.exercise_id == null
                            ? null
                            : Number(step.exercise_id),
                        exercise_code:
                          step.exercise_code == null
                            ? null
                            : String(step.exercise_code),
                        exercise_name: String(
                          step.exercise_name ?? 'Ejercicio'
                        ),
                        instructions: String(step.instructions ?? ''),
                        target_sets:
                          step.target_sets == null
                            ? null
                            : Number(step.target_sets),
                        target_reps:
                          step.target_reps == null
                            ? null
                            : Number(step.target_reps),
                        target_duration_seconds:
                          step.target_duration_seconds == null
                            ? null
                            : Number(step.target_duration_seconds),
                        target_rest_seconds: Number(
                          step.target_rest_seconds ?? 0
                        ),
                        difficulty:
                          step.difficulty == null
                            ? null
                            : (String(step.difficulty) as FitnessLevel),
                        movement_pattern:
                          step.movement_pattern == null
                            ? null
                            : String(step.movement_pattern),
                        primary_focus:
                          step.primary_focus == null
                            ? null
                            : String(step.primary_focus),
                        icon_name: String(
                          step.icon_name ?? 'fitness-outline'
                        ),
                        estimated_seconds: Number(
                          step.estimated_seconds ?? 0
                        ),
                        equipment: Array.isArray(step.equipment)
                          ? step.equipment.map((equipmentValue) => {
                              const equipment =
                                equipmentValue as Partial<PlanEquipment>

                              return {
                                code: String(equipment.code ?? ''),
                                name: String(
                                  equipment.name ?? 'Equipamiento'
                                ),
                                icon_name: String(
                                  equipment.icon_name ?? 'barbell-outline'
                                ),
                              }
                            })
                          : [],
                      }
                    })
                  : [],
              }
            })
          : [],
      }
    : null

  return {
    configured: Boolean(raw.configured),
    hasActivePlan: Boolean(raw.has_active_plan && plan),
    matchesCurrentProfile: Boolean(raw.matches_current_profile),
    staleReasons: Array.isArray(raw.stale_reasons)
      ? raw.stale_reasons.map(String)
      : [],
    currentProfile,
    selectedEquipmentCodes: Array.isArray(raw.selected_equipment_codes)
      ? raw.selected_equipment_codes.map(String)
      : [],
    plan,
  }
}

function goalLabel(goal: GoalCode) {
  switch (goal) {
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
  }
}

function levelLabel(level: FitnessLevel) {
  switch (level) {
    case 'beginner':
      return 'Principiante'
    case 'intermediate':
      return 'Intermedio'
    case 'advanced':
      return 'Avanzado'
  }
}

function focusLabel(focus: string) {
  switch (focus) {
    case 'full_body':
      return 'Cuerpo completo'
    case 'lower_body':
      return 'Tren inferior'
    case 'upper_body':
      return 'Tren superior'
    case 'cardio':
      return 'Cardio'
    case 'mobility':
      return 'Movilidad'
    case 'core':
      return 'Core y estabilidad'
    default:
      return 'Sesión mixta'
  }
}

function difficultyLabel(level: FitnessLevel | null) {
  switch (level) {
    case 'beginner':
      return 'Principiante'
    case 'intermediate':
      return 'Intermedio'
    case 'advanced':
      return 'Avanzado'
    default:
      return null
  }
}

function staleReasonLabel(reason: string) {
  switch (reason) {
    case 'goal':
      return 'objetivo'
    case 'fitness_level':
      return 'nivel'
    case 'days_per_week':
      return 'días por semana'
    case 'session_minutes':
      return 'duración de las sesiones'
    case 'equipment':
      return 'equipamiento'
    default:
      return reason
  }
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  if (minutes === 0) return `${seconds} s`
  if (seconds === 0) return `${minutes} min`

  return `${minutes} min ${seconds} s`
}

function formatTarget(step: HomePlanStep) {
  if (step.target_duration_seconds != null) {
    return formatDuration(step.target_duration_seconds)
  }

  if (step.target_sets != null && step.target_reps != null) {
    return `${step.target_sets} × ${step.target_reps} repeticiones`
  }

  return 'Objetivo por confirmar'
}

function iconName(value: string): IoniconName {
  return (value || 'fitness-outline') as IoniconName
}

export default function HomePlanScreen() {
  const [planData, setPlanData] =
    useState<HomePlanEnvelope>(EMPTY_PLAN_DATA)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [showGenerationSheet, setShowGenerationSheet] = useState(false)
  const generationInFlight = useRef(false)
  const [startingDayId, setStartingDayId] = useState<string | null>(null)
  const [expandedDayIds, setExpandedDayIds] = useState<string[]>([])
  const [executionState, setExecutionState] =
    useState<HomeExecutionState>(EMPTY_EXECUTION_STATE)

  const loadScreenData = useCallback(async () => {
    try {
      setLoading(true)

      const [planResponse, executionResponse] = await Promise.all([
        supabase.rpc('get_my_active_home_gym_plan'),
        supabase.rpc('get_my_home_gym_execution_state'),
      ])

      if (planResponse.error) throw planResponse.error
      if (executionResponse.error) throw executionResponse.error

      const next = normalizePlanEnvelope(planResponse.data)
      setPlanData(next)
      setExecutionState(normalizeExecutionState(executionResponse.data))

      if (next.plan?.days.length) {
        setExpandedDayIds((current) =>
          current.length > 0 ? current : [next.plan!.days[0].id]
        )
      }
    } catch (error: any) {
      Alert.alert(
        'No se pudo cargar el plan',
        error.message ?? 'Intenta nuevamente.'
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadScreenData()
    }, [loadScreenData])
  )

  const profileSummary = useMemo(() => {
    const profile = planData.currentProfile

    if (!profile) return null

    return `${goalLabel(profile.goal)} · ${levelLabel(
      profile.fitness_level
    )} · ${profile.days_per_week} día${
      profile.days_per_week === 1 ? '' : 's'
    } · ${profile.session_minutes} min`
  }, [planData.currentProfile])

  const dayProgressById = useMemo(
    () =>
      new Map(
        executionState.days.map((day) => [day.plan_day_id, day])
      ),
    [executionState.days]
  )

  const weeklyProgressPercent =
    executionState.totalDays > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (executionState.completedDaysThisWeek /
              executionState.totalDays) *
              100
          )
        )
      : 0

  const weeklyProgressWidth = `${weeklyProgressPercent}%` as `${number}%`

  function toggleDay(dayId: string) {
    setExpandedDayIds((current) =>
      current.includes(dayId)
        ? current.filter((id) => id !== dayId)
        : [...current, dayId]
    )
  }

  function openWorkout(sessionId: string) {
    router.push({
      pathname: '/entrenamiento/[id]',
      params: { id: sessionId },
    })
  }

  function offerContinueActiveWorkout(active: ActiveWorkoutSummary) {
    Alert.alert(
      'Entrenamiento en curso',
      `Ya tienes activo “${active.routine_title_snapshot}”. PlazaFit conserva una sola sesión en curso para no mezclar tiempos ni progreso.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar entrenamiento',
          onPress: () => openWorkout(active.id),
        },
      ]
    )
  }

  async function startDayWorkout(day: HomePlanDay) {
    if (startingDayId) return

    if (!planData.matchesCurrentProfile) {
      Alert.alert(
        'Plan desactualizado',
        'Regenera el plan con tus preferencias actuales antes de comenzar una sesión.'
      )
      return
    }

    const active = executionState.activeWorkout

    if (active) {
      if (
        active.workout_source === 'home_gym' &&
        active.home_plan_day_id === day.id
      ) {
        openWorkout(active.id)
        return
      }

      offerContinueActiveWorkout(active)
      return
    }

    try {
      setStartingDayId(day.id)

      const { data, error } = await supabase.rpc(
        'start_home_workout_session',
        { p_plan_day_id: day.id }
      )

      if (error) throw error

      const result = normalizeStartResult(data)

      if (result.status === 'existing' && !result.same_home_day) {
        offerContinueActiveWorkout({
          id: result.session_id,
          workout_source: result.workout_source,
          home_plan_id: result.home_plan_id,
          home_plan_day_id: result.home_plan_day_id,
          routine_id: null,
          routine_title_snapshot: result.routine_title_snapshot,
          plaza_name_snapshot: result.plaza_name_snapshot,
          started_at: '',
        })
        return
      }

      openWorkout(result.session_id)
    } catch (error: any) {
      let message = error.message ?? 'No se pudo iniciar la sesión.'

      if (message.includes('HOME_GYM_PLAN_STALE')) {
        message =
          'Tus preferencias cambiaron. Regenera el plan antes de entrenar.'
      }

      if (message.includes('HOME_GYM_ACTIVE_PLAN_REQUIRED')) {
        message =
          'Este plan ya no está activo. Vuelve a Casa y abre la versión vigente.'
      }

      if (message.includes('HOME_GYM_PLAN_DAY_EMPTY')) {
        message = 'Esta sesión no contiene ejercicios.'
      }

      if (message.includes('HOME_GYM_PLAN_DAY_NOT_FOUND')) {
        message =
          'No encontramos este día en el plan vigente. Recarga la pantalla e intenta nuevamente.'
      }

      Alert.alert('No se pudo comenzar', message)
    } finally {
      setStartingDayId(null)
    }
  }

  async function generatePlan() {
    if (generationInFlight.current) return
    generationInFlight.current = true
    try {
      setGenerating(true)

      const { data, error } = await supabase.rpc(
        'generate_my_home_gym_plan'
      )

      if (error) throw error

      const next = normalizePlanEnvelope(data)
      setPlanData(next)
      setExpandedDayIds(next.plan?.days[0] ? [next.plan.days[0].id] : [])

      const executionResponse = await supabase.rpc(
        'get_my_home_gym_execution_state'
      )

      if (!executionResponse.error) {
        setExecutionState(normalizeExecutionState(executionResponse.data))
      }

      Alert.alert(
        planData.hasActivePlan ? 'Plan regenerado' : 'Plan creado',
        'PlazaFit preparó tu semana usando solamente ejercicios compatibles con tu perfil.'
      )
    } catch (error: any) {
      let message = error.message ?? 'No se pudo generar el plan.'

      if (message.includes('HOME_GYM_PROFILE_REQUIRED')) {
        message = 'Primero debes completar tu perfil Home Gym.'
      }

      if (message.includes('HOME_GYM_CATALOG_INSUFFICIENT')) {
        message =
          'No hay suficientes ejercicios compatibles. Ajusta tu objetivo o equipamiento e intenta nuevamente.'
      }

      if (
        message.includes(
          'HOME_GYM_ACTIVE_WORKOUT_BLOCKS_REGENERATION'
        )
      ) {
        message =
          'Completa o abandona el entrenamiento activo antes de generar una nueva versión del plan.'
      }

      Alert.alert('No se pudo generar', message)
    } finally {
      generationInFlight.current = false
      setGenerating(false)
    }
  }

  function requestGeneration() {
    if (executionState.activeWorkout) {
      Alert.alert(
        'Finaliza el entrenamiento activo',
        'Antes de regenerar el plan, completa o abandona la sesión que está en curso.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Continuar entrenamiento',
            onPress: () => openWorkout(executionState.activeWorkout!.id),
          },
        ]
      )
      return
    }

    setShowGenerationSheet(true)
  }

  function generationSheet() {
    return (
      <PlanGenerationSheet
        visible={showGenerationSheet}
        hasActivePlan={planData.hasActivePlan}
        onClose={() => setShowGenerationSheet(false)}
        onRules={() => {
          setShowGenerationSheet(false)
          void generatePlan()
        }}
        onAI={() => {
          setShowGenerationSheet(false)
          router.push('/home-gym-ia')
        }}
      />
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
      </SafeAreaView>
    )
  }

  if (!planData.configured || !planData.currentProfile) {
    return (
      <SafeAreaView style={styles.center}>
        <View style={styles.emptyIcon}>
          <Ionicons name="home-outline" size={39} color="#166534" />
        </View>

        <Text style={styles.emptyTitle}>Configura primero Home Gym</Text>
        <Text style={styles.emptyText}>
          Necesitamos conocer tu objetivo, nivel, disponibilidad y equipamiento antes de crear un plan.
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={() => router.replace('/home-gym')}
        >
          <Text style={styles.primaryButtonText}>Ir a configuración</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  if (!planData.hasActivePlan || !planData.plan) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={styles.emptyPlanContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.createHero}>
            <View style={styles.createHeroIcon}>
              <Ionicons name="sparkles-outline" size={35} color="#166534" />
            </View>

            <Text style={styles.createEyebrow}>Tu semana</Text>
            <Text style={styles.createTitle}>Tu plan está a un paso</Text>
            <Text style={styles.createDescription}>
              PlazaFit seleccionará ejercicios compatibles y los distribuirá en una semana según tu tiempo disponible.
            </Text>
          </View>

          <View style={styles.profileCard}>
            <Text style={styles.profileEyebrow}>Perfil utilizado</Text>
            <Text style={styles.profileSummary}>{profileSummary}</Text>

            <View style={styles.profileMetaRow}>
              <View style={styles.profileMetaChip}>
                <Ionicons name="barbell-outline" size={16} color="#166534" />
                <Text style={styles.profileMetaText}>
                  {planData.selectedEquipmentCodes.length > 0
                    ? `${planData.selectedEquipmentCodes.length} equipo${
                        planData.selectedEquipmentCodes.length === 1 ? '' : 's'
                      }`
                    : 'Peso corporal'}
                </Text>
              </View>

              <View style={styles.profileMetaChip}>
                <Ionicons name="shield-checkmark-outline" size={16} color="#166534" />
                <Text style={styles.profileMetaText}>Catálogo aprobado</Text>
              </View>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={23} color="#166534" />
            <Text style={styles.infoText}>
              Elige Reglas PlazaFit o IA. Con IA podrás revisar la propuesta antes de usarla.
            </Text>
          </View>

          <Pressable
            style={[styles.generateButton, generating && styles.buttonDisabled]}
            onPress={requestGeneration}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="sparkles-outline" size={21} color="#ffffff" />
                <Text style={styles.generateButtonText}>Crear mi plan</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={styles.secondaryAction}
            onPress={() => router.push('/ejercicios-casa')}
          >
            <Ionicons name="library-outline" size={19} color="#166534" />
            <Text style={styles.secondaryActionText}>Revisar ejercicios compatibles</Text>
          </Pressable>
        </ScrollView>
        {generationSheet()}
      </SafeAreaView>
    )
  }

  const plan = planData.plan

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.planHero}>
          <View style={styles.planHeroTop}>
            <View style={styles.planHeroIcon}>
              <Ionicons name="calendar-outline" size={29} color="#166534" />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.planHeroEyebrow}>Plan semanal activo</Text>
              <Text style={styles.planHeroTitle}>{plan.name}</Text>
            </View>

            <View style={styles.versionBadge}>
              <Text style={styles.versionText}>v{plan.version}</Text>
            </View>
          </View>

          <Text style={styles.planHeroDescription}>
            {goalLabel(plan.goal_snapshot)} · {levelLabel(plan.fitness_level_snapshot)}
          </Text>

          <View style={styles.originChip}>
            <Ionicons name={plan.generation_source === 'ai' ? 'sparkles-outline' : 'git-branch-outline'} size={14} color="#dcfce7" />
            <Text style={styles.originText}>{planOriginLabel(plan.generation_source)}</Text>
          </View>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{plan.total_days}</Text>
              <Text style={styles.heroStatLabel}>días</Text>
            </View>

            <View style={styles.heroStatDivider} />

            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{plan.total_steps}</Text>
              <Text style={styles.heroStatLabel}>pasos</Text>
            </View>

            <View style={styles.heroStatDivider} />

            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{plan.total_estimated_minutes}</Text>
              <Text style={styles.heroStatLabel}>min/semana</Text>
            </View>
          </View>
        </View>

        {!planData.matchesCurrentProfile ? (
          <View style={styles.staleCard}>
            <Ionicons name="alert-circle-outline" size={24} color="#92400e" />

            <View style={{ flex: 1 }}>
              <Text style={styles.staleTitle}>Tus preferencias cambiaron</Text>
              <Text style={styles.staleText}>
                Actualizaste {planData.staleReasons.map(staleReasonLabel).join(', ')}. Crea un plan actualizado antes de comenzar otra sesión.
              </Text>
            </View>
          </View>
        ) : null}

        {executionState.activeWorkout ? (
          <Pressable
            style={styles.activeWorkoutCard}
            onPress={() => openWorkout(executionState.activeWorkout!.id)}
          >
            <View style={styles.activeWorkoutIcon}>
              <Ionicons name="play" size={21} color="#ffffff" />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.activeWorkoutEyebrow}>
                Entrenamiento en curso
              </Text>
              <Text style={styles.activeWorkoutTitle} numberOfLines={1}>
                {executionState.activeWorkout.routine_title_snapshot}
              </Text>
              <Text style={styles.activeWorkoutText}>
                Toca para continuar desde el paso en que quedaste.
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={22} color="#ffffff" />
          </Pressable>
        ) : null}

        <View style={styles.weeklyExecutionCard}>
          <View style={styles.weeklyExecutionHeader}>
            <View>
              <Text style={styles.weeklyExecutionEyebrow}>
                Progreso de esta semana
              </Text>
              <Text style={styles.weeklyExecutionTitle}>
                {executionState.completedDaysThisWeek} de{' '}
                {executionState.totalDays || plan.total_days} días completados
              </Text>
            </View>

            <Text style={styles.weeklyExecutionPercent}>
              {Math.round(weeklyProgressPercent)}%
            </Text>
          </View>

          <View style={styles.weeklyExecutionTrack}>
            <View
              style={[
                styles.weeklyExecutionFill,
                { width: weeklyProgressWidth },
              ]}
            />
          </View>

          <Text style={styles.weeklyExecutionHelp}>
            Completa una sesión válida de cada día para avanzar esta semana.
          </Text>
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionEyebrow}>Tu semana</Text>
            <Text style={styles.sectionTitle}>Sesiones programadas</Text>
          </View>

          <Text style={styles.sessionTargetText}>
            Disponibilidad: {plan.session_minutes_snapshot} min
          </Text>
        </View>

        {plan.days.map((day) => {
          const expanded = expandedDayIds.includes(day.id)
          const dayProgress = dayProgressById.get(day.id)
          const activeForDay =
            executionState.activeWorkout?.workout_source === 'home_gym' &&
            executionState.activeWorkout.home_plan_day_id === day.id
          const starting = startingDayId === day.id

          return (
            <View key={day.id} style={styles.dayCard}>
              <Pressable style={styles.dayHeader} onPress={() => toggleDay(day.id)}>
                <View style={styles.dayNumber}>
                  <Text style={styles.dayNumberText}>{day.day_number}</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.dayEyebrow}>Día {day.day_number}</Text>
                  <Text style={styles.dayTitle}>{day.title}</Text>
                  <Text style={styles.dayMeta}>
                    {focusLabel(day.focus)} · Aprox. {day.estimated_minutes} min · {day.steps.length} pasos
                  </Text>

                  {activeForDay ? (
                    <View style={styles.activeDayBadge}>
                      <Ionicons name="play-circle" size={14} color="#1d4ed8" />
                      <Text style={styles.activeDayText}>En curso</Text>
                    </View>
                  ) : dayProgress?.completed_this_week ? (
                    <View style={styles.completedDayBadge}>
                      <Ionicons
                        name="checkmark-circle"
                        size={14}
                        color="#166534"
                      />
                      <Text style={styles.completedDayText}>
                        Completada esta semana
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={22}
                  color="#16a34a"
                />
              </Pressable>

              {expanded ? (
                <View style={styles.stepsContainer}>
                  {day.steps.map((step) => {
                    const difficulty = difficultyLabel(step.difficulty)

                    return (
                      <View key={step.id} style={styles.stepRow}>
                        <View style={styles.stepIcon}>
                          <Ionicons
                            name={iconName(step.icon_name)}
                            size={21}
                            color="#166534"
                          />
                        </View>

                        <View style={{ flex: 1 }}>
                          <View style={styles.stepTitleRow}>
                            <Text style={styles.stepOrder}>{step.step_order}.</Text>
                            <Text style={styles.stepTitle}>{step.exercise_name}</Text>
                          </View>

                          <Text style={styles.stepTarget}>{formatTarget(step)}</Text>

                          {difficulty ? (
                            <Text style={styles.stepMeta}>
                              {difficulty}
                              {step.target_rest_seconds > 0
                                ? ` · descanso ${step.target_rest_seconds} s`
                                : ''}
                            </Text>
                          ) : step.target_rest_seconds > 0 ? (
                            <Text style={styles.stepMeta}>
                              Descanso {step.target_rest_seconds} s
                            </Text>
                          ) : null}

                          {step.equipment.length > 0 ? (
                            <View style={styles.stepEquipmentRow}>
                              {step.equipment.map((equipment) => (
                                <View key={equipment.code} style={styles.stepEquipmentChip}>
                                  <Ionicons
                                    name={iconName(equipment.icon_name)}
                                    size={13}
                                    color="#166534"
                                  />
                                  <Text style={styles.stepEquipmentText}>
                                    {equipment.name}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <View style={styles.bodyweightChip}>
                              <Ionicons name="body-outline" size={13} color="#166534" />
                              <Text style={styles.stepEquipmentText}>Peso corporal</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    )
                  })}

                  <Pressable
                    style={[
                      styles.dayWorkoutButton,
                      activeForDay && styles.dayWorkoutButtonActive,
                      (!planData.matchesCurrentProfile || starting) &&
                        styles.dayWorkoutButtonDisabled,
                    ]}
                    onPress={() => void startDayWorkout(day)}
                    disabled={starting}
                  >
                    {starting ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons
                          name={
                            activeForDay
                              ? 'play-circle-outline'
                              : dayProgress?.completed_this_week
                                ? 'refresh-outline'
                                : 'play-outline'
                          }
                          size={20}
                          color="#ffffff"
                        />
                        <Text style={styles.dayWorkoutButtonText}>
                          {!planData.matchesCurrentProfile
                            ? 'Regenera el plan para entrenar'
                            : activeForDay
                              ? 'Continuar sesión'
                              : dayProgress?.completed_this_week
                                ? 'Repetir sesión'
                                : 'Comenzar sesión'}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              ) : null}
            </View>
          )
        })}

        {planData.matchesCurrentProfile ? <Pressable
          style={[styles.secondaryAction, (generating || !!executionState.activeWorkout) && styles.buttonDisabled]}
          disabled={generating || !!executionState.activeWorkout}
          onPress={() => router.push({ pathname: '/home-gym-ia', params: { mode: 'adjust', planId: plan.id } })}
          accessibilityRole="button"
        >
          <Ionicons name="sparkles-outline" size={19} color="#166534" />
          <Text style={styles.secondaryActionText}>Ajustar este plan con IA</Text>
        </Pressable> : null}

        <Pressable
          style={[styles.generateButton, generating && styles.buttonDisabled]}
          onPress={requestGeneration}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Ionicons name="refresh-outline" size={21} color="#ffffff" />
              <Text style={styles.generateButtonText}>
                {planData.matchesCurrentProfile
                  ? 'Crear nuevo plan'
                  : 'Crear plan actualizado'}
              </Text>
            </>
          )}
        </Pressable>

        <Pressable
          style={styles.secondaryAction}
          onPress={() => router.push('/ejercicios-casa')}
        >
          <Ionicons name="library-outline" size={19} color="#166534" />
          <Text style={styles.secondaryActionText}>Ver ejercicios compatibles</Text>
        </Pressable>
      </ScrollView>
      {generationSheet()}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  originChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' },
  originText: { color: '#dcfce7', fontSize: 12, fontWeight: '700' },
  screen: {
    flex: 1,
    backgroundColor: '#f0fdf4',
  },
  center: {
    flex: 1,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 26,
  },
  container: {
    padding: 16,
    paddingBottom: 34,
    gap: 14,
  },
  emptyPlanContainer: {
    flexGrow: 1,
    padding: 18,
    paddingBottom: 34,
    justifyContent: 'center',
    gap: 14,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: '#111827',
    fontSize: 23,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 17,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 7,
  },
  primaryButton: {
    minHeight: 50,
    backgroundColor: '#16a34a',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 18,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  createHero: {
    backgroundColor: '#166534',
    borderRadius: 23,
    padding: 23,
    alignItems: 'center',
  },
  createHeroIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createEyebrow: {
    color: '#86efac',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: 17,
  },
  createTitle: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 4,
  },
  createDescription: {
    color: '#dcfce7',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 9,
  },
  profileCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dcfce7',
    borderRadius: 18,
    padding: 17,
  },
  profileEyebrow: {
    color: '#16a34a',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  profileSummary: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 23,
    marginTop: 5,
  },
  profileMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  profileMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  profileMetaText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 16,
    padding: 15,
  },
  infoText: {
    flex: 1,
    color: '#166534',
    fontSize: 13,
    lineHeight: 19,
  },
  generateButton: {
    minHeight: 53,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: '#16a34a',
    borderRadius: 15,
  },
  generateButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryAction: {
    minHeight: 49,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 15,
  },
  secondaryActionText: {
    color: '#166534',
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  planHero: {
    backgroundColor: '#166534',
    borderRadius: 22,
    padding: 18,
  },
  planHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  planHeroIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planHeroEyebrow: {
    color: '#86efac',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  planHeroTitle: {
    color: '#ffffff',
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
    marginTop: 2,
  },
  versionBadge: {
    backgroundColor: 'rgba(255,255,255,0.17)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  versionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  planHeroDescription: {
    color: '#dcfce7',
    fontSize: 13,
    marginTop: 13,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatValue: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },
  heroStatLabel: {
    color: '#bbf7d0',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  heroStatDivider: {
    width: 1,
    height: 34,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  staleCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 16,
    padding: 15,
  },
  staleTitle: {
    color: '#92400e',
    fontSize: 15,
    fontWeight: '900',
  },
  staleText: {
    color: '#92400e',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 3,
  },
  sectionEyebrow: {
    color: '#16a34a',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  sessionTargetText: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '700',
  },
  dayCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dcfce7',
    borderRadius: 18,
    overflow: 'hidden',
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 15,
  },
  dayNumber: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumberText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  dayEyebrow: {
    color: '#16a34a',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  dayTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  dayMeta: {
    color: '#6b7280',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  stepsContainer: {
    borderTopWidth: 1,
    borderTopColor: '#ecfdf5',
    paddingHorizontal: 15,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: '#ecfdf5',
  },
  stepIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
  },
  stepOrder: {
    color: '#16a34a',
    fontSize: 14,
    fontWeight: '900',
  },
  stepTitle: {
    flex: 1,
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },
  stepTarget: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 5,
  },
  stepMeta: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 4,
  },
  stepEquipmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  stepEquipmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  bodyweightChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 8,
  },
  stepEquipmentText: {
    color: '#166534',
    fontSize: 10,
    fontWeight: '700',
  },
  activeWorkoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#166534',
    borderRadius: 18,
    padding: 16,
  },
  activeWorkoutIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeWorkoutEyebrow: {
    color: '#86efac',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  activeWorkoutTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  activeWorkoutText: {
    color: '#dcfce7',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  weeklyExecutionCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dcfce7',
    borderRadius: 18,
    padding: 16,
  },
  weeklyExecutionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  weeklyExecutionEyebrow: {
    color: '#16a34a',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  weeklyExecutionTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 3,
  },
  weeklyExecutionPercent: {
    color: '#16a34a',
    fontSize: 16,
    fontWeight: '900',
  },
  weeklyExecutionTrack: {
    height: 9,
    borderRadius: 999,
    backgroundColor: '#dcfce7',
    overflow: 'hidden',
    marginTop: 13,
  },
  weeklyExecutionFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#16a34a',
  },
  weeklyExecutionHelp: {
    color: '#6b7280',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 9,
  },
  completedDayBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 7,
  },
  completedDayText: {
    color: '#166534',
    fontSize: 10,
    fontWeight: '800',
  },
  activeDayBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dbeafe',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 7,
  },
  activeDayText: {
    color: '#1d4ed8',
    fontSize: 10,
    fontWeight: '800',
  },
  dayWorkoutButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    borderRadius: 13,
    marginVertical: 14,
  },
  dayWorkoutButtonActive: {
    backgroundColor: '#166534',
  },
  dayWorkoutButtonDisabled: {
    opacity: 0.58,
  },
  dayWorkoutButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
})
