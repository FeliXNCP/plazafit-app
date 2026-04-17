import Ionicons from '@expo/vector-icons/Ionicons'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
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
type PlazaRoutine = Database['public']['Tables']['plaza_routines']['Row']

type RoutineStepLink = {
  routine_id: number
}

export default function MachineDetailScreen() {
  const { id, plazaId, plazaMachineId } = useLocalSearchParams<{
     id: string; 
     plazaId?: string
     plazaMachineId?: string
     origin?: string
    }>()

  const [machine, setMachine] = useState<MachineType | null>(null)
  const [images, setImages] = useState<MachineImage[]>([])
  const [tips, setTips] = useState<MachineTip[]>([])
  const [relatedRoutines, setRelatedRoutines] = useState<PlazaRoutine[]>([])
  const [loading, setLoading] = useState(true)
  const [plazaName, setPlazaName] = useState<string | null>(null)
  const [resolvedPlazaMachineId, setResolvedPlazaMachineId] = useState<number | null>(null)

  useEffect(() => {
    if (!id) return
    fetchMachineData()
  }, [id, plazaId])

  async function fetchMachineData() {
    try {
      setLoading(true)

      const machineId = Number(id)
      const selectedPlazaId = plazaId ? Number(plazaId) : null
      const selectedPlazaMachineId = plazaMachineId ? Number(plazaMachineId) : null

      const [machineRes, imagesRes, tipsRes, routineLinksRes] = await Promise.all([
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
        const { data: plazaData } = await supabase
          .from('plazas')
          .select('nombre')
          .eq('id', selectedPlazaId)
          .single()

        setPlazaName(plazaData?.nombre ?? null)
      } else {
        setPlazaName(null)
      }

      if (selectedPlazaMachineId) {
        setResolvedPlazaMachineId(selectedPlazaMachineId)
      } else if (selectedPlazaId) {
        const { data: plazaMachineData } = await supabase
          .from('plaza_machines')
          .select('id')
          .eq('plaza_id', selectedPlazaId)
          .eq('machine_type_id', machineId)
          .maybeSingle()

        setResolvedPlazaMachineId(plazaMachineData?.id ?? null)
      } else {
        setResolvedPlazaMachineId(null)
      }
    } catch (error: any) {
      console.error('Error loading machine detail:', error)
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


      {plazaId && plazaName ? (
        <View style={styles.contextCard}>
          <Text style={styles.contextLabel}>Plaza</Text>
          <Text style={styles.contextTitle}>{plazaName}</Text>

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
                <Text style={styles.reportButtonText}>Reportar problema</Text>
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

      <View style={styles.card}>
        <Text style={styles.label}>
          {plazaId ? 'Rutinas disponibles en esta plaza' : 'Rutinas donde se usa esta máquina'}
        </Text>

        {relatedRoutines.length === 0 ? (
          <Text style={styles.emptyText}>No hay rutinas relacionadas todavía.</Text>
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
                  <Text style={styles.routineDescription}>{routine.description}</Text>
                ) : null}

                <View style={styles.routineMetaRow}>
                  {routine.goal ? (
                    <Text style={styles.routineMeta}>{routine.goal}</Text>
                  ) : null}

                  {routine.difficulty ? (
                    <Text style={styles.routineMeta}>{routine.difficulty}</Text>
                  ) : null}

                  {routine.estimated_minutes ? (
                    <Text style={styles.routineMeta}>
                      {routine.estimated_minutes} min
                    </Text>
                  ) : null}
                </View>
              </View>
            </Pressable>
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
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 6,
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
  routineCard: {
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#ecfdf5',
  },
  routineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  routineTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  routineDescription: {
    fontSize: 14,
    color: '#4b5563',
    marginTop: 6,
    lineHeight: 20,
  },
  routineMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  routineMeta: {
    fontSize: 12,
    color: '#166534',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  featuredBadge: {
    backgroundColor: '#16a34a',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  featuredBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  contextCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  contextLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16a34a',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  contextTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  contextActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  contextButton: {
    flex: 1,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  contextButtonText: {
    color: '#166534',
    fontWeight: '700',
  },
  reportButton: {
    flex: 1,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  reportButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
})