import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import { supabase } from '../../../lib/supabase'

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

export default function RoutineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()

  const [routine, setRoutine] = useState<Routine | null>(null)
  const [steps, setSteps] = useState<RoutineStep[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    fetchRoutineData()
  }, [id])

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
})