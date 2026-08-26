import Ionicons from '@expo/vector-icons/Ionicons'
import { useEffect, useRef, useState } from 'react'
import {
    FlatList,
    Image,
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type ImageViewerModalProps = {
  visible: boolean
  images: string[]
  initialIndex?: number
  title?: string
  onClose: () => void
}

export function ImageViewerModal({
  visible,
  images,
  initialIndex = 0,
  title,
  onClose,
}: ImageViewerModalProps) {
  const { width } = useWindowDimensions()
  const listRef = useRef<FlatList<string> | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)

  const safeInitialIndex = Math.min(
    Math.max(initialIndex, 0),
    Math.max(images.length - 1, 0)
  )

  useEffect(() => {
    if (!visible || images.length === 0) return

    setCurrentIndex(safeInitialIndex)

    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({
        index: safeInitialIndex,
        animated: false,
      })
    }, 50)

    return () => clearTimeout(timer)
  }, [images.length, safeInitialIndex, visible, width])

  function handleMomentumScrollEnd(
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) {
    if (width <= 0) return

    const nextIndex = Math.round(
      event.nativeEvent.contentOffset.x / width
    )

    setCurrentIndex(
      Math.min(
        Math.max(nextIndex, 0),
        Math.max(images.length - 1, 0)
      )
    )
  }

  if (images.length === 0) {
    return null
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.screen}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="#000000"
        />

        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <View style={styles.headerSide} />

            <Text style={styles.title} numberOfLines={1}>
              {title ?? 'Galería'}
            </Text>

            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Cerrar galería"
            >
              <Ionicons name="close" size={25} color="#ffffff" />
            </Pressable>
          </View>

          <FlatList
            ref={listRef}
            data={images}
            horizontal
            pagingEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item, index) => `${item}-${index}`}
            getItemLayout={(_data, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            onScrollToIndexFailed={({ index }) => {
              setTimeout(() => {
                listRef.current?.scrollToOffset({
                  offset: width * index,
                  animated: false,
                })
              }, 50)
            }}
            renderItem={({ item }) => (
              <View style={[styles.imagePage, { width }]}>
                <Image
                  source={{ uri: item }}
                  style={styles.image}
                  resizeMode="contain"
                />
              </View>
            )}
          />

          <View style={styles.counterBadge}>
            <Text style={styles.counterText}>
              {currentIndex + 1} / {images.length}
            </Text>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    zIndex: 2,
  },
  headerSide: {
    width: 44,
  },
  title: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  counterBadge: {
    position: 'absolute',
    bottom: 18,
    alignSelf: 'center',
    backgroundColor: 'rgba(17,24,39,0.78)',
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  counterText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
})
