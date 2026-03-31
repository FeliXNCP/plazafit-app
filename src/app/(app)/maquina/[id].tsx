import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
    ActivityIndicator,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import { supabase } from '../../../lib/supabase'
import type { Database } from '../../../types/database.types'

type MachineType = Database['public']['Tables']['machine_types']['Row']
type MachineImage = Database['public']['Tables']['machine_type_images']['Row']
type MachineTip = Database['public']['Tables']['machine_type_tips']['Row']

export default function MachineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()

  const [machine, setMachine] = useState<MachineType | null>(null)
  const [images, setImages] = useState<MachineImage[]>([])
  const [tips, setTips] = useState<MachineTip[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    fetchMachineData()
  }, [id])

  async function fetchMachineData() {
    try {
      setLoading(true)

      const machineId = Number(id)

      const [machineRes, imagesRes, tipsRes] = await Promise.all([
        supabase.from('machine_types').select('*').eq('id', machineId).single(),
        supabase
          .from('machine_type_images')
          .select('*')
          .eq('machine_type_id', machineId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('machine_type_tips')
          .select('*')
          .eq('machine_type_id', machineId)
          .order('sort_order', { ascending: true }),
      ])

      if (machineRes.error) throw machineRes.error
      if (imagesRes.error) throw imagesRes.error
      if (tipsRes.error) throw tipsRes.error

      setMachine(machineRes.data ?? null)
      setImages(imagesRes.data ?? [])
      setTips(tipsRes.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  function getPublicImageUrl(path: string) {
    const { data } = supabase.storage.from('machine-images').getPublicUrl(path)
    return data.publicUrl
  }

  const primaryImage = useMemo(() => images[0] ?? null, [images])
  const extraImages = useMemo(() => images.slice(1), [images])

  const recommendTips = useMemo(
    () => tips.filter((tip) => tip.tip_type === 'recommend'),
    [tips]
  )

  const avoidTips = useMemo(
    () => tips.filter((tip) => tip.tip_type === 'avoid'),
    [tips]
  )

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (!machine) {
    return (
      <View style={styles.center}>
        <Text>No se encontró la máquina.</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {primaryImage ? (
        <Image
          source={{ uri: getPublicImageUrl(primaryImage.storage_path) }}
          style={styles.image}
        />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.imagePlaceholderText}>Sin imagen</Text>
        </View>
      )}

      <Text style={styles.title}>{machine.name}</Text>

      {machine.category ? (
        <View style={styles.categoryBadge}>
            <Ionicons name="barbell-outline" size={14} color="#166534" />
            <Text style={styles.categoryBadgeText}>{machine.category}</Text>
        </View>
        ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>Descripción</Text>
        <Text style={styles.description}>
          {machine.description ?? 'Sin descripción disponible'}
        </Text>
      </View>

      {extraImages.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.label}>Más imágenes</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.galleryRow}
          >
            {extraImages.map((img) => (
              <Image
                key={img.id}
                source={{ uri: getPublicImageUrl(img.storage_path) }}
                style={styles.galleryImage}
              />
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.tipCardSuccess}>
        <View style={styles.tipHeaderRow}>
            <View style={styles.tipIconSuccess}>
            <Ionicons name="checkmark-circle" size={18} color="#166534" />
            </View>
            <Text style={styles.tipTitleSuccess}>Cómo usarla</Text>
        </View>

        {recommendTips.length === 0 ? (
            <Text style={styles.emptyTextSuccess}>No hay recomendaciones todavía.</Text>
        ) : (
            recommendTips.map((tip) => (
            <View key={tip.id} style={styles.tipItem}>
                <Text style={styles.bulletSuccess}>•</Text>
                <Text style={styles.tipTextDark}>{tip.content}</Text>
            </View>
            ))
        )}
        </View>

        <View style={styles.tipCardDanger}>
        <View style={styles.tipHeaderRow}>
            <View style={styles.tipIconDanger}>
            <Ionicons name="alert-circle" size={18} color="#991b1b" />
            </View>
            <Text style={styles.tipTitleDanger}>Evita</Text>
        </View>

        {avoidTips.length === 0 ? (
            <Text style={styles.emptyTextDanger}>No hay advertencias todavía.</Text>
        ) : (
            avoidTips.map((tip) => (
            <View key={tip.id} style={styles.tipItem}>
                <Text style={styles.bulletDanger}>•</Text>
                <Text style={styles.tipTextDark}>{tip.content}</Text>
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
  image: {
    width: '100%',
    height: 240,
    borderRadius: 20,
    backgroundColor: '#dcfce7',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  imagePlaceholder: {
    width: '100%',
    height: 240,
    borderRadius: 20,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  imagePlaceholderText: {
    color: '#15803d',
    fontSize: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 16,
    color: '#15803d',
    marginTop: -6,
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
  description: {
    fontSize: 16,
    color: '#111827',
    lineHeight: 24,
  },
  galleryRow: {
    gap: 10,
  },
  galleryImage: {
    width: 160,
    height: 110,
    borderRadius: 12,
    backgroundColor: '#dcfce7',
  },
  emptyText: {
    fontSize: 15,
    color: '#6b7280',
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 6,
  },
  tipCardSuccess: {
    backgroundColor: '#dcfce7',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  tipCardDanger: {
    backgroundColor: '#fee2e2',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  tipHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  tipIconSuccess: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipIconDanger: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipTitleSuccess: {
    fontSize: 16,
    fontWeight: '700',
    color: '#166534',
  },
  tipTitleDanger: {
    fontSize: 16,
    fontWeight: '700',
    color: '#991b1b',
  },
  bulletSuccess: {
    fontSize: 18,
    color: '#16a34a',
    lineHeight: 22,
  },
  bulletDanger: {
    fontSize: 18,
    color: '#dc2626',
    lineHeight: 22,
  },
  tipTextDark: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    lineHeight: 22,
  },
  emptyTextSuccess: {
    fontSize: 15,
    color: '#166534',
  },
  emptyTextDanger: {
    fontSize: 15,
    color: '#991b1b',
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: -4,
  },
  categoryBadgeText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '700',
  },
  
})