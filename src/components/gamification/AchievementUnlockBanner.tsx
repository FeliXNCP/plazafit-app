import Ionicons from '@expo/vector-icons/Ionicons'
import { useAudioPlayer } from 'expo-audio'
import * as Haptics from 'expo-haptics'
import {
    type ComponentProps,
    useEffect,
    useRef,
} from 'react'
import {
    Animated,
    Easing,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type IoniconName =
  ComponentProps<typeof Ionicons>['name']

export type AchievementUnlockNotice = {
  id: string | number
  name: string
  description?: string
  xpReward: number
  iconName?: IoniconName
}

type Props = {
  achievement: AchievementUnlockNotice | null
  onDismiss: () => void
  onPress?: () => void
}

export function AchievementUnlockBanner({
  achievement,
  onDismiss,
  onPress,
}: Props) {
  const insets = useSafeAreaInsets()

  const translateY = useRef(
    new Animated.Value(-140)
  ).current

  const opacity = useRef(
    new Animated.Value(0)
  ).current

  const scale = useRef(
    new Animated.Value(0.96)
  ).current

  const player = useAudioPlayer(
    require('../../../assets/sounds/achievement-unlocked.mp3')
  )

  useEffect(() => {
    if (!achievement) return

    let cancelled = false

    translateY.setValue(-140)
    opacity.setValue(0)
    scale.setValue(0.96)

    /*
     * Sonido y respuesta háptica.
     * Si uno falla, la animación sigue funcionando.
     */
    void (async () => {
      try {
        player.volume = 0.65
        await player.seekTo(0)
        player.play()
      } catch (error) {
        console.warn(
          'No se pudo reproducir el sonido del logro:',
          error
        )
      }

      try {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        )
      } catch (error) {
        console.warn(
          'No se pudo ejecutar la vibración del logro:',
          error
        )
      }
    })()

    const animation = Animated.sequence([
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          damping: 16,
          stiffness: 180,
          mass: 0.8,
          useNativeDriver: true,
        }),

        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(
            Easing.cubic
          ),
          useNativeDriver: true,
        }),

        Animated.spring(scale, {
          toValue: 1,
          damping: 14,
          stiffness: 190,
          useNativeDriver: true,
        }),
      ]),

      Animated.delay(2800),

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -140,
          duration: 240,
          easing: Easing.in(
            Easing.cubic
          ),
          useNativeDriver: true,
        }),

        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
    ])

    animation.start(({ finished }) => {
      if (
        finished &&
        !cancelled
      ) {
        onDismiss()
      }
    })

    return () => {
      cancelled = true
      animation.stop()
    }
  }, [
    achievement?.id,
    onDismiss,
    opacity,
    player,
    scale,
    translateY,
  ])

  if (!achievement) {
    return null
  }

  const iconName =
    achievement.iconName ??
    'trophy-outline'

  return (
    <Animated.View
      style={[
        styles.positioner,
        {
          top: insets.top + 10,
          opacity,
          transform: [
            { translateY },
            { scale },
          ],
        },
      ]}
    >
      <Pressable
        style={styles.banner}
        onPress={
          onPress ?? onDismiss
        }
      >
        <View style={styles.iconContainer}>
          <Ionicons
            name={iconName}
            size={27}
            color="#166534"
          />
        </View>

        <View style={styles.content}>
          <Text style={styles.eyebrow}>
            Logro desbloqueado
          </Text>

          <Text
            style={styles.title}
            numberOfLines={1}
          >
            {achievement.name}
          </Text>

          {achievement.description ? (
            <Text
              style={styles.description}
              numberOfLines={2}
            >
              {achievement.description}
            </Text>
          ) : null}
        </View>

        <View style={styles.xpBadge}>
          <Text style={styles.xpText}>
            +{achievement.xpReward}
          </Text>

          <Text style={styles.xpLabel}>
            XP
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  positioner: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 1000,
    elevation: 20,
  },

  banner: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,

    backgroundColor: '#14532d',

    borderWidth: 1,
    borderColor: '#4ade80',
    borderRadius: 17,

    paddingHorizontal: 14,
    paddingVertical: 12,

    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 5,
    },
  },

  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,

    backgroundColor: '#dcfce7',

    alignItems: 'center',
    justifyContent: 'center',
  },

  content: {
    flex: 1,
  },

  eyebrow: {
    color: '#86efac',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  title: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 2,
  },

  description: {
    color: '#dcfce7',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
  },

  xpBadge: {
    minWidth: 48,
    backgroundColor: '#fef3c7',

    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 12,

    paddingHorizontal: 8,
    paddingVertical: 7,

    alignItems: 'center',
    justifyContent: 'center',
  },

  xpText: {
    color: '#92400e',
    fontSize: 15,
    fontWeight: '900',
  },

  xpLabel: {
    color: '#92400e',
    fontSize: 9,
    fontWeight: '800',
    marginTop: 1,
  },
})