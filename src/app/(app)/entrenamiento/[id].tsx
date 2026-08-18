import Ionicons from '@expo/vector-icons/Ionicons'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import type { Database } from '../../../types/database.types'

type WorkoutSession = Pick<
  Database['public']['Tables']['workout_sessions']['Row'],
  | 'id'
  | 'routine_id'
  | 'plaza_id'
  | 'routine_title_snapshot'
  | 'plaza_name_snapshot'
  | 'status'
  | 'current_step_order'
  | 'started_at'
  | 'completed_at'
  | 'abandoned_at'
>

type WorkoutStep =
  Database['public']['Tables']['workout_session_steps']['Row']

function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatLongDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  if (minutes === 0) return `${seconds} s`
  if (seconds === 0) return `${minutes} min`

  return `${minutes} min ${seconds} s`
}

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()

  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [steps, setSteps] = useState<WorkoutStep[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [activating, setActivating] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(Date.now())

  const fetchWorkout = useCallback(async () => {
    if (!id) return

    try {
      setLoadError(null)

      const [sessionRes, stepsRes] = await Promise.all([
        supabase
          .from('workout_sessions')
          .select(
            `
            id,
            routine_id,
            plaza_id,
            routine_title_snapshot,
            plaza_name_snapshot,
            status,
            current_step_order,
            started_at,
            completed_at,
            abandoned_at
          `
          )
          .eq('id', id)
          .single(),

        supabase
          .from('workout_session_steps')
          .select('*')
          .eq('session_id', id)
          .order('step_order', { ascending: true }),
      ])

      if (sessionRes.error) throw sessionRes.error
      if (stepsRes.error) throw stepsRes.error

      setSession(sessionRes.data as WorkoutSession)
      setSteps((stepsRes.data ?? []) as WorkoutStep[])
    } catch (error: any) {
      setLoadError(
        error.message ?? 'No se pudo cargar el entrenamiento.'
      )
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void fetchWorkout()
  }, [fetchWorkout])

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const activeStep =
    steps.find((step) => step.status === 'active') ?? null

  const currentPendingStep =
    session
      ? steps.find(
          (step) =>
            step.step_order === session.current_step_order &&
            step.status === 'pending'
        ) ?? null
      : null

  const previousStep = useMemo(() => {
    if (!currentPendingStep) return null

    return (
      [...steps]
        .filter(
          (step) =>
            step.step_order < currentPendingStep.step_order &&
            (step.status === 'completed' || step.status === 'skipped')
        )
        .sort((a, b) => b.step_order - a.step_order)[0] ?? null
    )
  }, [currentPendingStep, steps])

  const processedSteps = steps.filter(
    (step) => step.status === 'completed' || step.status === 'skipped'
  ).length

  const completedSteps = steps.filter(
    (step) => step.status === 'completed'
  ).length

  const skippedSteps = steps.filter(
    (step) => step.status === 'skipped'
  ).length

  const progressPercent =
    steps.length > 0 ? (processedSteps / steps.length) * 100 : 0

  const activeElapsedSeconds =
    activeStep?.started_at
      ? Math.max(
          0,
          Math.floor(
            (nowMs - new Date(activeStep.started_at).getTime()) / 1000
          )
        )
      : 0

  const activeRemainingSeconds =
    activeStep?.target_duration_seconds != null
      ? Math.max(
          activeStep.target_duration_seconds - activeElapsedSeconds,
          0
        )
      : null

  const restTotalSeconds =
    previousStep?.status === 'completed'
      ? previousStep.target_rest_seconds ?? 0
      : 0

  const restAnchor =
    previousStep?.completed_at ?? previousStep?.skipped_at ?? null

  const restElapsedSeconds = restAnchor
    ? Math.max(
        0,
        Math.floor((nowMs - new Date(restAnchor).getTime()) / 1000)
      )
    : 0

  const restRemainingSeconds = Math.max(
    restTotalSeconds - restElapsedSeconds,
    0
  )

  const isBetweenSteps =
    session?.status === 'in_progress' &&
    !activeStep &&
    currentPendingStep !== null

  const activateCurrentStep = useCallback(async () => {
    if (!session || activating) return

    try {
      setActivating(true)

      const { error } = await supabase.rpc('activate_workout_step', {
        p_session_id: session.id,
      })

      if (error) throw error

      await fetchWorkout()
    } catch (error: any) {
      Alert.alert(
        'No se pudo continuar',
        error.message ?? 'No se pudo activar el siguiente ejercicio.'
      )
    } finally {
      setActivating(false)
    }
  }, [activating, fetchWorkout, session])

  useEffect(() => {
    if (!isBetweenSteps) return
    if (restRemainingSeconds > 0) return
    if (activating) return

    void activateCurrentStep()
  }, [
    activateCurrentStep,
    activating,
    isBetweenSteps,
    restRemainingSeconds,
  ])

  async function finishActiveStep(
    result: 'completed' | 'skipped'
  ) {
    if (!session || !activeStep || processing) return

    try {
      setProcessing(true)

      const { error } = await supabase.rpc('finish_workout_step', {
        p_session_id: session.id,
        p_result: result,
        p_actual_duration_seconds: activeElapsedSeconds,
      })

      if (error) throw error

      await fetchWorkout()
    } catch (error: any) {
      Alert.alert(
        'No se pudo guardar',
        error.message ?? 'No se pudo actualizar el ejercicio.'
      )
    } finally {
      setProcessing(false)
    }
  }

  function requestAbandonWorkout() {
    if (!session || processing) return

    Alert.alert(
      'Abandonar entrenamiento',
      'El progreso de esta sesión quedará registrado como abandonado.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Abandonar',
          style: 'destructive',
          onPress: () => {
            void confirmAbandonWorkout()
          },
        },
      ]
    )
  }

  async function confirmAbandonWorkout() {
    if (!session) return

    try {
      setProcessing(true)

      const { error } = await supabase.rpc(
        'abandon_workout_session',
        {
          p_session_id: session.id,
        }
      )

      if (error) throw error

      if (session.routine_id) {
        router.replace({
          pathname: '/rutina/[id]',
          params: { id: String(session.routine_id) },
        })
      } else {
        router.replace('/')
      }
    } catch (error: any) {
      Alert.alert(
        'No se pudo abandonar',
        error.message ?? 'No se pudo cerrar el entrenamiento.'
      )
    } finally {
      setProcessing(false)
    }
  }

  function openMachine(machineTypeId: number) {
    if (!session) return

    router.push({
      pathname: '/maquina/[id]',
      params: {
        id: String(machineTypeId),
        ...(session.plaza_id
          ? { plazaId: String(session.plaza_id) }
          : {}),
      },
    })
  }

  function returnToRoutine() {
    if (session?.routine_id) {
      router.replace({
        pathname: '/rutina/[id]',
        params: { id: String(session.routine_id) },
      })
      return
    }

    router.replace('/')
  }

  function renderTargetInformation(step: WorkoutStep) {
    const targets: string[] = []

    if (step.target_sets) {
      targets.push(`${step.target_sets} series`)
    }

    if (step.target_reps) {
      targets.push(`${step.target_reps} repeticiones`)
    }

    if (step.target_duration_seconds) {
      targets.push(
        formatLongDuration(step.target_duration_seconds)
      )
    }

    return targets
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
      </SafeAreaView>
    )
  }

  if (loadError || !session) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color="#dc2626"
        />

        <Text style={styles.errorTitle}>
          No se pudo abrir el entrenamiento
        </Text>

        <Text style={styles.errorText}>
          {loadError ?? 'Sesión no encontrada.'}
        </Text>

        <Pressable
          style={styles.secondaryAction}
          onPress={() => router.back()}
        >
          <Text style={styles.secondaryActionText}>Volver</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  if (session.status === 'completed') {
    const totalSessionSeconds =
      session.completed_at
        ? Math.max(
            0,
            Math.floor(
              (
                new Date(session.completed_at).getTime() -
                new Date(session.started_at).getTime()
              ) / 1000
            )
          )
        : 0

    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.summaryContainer}
        >
          <View style={styles.summaryIcon}>
            <Ionicons
              name="checkmark"
              size={52}
              color="#ffffff"
            />
          </View>

          <Text style={styles.summaryEyebrow}>
            Entrenamiento completado
          </Text>

          <Text style={styles.summaryTitle}>
            {session.routine_title_snapshot}
          </Text>

          <Text style={styles.summarySubtitle}>
            {session.plaza_name_snapshot}
          </Text>

          <View style={styles.summaryStats}>
            <View style={styles.summaryStatCard}>
              <Text style={styles.summaryStatValue}>
                {completedSteps}
              </Text>
              <Text style={styles.summaryStatLabel}>
                Completados
              </Text>
            </View>

            <View style={styles.summaryStatCard}>
              <Text style={styles.summaryStatValue}>
                {skippedSteps}
              </Text>
              <Text style={styles.summaryStatLabel}>
                Saltados
              </Text>
            </View>

            <View style={styles.summaryStatCard}>
              <Text style={styles.summaryStatValue}>
                {Math.max(
                  1,
                  Math.round(totalSessionSeconds / 60)
                )}
              </Text>
              <Text style={styles.summaryStatLabel}>
                Minutos
              </Text>
            </View>
          </View>

          <View style={styles.summaryMessage}>
            <Ionicons
              name="sparkles-outline"
              size={22}
              color="#166534"
            />
            <Text style={styles.summaryMessageText}>
              Esta sesión ya quedó registrada en tu historial.
              Más adelante alimentará tu XP, racha y objetivos
              semanales.
            </Text>
          </View>

          <Pressable
            style={styles.primaryAction}
            onPress={returnToRoutine}
          >
            <Text style={styles.primaryActionText}>
              Volver a la rutina
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (session.status === 'abandoned') {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons
          name="close-circle-outline"
          size={54}
          color="#d97706"
        />

        <Text style={styles.errorTitle}>
          Entrenamiento abandonado
        </Text>

        <Pressable
          style={styles.primaryAction}
          onPress={returnToRoutine}
        >
          <Text style={styles.primaryActionText}>
            Volver a la rutina
          </Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            style={styles.headerButton}
            onPress={() => router.back()}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color="#166534"
            />
          </Pressable>

          <View style={styles.headerTextContainer}>
            <Text style={styles.headerEyebrow}>
              Entrenamiento en curso
            </Text>
            <Text
              style={styles.headerTitle}
              numberOfLines={1}
            >
              {session.routine_title_snapshot}
            </Text>
          </View>
        </View>

        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressText}>
              {processedSteps} de {steps.length} pasos
            </Text>

            <Text style={styles.progressPercentage}>
              {Math.round(progressPercent)}%
            </Text>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${progressPercent}%` },
              ]}
            />
          </View>
        </View>

        {activeStep ? (
          <View style={styles.exerciseCard}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>
                Paso {activeStep.step_order} de {steps.length}
              </Text>
            </View>

            <Text style={styles.exerciseTitle}>
              {activeStep.title_snapshot}
            </Text>

            {activeStep.instruction_snapshot ? (
              <Text style={styles.exerciseInstruction}>
                {activeStep.instruction_snapshot}
              </Text>
            ) : null}

            {renderTargetInformation(activeStep).length > 0 ? (
              <View style={styles.targetRow}>
                {renderTargetInformation(activeStep).map(
                  (target) => (
                    <View
                      key={target}
                      style={styles.targetBadge}
                    >
                      <Text style={styles.targetBadgeText}>
                        {target}
                      </Text>
                    </View>
                  )
                )}
              </View>
            ) : null}

            <View style={styles.timerCard}>
              <Text style={styles.timerLabel}>
                {activeRemainingSeconds !== null
                  ? 'Tiempo restante'
                  : 'Tiempo activo'}
              </Text>

              <Text style={styles.timerValue}>
                {formatClock(
                  activeRemainingSeconds ??
                    activeElapsedSeconds
                )}
              </Text>

              {activeRemainingSeconds === 0 &&
              activeStep.target_duration_seconds ? (
                <Text style={styles.timerDoneText}>
                  Tiempo objetivo cumplido
                </Text>
              ) : null}
            </View>

            {activeStep.machine_type_id ? (
              <Pressable
                style={styles.machineButton}
                onPress={() =>
                  openMachine(activeStep.machine_type_id!)
                }
              >
                <Ionicons
                  name="barbell-outline"
                  size={18}
                  color="#166534"
                />
                <Text style={styles.machineButtonText}>
                  Ver cómo usar la máquina
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              style={[
                styles.completeButton,
                processing && styles.buttonDisabled,
              ]}
              onPress={() =>
                void finishActiveStep('completed')
              }
              disabled={processing}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={21}
                color="#ffffff"
              />
              <Text style={styles.completeButtonText}>
                {processing
                  ? 'Guardando...'
                  : 'Completar paso'}
              </Text>
            </Pressable>

            <Pressable
              style={styles.skipButton}
              onPress={() =>
                void finishActiveStep('skipped')
              }
              disabled={processing}
            >
              <Text style={styles.skipButtonText}>
                Saltar este paso
              </Text>
            </Pressable>
          </View>
        ) : isBetweenSteps && currentPendingStep ? (
          <View style={styles.restCard}>
            <View style={styles.restIcon}>
              <Ionicons
                name="timer-outline"
                size={36}
                color="#166534"
              />
            </View>

            <Text style={styles.restEyebrow}>Descanso</Text>

            <Text style={styles.restTimer}>
              {formatClock(restRemainingSeconds)}
            </Text>

            <Text style={styles.nextStepLabel}>
              Siguiente ejercicio
            </Text>

            <Text style={styles.nextStepTitle}>
              {currentPendingStep.title_snapshot}
            </Text>

            {restRemainingSeconds > 0 ? (
              <Pressable
                style={styles.secondaryAction}
                onPress={() =>
                  void activateCurrentStep()
                }
                disabled={activating}
              >
                <Text style={styles.secondaryActionText}>
                  {activating
                    ? 'Preparando...'
                    : 'Saltar descanso'}
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.preparingText}>
                Preparando siguiente ejercicio...
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.recoveryCard}>
            <Text style={styles.recoveryTitle}>
              Preparando entrenamiento
            </Text>

            <Pressable
              style={styles.primaryAction}
              onPress={() => void activateCurrentStep()}
              disabled={activating}
            >
              <Text style={styles.primaryActionText}>
                Continuar
              </Text>
            </Pressable>
          </View>
        )}

        <Pressable
          style={styles.abandonButton}
          onPress={requestAbandonWorkout}
          disabled={processing}
        >
          <Text style={styles.abandonButtonText}>
            Abandonar entrenamiento
          </Text>
        </Pressable>

        <Text style={styles.resumeHint}>
          Puedes volver atrás y continuar esta sesión más tarde.
        </Text>
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
    padding: 16,
    paddingBottom: 32,
    gap: 14,
  },
  center: {
    flex: 1,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#16a34a',
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#111827',
    marginTop: 2,
  },
  progressCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  progressText: {
    color: '#374151',
    fontWeight: '600',
  },
  progressPercentage: {
    color: '#16a34a',
    fontWeight: '800',
  },
  progressTrack: {
    height: 9,
    borderRadius: 999,
    backgroundColor: '#dcfce7',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#16a34a',
  },
  exerciseCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  stepBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  stepBadgeText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
  },
  exerciseTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
    marginTop: 16,
  },
  exerciseInstruction: {
    fontSize: 16,
    color: '#4b5563',
    lineHeight: 23,
    marginTop: 9,
  },
  targetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  targetBadge: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  targetBadgeText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '700',
  },
  timerCard: {
    backgroundColor: '#111827',
    borderRadius: 18,
    paddingVertical: 22,
    alignItems: 'center',
    marginTop: 20,
  },
  timerLabel: {
    color: '#d1d5db',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  timerValue: {
    color: '#ffffff',
    fontSize: 48,
    fontWeight: '800',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  timerDoneText: {
    color: '#86efac',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  machineButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 13,
    paddingVertical: 13,
    marginTop: 16,
  },
  machineButtonText: {
    color: '#166534',
    fontWeight: '800',
  },
  completeButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 14,
  },
  completeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 13,
    marginTop: 3,
  },
  skipButtonText: {
    color: '#6b7280',
    fontWeight: '700',
  },
  restCard: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  restIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restEyebrow: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: 14,
  },
  restTimer: {
    color: '#14532d',
    fontSize: 52,
    fontWeight: '800',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  nextStepLabel: {
    color: '#4b5563',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 18,
  },
  nextStepTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 5,
  },
  preparingText: {
    color: '#166534',
    fontWeight: '700',
    marginTop: 16,
  },
  recoveryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  recoveryTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 14,
  },
  abandonButton: {
    alignItems: 'center',
    paddingVertical: 13,
  },
  abandonButtonText: {
    color: '#dc2626',
    fontWeight: '800',
  },
  resumeHint: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 12,
  },
  primaryAction: {
    backgroundColor: '#16a34a',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 22,
    alignItems: 'center',
    marginTop: 18,
  },
  primaryActionText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  secondaryAction: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 22,
    alignItems: 'center',
    marginTop: 18,
  },
  secondaryActionText: {
    color: '#166534',
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginTop: 14,
  },
  errorText: {
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
  },
  summaryContainer: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryEyebrow: {
    color: '#16a34a',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: 22,
  },
  summaryTitle: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 6,
  },
  summarySubtitle: {
    color: '#6b7280',
    fontSize: 15,
    marginTop: 5,
  },
  summaryStats: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },
  summaryStatCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dcfce7',
    paddingVertical: 18,
    alignItems: 'center',
  },
  summaryStatValue: {
    color: '#16a34a',
    fontSize: 27,
    fontWeight: '800',
  },
  summaryStatLabel: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 4,
  },
  summaryMessage: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 16,
    padding: 16,
    marginTop: 18,
  },
  summaryMessageText: {
    flex: 1,
    color: '#166534',
    lineHeight: 20,
    fontSize: 14,
  },
})