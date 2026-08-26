import Ionicons from '@expo/vector-icons/Ionicons'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { ImageViewerModal } from '../../../components/media/ImageViewerModal'
import { supabase } from '../../../lib/supabase'
import type { Database } from '../../../types/database.types'

type MachineType = Database['public']['Tables']['machine_types']['Row']
type MachineImage = Database['public']['Tables']['machine_type_images']['Row']
type MachineTip = Database['public']['Tables']['machine_type_tips']['Row']
type PlazaRoutine = Database['public']['Tables']['plaza_routines']['Row']

type RoutineStepLink = {
  routine_id: number
}

function getMachineImageUrl(path: string) {
  const { data } = supabase.storage
    .from('machine-images')
    .getPublicUrl(path)

  return data.publicUrl
}

export default function MachineDetailScreen() {
  const { id, plazaId, plazaMachineId } = useLocalSearchParams<{
    id: string
    plazaId?: string
    plazaMachineId?: string
    origin?: string
  }>()

  const [machine, setMachine] = useState<MachineType | null>(null)
  const [images, setImages] = useState<MachineImage[]>([])
  const [tips, setTips] = useState<MachineTip[]>([])
  const [relatedRoutines, setRelatedRoutines] = useState<PlazaRoutine[]>([])
  const [plazaName, setPlazaName] = useState<string | null>(null)
  const [resolvedPlazaMachineId, setResolvedPlazaMachineId] =
    useState<number | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [imageViewerVisible, setImageViewerVisible] = useState(false)
  const [imageViewerIndex, setImageViewerIndex] = useState(0)

  const fetchMachineData = useCallback(async () => {
    if (!id) return

    try {
      setLoading(true)
      setLoadError(null)

      const machineId = Number(id)
      const selectedPlazaId = plazaId ? Number(plazaId) : null
      const selectedPlazaMachineId = plazaMachineId
        ? Number(plazaMachineId)
        : null

      const [machineRes, imagesRes, tipsRes, routineLinksRes] =
        await Promise.all([
          supabase
            .from('machine_types')
            .select('*')
            .eq('id', machineId)
            .single(),
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
          supabase
            .from('plaza_routine_steps')
            .select('routine_id')
            .eq('machine_type_id', machineId),
        ])

      if (machineRes.error) throw machineRes.error
      if (imagesRes.error) throw imagesRes.error
      if (tipsRes.error) throw tipsRes.error
      if (routineLinksRes.error) throw routineLinksRes.error

      setMachine(machineRes.data ?? null)
      setImages(imagesRes.data ?? [])
      setTips(tipsRes.data ?? [])

      const routineIds = Array.from(
        new Set(
          ((routineLinksRes.data ?? []) as RoutineStepLink[]).map(
            (item) => item.routine_id
          )
        )
      )

      if (routineIds.length > 0) {
        let routineQuery = supabase
          .from('plaza_routines')
          .select('*')
          .in('id', routineIds)
          .order('is_featured', { ascending: false })
          .order('created_at', { ascending: true })

        if (selectedPlazaId) {
          routineQuery = routineQuery.eq('plaza_id', selectedPlazaId)
        }

        const { data: routinesData, error: routinesError } = await routineQuery

        if (routinesError) throw routinesError

        setRelatedRoutines((routinesData ?? []) as PlazaRoutine[])
      } else {
        setRelatedRoutines([])
      }

      if (selectedPlazaId) {
        const { data: plazaData, error: plazaError } = await supabase
          .from('plazas')
          .select('nombre')
          .eq('id', selectedPlazaId)
          .single()

        if (plazaError) throw plazaError
        setPlazaName(plazaData?.nombre ?? null)
      } else {
        setPlazaName(null)
      }

      if (selectedPlazaMachineId) {
        setResolvedPlazaMachineId(selectedPlazaMachineId)
      } else if (selectedPlazaId) {
        const { data: plazaMachineData, error: plazaMachineError } =
          await supabase
            .from('plaza_machines')
            .select('id')
            .eq('plaza_id', selectedPlazaId)
            .eq('machine_type_id', machineId)
            .maybeSingle()

        if (plazaMachineError) throw plazaMachineError
        setResolvedPlazaMachineId(plazaMachineData?.id ?? null)
      } else {
        setResolvedPlazaMachineId(null)
      }
    } catch (error: any) {
      console.error('Error loading machine detail:', error)
      setLoadError(error.message ?? 'No se pudo cargar la máquina.')
    } finally {
      setLoading(false)
    }
  }, [id, plazaId, plazaMachineId])

  useEffect(() => {
    void fetchMachineData()
  }, [fetchMachineData])


  const imageUrls = useMemo(
    () => images.map((image) => getMachineImageUrl(image.storage_path)),
    [images]
  )

  const primaryImage = images[0] ?? null
  const extraImages = images.slice(1)

  const recommendTips = useMemo(
    () => tips.filter((tip) => tip.tip_type === 'recommend'),
    [tips]
  )

  const avoidTips = useMemo(
    () => tips.filter((tip) => tip.tip_type === 'avoid'),
    [tips]
  )

  function openImageViewer(index: number) {
    if (imageUrls.length === 0) return

    setImageViewerIndex(index)
    setImageViewerVisible(true)
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    )
  }

  if (loadError || !machine) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={44} color="#dc2626" />
        <Text style={styles.errorTitle}>No se pudo abrir la máquina</Text>
        <Text style={styles.errorText}>
          {loadError ?? 'No se encontró la máquina.'}
        </Text>
        <Pressable style={styles.retryButton} onPress={() => void fetchMachineData()}>
          <Text style={styles.retryButtonText}>Reintentar</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {primaryImage ? (
          <View style={styles.heroWrapper}>
            <Pressable
              style={styles.heroPressable}
              onPress={() => openImageViewer(0)}
            >
              <Image
                source={{ uri: imageUrls[0] }}
                style={styles.heroImage}
              />
            </Pressable>

            <Pressable
              style={styles.photoCountBadge}
              onPress={() => openImageViewer(0)}
            >
              <Ionicons name="images-outline" size={15} color="#ffffff" />
              <Text style={styles.photoCountText}>
                {imageUrls.length} {imageUrls.length === 1 ? 'foto' : 'fotos'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={42} color="#15803d" />
            <Text style={styles.imagePlaceholderText}>Sin imagen</Text>
          </View>
        )}

        <View style={styles.identityBlock}>
          <Text style={styles.title}>{machine.name}</Text>

          {machine.category ? (
            <View style={styles.categoryBadge}>
              <Ionicons name="barbell-outline" size={14} color="#166534" />
              <Text style={styles.categoryBadgeText}>{machine.category}</Text>
            </View>
          ) : null}
        </View>

        {plazaId && plazaName ? (
          <View style={styles.contextCard}>
            <View style={styles.contextHeader}>
              <View style={styles.contextIcon}>
                <Ionicons name="location-outline" size={20} color="#166534" />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.contextLabel}>Disponible en</Text>
                <Text style={styles.contextTitle}>{plazaName}</Text>
              </View>
            </View>

            <View style={styles.contextActions}>
              <Pressable
                style={styles.contextButton}
                onPress={() =>
                  router.push({
                    pathname: '/plaza/[id]',
                    params: { id: String(plazaId) },
                  })
                }
              >
                <Ionicons name="map-outline" size={18} color="#166534" />
                <Text style={styles.contextButtonText}>Ver plaza</Text>
              </Pressable>

              {resolvedPlazaMachineId ? (
                <Pressable
                  style={styles.reportButton}
                  onPress={() =>
                    router.push({
                      pathname: '/reporte/[id]',
                      params: { id: String(resolvedPlazaMachineId) },
                    })
                  }
                >
                  <Ionicons name="warning-outline" size={18} color="#ffffff" />
                  <Text style={styles.reportButtonText}>Reportar</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.label}>Descripción</Text>
          <Text style={styles.description}>
            {machine.description ?? 'Sin descripción disponible'}
          </Text>
        </View>

        {extraImages.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.label, styles.labelWithoutMargin]}>
                Más imágenes
              </Text>
              <Text style={styles.sectionCount}>{imageUrls.length} fotos</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.galleryRow}
            >
              {extraImages.map((image, index) => (
                <Pressable
                  key={image.id}
                  onPress={() => openImageViewer(index + 1)}
                >
                  <Image
                    source={{ uri: imageUrls[index + 1] }}
                    style={styles.galleryImage}
                  />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.tipCardSuccess}>
          <View style={styles.tipHeaderRow}>
            <View style={styles.tipIconSuccess}>
              <Ionicons name="checkmark-circle" size={18} color="#166534" />
            </View>
            <Text style={styles.tipTitleSuccess}>Cómo usarla</Text>
          </View>

          {recommendTips.length === 0 ? (
            <Text style={styles.emptyTextSuccess}>
              No hay recomendaciones todavía.
            </Text>
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
            <Text style={styles.emptyTextDanger}>
              No hay advertencias todavía.
            </Text>
          ) : (
            avoidTips.map((tip) => (
              <View key={tip.id} style={styles.tipItem}>
                <Text style={styles.bulletDanger}>•</Text>
                <Text style={styles.tipTextDark}>{tip.content}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>
            {plazaId
              ? 'Rutinas disponibles en esta plaza'
              : 'Rutinas donde se usa esta máquina'}
          </Text>

          {relatedRoutines.length === 0 ? (
            <Text style={styles.emptyText}>
              No hay rutinas relacionadas todavía.
            </Text>
          ) : (
            relatedRoutines.map((routine) => (
              <Pressable
                key={routine.id}
                style={styles.routineCard}
                onPress={() =>
                  router.push({
                    pathname: '/rutina/[id]',
                    params: { id: String(routine.id) },
                  })
                }
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.routineHeaderRow}>
                    <Text style={styles.routineTitle}>{routine.title}</Text>

                    {routine.is_featured ? (
                      <View style={styles.featuredBadge}>
                        <Text style={styles.featuredBadgeText}>Destacada</Text>
                      </View>
                    ) : null}
                  </View>

                  {routine.description ? (
                    <Text style={styles.routineDescription} numberOfLines={2}>
                      {routine.description}
                    </Text>
                  ) : null}

                  <View style={styles.routineMetaRow}>
                    {routine.goal ? (
                      <Text style={styles.routineMeta}>{routine.goal}</Text>
                    ) : null}

                    {routine.difficulty ? (
                      <Text style={styles.routineMeta}>
                        {routine.difficulty}
                      </Text>
                    ) : null}

                    {routine.estimated_minutes ? (
                      <Text style={styles.routineMeta}>
                        {routine.estimated_minutes} min
                      </Text>
                    ) : null}
                  </View>
                </View>

                <Ionicons name="chevron-forward" size={21} color="#16a34a" />
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      <ImageViewerModal
        visible={imageViewerVisible}
        images={imageUrls}
        initialIndex={imageViewerIndex}
        title={machine.name}
        onClose={() => setImageViewerVisible(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f0fdf4',
  },
  scrollView: {
    flex: 1,
  },
  container: {
    padding: 16,
    paddingBottom: 34,
    gap: 14,
  },
  center: {
    flex: 1,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  heroWrapper: {
    height: 250,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#dcfce7',
    position: 'relative',
  },
  heroPressable: {
    flex: 1,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    height: 250,
    borderRadius: 20,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imagePlaceholderText: {
    color: '#15803d',
    fontSize: 15,
    fontWeight: '700',
  },
  photoCountBadge: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(17,24,39,0.78)',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  photoCountText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  identityBlock: {
    gap: 8,
  },
  title: {
    color: '#111827',
    fontSize: 29,
    fontWeight: '900',
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
  },
  categoryBadgeText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 17,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  label: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 9,
  },
  labelWithoutMargin: {
    marginBottom: 0,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },
  sectionCount: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  description: {
    color: '#374151',
    fontSize: 15,
    lineHeight: 23,
  },
  galleryRow: {
    gap: 10,
  },
  galleryImage: {
    width: 170,
    height: 115,
    borderRadius: 13,
    backgroundColor: '#dcfce7',
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 20,
  },
  contextCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 17,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  contextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  contextIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextLabel: {
    color: '#16a34a',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  contextTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 2,
  },
  contextActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  contextButton: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,
  },
  contextButtonText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '800',
  },
  reportButton: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#dc2626',
    borderRadius: 12,
  },
  reportButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  tipCardSuccess: {
    backgroundColor: '#dcfce7',
    borderRadius: 18,
    padding: 17,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  tipCardDanger: {
    backgroundColor: '#fee2e2',
    borderRadius: 18,
    padding: 17,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipIconDanger: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipTitleSuccess: {
    color: '#166534',
    fontSize: 16,
    fontWeight: '900',
  },
  tipTitleDanger: {
    color: '#991b1b',
    fontSize: 16,
    fontWeight: '900',
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 5,
  },
  bulletSuccess: {
    color: '#16a34a',
    fontSize: 18,
    lineHeight: 22,
  },
  bulletDanger: {
    color: '#dc2626',
    fontSize: 18,
    lineHeight: 22,
  },
  tipTextDark: {
    flex: 1,
    color: '#111827',
    fontSize: 14,
    lineHeight: 21,
  },
  emptyTextSuccess: {
    color: '#166534',
    fontSize: 14,
  },
  emptyTextDanger: {
    color: '#991b1b',
    fontSize: 14,
  },
  routineCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#ecfdf5',
    paddingVertical: 13,
  },
  routineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  routineTitle: {
    flex: 1,
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  routineDescription: {
    color: '#4b5563',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  routineMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 8,
  },
  routineMeta: {
    color: '#166534',
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '700',
  },
  featuredBadge: {
    backgroundColor: '#16a34a',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  featuredBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  errorTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 12,
  },
  errorText: {
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
  },
  retryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 16,
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },
})
