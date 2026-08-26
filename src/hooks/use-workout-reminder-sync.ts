import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
    type IsoWeekday,
    cancelOtherUsersWorkoutReminders,
    cancelWorkoutReminders,
    getScheduledWorkoutReminders,
    hasNotificationPermission,
    scheduleWorkoutReminders,
} from '../services/notifications/workout-reminder-service'

function parseTime(
  value: string
) {
  const [
    hourValue,
    minuteValue,
  ] = value.split(':')

  return {
    hour:
      Number(hourValue ?? 19),

    minute:
      Number(minuteValue ?? 0),
  }
}

export function
useWorkoutReminderSync(
  userId?: string
) {
  useEffect(() => {
    if (!userId) return

    let cancelled = false

    void (async () => {
      try {
        await
          cancelOtherUsersWorkoutReminders(
            userId
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

        if (
          cancelled ||
          error
        ) {
          return
        }

        if (
          !data?.workout_reminders_enabled
        ) {
          await cancelWorkoutReminders(
            userId
          )

          return
        }
        
        const reminderDays = (
            data.workout_reminder_days ?? []
        ) as IsoWeekday[]

        const permissionGranted =
          await hasNotificationPermission()

        if (
          cancelled ||
          !permissionGranted
        ) {
          return
        }

        const scheduled =
          await getScheduledWorkoutReminders(
            userId
          )

        /*
         * Después de reinstalar la app,
         * la preferencia puede existir en
         * Supabase pero no los schedules.
         */
        if (
          scheduled.length ===
          data.workout_reminder_days.length
        ) {
          return
        }

        const {
          hour,
          minute,
        } = parseTime(
          data.workout_reminder_time
        )

        await scheduleWorkoutReminders(
          {
            userId,

            days: reminderDays,
            hour,
            minute,
          },
          {
            requestPermission: false,
          }
        )
      } catch (error) {
        console.warn(
          'No se pudieron sincronizar los recordatorios:',
          error
        )
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId])
}