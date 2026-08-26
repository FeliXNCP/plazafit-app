import Ionicons from '@expo/vector-icons/Ionicons'
import DateTimePicker, {
    type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { useFocusEffect } from 'expo-router'
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react'
import {
    ActivityIndicator,
    Alert,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../providers/session-provider'
import {
    type IsoWeekday,
    NotificationPermissionDeniedError,
    cancelWorkoutReminders,
    ensureWorkoutReminderChannel,
    getNextWorkoutReminderDate,
    getScheduledWorkoutReminders,
    hasNotificationPermission,
    scheduleTestWorkoutReminder,
    scheduleWorkoutReminders,
} from '../../services/notifications/workout-reminder-service'

const DAYS: {
  value: IsoWeekday
  short: string
  name: string
}[] = [
  {
    value: 1,
    short: 'L',
    name: 'Lunes',
  },
  {
    value: 2,
    short: 'M',
    name: 'Martes',
  },
  {
    value: 3,
    short: 'X',
    name: 'Miércoles',
  },
  {
    value: 4,
    short: 'J',
    name: 'Jueves',
  },
  {
    value: 5,
    short: 'V',
    name: 'Viernes',
  },
  {
    value: 6,
    short: 'S',
    name: 'Sábado',
  },
  {
    value: 7,
    short: 'D',
    name: 'Domingo',
  },
]

function parseDatabaseTime(
  value: string
) {
  const [hour, minute] =
    value.split(':')

  return {
    hour: Number(hour ?? 19),
    minute: Number(minute ?? 0),
  }
}

function createTimeDate(
  hour: number,
  minute: number
) {
  const date = new Date()

  date.setHours(
    hour,
    minute,
    0,
    0
  )

  return date
}

function formatTime(
  hour: number,
  minute: number
) {
  return `${String(hour).padStart(
    2,
    '0'
  )}:${String(minute).padStart(
    2,
    '0'
  )}`
}

function formatNextDate(
  timestamp: number | null
) {
  if (!timestamp) {
    return 'Sin recordatorio próximo'
  }

  return new Date(
    timestamp
  ).toLocaleString('es-CL', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getDeviceTimezone() {
  try {
    return Intl
      .DateTimeFormat()
      .resolvedOptions()
      .timeZone ||
      'America/Santiago'
  } catch {
    return 'America/Santiago'
  }
}

export default function
WorkoutRemindersScreen() {
  const { session } = useSession()

  const userId =
    session?.user?.id

  const [loading, setLoading] =
    useState(true)

  const [saving, setSaving] =
    useState(false)

  const [testing, setTesting] =
    useState(false)

  const [enabled, setEnabled] =
    useState(false)

  const [selectedDays, setSelectedDays] =
    useState<IsoWeekday[]>([
      1,
      3,
      5,
    ])

  const [hour, setHour] =
    useState(19)

  const [minute, setMinute] =
    useState(0)

  const [
    showTimePicker,
    setShowTimePicker,
  ] = useState(false)

  const [
    permissionGranted,
    setPermissionGranted,
  ] = useState(false)

  const [
    scheduledCount,
    setScheduledCount,
  ] = useState(0)

  const [
    nextReminderAt,
    setNextReminderAt,
  ] = useState<number | null>(
    null
  )

  const sortedDays = useMemo(
    () =>
      [...selectedDays].sort(
        (a, b) => a - b
      ),
    [selectedDays]
  )

  const loadPreferences =
    useCallback(async () => {
      if (!userId) return

      try {
        setLoading(true)

        await
          ensureWorkoutReminderChannel()

        const permission =
          await hasNotificationPermission()

        setPermissionGranted(
          permission
        )

        const {
          data,
          error,
        } = await supabase
          .from(
            'notification_preferences'
          )
          .select(
            `
            workout_reminders_enabled,
            workout_reminder_days,
            workout_reminder_time
          `
          )
          .eq('user_id', userId)
          .maybeSingle()

        if (error) throw error

        if (data) {
          const time =
            parseDatabaseTime(
              data.workout_reminder_time
            )

          setEnabled(
            data.workout_reminders_enabled
          )

            const reminderDays = (
                data.workout_reminder_days ?? []
            ) as IsoWeekday[]

            setSelectedDays(reminderDays)

          setHour(time.hour)
          setMinute(time.minute)
        }

        const scheduled =
          await getScheduledWorkoutReminders(
            userId
          )

        setScheduledCount(
          scheduled.length
        )
      } catch (error: any) {
        Alert.alert(
          'No se pudieron cargar',
          error.message ??
            'No se pudieron cargar los recordatorios.'
        )
      } finally {
        setLoading(false)
      }
    }, [userId])

  useFocusEffect(
    useCallback(() => {
      void loadPreferences()
    }, [loadPreferences])
  )

  useEffect(() => {
    let cancelled = false

    void (async () => {
      if (
        !enabled ||
        sortedDays.length === 0
      ) {
        if (!cancelled) {
          setNextReminderAt(null)
        }

        return
      }

      const next =
        await getNextWorkoutReminderDate(
          sortedDays,
          hour,
          minute
        )

      if (!cancelled) {
        setNextReminderAt(next)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    enabled,
    hour,
    minute,
    sortedDays,
  ])

  function toggleDay(
    day: IsoWeekday
  ) {
    setSelectedDays((current) =>
      current.includes(day)
        ? current.filter(
            (item) => item !== day
          )
        : [...current, day]
    )
  }

  function handleTimeChange(
    _event: DateTimePickerEvent,
    selectedDate?: Date
  ) {
    if (Platform.OS === 'android') {
      setShowTimePicker(false)
    }

    if (!selectedDate) {
      return
    }

    setHour(
      selectedDate.getHours()
    )

    setMinute(
      selectedDate.getMinutes()
    )
  }

  async function savePreferences() {
    if (!userId || saving) return

    if (
      enabled &&
      sortedDays.length === 0
    ) {
      Alert.alert(
        'Selecciona un día',
        'Debes elegir al menos un día de entrenamiento.'
      )

      return
    }

    try {
      setSaving(true)

      let schedulesCreated = false

      if (enabled) {
        await scheduleWorkoutReminders({
          userId,
          days: sortedDays,
          hour,
          minute,
        })

        schedulesCreated = true
      }

      const timezone =
        getDeviceTimezone()

      const { error } = await supabase
        .from(
          'notification_preferences'
        )
        .upsert(
          {
            user_id: userId,

            workout_reminders_enabled:
              enabled,

            workout_reminder_days:
              sortedDays,

            workout_reminder_time:
              `${formatTime(
                hour,
                minute
              )}:00`,

            timezone,
          },
          {
            onConflict: 'user_id',
          }
        )

      if (error) {
        if (schedulesCreated) {
          await cancelWorkoutReminders(
            userId
          )
        }

        throw error
      }

      if (!enabled) {
        await cancelWorkoutReminders(
          userId
        )
      }

      const scheduled =
        await getScheduledWorkoutReminders(
          userId
        )

      setScheduledCount(
        scheduled.length
      )

      const permission =
        await hasNotificationPermission()

      setPermissionGranted(
        permission
      )

      Alert.alert(
        enabled
          ? 'Recordatorios activados'
          : 'Recordatorios desactivados',

        enabled
          ? `Programamos ${scheduled.length} recordatorio${scheduled.length === 1 ? '' : 's'} semanal${scheduled.length === 1 ? '' : 'es'}.`
          : 'Los recordatorios fueron cancelados.'
      )
    } catch (error: any) {
      if (
        error instanceof
          NotificationPermissionDeniedError
      ) {
        setPermissionGranted(false)

        Alert.alert(
          'Permiso necesario',
          'Debes permitir las notificaciones para activar los recordatorios.'
        )

        return
      }

      Alert.alert(
        'No se pudo guardar',
        error.message ??
          'No se pudieron guardar los recordatorios.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function sendTestReminder() {
    if (!userId || testing) return

    try {
      setTesting(true)

      await
        scheduleTestWorkoutReminder(
          userId
        )

      setPermissionGranted(true)

      Alert.alert(
        'Notificación programada',
        'La notificación de prueba aparecerá en aproximadamente 5 segundos.'
      )
    } catch (error: any) {
      if (
        error instanceof
          NotificationPermissionDeniedError
      ) {
        setPermissionGranted(false)

        Alert.alert(
          'Permiso necesario',
          'Debes permitir las notificaciones para realizar la prueba.'
        )

        return
      }

      Alert.alert(
        'No se pudo probar',
        error.message ??
          'No se pudo programar la notificación de prueba.'
      )
    } finally {
      setTesting(false)
    }
  }

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
        contentContainerStyle={
          styles.container
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons
              name="notifications-outline"
              size={29}
              color="#166534"
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.heroEyebrow}>
              Recordatorios
            </Text>

            <Text style={styles.heroTitle}>
              Mantén tu constancia
            </Text>

            <Text
              style={styles.heroDescription}
            >
              Elige cuándo quieres que
              PlazaFit te recuerde entrenar.
            </Text>
          </View>
        </View>

        {!permissionGranted ? (
          <View style={styles.warningCard}>
            <Ionicons
              name="alert-circle-outline"
              size={23}
              color="#92400e"
            />

            <View style={{ flex: 1 }}>
              <Text
                style={styles.warningTitle}
              >
                Notificaciones desactivadas
              </Text>

              <Text
                style={styles.warningText}
              >
                Actívalas para recibir
                recordatorios en el teléfono.
              </Text>

              <Pressable
                style={
                  styles.settingsButton
                }
                onPress={() =>
                  Linking.openSettings()
                }
              >
                <Text
                  style={
                    styles.settingsButtonText
                  }
                >
                  Abrir configuración
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text
                style={styles.sectionTitle}
              >
                Recordatorios de entrenamiento
              </Text>

              <Text
                style={
                  styles.sectionDescription
                }
              >
                Recibe un aviso en los días
                seleccionados.
              </Text>
            </View>

            <Switch
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{
                false: '#d1d5db',
                true: '#86efac',
              }}
              thumbColor={
                enabled
                  ? '#16a34a'
                  : '#f9fafb'
              }
            />
          </View>
        </View>

        <View
          style={[
            styles.sectionCard,
            !enabled &&
              styles.sectionDisabled,
          ]}
        >
          <Text style={styles.label}>
            Días de entrenamiento
          </Text>

          <View style={styles.daysRow}>
            {DAYS.map((day) => {
              const selected =
                selectedDays.includes(
                  day.value
                )

              return (
                <Pressable
                  key={day.value}
                  style={[
                    styles.dayChip,
                    selected &&
                      styles.dayChipSelected,
                  ]}
                  onPress={() =>
                    toggleDay(day.value)
                  }
                  disabled={!enabled}
                  accessibilityLabel={
                    day.name
                  }
                >
                  <Text
                    style={[
                      styles.dayChipText,
                      selected &&
                        styles
                          .dayChipTextSelected,
                    ]}
                  >
                    {day.short}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <Text style={styles.selectedDays}>
            {sortedDays.length > 0
              ? sortedDays
                  .map(
                    (day) =>
                      DAYS.find(
                        (item) =>
                          item.value === day
                      )?.name
                  )
                  .filter(Boolean)
                  .join(', ')
              : 'Ningún día seleccionado'}
          </Text>
        </View>

        <View
          style={[
            styles.sectionCard,
            !enabled &&
              styles.sectionDisabled,
          ]}
        >
          <Text style={styles.label}>
            Hora
          </Text>

          <Pressable
            style={styles.timeButton}
            onPress={() =>
              setShowTimePicker(true)
            }
            disabled={!enabled}
          >
            <Ionicons
              name="time-outline"
              size={23}
              color="#166534"
            />

            <Text style={styles.timeText}>
              {formatTime(
                hour,
                minute
              )}
            </Text>

            <Ionicons
              name="chevron-forward"
              size={20}
              color="#16a34a"
            />
          </Pressable>

          {showTimePicker ? (
            <DateTimePicker
              value={createTimeDate(
                hour,
                minute
              )}
              mode="time"
              display="default"
              is24Hour
              onChange={handleTimeChange}
            />
          ) : null}
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusIcon}>
            <Ionicons
              name="calendar-outline"
              size={23}
              color="#166534"
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.statusLabel}>
              Próximo recordatorio
            </Text>

            <Text style={styles.statusValue}>
              {enabled
                ? formatNextDate(
                    nextReminderAt
                  )
                : 'Recordatorios desactivados'}
            </Text>

            <Text style={styles.statusCount}>
              {scheduledCount}{' '}
              programado
              {scheduledCount === 1
                ? ''
                : 's'}{' '}
              en este dispositivo
            </Text>
          </View>
        </View>

        <Pressable
          style={[
            styles.saveButton,
            saving &&
              styles.buttonDisabled,
          ]}
          onPress={() =>
            void savePreferences()
          }
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator
              size="small"
              color="#ffffff"
            />
          ) : (
            <>
              <Ionicons
                name="save-outline"
                size={20}
                color="#ffffff"
              />

              <Text
                style={
                  styles.saveButtonText
                }
              >
                Guardar recordatorios
              </Text>
            </>
          )}
        </Pressable>

        <Pressable
          style={styles.testButton}
          onPress={() =>
            void sendTestReminder()
          }
          disabled={testing}
        >
          {testing ? (
            <ActivityIndicator
              size="small"
              color="#166534"
            />
          ) : (
            <>
              <Ionicons
                name="notifications-outline"
                size={19}
                color="#166534"
              />

              <Text
                style={
                  styles.testButtonText
                }
              >
                Enviar notificación de prueba
              </Text>
            </>
          )}
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

  container: {
    padding: 16,
    paddingBottom: 30,
    gap: 14,
  },

  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,

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
    color: '#bbf7d0',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },

  heroTitle: {
    color: '#ffffff',
    fontSize: 21,
    fontWeight: '900',
    marginTop: 2,
  },

  heroDescription: {
    color: '#dcfce7',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },

  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,

    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 17,
    padding: 16,
  },

  warningTitle: {
    color: '#92400e',
    fontSize: 15,
    fontWeight: '800',
  },

  warningText: {
    color: '#92400e',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },

  settingsButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
  },

  settingsButtonText: {
    color: '#92400e',
    fontWeight: '800',
  },

  sectionCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dcfce7',
    borderRadius: 18,
    padding: 17,
  },

  sectionDisabled: {
    opacity: 0.5,
  },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  sectionTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },

  sectionDescription: {
    color: '#6b7280',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },

  label: {
    color: '#16a34a',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 12,
  },

  daysRow: {
    flexDirection: 'row',
    gap: 7,
  },

  dayChip: {
    flex: 1,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  dayChipSelected: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },

  dayChipText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '800',
  },

  dayChipTextSelected: {
    color: '#ffffff',
  },

  selectedDays: {
    color: '#6b7280',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 11,
  },

  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,

    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 14,
    padding: 14,
  },

  timeText: {
    flex: 1,
    color: '#111827',
    fontSize: 20,
    fontWeight: '900',
  },

  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,

    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 18,
    padding: 16,
  },

  statusIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  statusLabel: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },

  statusValue: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 3,
  },

  statusCount: {
    color: '#15803d',
    fontSize: 12,
    marginTop: 4,
  },

  saveButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,

    backgroundColor: '#16a34a',
    borderRadius: 15,
  },

  saveButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },

  testButton: {
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

  testButtonText: {
    color: '#166534',
    fontWeight: '800',
  },

  buttonDisabled: {
    opacity: 0.65,
  },
})