import Ionicons from '@expo/vector-icons/Ionicons'
import { router, useFocusEffect } from 'expo-router'
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
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'

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

type HomeGymProfile = {
  goal: GoalCode
  fitness_level: FitnessLevel
  days_per_week: number
  session_minutes: number
  onboarding_completed: boolean
  created_at: string
  updated_at: string
}

type EquipmentItem = {
  id: number
  code: string
  name: string
  description: string | null
  icon_name: string
  sort_order: number
}

type HomeGymSetup = {
  configured: boolean
  profile: HomeGymProfile | null
  selectedEquipmentCodes: string[]
  equipmentCatalog: EquipmentItem[]
}

type SelectOption<T extends string> = {
  value: T
  title: string
  description: string
  icon: IoniconName
}

const TOTAL_STEPS = 5

const GOAL_OPTIONS: SelectOption<GoalCode>[] = [
  {
    value: 'stay_active',
    title: 'Mantenerme activo',
    description: 'Moverme con regularidad y construir el hábito.',
    icon: 'walk-outline',
  },
  {
    value: 'general_fitness',
    title: 'Mejorar condición física',
    description: 'Combinar fuerza, resistencia y movilidad.',
    icon: 'fitness-outline',
  },
  {
    value: 'strength',
    title: 'Ganar fuerza',
    description: 'Priorizar ejercicios de fuerza y control corporal.',
    icon: 'barbell-outline',
  },
  {
    value: 'endurance',
    title: 'Mejorar resistencia',
    description: 'Aumentar progresivamente la capacidad cardiovascular.',
    icon: 'heart-outline',
  },
  {
    value: 'mobility',
    title: 'Mejorar movilidad',
    description: 'Trabajar rango de movimiento, estabilidad y control.',
    icon: 'body-outline',
  },
]

const LEVEL_OPTIONS: SelectOption<FitnessLevel>[] = [
  {
    value: 'beginner',
    title: 'Principiante',
    description: 'Estoy comenzando o retomando después de una pausa.',
    icon: 'leaf-outline',
  },
  {
    value: 'intermediate',
    title: 'Intermedio',
    description: 'Entreno con cierta regularidad y conozco lo básico.',
    icon: 'trending-up-outline',
  },
  {
    value: 'advanced',
    title: 'Avanzado',
    description: 'Tengo experiencia y tolero mayor volumen de trabajo.',
    icon: 'flash-outline',
  },
]

const DAY_OPTIONS = [1, 2, 3, 4, 5]
const DURATION_OPTIONS = [10, 20, 30, 45, 60]

const EMPTY_SETUP: HomeGymSetup = {
  configured: false,
  profile: null,
  selectedEquipmentCodes: [],
  equipmentCatalog: [],
}

function toPercentageWidth(value: number): `${number}%` {
  const safeValue = Math.min(100, Math.max(0, value))
  return `${safeValue}%` as `${number}%`
}

function normalizeSetup(value: unknown): HomeGymSetup {
  const raw = (value ?? {}) as {
    configured?: unknown
    profile?: Partial<HomeGymProfile> | null
    selected_equipment_codes?: unknown
    equipment_catalog?: unknown
  }

  const profile = raw.profile
    ? {
        goal: String(raw.profile.goal ?? 'stay_active') as GoalCode,
        fitness_level: String(
          raw.profile.fitness_level ?? 'beginner'
        ) as FitnessLevel,
        days_per_week: Number(raw.profile.days_per_week ?? 3),
        session_minutes: Number(raw.profile.session_minutes ?? 30),
        onboarding_completed: Boolean(
          raw.profile.onboarding_completed ?? true
        ),
        created_at: String(raw.profile.created_at ?? ''),
        updated_at: String(raw.profile.updated_at ?? ''),
      }
    : null

  const selectedEquipmentCodes = Array.isArray(
    raw.selected_equipment_codes
  )
    ? raw.selected_equipment_codes.map(String)
    : []

  const equipmentCatalog = Array.isArray(raw.equipment_catalog)
    ? raw.equipment_catalog.map((item) => {
        const equipment = item as Partial<EquipmentItem>

        return {
          id: Number(equipment.id ?? 0),
          code: String(equipment.code ?? ''),
          name: String(equipment.name ?? 'Equipamiento'),
          description:
            equipment.description == null
              ? null
              : String(equipment.description),
          icon_name: String(
            equipment.icon_name ?? 'barbell-outline'
          ),
          sort_order: Number(equipment.sort_order ?? 0),
        }
      })
    : []

  return {
    configured: Boolean(raw.configured && profile),
    profile,
    selectedEquipmentCodes,
    equipmentCatalog,
  }
}

function goalLabel(value: GoalCode) {
  return (
    GOAL_OPTIONS.find((option) => option.value === value)?.title ??
    'Objetivo'
  )
}

function levelLabel(value: FitnessLevel) {
  return (
    LEVEL_OPTIONS.find((option) => option.value === value)?.title ??
    'Nivel'
  )
}

function equipmentIcon(value: string): IoniconName {
  return (value || 'barbell-outline') as IoniconName
}

export default function HomeGymScreen() {
  const [setup, setSetup] = useState<HomeGymSetup>(EMPTY_SETUP)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [step, setStep] = useState(0)

  const [goal, setGoal] = useState<GoalCode | null>(null)
  const [fitnessLevel, setFitnessLevel] =
    useState<FitnessLevel | null>(null)
  const [selectedEquipmentCodes, setSelectedEquipmentCodes] =
    useState<string[]>([])
  const [equipmentChoiceMade, setEquipmentChoiceMade] = useState(false)
  const [daysPerWeek, setDaysPerWeek] = useState(3)
  const [sessionMinutes, setSessionMinutes] = useState(30)

  const hydrateForm = useCallback((nextSetup: HomeGymSetup) => {
    const profile = nextSetup.profile

    setGoal(profile?.goal ?? null)
    setFitnessLevel(profile?.fitness_level ?? null)
    setSelectedEquipmentCodes(nextSetup.selectedEquipmentCodes)
    setEquipmentChoiceMade(Boolean(profile))
    setDaysPerWeek(profile?.days_per_week ?? 3)
    setSessionMinutes(profile?.session_minutes ?? 30)
  }, [])

  const loadSetup = useCallback(async () => {
    try {
      setLoading(true)

      const { data, error } = await supabase.rpc(
        'get_my_home_gym_setup'
      )

      if (error) throw error

      const nextSetup = normalizeSetup(data)
      setSetup(nextSetup)
      hydrateForm(nextSetup)
      setEditing(false)
      setStep(0)
    } catch (error: any) {
      Alert.alert(
        'No se pudo cargar Home Gym',
        error.message ?? 'Intenta nuevamente.'
      )
    } finally {
      setLoading(false)
    }
  }, [hydrateForm])

  useFocusEffect(
    useCallback(() => {
      void loadSetup()
    }, [loadSetup])
  )

  const selectedEquipment = useMemo(
    () =>
      setup.equipmentCatalog.filter((item) =>
        selectedEquipmentCodes.includes(item.code)
      ),
    [selectedEquipmentCodes, setup.equipmentCatalog]
  )

  const progressWidth = toPercentageWidth(
    ((step + 1) / TOTAL_STEPS) * 100
  )

  function beginOnboarding() {
    hydrateForm(setup)
    setStep(0)
    setEditing(true)
  }

  function cancelOnboarding() {
    hydrateForm(setup)
    setStep(0)
    setEditing(false)
  }

  function toggleEquipment(code: string) {
    setEquipmentChoiceMade(true)

    setSelectedEquipmentCodes((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code]
    )
  }

  function selectNoEquipment() {
    setSelectedEquipmentCodes([])
    setEquipmentChoiceMade(true)
  }

  function validateCurrentStep() {
    if (step === 0 && !goal) {
      Alert.alert('Selecciona un objetivo', 'Elige tu objetivo principal.')
      return false
    }

    if (step === 1 && !fitnessLevel) {
      Alert.alert('Selecciona tu nivel', 'Elige la opción que mejor te representa.')
      return false
    }

    if (step === 2 && !equipmentChoiceMade) {
      Alert.alert(
        'Selecciona tu equipamiento',
        'Elige al menos una opción o indica que entrenarás sin equipamiento.'
      )
      return false
    }

    return true
  }

  async function saveProfile() {
    if (!goal || !fitnessLevel || saving) return

    try {
      setSaving(true)

      const { data, error } = await supabase.rpc(
        'save_my_home_gym_profile',
        {
          p_goal: goal,
          p_fitness_level: fitnessLevel,
          p_days_per_week: daysPerWeek,
          p_session_minutes: sessionMinutes,
          p_equipment_codes: selectedEquipmentCodes,
        }
      )

      if (error) throw error

      const nextSetup = normalizeSetup(data)
      setSetup(nextSetup)
      hydrateForm(nextSetup)
      setEditing(false)
      setStep(0)

      Alert.alert(
        'Perfil Home Gym guardado',
        'Ya tenemos la información necesaria para preparar tu plan.'
      )
    } catch (error: any) {
      let message = error.message ?? 'No se pudo guardar tu perfil.'

      if (message.includes('INVALID_HOME_GYM_EQUIPMENT')) {
        message = 'Hay equipamiento no válido o desactivado. Actualiza e intenta nuevamente.'
      }

      Alert.alert('No se pudo guardar', message)
    } finally {
      setSaving(false)
    }
  }

  function continueOnboarding() {
    if (!validateCurrentStep()) return

    if (step < TOTAL_STEPS - 1) {
      setStep((current) => current + 1)
      return
    }

    void saveProfile()
  }

  function previousStep() {
    if (step > 0) {
      setStep((current) => current - 1)
      return
    }

    cancelOnboarding()
  }

  function renderChoice<T extends string>(
    option: SelectOption<T>,
    selected: boolean,
    onPress: () => void
  ) {
    return (
      <Pressable
        key={option.value}
        style={[
          styles.choiceCard,
          selected && styles.choiceCardSelected,
        ]}
        onPress={onPress}
      >
        <View
          style={[
            styles.choiceIcon,
            selected && styles.choiceIconSelected,
          ]}
        >
          <Ionicons
            name={option.icon}
            size={24}
            color={selected ? '#ffffff' : '#166534'}
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.choiceTitle,
              selected && styles.choiceTitleSelected,
            ]}
          >
            {option.title}
          </Text>

          <Text
            style={[
              styles.choiceDescription,
              selected && styles.choiceDescriptionSelected,
            ]}
          >
            {option.description}
          </Text>
        </View>

        <Ionicons
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={selected ? '#ffffff' : '#86efac'}
        />
      </Pressable>
    )
  }

  function renderWizardStep() {
    if (step === 0) {
      return (
        <>
          <Text style={styles.stepTitle}>¿Cuál es tu objetivo principal?</Text>
          <Text style={styles.stepDescription}>
            Usaremos esta respuesta para priorizar el tipo de sesiones de tu plan.
          </Text>

          <View style={styles.choicesList}>
            {GOAL_OPTIONS.map((option) =>
              renderChoice(
                option,
                goal === option.value,
                () => setGoal(option.value)
              )
            )}
          </View>
        </>
      )
    }

    if (step === 1) {
      return (
        <>
          <Text style={styles.stepTitle}>¿Cuál es tu nivel actual?</Text>
          <Text style={styles.stepDescription}>
            Elige la alternativa más realista. Podrás cambiarla después.
          </Text>

          <View style={styles.choicesList}>
            {LEVEL_OPTIONS.map((option) =>
              renderChoice(
                option,
                fitnessLevel === option.value,
                () => setFitnessLevel(option.value)
              )
            )}
          </View>
        </>
      )
    }

    if (step === 2) {
      const noEquipmentSelected =
        equipmentChoiceMade && selectedEquipmentCodes.length === 0

      return (
        <>
          <Text style={styles.stepTitle}>¿Qué equipamiento tienes?</Text>
          <Text style={styles.stepDescription}>
            Puedes seleccionar varias opciones. El peso corporal siempre estará disponible.
          </Text>

          <Pressable
            style={[
              styles.noEquipmentCard,
              noEquipmentSelected && styles.noEquipmentCardSelected,
            ]}
            onPress={selectNoEquipment}
          >
            <View
              style={[
                styles.choiceIcon,
                noEquipmentSelected && styles.choiceIconSelected,
              ]}
            >
              <Ionicons
                name="body-outline"
                size={24}
                color={noEquipmentSelected ? '#ffffff' : '#166534'}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.choiceTitle,
                  noEquipmentSelected && styles.choiceTitleSelected,
                ]}
              >
                Sin equipamiento
              </Text>
              <Text
                style={[
                  styles.choiceDescription,
                  noEquipmentSelected && styles.choiceDescriptionSelected,
                ]}
              >
                Quiero entrenar utilizando solo mi peso corporal.
              </Text>
            </View>

            <Ionicons
              name={
                noEquipmentSelected
                  ? 'checkmark-circle'
                  : 'ellipse-outline'
              }
              size={24}
              color={noEquipmentSelected ? '#ffffff' : '#86efac'}
            />
          </Pressable>

          <View style={styles.equipmentGrid}>
            {setup.equipmentCatalog.map((item) => {
              const selected = selectedEquipmentCodes.includes(item.code)

              return (
                <Pressable
                  key={item.id}
                  style={[
                    styles.equipmentCard,
                    selected && styles.equipmentCardSelected,
                  ]}
                  onPress={() => toggleEquipment(item.code)}
                >
                  <Ionicons
                    name={equipmentIcon(item.icon_name)}
                    size={26}
                    color={selected ? '#ffffff' : '#166534'}
                  />

                  <Text
                    style={[
                      styles.equipmentName,
                      selected && styles.equipmentNameSelected,
                    ]}
                  >
                    {item.name}
                  </Text>

                  <Ionicons
                    name={
                      selected ? 'checkmark-circle' : 'add-circle-outline'
                    }
                    size={20}
                    color={selected ? '#ffffff' : '#16a34a'}
                  />
                </Pressable>
              )
            })}
          </View>
        </>
      )
    }

    if (step === 3) {
      return (
        <>
          <Text style={styles.stepTitle}>¿Cuántos días quieres entrenar?</Text>
          <Text style={styles.stepDescription}>
            Define una frecuencia semanal que puedas sostener.
          </Text>

          <View style={styles.numberGrid}>
            {DAY_OPTIONS.map((value) => {
              const selected = daysPerWeek === value

              return (
                <Pressable
                  key={value}
                  style={[
                    styles.numberCard,
                    selected && styles.numberCardSelected,
                  ]}
                  onPress={() => setDaysPerWeek(value)}
                >
                  <Text
                    style={[
                      styles.numberValue,
                      selected && styles.numberValueSelected,
                    ]}
                  >
                    {value}
                  </Text>
                  <Text
                    style={[
                      styles.numberLabel,
                      selected && styles.numberLabelSelected,
                    ]}
                  >
                    {value === 1 ? 'día' : 'días'}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </>
      )
    }

    return (
      <>
        <Text style={styles.stepTitle}>¿Cuánto tiempo tienes por sesión?</Text>
        <Text style={styles.stepDescription}>
          El futuro generador ajustará el número y duración de ejercicios a este límite.
        </Text>

        <View style={styles.durationList}>
          {DURATION_OPTIONS.map((value) => {
            const selected = sessionMinutes === value

            return (
              <Pressable
                key={value}
                style={[
                  styles.durationCard,
                  selected && styles.durationCardSelected,
                ]}
                onPress={() => setSessionMinutes(value)}
              >
                <View
                  style={[
                    styles.durationIcon,
                    selected && styles.durationIconSelected,
                  ]}
                >
                  <Ionicons
                    name="time-outline"
                    size={23}
                    color={selected ? '#ffffff' : '#166534'}
                  />
                </View>

                <Text
                  style={[
                    styles.durationValue,
                    selected && styles.durationValueSelected,
                  ]}
                >
                  {value} minutos
                </Text>

                <Ionicons
                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={selected ? '#ffffff' : '#86efac'}
                />
              </Pressable>
            )
          })}
        </View>

        <View style={styles.reviewCard}>
          <Text style={styles.reviewEyebrow}>Resumen</Text>
          <Text style={styles.reviewLine}>
            {goal ? goalLabel(goal) : 'Objetivo pendiente'}
          </Text>
          <Text style={styles.reviewLine}>
            {fitnessLevel ? levelLabel(fitnessLevel) : 'Nivel pendiente'}
          </Text>
          <Text style={styles.reviewLine}>
            {daysPerWeek} día{daysPerWeek === 1 ? '' : 's'} por semana ·{' '}
            {sessionMinutes} min
          </Text>
          <Text style={styles.reviewLine}>
            {selectedEquipmentCodes.length > 0
              ? `${selectedEquipmentCodes.length} equipo${
                  selectedEquipmentCodes.length === 1 ? '' : 's'
                } seleccionado${
                  selectedEquipmentCodes.length === 1 ? '' : 's'
                }`
              : 'Solo peso corporal'}
          </Text>
        </View>
      </>
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
      </SafeAreaView>
    )
  }

  if (editing) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.wizardContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.wizardHeader}>
            <Pressable
              style={styles.backButton}
              onPress={previousStep}
              disabled={saving}
            >
              <Ionicons name="chevron-back" size={23} color="#166534" />
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={styles.wizardEyebrow}>Configurar Home Gym</Text>
              <Text style={styles.wizardStepText}>
                Paso {step + 1} de {TOTAL_STEPS}
              </Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: progressWidth }]} />
          </View>

          <View style={styles.stepCard}>{renderWizardStep()}</View>

          <View style={styles.wizardActions}>
            {setup.configured ? (
              <Pressable
                style={styles.cancelButton}
                onPress={cancelOnboarding}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </Pressable>
            ) : null}

            <Pressable
              style={[
                styles.continueButton,
                saving && styles.buttonDisabled,
              ]}
              onPress={continueOnboarding}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Text style={styles.continueButtonText}>
                    {step === TOTAL_STEPS - 1
                      ? 'Guardar preferencias'
                      : 'Continuar'}
                  </Text>
                  <Ionicons
                    name={
                      step === TOTAL_STEPS - 1
                        ? 'checkmark-circle-outline'
                        : 'arrow-forward'
                    }
                    size={20}
                    color="#ffffff"
                  />
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (!setup.configured || !setup.profile) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.introContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.introHero}>
            <View style={styles.introIcon}>
              <Ionicons name="home-outline" size={42} color="#166534" />
            </View>

            <Text style={styles.introEyebrow}>Home Gym</Text>
            <Text style={styles.introTitle}>Entrena con lo que tienes en casa</Text>
            <Text style={styles.introDescription}>
              Cuéntanos tu objetivo, experiencia, disponibilidad y equipamiento.
              PlazaFit usará esa información para preparar un plan semanal.
            </Text>
          </View>

          <View style={styles.benefitsCard}>
            <View style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <Ionicons name="options-outline" size={21} color="#166534" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.benefitTitle}>Adaptado a ti</Text>
                <Text style={styles.benefitText}>
                  El plan tendrá en cuenta tu nivel y tiempo disponible.
                </Text>
              </View>
            </View>

            <View style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <Ionicons name="barbell-outline" size={21} color="#166534" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.benefitTitle}>Con tu equipamiento</Text>
                <Text style={styles.benefitText}>
                  También funcionará si solo quieres entrenar con peso corporal.
                </Text>
              </View>
            </View>

            <View style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <Ionicons name="trophy-outline" size={21} color="#166534" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.benefitTitle}>Con progreso PlazaFit</Text>
                <Text style={styles.benefitText}>
                  Más adelante tus sesiones de casa usarán el mismo XP, racha e historial.
                </Text>
              </View>
            </View>
          </View>

          <Pressable style={styles.primaryButton} onPress={beginOnboarding}>
            <Text style={styles.primaryButtonText}>Configurar Home Gym</Text>
            <Ionicons name="arrow-forward" size={20} color="#ffffff" />
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    )
  }

  const profile = setup.profile

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.dashboardContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.dashboardHero}>
          <View style={styles.dashboardHeroTop}>
            <View style={styles.dashboardIcon}>
              <Ionicons name="home-outline" size={29} color="#166534" />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.dashboardEyebrow}>Home Gym</Text>
              <Text style={styles.dashboardTitle}>Tu perfil está listo</Text>
            </View>

            <Ionicons name="checkmark-circle" size={27} color="#86efac" />
          </View>

          <Text style={styles.dashboardDescription}>
            Ya guardamos tus preferencias. El siguiente bloque construirá tu plan semanal
            usando un catálogo controlado de ejercicios.
          </Text>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Ionicons name="flag-outline" size={22} color="#16a34a" />
            <Text style={styles.summaryValue}>{goalLabel(profile.goal)}</Text>
            <Text style={styles.summaryLabel}>Objetivo</Text>
          </View>

          <View style={styles.summaryCard}>
            <Ionicons name="trending-up-outline" size={22} color="#16a34a" />
            <Text style={styles.summaryValue}>
              {levelLabel(profile.fitness_level)}
            </Text>
            <Text style={styles.summaryLabel}>Nivel</Text>
          </View>

          <View style={styles.summaryCard}>
            <Ionicons name="calendar-outline" size={22} color="#16a34a" />
            <Text style={styles.summaryNumber}>{profile.days_per_week}</Text>
            <Text style={styles.summaryLabel}>Días por semana</Text>
          </View>

          <View style={styles.summaryCard}>
            <Ionicons name="time-outline" size={22} color="#16a34a" />
            <Text style={styles.summaryNumber}>{profile.session_minutes}</Text>
            <Text style={styles.summaryLabel}>Minutos por sesión</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderIcon}>
              <Ionicons name="barbell-outline" size={21} color="#166534" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionEyebrow}>Equipamiento</Text>
              <Text style={styles.sectionTitle}>Disponible en casa</Text>
            </View>
          </View>

          {selectedEquipment.length > 0 ? (
            <View style={styles.equipmentChips}>
              {selectedEquipment.map((item) => (
                <View key={item.id} style={styles.equipmentChip}>
                  <Ionicons
                    name={equipmentIcon(item.icon_name)}
                    size={16}
                    color="#166534"
                  />
                  <Text style={styles.equipmentChipText}>{item.name}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.bodyweightRow}>
              <Ionicons name="body-outline" size={21} color="#166534" />
              <Text style={styles.bodyweightText}>Solo peso corporal</Text>
            </View>
          )}
        </View>

        <View style={styles.nextStepCard}>
          <View style={styles.nextStepIcon}>
            <Ionicons name="git-branch-outline" size={26} color="#166534" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.nextStepEyebrow}>Generador preparado</Text>
            <Text style={styles.nextStepTitle}>Crea tu plan semanal</Text>
            <Text style={styles.nextStepText}>
              PlazaFit ya puede distribuir ejercicios compatibles en sesiones semanales
              mediante reglas controladas, sin utilizar IA ni generar costos.
            </Text>
          </View>
        </View>

        <Pressable
          style={styles.planButton}
          onPress={() => router.push('/plan-casa')}
        >
          <View style={styles.planButtonIcon}>
            <Ionicons name="calendar-outline" size={22} color="#ffffff" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.planButtonEyebrow}>Plan Home Gym</Text>
            <Text style={styles.planButtonTitle}>Crear o revisar mi semana</Text>
            <Text style={styles.planButtonText}>
              Genera una propuesta según tu objetivo, nivel, tiempo y equipamiento.
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={22} color="#ffffff" />
        </Pressable>

        <Pressable
          style={styles.catalogButton}
          onPress={() => router.push('/ejercicios-casa')}
        >
          <View style={styles.catalogButtonIcon}>
            <Ionicons name="library-outline" size={21} color="#166534" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.catalogButtonEyebrow}>Vista previa</Text>
            <Text style={styles.catalogButtonTitle}>Ver ejercicios compatibles</Text>
          </View>

          <Ionicons name="chevron-forward" size={22} color="#16a34a" />
        </Pressable>

        <Pressable style={styles.editButton} onPress={beginOnboarding}>
          <Ionicons name="create-outline" size={20} color="#166534" />
          <Text style={styles.editButtonText}>Editar preferencias</Text>
        </Pressable>
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
  introContainer: {
    flexGrow: 1,
    padding: 18,
    paddingBottom: 34,
    justifyContent: 'center',
    gap: 15,
  },
  introHero: {
    backgroundColor: '#166534',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  introIcon: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  introEyebrow: {
    color: '#86efac',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: 18,
  },
  introTitle: {
    color: '#ffffff',
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 5,
  },
  introDescription: {
    color: '#dcfce7',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 10,
  },
  benefitsCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dcfce7',
    borderRadius: 20,
    paddingHorizontal: 17,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: '#ecfdf5',
  },
  benefitIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },
  benefitText: {
    color: '#6b7280',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  primaryButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: '#16a34a',
    borderRadius: 16,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  wizardContainer: {
    padding: 18,
    paddingBottom: 34,
    gap: 15,
  },
  wizardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wizardEyebrow: {
    color: '#16a34a',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  wizardStepText: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  progressTrack: {
    height: 9,
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#16a34a',
    borderRadius: 999,
  },
  stepCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dcfce7',
    borderRadius: 21,
    padding: 18,
  },
  stepTitle: {
    color: '#111827',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
  },
  stepDescription: {
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },
  choicesList: {
    gap: 10,
    marginTop: 18,
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 14,
  },
  choiceCardSelected: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  choiceIcon: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceIconSelected: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  choiceTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },
  choiceTitleSelected: {
    color: '#ffffff',
  },
  choiceDescription: {
    color: '#6b7280',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  choiceDescriptionSelected: {
    color: '#dcfce7',
  },
  noEquipmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 16,
    padding: 14,
    marginTop: 18,
  },
  noEquipmentCardSelected: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  equipmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  equipmentCard: {
    width: '48%',
    minHeight: 118,
    justifyContent: 'space-between',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 14,
  },
  equipmentCardSelected: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  equipmentName: {
    color: '#111827',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    marginVertical: 8,
  },
  equipmentNameSelected: {
    color: '#ffffff',
  },
  numberGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 24,
  },
  numberCard: {
    flex: 1,
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 16,
  },
  numberCardSelected: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  numberValue: {
    color: '#166534',
    fontSize: 26,
    fontWeight: '900',
  },
  numberValueSelected: {
    color: '#ffffff',
  },
  numberLabel: {
    color: '#15803d',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  numberLabelSelected: {
    color: '#dcfce7',
  },
  durationList: {
    gap: 10,
    marginTop: 20,
  },
  durationCard: {
    minHeight: 61,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  durationCardSelected: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  durationIcon: {
    width: 39,
    height: 39,
    borderRadius: 20,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationIconSelected: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  durationValue: {
    flex: 1,
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  durationValueSelected: {
    color: '#ffffff',
  },
  reviewCard: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 16,
    padding: 15,
    marginTop: 17,
  },
  reviewEyebrow: {
    color: '#16a34a',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 7,
  },
  reviewLine: {
    color: '#166534',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
  },
  wizardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    minHeight: 52,
    paddingHorizontal: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#166534',
    fontWeight: '800',
  },
  continueButton: {
    minHeight: 52,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    borderRadius: 15,
  },
  continueButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  dashboardContainer: {
    padding: 18,
    paddingBottom: 34,
    gap: 14,
  },
  dashboardHero: {
    backgroundColor: '#166534',
    borderRadius: 22,
    padding: 19,
  },
  dashboardHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dashboardIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardEyebrow: {
    color: '#86efac',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  dashboardTitle: {
    color: '#ffffff',
    fontSize: 21,
    fontWeight: '900',
    marginTop: 2,
  },
  dashboardDescription: {
    color: '#dcfce7',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 11,
  },
  summaryCard: {
    width: '48%',
    minHeight: 130,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dcfce7',
    borderRadius: 18,
    padding: 15,
    justifyContent: 'center',
  },
  summaryValue: {
    color: '#111827',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
    marginTop: 9,
  },
  summaryNumber: {
    color: '#16a34a',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 7,
  },
  summaryLabel: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 4,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dcfce7',
    borderRadius: 19,
    padding: 17,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  sectionHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionEyebrow: {
    color: '#16a34a',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 2,
  },
  equipmentChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 15,
  },
  equipmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  equipmentChipText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
  },
  bodyweightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#f0fdf4',
    borderRadius: 14,
    padding: 13,
    marginTop: 14,
  },
  bodyweightText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '800',
  },
  nextStepCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 19,
    padding: 17,
  },
  nextStepIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextStepEyebrow: {
    color: '#16a34a',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  nextStepTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 3,
  },
  nextStepText: {
    color: '#166534',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  planButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#166534',
    borderRadius: 18,
    padding: 17,
  },
  planButtonIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planButtonEyebrow: {
    color: '#86efac',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  planButtonTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  planButtonText: {
    color: '#dcfce7',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  catalogButton: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  catalogButtonIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catalogButtonEyebrow: {
    color: '#16a34a',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  catalogButtonTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },

  editButton: {
    minHeight: 51,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 15,
  },
  editButtonText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '900',
  },
})
