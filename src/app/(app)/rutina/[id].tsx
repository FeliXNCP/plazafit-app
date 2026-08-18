import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { supabase } from '../../../lib/supabase'
import type { Database } from '../../../types/database.types'

//tipos
type Routine = {
  id: number
  plaza_id: number
  title: string
  description: string | null
  goal: string | null
  difficulty: string | null
  estimated_minutes: number | null
  is_featured: boolean
}

type RoutineStepRaw = {
  id: number
  step_order: number
  title: string
  instruction: string | null
  sets: number | null
  reps: number | null
  duration_seconds: number | null
  rest_seconds: number | null
  machine_types:
    | {
        id?: number
        name: string
        category: string | null
      }
    | {
        id?: number
        name: string
        category: string | null
      }[]
    | null
  machine_type_id?: number | null
}

type RoutineStep = {
  id: number
  stepOrder: number
  title: string
  instruction: string | null
  sets: number | null
  reps: number | null
  durationSeconds: number | null
  restSeconds: number | null
  machineTypeId: number | null
  machineName: string | null
  machineCategory: string | null
}

type ActiveWorkout = Pick<
  Database['public']['Tables']['workout_sessions']['Row'],
  'id' | 'routine_id' | 'routine_title_snapshot' | 'started_at'
>


// estados
export default function RoutineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()

  const [routine, setRoutine] = useState<Routine | null>(null)
  const [steps, setSteps] = useState<RoutineStep[]>([])
  const [loading, setLoading] = useState(true)
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null)
  const [startingWorkout, setStartingWorkout] = useState(false)

  const fetchActiveWorkout = useCallback(async () => {
    const { data, error } = await supabase
      .from('workout_sessions')
      .select('id, routine_id, routine_title_snapshot, started_at')
      .eq('status', 'in_progress')
      .maybeSingle()

    if (error) {
      console.error('Error loading active workout:', error)
      return
    }

    setActiveWorkout((data ?? null) as ActiveWorkout | null)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void fetchActiveWorkout()
    }, [fetchActiveWorkout])
  )


  useEffect(() => {
    if (!id) return
    fetchRoutineData()
  }, [id])


  //funciones
  async function fetchRoutineData() {
    try {
      setLoading(true)

      const routineId = Number(id)

      const [routineRes, stepsRes] = await Promise.all([
        supabase.from('plaza_routines').select('*').eq('id', routineId).single(),
        supabase
          .from('plaza_routine_steps')
          .select(
            `
            id,
            step_order,
            title,
            instruction,
            sets,
            reps,
            duration_seconds,
            rest_seconds,
            machine_type_id,
            machine_types (
              name,
              category
            )
          `
          )
          .eq('routine_id', routineId)
          .order('step_order', { ascending: true }),
      ])

      if (routineRes.error) throw routineRes.error
      if (stepsRes.error) throw stepsRes.error

      setRoutine((routineRes.data ?? null) as Routine)

      const normalizedSteps = ((stepsRes.data ?? []) as RoutineStepRaw[]).map((step) => {
        const machineType = Array.isArray(step.machine_types)
          ? step.machine_types[0]
          : step.machine_types

        return {
          id: step.id,
          stepOrder: step.step_order,
          title: step.title,
          instruction: step.instruction,
          sets: step.sets,
          reps: step.reps,
          durationSeconds: step.duration_seconds,
          restSeconds: step.rest_seconds,
          machineTypeId: step.machine_type_id ?? null,
          machineName: machineType?.name ?? null,
          machineCategory: machineType?.category ?? null,
        }
      })

      setSteps(normalizedSteps)
    } finally {
      setLoading(false)
    }
  }

  function formatStepMeta(step: RoutineStep) {
    const parts: string[] = []

    if (step.sets) parts.push(`${step.sets} series`)
    if (step.reps) parts.push(`${step.reps} rep`)
    if (step.durationSeconds) parts.push(`${Math.round(step.durationSeconds / 60)} min`)
    if (step.restSeconds) parts.push(`descanso ${step.restSeconds}s`)

    return parts.join(' • ')
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (!routine) {
    return (
      <View style={styles.center}>
        <Text>No se encontró la rutina.</Text>
      </View>
    )
  }

  async function handleWorkoutAction() {
  if (!id) return

  if (activeWorkout) {
    router.push({
      pathname: '/entrenamiento/[id]',
      params: { id: activeWorkout.id },
    })
    return
  }

  try {
    setStartingWorkout(true)

    const { data: sessionId, error } = await supabase.rpc(
      'start_workout_session',
      {
        p_routine_id: Number(id),
      }
    )

    if (error) {
      if (error.message.includes('ACTIVE_WORKOUT_EXISTS')) {
        await fetchActiveWorkout()

        Alert.alert(
          'Entrenamiento activo',
          'Ya tienes un entrenamiento en curso. Puedes continuarlo antes de comenzar otro.'
        )
        return
      }

      if (error.message.includes('ROUTINE_HAS_NO_STEPS')) {
        Alert.alert(
          'Rutina incompleta',
          'Esta rutina todavía no tiene pasos configurados.'
        )
        return
      }

      throw error
    }

    if (!sessionId) {
      throw new Error('No se recibió el identificador de la sesión.')
    }

    router.push({
      pathname: '/entrenamiento/[id]',
      params: { id: String(sessionId) },
    })
  } catch (error: any) {
    Alert.alert(
      'No se pudo iniciar',
      error.message ?? 'No se pudo iniciar el entrenamiento.'
    )
  } finally {
    setStartingWorkout(false)
  }
}

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.heroCard}>
        <Text style={styles.title}>{routine.title}</Text>

        {routine.description ? (
          <Text style={styles.description}>{routine.description}</Text>
        ) : null}

        <View style={styles.metaRow}>
          {routine.goal ? <Text style={styles.metaBadge}>{routine.goal}</Text> : null}
          {routine.difficulty ? (
            <Text style={styles.metaBadge}>{routine.difficulty}</Text>
          ) : null}
          {routine.estimated_minutes ? (
            <Text style={styles.metaBadge}>{routine.estimated_minutes} min</Text>
          ) : null}
        </View>
      </View>


      {activeWorkout ? (
        <View style={styles.activeWorkoutCard}>
          <Text style={styles.activeWorkoutEyebrow}>Entrenamiento en curso</Text>

          <Text style={styles.activeWorkoutTitle}>
            {activeWorkout.routine_id === routine.id
              ? 'Ya comenzaste esta rutina'
              : activeWorkout.routine_title_snapshot}
          </Text>

          <Text style={styles.activeWorkoutText}>
            {activeWorkout.routine_id === routine.id
              ? 'Puedes continuar desde el paso en que quedaste.'
              : 'Debes terminar o abandonar la sesión activa antes de comenzar otra.'}
          </Text>

          <Pressable
            style={styles.continueWorkoutButton}
            onPress={handleWorkoutAction}
          >
            <Text style={styles.continueWorkoutButtonText}>
              Continuar entrenamiento
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={[
            styles.startWorkoutButton,
            startingWorkout && styles.buttonDisabled,
          ]}
          onPress={handleWorkoutAction}
          disabled={startingWorkout}
        >
          <Text style={styles.startWorkoutButtonText}>
            {startingWorkout
              ? 'Iniciando entrenamiento...'
              : 'Comenzar entrenamiento'}
          </Text>
        </Pressable>
      )}





      <View style={styles.card}>
        <Text style={styles.label}>Pasos de la rutina</Text>

        {steps.length === 0 ? (
          <Text style={styles.emptyText}>No hay pasos registrados todavía.</Text>
        ) : (
          steps.map((step) => (
            <View key={step.id} style={styles.stepCard}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{step.stepOrder}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{step.title}</Text>

                {step.machineName ? (
                  <Pressable
                    style={styles.machineLink}
                    onPress={() =>
                      router.push({
                        pathname: '/maquina/[id]',
                        params: { 
                            id: String(step.machineTypeId),
                            plazaId: String(routine.plaza_id),
                            origin: 'map',
                         },
                      })
                    }
                  >
                    <Text style={styles.machineLinkText}>
                      {step.machineName}
                      {step.machineCategory ? ` · ${step.machineCategory}` : ''}
                    </Text>
                  </Pressable>
                ) : null}

                {step.instruction ? (
                  <Text style={styles.stepInstruction}>{step.instruction}</Text>
                ) : null}

                {formatStepMeta(step) ? (
                  <Text style={styles.stepMeta}>{formatStepMeta(step)}</Text>
                ) : null}
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  )
}


const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f0fdf4',
  },
  container: {
    padding: 16,
    gap: 14,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCard: {
    backgroundColor: '#dcfce7',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  description: {
    fontSize: 15,
    color: '#374151',
    marginTop: 8,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  metaBadge: {
    fontSize: 12,
    color: '#166534',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16a34a',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 15,
    color: '#6b7280',
  },
  stepCard: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#ecfdf5',
  },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepNumberText: {
    color: '#fff',
    fontWeight: '700',
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  machineLink: {
    alignSelf: 'flex-start',
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  machineLinkText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
  },
  stepInstruction: {
    fontSize: 15,
    color: '#374151',
    marginTop: 8,
    lineHeight: 21,
  },
  stepMeta: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 8,
  },
  activeWorkoutCard: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 18,
    padding: 18,
  },
  activeWorkoutEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400e',
    textTransform: 'uppercase',
  },
  activeWorkoutTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#111827',
    marginTop: 6,
  },
  activeWorkoutText: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
    marginTop: 6,
  },
  continueWorkoutButton: {
    backgroundColor: '#d97706',
    borderRadius: 13,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  continueWorkoutButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  startWorkoutButton: {
    backgroundColor: '#16a34a',
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
  },
  startWorkoutButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
})