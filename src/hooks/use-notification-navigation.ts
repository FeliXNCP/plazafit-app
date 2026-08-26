import * as Notifications from 'expo-notifications'
import {
    type Href,
    router,
} from 'expo-router'
import { useEffect } from 'react'
import {
    WORKOUT_REMINDER_TYPE,
} from '../services/notifications/workout-reminder-service'

export function
useNotificationNavigation() {
  useEffect(() => {
    function redirectFromNotification(
      notification:
        Notifications.Notification
    ) {
      const data =
        notification.request.content
          .data as
          | Record<string, unknown>
          | undefined

      if (
        data?.type !==
          WORKOUT_REMINDER_TYPE
      ) {
        return
      }

      const url = data?.url

      if (
        typeof url === 'string'
      ) {
        router.push(
          url as Href
        )
      }
    }

    const initialResponse =
      Notifications
        .getLastNotificationResponse()

    if (
      initialResponse?.notification
    ) {
      redirectFromNotification(
        initialResponse.notification
      )

      void Notifications
        .clearLastNotificationResponseAsync()
    }

    const subscription =
      Notifications
        .addNotificationResponseReceivedListener(
          (response) => {
            redirectFromNotification(
              response.notification
            )
          }
        )

    return () => {
      subscription.remove()
    }
  }, [])
}