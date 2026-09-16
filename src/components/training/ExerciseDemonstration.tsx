import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import { memo, useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type {
  DemonstrationFrame,
  ExerciseDemonstrationData,
} from '../../services/training/exercise-demonstration-types'

type Props = {
  demonstration: ExerciseDemonstrationData | null
  exerciseName: string
  playing: boolean
}

type FrameState = 'loading' | 'ready' | 'error'

function useReducedMotion() {
  // Hasta conocer el ajuste del dispositivo, mostramos la imagen sin movimiento.
  const [reduced, setReduced] = useState(true)
  useEffect(() => {
    let disposed = false
    let receivedEvent = false
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      receivedEvent = true
      if (!disposed) setReduced(value)
    })
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!disposed && !receivedEvent) setReduced(value)
    }).catch(() => {
      // Ante un error conservamos una referencia estática.
    })
    return () => {
      disposed = true
      listener.remove()
    }
  }, [])
  return reduced
}

function Frame({
  frame,
  onReady,
  onError,
}: {
  frame: DemonstrationFrame
  onReady: () => void
  onError: () => void
}) {
  return (
    <Image
      source={{ uri: frame.uri, cacheKey: frame.cacheKey }}
      style={styles.image}
      contentFit="contain"
      cachePolicy="memory-disk"
      transition={0}
      accessible={false}
      onLoad={onReady}
      onError={onError}
    />
  )
}

function DemonstrationContent({ demonstration, exerciseName, playing }: {
  demonstration: ExerciseDemonstrationData
  exerciseName: string
  playing: boolean
}) {
  const first = demonstration.frames[0]
  const second = demonstration.frames[1]
  const [firstState, setFirstState] = useState<FrameState>('loading')
  const [secondState, setSecondState] = useState<FrameState>('loading')
  const [timedOut, setTimedOut] = useState(false)
  const reducedMotion = useReducedMotion()
  const opacity = useRef(new Animated.Value(0)).current
  const firstReady = !!first && firstState === 'ready'
  const secondReady = !!second && secondState === 'ready'
  const pairReady = firstReady && secondReady

  useEffect(() => {
    const timeout = setTimeout(() => setTimedOut(true), 12000)
    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
    opacity.stopAnimation()
    opacity.setValue(0)
    if (!pairReady || !playing || reducedMotion) return
    const cycle = Animated.loop(Animated.sequence([
      Animated.delay(demonstration.holdMs),
      Animated.timing(opacity, {
        toValue: 1, duration: 200, easing: Easing.linear,
        useNativeDriver: true, isInteraction: false,
      }),
      Animated.delay(demonstration.holdMs),
      Animated.timing(opacity, {
        toValue: 0, duration: 200, easing: Easing.linear,
        useNativeDriver: true, isInteraction: false,
      }),
    ]))
    cycle.start()
    return () => cycle.stop()
  }, [demonstration.holdMs, opacity, pairReady, playing, reducedMotion])

  const waiting = !timedOut && ((!!first && firstState === 'loading') || (!!second && secondState === 'loading'))
  const anyReady = firstReady || secondReady

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Referencia visual</Text>
      <View
        style={styles.stage}
        pointerEvents="none"
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Referencia visual de ${exerciseName}. Consulta las instrucciones del ejercicio.`}
      >
        {first ? (
          <View style={[styles.layer, { opacity: firstReady ? 1 : 0 }]}>
            <Frame frame={first} onReady={() => setFirstState('ready')} onError={() => setFirstState('error')} />
          </View>
        ) : null}
        {second ? (
          <Animated.View style={[
            styles.layer,
            { opacity: secondReady ? (firstReady ? opacity : 1) : 0 },
          ]}>
            <Frame frame={second} onReady={() => setSecondState('ready')} onError={() => setSecondState('error')} />
          </Animated.View>
        ) : null}
        {!anyReady ? (
          <View style={styles.placeholder}>
            <Ionicons name="image-outline" color="#6b7280" size={30} />
            <Text style={styles.placeholderText}>
              {waiting ? 'Cargando referencia…' : 'Imagen no disponible. Sigue las instrucciones.'}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.caption}>
        {pairReady && !reducedMotion
          ? 'Dos posiciones de referencia; no marcan el ritmo del ejercicio.'
          : 'Referencia de postura. Sigue las indicaciones del ejercicio.'}
      </Text>
      {demonstration.attribution ? (
        demonstration.attributionUrl ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Fuente de las ilustraciones: ${demonstration.attribution}`}
            style={styles.creditLink}
            onPress={() => {
              if (!demonstration.attributionUrl) return
              void Linking.openURL(demonstration.attributionUrl).catch(() => {
                console.warn('[PlazaFit] No se pudo abrir la atribución del recurso.')
              })
            }}
          >
            <Text style={styles.creditText}>{demonstration.attribution}</Text>
          </Pressable>
        ) : <Text style={styles.creditText}>{demonstration.attribution}</Text>
      ) : null}
    </View>
  )
}

/** Sin carrusel, zoom, modal ni botones de reproducción. No modifica el reloj ni XP. */
export const ExerciseDemonstration = memo(function ExerciseDemonstration({
  demonstration,
  exerciseName,
  playing,
}: Props) {
  if (!demonstration) return null
  // Evita que una carga tardía del paso anterior contamine las nuevas imágenes.
  const key = `${demonstration.id}:${demonstration.frames.map((frame) => frame.uri).join('|')}`
  return (
    <DemonstrationContent
      key={key}
      demonstration={demonstration}
      exerciseName={exerciseName}
      playing={playing}
    />
  )
})

const styles = StyleSheet.create({
  container: { marginTop: 14, marginBottom: 4 },
  heading: { fontSize: 11, fontWeight: '800', color: '#15803d', textTransform: 'uppercase', marginBottom: 8 },
  stage: { width: '100%', height: 230, borderRadius: 14, overflow: 'hidden', backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  layer: { ...StyleSheet.absoluteFillObject },
  image: { width: '100%', height: '100%' },
  placeholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 18, gap: 8 },
  placeholderText: { color: '#6b7280', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  caption: { color: '#6b7280', fontSize: 11, lineHeight: 16, marginTop: 7 },
  creditLink: { alignSelf: 'flex-start', paddingTop: 5, paddingBottom: 5 },
  creditText: { color: '#166534', fontSize: 10, lineHeight: 15 },
})
