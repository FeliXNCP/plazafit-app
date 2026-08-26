import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

export const WORKOUT_REMINDER_CHANNEL_ID =
  'workout-reminders'

export const WORKOUT_REMINDER_TYPE =
  'workout_reminder'

export type IsoWeekday =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7

export type WorkoutReminderSchedule = {
  userId: string
  days: IsoWeekday[]
  hour: number
  minute: number
}

type ScheduleOptions = {
  requestPermission?: boolean
}

export class NotificationPermissionDeniedError
  extends Error {
  constructor() {
    super('NOTIFICATION_PERMISSION_DENIED')
    this.name =
      'NotificationPermissionDeniedError'
  }
}

/*
 * SDK 55 no presenta una notificación
 * foreground automáticamente.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

function normalizeDays(
  days: number[]
): IsoWeekday[] {
  return Array.from(
    new Set(
      days.filter(
        (day) =>
          Number.isInteger(day) &&
          day >= 1 &&
          day <= 7
      )
    )
  )
    .sort((a, b) => a - b)
    .map((day) => day as IsoWeekday)
}

/*
 * PlazaFit usa ISO:
 * lunes = 1
 * domingo = 7
 *
 * Expo usa:
 * domingo = 1
 * lunes = 2
 */
function isoToExpoWeekday(
  day: IsoWeekday
) {
  return day === 7
    ? 1
    : day + 1
}

function isPermissionGranted(
  permission:
    Notifications.NotificationPermissionsStatus
) {
  if (permission.granted) {
    return true
  }

  if (
    Platform.OS === 'ios' &&
    permission.ios
  ) {
    return [
      Notifications
        .IosAuthorizationStatus
        .AUTHORIZED,

      Notifications
        .IosAuthorizationStatus
        .PROVISIONAL,

      Notifications
        .IosAuthorizationStatus
        .EPHEMERAL,
    ].includes(permission.ios.status)
  }

  return false
}

export async function
ensureWorkoutReminderChannel() {
  if (Platform.OS !== 'android') {
    return
  }

  await Notifications
    .setNotificationChannelAsync(
      WORKOUT_REMINDER_CHANNEL_ID,
      {
        name:
          'Recordatorios de entrenamiento',

        importance:
          Notifications
            .AndroidImportance.HIGH,



        vibrationPattern: [
          0,
          250,
          150,
          250,
        ],

        lightColor: '#16a34a',
      }
    )
}

export async function
hasNotificationPermission() {
  const permission =
    await Notifications
      .getPermissionsAsync()

  return isPermissionGranted(
    permission
  )
}

export async function
requestNotificationPermission() {
  await ensureWorkoutReminderChannel()

  const currentPermission =
    await Notifications
      .getPermissionsAsync()

  if (
    isPermissionGranted(
      currentPermission
    )
  ) {
    return true
  }

  const requestedPermission =
    await Notifications
      .requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: false,
          allowSound: true,
        },
      })

  return isPermissionGranted(
    requestedPermission
  )
}

function isWorkoutReminderRequest(
  request: Notifications.NotificationRequest,
  userId?: string
) {
  const data =
    request.content.data as
      | Record<string, unknown>
      | undefined

  if (
    data?.type !==
      WORKOUT_REMINDER_TYPE
  ) {
    return false
  }

  if (
    userId &&
    data?.userId !== userId
  ) {
    return false
  }

  return true
}

export async function
getScheduledWorkoutReminders(
  userId?: string
) {
  const requests =
    await Notifications
      .getAllScheduledNotificationsAsync()

  return requests.filter((request) =>
    isWorkoutReminderRequest(
      request,
      userId
    )
  )
}

export async function
cancelWorkoutReminders(
  userId: string
) {
  const reminders =
    await getScheduledWorkoutReminders(
      userId
    )

  await Promise.all(
    reminders.map((reminder) =>
      Notifications
        .cancelScheduledNotificationAsync(
          reminder.identifier
        )
    )
  )
}

export async function
cancelOtherUsersWorkoutReminders(
  currentUserId: string
) {
  const reminders =
    await getScheduledWorkoutReminders()

  const otherUsers =
    reminders.filter((request) => {
      const data =
        request.content.data as
          | Record<string, unknown>
          | undefined

      return (
        data?.userId !==
        currentUserId
      )
    })

  await Promise.all(
    otherUsers.map((request) =>
      Notifications
        .cancelScheduledNotificationAsync(
          request.identifier
        )
    )
  )
}

function buildWeeklyTrigger(
  day: IsoWeekday,
  hour: number,
  minute: number
): Notifications.WeeklyTriggerInput {
  const trigger: Notifications.WeeklyTriggerInput = {
    type:
      Notifications
        .SchedulableTriggerInputTypes
        .WEEKLY,

    weekday:
      isoToExpoWeekday(day),

    hour,
    minute,
  }

  if (Platform.OS === 'android') {
    trigger.channelId =
      WORKOUT_REMINDER_CHANNEL_ID
  }

  return trigger
}

export async function
getNextWorkoutReminderDate(
  days: IsoWeekday[],
  hour: number,
  minute: number
) {
  const normalizedDays =
    normalizeDays(days)

  if (
    normalizedDays.length === 0
  ) {
    return null
  }

  const dates = await Promise.all(
    normalizedDays.map((day) =>
      Notifications
        .getNextTriggerDateAsync(
          buildWeeklyTrigger(
            day,
            hour,
            minute
          )
        )
    )
  )

  const validDates = dates.filter(
    (date): date is number =>
      typeof date === 'number'
  )

  if (validDates.length === 0) {
    return null
  }

  return Math.min(...validDates)
}

export async function
scheduleWorkoutReminders(
  schedule: WorkoutReminderSchedule,
  options: ScheduleOptions = {}
) {
  const {
    requestPermission = true,
  } = options

  await ensureWorkoutReminderChannel()

  const permissionGranted =
    requestPermission
      ? await requestNotificationPermission()
      : await hasNotificationPermission()

  if (!permissionGranted) {
    throw new
      NotificationPermissionDeniedError()
  }

  const normalizedDays =
    normalizeDays(schedule.days)

  if (
    normalizedDays.length === 0
  ) {
    throw new Error(
      'REMINDER_DAYS_REQUIRED'
    )
  }

  if (
    schedule.hour < 0 ||
    schedule.hour > 23 ||
    schedule.minute < 0 ||
    schedule.minute > 59
  ) {
    throw new Error(
      'INVALID_REMINDER_TIME'
    )
  }

  await cancelWorkoutReminders(
    schedule.userId
  )

  const createdIdentifiers: string[] =
    []

  try {
    for (
      const day of normalizedDays
    ) {
      const identifier =
        await Notifications
          .scheduleNotificationAsync({
            content: {
              title:
                'Tu entrenamiento te espera 💪',

              body:
                'Tienes una meta semanal en marcha. Abre PlazaFit y completa una rutina.',

              sound: true,

              data: {
                type:
                  WORKOUT_REMINDER_TYPE,

                userId:
                  schedule.userId,

                url: '/',
              },
            },

            trigger:
              buildWeeklyTrigger(
                day,
                schedule.hour,
                schedule.minute
              ),
          })

      createdIdentifiers.push(
        identifier
      )
    }
  } catch (error) {
    await Promise.all(
      createdIdentifiers.map(
        (identifier) =>
          Notifications
            .cancelScheduledNotificationAsync(
              identifier
            )
      )
    )

    throw error
  }

  const nextTriggerAt =
    await getNextWorkoutReminderDate(
      normalizedDays,
      schedule.hour,
      schedule.minute
    )

  return {
    identifiers:
      createdIdentifiers,

    nextTriggerAt,
  }
}

export async function
scheduleTestWorkoutReminder(
  userId: string
) {
  await ensureWorkoutReminderChannel()

  const permissionGranted =
    await requestNotificationPermission()

  if (!permissionGranted) {
    throw new
      NotificationPermissionDeniedError()
  }

  return Notifications
    .scheduleNotificationAsync({
      content: {
        title:
          'Recordatorio PlazaFit listo ✅',

        body:
          'Tus recordatorios de entrenamiento están funcionando.',

        sound: true,

        data: {
          type:
            WORKOUT_REMINDER_TYPE,

          userId,

          url: '/',
          isTest: true,
        },
      },

      trigger: {
        type:
          Notifications
            .SchedulableTriggerInputTypes
            .TIME_INTERVAL,

        seconds: 5,

        ...(Platform.OS === 'android'
          ? {
              channelId:
                WORKOUT_REMINDER_CHANNEL_ID,
            }
          : {}),
      },
    })
}