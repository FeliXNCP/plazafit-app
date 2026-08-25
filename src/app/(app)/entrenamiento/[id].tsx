import Ionicons from '@expo/vector-icons/Ionicons'
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import type { Database } from '../../../types/database.types'

import {
  AchievementUnlockBanner,
  type AchievementUnlockNotice,
} from '../../../components/gamification/AchievementUnlockBanner'


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
  | 'total_steps'
  | 'completed_steps'
  | 'skipped_steps'
  | 'completion_percentage'
  | 'reward_eligible'
  | 'reward_reason'
  | 'workout_duration_seconds'
  | 'xp_awarded'
  | 'active_duration_seconds'
  | 'active_segment_started_at'
>

type WorkoutStep =
  Database['public']['Tables']['workout_session_steps']['Row']

type LoadedWorkout = {
  session: WorkoutSession
  steps: WorkoutStep[]
}

type ActiveClock = {
  stepId: number
  elapsedAtAnchor: number
  anchorMs: number
}

type RestClock = {
  nextStepOrder: number
  remainingAtAnchor: number
  anchorMs: number
}

type FinishWorkoutStepResult = {
  session_status?: string
  transition?: 'rest' | 'summary'
  next_step_order?: number
  rest_seconds?: number
}

type PostWorkoutMissionReward = {
  id: string
  code: string
  title: string
  description: string
  xp_reward: number
  icon_name: string
  completed_at: string
}

type PostWorkoutAchievementReward = {
  id: number
  code: string
  name: string
  description: string
  xp_reward: number
  icon_name: string
  unlocked_at: string
}

type PostWorkoutRewards = {
  session_id: string

  reward_eligible: boolean
  is_replay: boolean

  base_xp: number
  mission_xp: number
  achievement_xp: number
  total_xp_awarded: number
  total_xp: number

  completed_missions:
    PostWorkoutMissionReward[]

  unlocked_achievements:
    PostWorkoutAchievementReward[]

  previous_level: number
  previous_level_name: string

  current_level: number
  current_level_name: string

  level_up: boolean
  evaluated_at: string
}

function normalizePostWorkoutRewards(
  value: unknown
): PostWorkoutRewards {
  const raw =
    (value ?? {}) as Partial<PostWorkoutRewards>

  return {
    session_id:
      String(raw.session_id ?? ''),

    reward_eligible:
      Boolean(raw.reward_eligible),

    is_replay:
      Boolean(raw.is_replay),

    base_xp:
      Number(raw.base_xp ?? 0),

    mission_xp:
      Number(raw.mission_xp ?? 0),

    achievement_xp:
      Number(raw.achievement_xp ?? 0),

    total_xp_awarded:
      Number(
        raw.total_xp_awarded ?? 0
      ),

    total_xp:
      Number(raw.total_xp ?? 0),

    completed_missions:
      Array.isArray(
        raw.completed_missions
      )
        ? raw.completed_missions
        : [],

    unlocked_achievements:
      Array.isArray(
        raw.unlocked_achievements
      )
        ? raw.unlocked_achievements
        : [],

    previous_level:
      Number(raw.previous_level ?? 1),

    previous_level_name:
      String(
        raw.previous_level_name ??
          'Inicio'
      ),

    current_level:
      Number(raw.current_level ?? 1),

    current_level_name:
      String(
        raw.current_level_name ??
          'Inicio'
      ),

    level_up:
      Boolean(raw.level_up),

    evaluated_at:
      String(raw.evaluated_at ?? ''),
  }
}

function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatLongDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  if (minutes === 0) return `${seconds} s`
  if (seconds === 0) return `${minutes} min`

  return `${minutes} min ${seconds} s`
}

function getServerRemainingSeconds(error: unknown): number | null {
  const details = (error as { details?: unknown } | null)?.details

  if (!details) return null

  try {
    const parsed =
      typeof details === 'string'
        ? JSON.parse(details)
        : details

    const remaining = Number(
      (parsed as { remaining_seconds?: unknown })?.remaining_seconds
    )

    return Number.isFinite(remaining) ? remaining : null
  } catch {
    return null
  }
}


//COMPONENTE
export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()

  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [steps, setSteps] = useState<WorkoutStep[]>([])

  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [submittedElapsedSeconds, setSubmittedElapsedSeconds] =
    useState<number | null>(null)
  const [activating, setActivating] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [nowMs, setNowMs] = useState(Date.now())
  const [screenIsFocused, setScreenIsFocused] = useState(false)
  const [appIsActive, setAppIsActive] = useState(
    (AppState.currentState ?? 'active') === 'active'
  )
  const [clockReady, setClockReady] = useState(false)

  const [activeClock, setActiveClock] = useState<ActiveClock | null>(null)
  const [restClock, setRestClock] = useState<RestClock | null>(null)

  const screenFocusedRef = useRef(false)
  const appStateRef = useRef<AppStateStatus>(
    AppState.currentState ?? 'active'
  )
  const lifecycleGenerationRef = useRef(0)
  const lifecycleQueueRef = useRef<Promise<void>>(Promise.resolve())


  const [
    achievementQueue,
    setAchievementQueue,
  ] = useState<AchievementUnlockNotice[]>([])

  const visibleAchievement =
    achievementQueue[0] ?? null

  const dismissVisibleAchievement =
    useCallback(() => {
      setAchievementQueue(
        (current) =>
          current.slice(1)
      )
    }, [])




  const [
    postWorkoutRewards,
    setPostWorkoutRewards,
  ] = useState<PostWorkoutRewards | null>(
    null
  )

  const [
    loadingPostRewards,
    setLoadingPostRewards,
  ] = useState(false)

  const [
    postRewardsError,
    setPostRewardsError,
  ] = useState<string | null>(null)

  const postRewardSessionRef =
    useRef<string | null>(null)

  const enqueueLifecycleTask = useCallback(
    (task: () => Promise<void>) => {
      const next = lifecycleQueueRef.current.then(
        () => task(),
        () => task()
      )

      lifecycleQueueRef.current = next.catch((error) => {
        console.warn('Error sincronizando el entrenamiento:', error)
      })

      return next
    },
    []
  )




  const loadPostWorkoutRewards =
    useCallback(
      async (
        sessionId: string,
        force = false
      ) => {
        if (
          !force &&
          postRewardSessionRef.current ===
          sessionId
        ) {
          return
        }

        postRewardSessionRef.current =
          sessionId

        try {
          setLoadingPostRewards(true)
          setPostRewardsError(null)

          const { data, error } =
            await supabase.rpc(
              'evaluate_post_workout_rewards',
              {
                p_session_id: sessionId,
              }
            )

          if (error) throw error

          const result =
            normalizePostWorkoutRewards(
              data
            )

          setPostWorkoutRewards(result)

          /*
           * El banner solo aparece durante
           * la primera evaluación.
           */
          if (
            !result.is_replay &&
            result
              .unlocked_achievements
              .length > 0
          ) {
            setAchievementQueue(
              result
                .unlocked_achievements
                .map((achievement) => ({
                  id: achievement.id,

                  name: achievement.name,

                  description:
                    achievement.description,

                  xpReward:
                    achievement.xp_reward,

                  iconName:
                    achievement.icon_name as
                    AchievementUnlockNotice[
                    'iconName'
                    ],
                }))
            )
          }
        } catch (error: any) {
          setPostRewardsError(
            error.message ??
            'No se pudieron calcular las recompensas.'
          )
        } finally {
          setLoadingPostRewards(false)
        }
      },
      []
    )







  const fetchWorkout = useCallback(
    async (): Promise<LoadedWorkout | null> => {
      if (!id) return null

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
              abandoned_at,
              total_steps,
              completed_steps,
              skipped_steps,
              completion_percentage,
              reward_eligible,
              reward_reason,
              workout_duration_seconds,
              xp_awarded,
              active_duration_seconds,
              active_segment_started_at
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

        const nextSession = sessionRes.data as WorkoutSession
        const nextSteps = (stepsRes.data ?? []) as WorkoutStep[]

        setSession(nextSession)
        setSteps(nextSteps)

        return {
          session: nextSession,
          steps: nextSteps,
        }
      } catch (error: any) {
        setLoadError(
          error.message ?? 'No se pudo cargar el entrenamiento.'
        )

        return null
      } finally {
        setLoading(false)
      }
    },
    [id]
  )

  const freezeLocalClocks = useCallback(() => {
    const now = Date.now()

    setActiveClock((current) => {
      if (!current) return null

      const elapsedSinceAnchor = Math.max(
        0,
        Math.floor((now - current.anchorMs) / 1000)
      )

      return {
        ...current,
        elapsedAtAnchor:
          current.elapsedAtAnchor + elapsedSinceAnchor,
        anchorMs: now,
      }
    })

    setRestClock((current) => {
      if (!current) return null

      const elapsedSinceAnchor = Math.max(
        0,
        Math.floor((now - current.anchorMs) / 1000)
      )

      return {
        ...current,
        remainingAtAnchor: Math.max(
          current.remainingAtAnchor - elapsedSinceAnchor,
          0
        ),
        anchorMs: now,
      }
    })

    setNowMs(now)
  }, [])

  const pauseOnServer = useCallback(async () => {
    if (!id) return

    const { error } = await supabase.rpc('pause_workout_session', {
      p_session_id: id,
    })

    if (error) {
      console.warn('No se pudo pausar la sesión:', error.message)
    }
  }, [id])

  const resumeOnServer = useCallback(async () => {
    if (!id) return false

    const { error } = await supabase.rpc('resume_workout_session', {
      p_session_id: id,
    })

    if (error) {
      console.warn('No se pudo reanudar la sesión:', error.message)
      return false
    }

    return true
  }, [id])

  const syncActiveStepOnServer = useCallback(async () => {
    if (!id) return false

    const { error } = await supabase.rpc(
      'sync_active_workout_step_clock',
      {
        p_session_id: id,
      }
    )

    if (error) {
      console.warn(
        'No se pudo sincronizar el paso activo:',
        error.message
      )
      return false
    }

    return true
  }, [id])

  const initializeLocalClocks = useCallback(
    (loaded: LoadedWorkout) => {
      const now = Date.now()
      const activeStep =
        loaded.steps.find((step) => step.status === 'active') ?? null

      if (activeStep) {
        setActiveClock({
          stepId: activeStep.id,
          elapsedAtAnchor: activeStep.active_duration_seconds ?? 0,
          anchorMs: now,
        })
        setRestClock(null)
        setNowMs(now)
        return
      }

      setActiveClock(null)

      const pendingStep =
        loaded.steps.find(
          (step) =>
            step.step_order === loaded.session.current_step_order &&
            step.status === 'pending'
        ) ?? null

      if (!pendingStep) {
        setRestClock(null)
        setNowMs(now)
        return
      }

      const previousStep =
        [...loaded.steps]
          .filter(
            (step) =>
              step.step_order < pendingStep.step_order &&
              (step.status === 'completed' || step.status === 'skipped')
          )
          .sort((a, b) => b.step_order - a.step_order)[0] ?? null

      const fullRestSeconds =
        previousStep?.status === 'completed'
          ? previousStep.target_rest_seconds ?? 0
          : 0

      setRestClock((current) => {
        if (current?.nextStepOrder === pendingStep.step_order) {
          return {
            ...current,
            anchorMs: now,
          }
        }

        return {
          nextStepOrder: pendingStep.step_order,
          remainingAtAnchor: fullRestSeconds,
          anchorMs: now,
        }
      })

      setNowMs(now)
    },
    []
  )

  const synchronizeRunningState = useCallback(
    async (generation: number) => {
      setClockReady(false)

      await enqueueLifecycleTask(async () => {
        const isStillCurrent = () =>
          generation === lifecycleGenerationRef.current &&
          screenFocusedRef.current &&
          appStateRef.current === 'active'

        const loaded = await fetchWorkout()

        if (!loaded) return

        if (loaded.session.status !== 'in_progress') {
          if (isStillCurrent()) {
            setActiveClock(null)
            setRestClock(null)
            setClockReady(false)
          }
          return
        }

        if (!isStillCurrent()) return

        const resumed = await resumeOnServer()
        if (!resumed || !isStillCurrent()) return

        const hasActiveStep = loaded.steps.some(
          (step) => step.status === 'active'
        )

        if (hasActiveStep) {
          const synchronized = await syncActiveStepOnServer()
          if (!synchronized || !isStillCurrent()) return
        }

        initializeLocalClocks(loaded)

        if (isStillCurrent()) {
          setClockReady(true)
        }
      })
    },
    [
      enqueueLifecycleTask,
      fetchWorkout,
      initializeLocalClocks,
      resumeOnServer,
      syncActiveStepOnServer,
    ]
  )

  const requestPause = useCallback(() => {
    lifecycleGenerationRef.current += 1
    setClockReady(false)
    freezeLocalClocks()

    return enqueueLifecycleTask(async () => {
      await pauseOnServer()
    })
  }, [enqueueLifecycleTask, freezeLocalClocks, pauseOnServer])

  const requestResume = useCallback(() => {
    const generation = lifecycleGenerationRef.current + 1
    lifecycleGenerationRef.current = generation
    setClockReady(false)

    return synchronizeRunningState(generation)
  }, [synchronizeRunningState])

  useFocusEffect(
    useCallback(() => {
      screenFocusedRef.current = true
      setScreenIsFocused(true)

      const currentAppState = AppState.currentState ?? 'active'
      appStateRef.current = currentAppState
      setAppIsActive(currentAppState === 'active')

      if (currentAppState === 'active') {
        void requestResume()
      }

      return () => {
        screenFocusedRef.current = false
        setScreenIsFocused(false)
        void requestPause()
      }
    }, [requestPause, requestResume])
  )

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState) => {
        const previousState = appStateRef.current
        appStateRef.current = nextState

        const nextIsActive = nextState === 'active'
        setAppIsActive(nextIsActive)

        if (!screenFocusedRef.current) return

        if (previousState === 'active' && !nextIsActive) {
          void requestPause()
          return
        }

        if (previousState !== 'active' && nextIsActive) {
          void requestResume()
        }
      }
    )

    return () => subscription.remove()
  }, [requestPause, requestResume])






  useEffect(() => {
    if (
      session?.status !== 'completed'
    ) {
      return
    }

    if (
      postWorkoutRewards ||
      loadingPostRewards
    ) {
      return
    }

    void loadPostWorkoutRewards(
      session.id
    )
  }, [
    loadPostWorkoutRewards,
    loadingPostRewards,
    postWorkoutRewards,
    session?.id,
    session?.status,
  ])



  const clockIsRunning =
    screenIsFocused && appIsActive && clockReady

  useEffect(() => {
    if (!clockIsRunning) return

    setNowMs(Date.now())

    const interval = setInterval(() => {
      setNowMs(Date.now())
    }, 200)

    return () => clearInterval(interval)
  }, [clockIsRunning])

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

  const localActiveSegmentSeconds =
    activeStep &&
    activeClock?.stepId === activeStep.id &&
    clockIsRunning
      ? Math.max(
          0,
          Math.floor((nowMs - activeClock.anchorMs) / 1000)
        )
      : 0

  const activeElapsedSeconds =
    activeStep && activeClock?.stepId === activeStep.id
      ? activeClock.elapsedAtAnchor + localActiveSegmentSeconds
      : activeStep?.active_duration_seconds ?? 0

  /*
   * Al enviar "Completar" o "Saltar", congelamos el valor
   * visible del reloj hasta que Supabase confirme la transición.
   * Así el paso anterior no vuelve momentáneamente a su duración
   * inicial mientras se consulta el nuevo estado.
   */
  const displayedActiveElapsedSeconds =
    processing && submittedElapsedSeconds !== null
      ? submittedElapsedSeconds
      : activeElapsedSeconds

  const activeRemainingSeconds =
    activeStep?.target_duration_seconds != null
      ? Math.max(
          activeStep.target_duration_seconds -
            displayedActiveElapsedSeconds,
          0
        )
      : null

  const minimumCompletionSeconds =
    activeStep?.minimum_completion_seconds ?? 0

  const completionUnlockRemainingSeconds = activeStep
    ? Math.max(
        minimumCompletionSeconds - activeElapsedSeconds,
        0
      )
    : 0

  const canCompleteActiveStep =
    activeStep !== null &&
    clockIsRunning &&
    (minimumCompletionSeconds === 0 ||
      completionUnlockRemainingSeconds === 0)

  const restElapsedSeconds =
    restClock && clockIsRunning
      ? Math.max(
          0,
          Math.floor((nowMs - restClock.anchorMs) / 1000)
        )
      : 0

  const restRemainingSeconds = restClock
    ? Math.max(
        restClock.remainingAtAnchor - restElapsedSeconds,
        0
      )
    : 0

  const isBetweenSteps =
    session?.status === 'in_progress' &&
    !activeStep &&
    currentPendingStep !== null

  useEffect(() => {
    if (!clockIsRunning) return
    if (!isBetweenSteps || !currentPendingStep) return

    if (restClock?.nextStepOrder === currentPendingStep.step_order) {
      return
    }

    const fullRestSeconds =
      previousStep?.status === 'completed'
        ? previousStep.target_rest_seconds ?? 0
        : 0

    setRestClock({
      nextStepOrder: currentPendingStep.step_order,
      remainingAtAnchor: fullRestSeconds,
      anchorMs: Date.now(),
    })
  }, [
    clockIsRunning,
    currentPendingStep,
    isBetweenSteps,
    previousStep,
    restClock?.nextStepOrder,
  ])

  const activateCurrentStep = useCallback(async () => {
    const currentSession = session

    if (!currentSession || activating) return

    const operationGeneration = lifecycleGenerationRef.current

    try {
      setActivating(true)
      setClockReady(false)

      await enqueueLifecycleTask(async () => {
        const { error } = await supabase.rpc(
          'activate_workout_step',
          {
            p_session_id: currentSession.id,
          }
        )

        if (error) throw error

        const loaded = await fetchWorkout()
        if (!loaded) {
          throw new Error('No se pudo cargar el siguiente paso.')
        }

        const synchronized = await syncActiveStepOnServer()
        if (!synchronized) {
          throw new Error('No se pudo sincronizar el siguiente paso.')
        }

        const canApplyLocally =
          operationGeneration === lifecycleGenerationRef.current &&
          screenFocusedRef.current &&
          appStateRef.current === 'active'

        if (!canApplyLocally) return

        initializeLocalClocks(loaded)
        setClockReady(true)
      })
    } catch (error: any) {
      Alert.alert(
        'No se pudo continuar',
        error.message ?? 'No se pudo activar el siguiente ejercicio.'
      )
    } finally {
      setActivating(false)
    }
  }, [
    activating,
    enqueueLifecycleTask,
    fetchWorkout,
    initializeLocalClocks,
    session,
    syncActiveStepOnServer,
  ])

  useEffect(() => {
    if (!clockIsRunning) return
    if (!isBetweenSteps) return
    if (!restClock) return
    if (restRemainingSeconds > 0) return
    if (activating) return

    void activateCurrentStep()
  }, [
    activateCurrentStep,
    activating,
    clockIsRunning,
    isBetweenSteps,
    restClock,
    restRemainingSeconds,
  ])

  async function finishActiveStep(
    result: 'completed' | 'skipped'
  ) {
    const currentSession = session
    const currentStep = activeStep
    const elapsedSecondsAtSubmit = activeElapsedSeconds

    if (!currentSession || !currentStep || processing) return

    if (result === 'completed' && !canCompleteActiveStep) {
      Alert.alert(
        'Tiempo mínimo pendiente',
        `Podrás completar este ejercicio en ${formatLongDuration(
          completionUnlockRemainingSeconds
        )}. También puedes saltarlo.`
      )
      return
    }

    try {
      setSubmittedElapsedSeconds(elapsedSecondsAtSubmit)
      setProcessing(true)

      const { data, error } = await supabase.rpc(
        'finish_workout_step',
        {
          p_session_id: currentSession.id,
          p_result: result,
          p_actual_duration_seconds: elapsedSecondsAtSubmit,
        }
      )

      if (error) {
        if (
          error.message?.includes('STEP_MINIMUM_TIME_NOT_REACHED')
        ) {
          const serverRemaining = getServerRemainingSeconds(error)

          Alert.alert(
            'Tiempo mínimo pendiente',
            `Aún debes esperar ${Math.max(
              serverRemaining ?? 1,
              1
            )} s antes de completar este paso.`
          )
          return
        }

        throw error
      }

      const resultData = (data ?? {}) as FinishWorkoutStepResult

      const loaded = await fetchWorkout()
      if (!loaded) {
        throw new Error(
          'El paso fue guardado, pero no se pudo actualizar la sesión.'
        )
      }

      setActiveClock(null)

      if (
        resultData.transition === 'rest' &&
        resultData.next_step_order != null
      ) {
        const now = Date.now()

        setRestClock({
          nextStepOrder: resultData.next_step_order,
          remainingAtAnchor: Math.max(
            Number(resultData.rest_seconds ?? 0),
            0
          ),
          anchorMs: now,
        })
        setNowMs(now)
        setClockReady(true)
      } else {
        setRestClock(null)
        setClockReady(false)
      }
    } catch (error: any) {
      Alert.alert(
        'No se pudo guardar',
        error.message ?? 'No se pudo actualizar el ejercicio.'
      )
    } finally {
      setProcessing(false)
      setSubmittedElapsedSeconds(null)
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
    const currentSession = session
    if (!currentSession) return

    try {
      setProcessing(true)
      setClockReady(false)
      freezeLocalClocks()

      const { error } = await supabase.rpc(
        'abandon_workout_session',
        {
          p_session_id: currentSession.id,
        }
      )

      if (error) throw error

      if (currentSession.routine_id) {
        router.replace({
          pathname: '/rutina/[id]',
          params: { id: String(currentSession.routine_id) },
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
      targets.push(formatLongDuration(step.target_duration_seconds))
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
      session.workout_duration_seconds ?? 0

    return (
      <SafeAreaView style={styles.screen}>
        <AchievementUnlockBanner
          achievement={visibleAchievement}
          onDismiss={
            dismissVisibleAchievement
          }
        />

        <ScrollView contentContainerStyle={styles.summaryContainer}>
          <View style={styles.summaryIcon}>
            <Ionicons name="checkmark" size={52} color="#ffffff" />
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
                {session.completed_steps ?? completedSteps}
              </Text>
              <Text style={styles.summaryStatLabel}>Completados</Text>
            </View>

            <View style={styles.summaryStatCard}>
              <Text style={styles.summaryStatValue}>
                {session.skipped_steps ?? skippedSteps}
              </Text>
              <Text style={styles.summaryStatLabel}>Saltados</Text>
            </View>

            <View style={styles.summaryStatCard}>
              <Text style={styles.summaryStatValue}>
                {Math.max(1, Math.round(totalSessionSeconds / 60))}
              </Text>
              <Text style={styles.summaryStatLabel}>Minutos</Text>
            </View>
          </View>


          {loadingPostRewards ? (
            <View style={styles.calculatingRewardsCard}>
              <ActivityIndicator
                size="small"
                color="#166534"
              />

              <View style={{ flex: 1 }}>
                <Text style={styles.calculatingRewardsTitle}>
                  Calculando recompensas
                </Text>

                <Text style={styles.calculatingRewardsText}>
                  Revisando XP, misiones y logros...
                </Text>
              </View>
            </View>
          ) : postRewardsError ? (
            <View style={styles.rewardErrorCard}>
              <Ionicons
                name="alert-circle-outline"
                size={24}
                color="#92400e"
              />

              <View style={{ flex: 1 }}>
                <Text style={styles.rewardErrorTitle}>
                  Recompensas pendientes
                </Text>

                <Text style={styles.rewardErrorText}>
                  {postRewardsError}
                </Text>

                <Pressable
                  style={styles.retryRewardsButton}
                  onPress={() => {
                    postRewardSessionRef.current =
                      null

                    void loadPostWorkoutRewards(
                      session.id,
                      true
                    )
                  }}
                >
                  <Text style={styles.retryRewardsText}>
                    Reintentar
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : postWorkoutRewards ? (
            postWorkoutRewards.reward_eligible ? (
              <>
                <View style={styles.rewardBreakdownCard}>
                  <Text style={styles.rewardBreakdownTitle}>
                    Recompensas obtenidas
                  </Text>

                  {postWorkoutRewards.base_xp > 0 ? (
                    <View style={styles.rewardRow}>
                      <View style={styles.rewardRowIcon}>
                        <Ionicons
                          name="fitness-outline"
                          size={18}
                          color="#166534"
                        />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.rewardRowTitle}>
                          Entrenamiento válido
                        </Text>

                        <Text style={styles.rewardRowSubtitle}>
                          Rutina completada
                        </Text>
                      </View>

                      <Text style={styles.rewardRowXp}>
                        +{postWorkoutRewards.base_xp} XP
                      </Text>
                    </View>
                  ) : null}

                  {postWorkoutRewards
                    .completed_missions
                    .map((mission) => (
                      <View
                        key={mission.id}
                        style={styles.rewardRow}
                      >
                        <View style={styles.rewardRowIcon}>
                          <Ionicons
                            name="flag-outline"
                            size={18}
                            color="#166534"
                          />
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={styles.rewardRowTitle}>
                            {mission.title}
                          </Text>

                          <Text style={styles.rewardRowSubtitle}>
                            Misión semanal
                          </Text>
                        </View>

                        <Text style={styles.rewardRowXp}>
                          +{mission.xp_reward} XP
                        </Text>
                      </View>
                    ))}

                  {postWorkoutRewards
                    .unlocked_achievements
                    .map((achievement) => (
                      <View
                        key={achievement.id}
                        style={styles.rewardRow}
                      >
                        <View style={styles.rewardRowIcon}>
                          <Ionicons
                            name="trophy-outline"
                            size={18}
                            color="#166534"
                          />
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={styles.rewardRowTitle}>
                            {achievement.name}
                          </Text>

                          <Text style={styles.rewardRowSubtitle}>
                            Logro desbloqueado
                          </Text>
                        </View>

                        <Text style={styles.rewardRowXp}>
                          +{achievement.xp_reward} XP
                        </Text>
                      </View>
                    ))}

                  <View style={styles.rewardTotalRow}>
                    <Text style={styles.rewardTotalLabel}>
                      Total obtenido
                    </Text>

                    <Text style={styles.rewardTotalValue}>
                      +{postWorkoutRewards.total_xp_awarded} XP
                    </Text>
                  </View>

                  <Text style={styles.currentXpText}>
                    XP acumulado: {postWorkoutRewards.total_xp}
                  </Text>
                </View>

                {postWorkoutRewards.level_up ? (
                  <View style={styles.levelUpCard}>
                    <View style={styles.levelUpIcon}>
                      <Ionicons
                        name="arrow-up"
                        size={25}
                        color="#ffffff"
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.levelUpEyebrow}>
                        Subiste de nivel
                      </Text>

                      <Text style={styles.levelUpTitle}>
                        Nivel {postWorkoutRewards.current_level}
                        {' · '}
                        {postWorkoutRewards.current_level_name}
                      </Text>

                      <Text style={styles.levelUpText}>
                        Venías desde Nivel{' '}
                        {postWorkoutRewards.previous_level}
                        {' · '}
                        {postWorkoutRewards.previous_level_name}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.noRewardCard}>
                <Ionicons
                  name="information-circle-outline"
                  size={24}
                  color="#92400e"
                />

                <View style={{ flex: 1 }}>
                  <Text style={styles.noRewardTitle}>
                    Sesión guardada sin XP
                  </Text>

                  <Text style={styles.noRewardText}>
                    Necesitas completar al menos el 75 %
                    de los pasos para recibir recompensas.
                  </Text>
                </View>
              </View>
            )
          ) : null}



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

  const progressWidth = `${Math.min(
    100,
    Math.max(0, progressPercent)
  )}%` as `${number}%`

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
            <Text style={styles.headerTitle} numberOfLines={1}>
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
                { width: progressWidth },
              ]}
            />
          </View>
        </View>

        {!clockReady && (
          <View style={styles.syncCard}>
            <ActivityIndicator size="small" color="#166534" />
            <Text style={styles.syncText}>
              Sincronizando temporizador...
            </Text>
          </View>
        )}

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
                {renderTargetInformation(activeStep).map((target) => (
                  <View key={target} style={styles.targetBadge}>
                    <Text style={styles.targetBadgeText}>{target}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.timerCard}>
              <Text style={styles.timerLabel}>
                {processing
                  ? 'Guardando resultado'
                  : activeRemainingSeconds !== null
                    ? 'Tiempo restante'
                    : 'Tiempo activo'}
              </Text>

              <Text style={styles.timerValue}>
                {formatClock(
                  activeRemainingSeconds ?? activeElapsedSeconds
                )}
              </Text>

              {activeRemainingSeconds === 0 &&
              activeStep.target_duration_seconds ? (
                <Text style={styles.timerDoneText}>
                  Tiempo objetivo cumplido
                </Text>
              ) : null}
            </View>

            {minimumCompletionSeconds > 0 ? (
              <View
                style={[
                  styles.minimumTimeMessage,
                  canCompleteActiveStep &&
                    styles.minimumTimeMessageReady,
                ]}
              >
                <Ionicons
                  name={
                    canCompleteActiveStep
                      ? 'checkmark-circle-outline'
                      : 'lock-closed-outline'
                  }
                  size={18}
                  color={
                    canCompleteActiveStep ? '#166534' : '#92400e'
                  }
                />

                <Text
                  style={[
                    styles.minimumTimeText,
                    canCompleteActiveStep &&
                      styles.minimumTimeTextReady,
                  ]}
                >
                  {canCompleteActiveStep
                    ? 'Ya puedes completar este paso.'
                    : clockReady
                      ? `Completar se habilita en ${formatClock(
                          completionUnlockRemainingSeconds
                        )}.`
                      : 'Esperando sincronización del temporizador.'}
                </Text>
              </View>
            ) : null}

            {activeStep.machine_type_id ? (
              <Pressable
                style={styles.machineButton}
                onPress={() => openMachine(activeStep.machine_type_id!)}
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
                (processing || !canCompleteActiveStep) &&
                  styles.completeButtonLocked,
              ]}
              onPress={() => void finishActiveStep('completed')}
              disabled={processing || !canCompleteActiveStep}
            >
              <Ionicons
                name={
                  canCompleteActiveStep
                    ? 'checkmark-circle-outline'
                    : 'lock-closed-outline'
                }
                size={21}
                color="#ffffff"
              />

              <Text style={styles.completeButtonText}>
                {processing
                  ? 'Guardando...'
                  : !clockReady
                    ? 'Sincronizando...'
                    : canCompleteActiveStep
                      ? 'Completar paso'
                      : `Disponible en ${formatClock(
                          completionUnlockRemainingSeconds
                        )}`}
              </Text>
            </Pressable>

            <Pressable
              style={styles.skipButton}
              onPress={() => void finishActiveStep('skipped')}
              disabled={processing || !clockReady}
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
                onPress={() => void activateCurrentStep()}
                disabled={activating || !clockReady}
              >
                <Text style={styles.secondaryActionText}>
                  {activating ? 'Preparando...' : 'Saltar descanso'}
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
              disabled={activating || !clockReady}
            >
              <Text style={styles.primaryActionText}>Continuar</Text>
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
          Al salir de esta pantalla, el temporizador se pausa
          automáticamente.
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
  syncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dcfce7',
    borderRadius: 13,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  syncText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '700',
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
  minimumTimeMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  minimumTimeMessageReady: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  minimumTimeText: {
    flex: 1,
    color: '#92400e',
    fontSize: 13,
    fontWeight: '700',
  },
  minimumTimeTextReady: {
    color: '#166534',
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
  completeButtonLocked: {
    backgroundColor: '#9ca3af',
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
  rewardCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 16,
    padding: 16,
    marginTop: 18,
  },
  rewardIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardTitle: {
    color: '#166534',
    fontSize: 22,
    fontWeight: '900',
  },
  rewardText: {
    color: '#166534',
    lineHeight: 20,
    fontSize: 14,
    marginTop: 3,
  },
  noRewardCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 16,
    padding: 16,
    marginTop: 18,
  },
  noRewardTitle: {
    color: '#92400e',
    fontSize: 16,
    fontWeight: '800',
  },
  noRewardText: {
    color: '#92400e',
    lineHeight: 20,
    fontSize: 14,
    marginTop: 3,
  },
  calculatingRewardsCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 16,
    padding: 16,
    marginTop: 18,
  },

  calculatingRewardsTitle: {
    color: '#166534',
    fontSize: 16,
    fontWeight: '800',
  },

  calculatingRewardsText: {
    color: '#166534',
    fontSize: 13,
    marginTop: 3,
  },

  rewardErrorCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 16,
    padding: 16,
    marginTop: 18,
  },

  rewardErrorTitle: {
    color: '#92400e',
    fontSize: 16,
    fontWeight: '800',
  },

  rewardErrorText: {
    color: '#92400e',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },

  retryRewardsButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 8,
    marginTop: 10,
  },

  retryRewardsText: {
    color: '#92400e',
    fontWeight: '800',
  },

  rewardBreakdownCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 18,
    padding: 16,
    marginTop: 18,
  },

  rewardBreakdownTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 7,
  },

  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: '#ecfdf5',
  },

  rewardRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  rewardRowTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },

  rewardRowSubtitle: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },

  rewardRowXp: {
    color: '#16a34a',
    fontSize: 14,
    fontWeight: '900',
  },

  rewardTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#86efac',
    paddingTop: 14,
    marginTop: 5,
  },

  rewardTotalLabel: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
  },

  rewardTotalValue: {
    color: '#16a34a',
    fontSize: 21,
    fontWeight: '900',
  },

  currentXpText: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 5,
  },

  levelUpCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: '#166534',
    borderRadius: 18,
    padding: 17,
    marginTop: 13,
  },

  levelUpIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },

  levelUpEyebrow: {
    color: '#86efac',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },

  levelUpTitle: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '900',
    marginTop: 2,
  },

  levelUpText: {
    color: '#dcfce7',
    fontSize: 12,
    marginTop: 4,
  },
})
