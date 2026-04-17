import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native'
import { supabase } from '../../../lib/supabase'
import { useSession } from '../../../providers/session-provider'

type PlazaMachineContext = {
  id: number
  plaza_id: number
  machine_type_id: number
  machine_types:
    | {
        name: string
      }
    | {
        name: string
      }[]
    | null
  plazas:
    | {
        nombre: string
      }
    | {
        nombre: string
      }[]
    | null
}

const ISSUE_TYPES = [
  { key: 'broken', label: 'Averiada' },
  { key: 'unsafe', label: 'Insegura' },
  { key: 'missing_parts', label: 'Faltan piezas' },
  { key: 'qr_damaged', label: 'QR dañado' },
  { key: 'dirty', label: 'Suciedad / estado' },
  { key: 'other', label: 'Otro' },
]

export default function EquipmentReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useSession()

  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [context, setContext] = useState<PlazaMachineContext | null>(null)
  const [issueType, setIssueType] = useState('broken')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!id) return
    fetchContext()
  }, [id])

  async function fetchContext() {
    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('plaza_machines')
        .select(
          `
          id,
          plaza_id,
          machine_type_id,
          machine_types (
            name
          ),
          plazas (
            nombre
          )
        `
        )
        .eq('id', Number(id))
        .single()

      if (error) throw error
      setContext((data ?? null) as PlazaMachineContext)
    } catch (error: any) {
      Alert.alert('Error', error.message ?? 'No se pudo cargar el contexto del reporte.')
      router.back()
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit() {
    if (!session?.user?.id || !context) return

    const trimmed = message.trim()

    if (trimmed.length < 10) {
      Alert.alert(
        'Descripción insuficiente',
        'Describe el problema con más detalle.'
      )
      return
    }

    try {
      setSending(true)

      const { error } = await supabase.from('equipment_reports').insert({
        user_id: session.user.id,
        plaza_id: context.plaza_id,
        plaza_machine_id: context.id,
        machine_type_id: context.machine_type_id,
        issue_type: issueType,
        message: trimmed,
      })

      if (error) throw error

      Alert.alert(
        'Reporte enviado',
        'Gracias. Tu reporte fue registrado correctamente.'
      )

      router.back()
    } catch (error: any) {
      Alert.alert('Error', error.message ?? 'No se pudo enviar el reporte.')
    } finally {
      setSending(false)
    }
  }

  const machineType = Array.isArray(context?.machine_types)
    ? context?.machine_types[0]
    : context?.machine_types

  const plaza = Array.isArray(context?.plazas)
    ? context?.plazas[0]
    : context?.plazas

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (!context) {
    return (
      <View style={styles.center}>
        <Text>No se encontró la máquina a reportar.</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Máquina</Text>
        <Text style={styles.title}>{machineType?.name ?? 'Máquina'}</Text>

        <Text style={styles.labelSecondary}>Plaza</Text>
        <Text style={styles.subtitle}>{plaza?.nombre ?? 'Plaza'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Tipo de problema</Text>

        <View style={styles.chipsWrap}>
          {ISSUE_TYPES.map((item) => {
            const active = issueType === item.key

            return (
              <Pressable
                key={item.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setIssueType(item.key)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Describe la falla</Text>

        <TextInput
          style={styles.textArea}
          multiline
          value={message}
          onChangeText={setMessage}
          placeholder="Ejemplo: la bicicleta no opone resistencia y el pedal derecho suena extraño."
          placeholderTextColor="#6b7280"
          textAlignVertical="top"
        />

        <Text style={styles.helperText}>
          Intenta describir el problema con claridad para facilitar su revisión.
        </Text>
      </View>

      <Pressable
        style={styles.submitButton}
        onPress={handleSubmit}
        disabled={sending}
      >
        <Text style={styles.submitButtonText}>
          {sending ? 'Enviando...' : 'Enviar reporte'}
        </Text>
      </Pressable>
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16a34a',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  labelSecondary: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16a34a',
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 16,
    color: '#374151',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  chipText: {
    color: '#166534',
    fontWeight: '600',
    fontSize: 13,
  },
  chipTextActive: {
    color: '#fff',
  },
  textArea: {
    minHeight: 140,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 14,
    backgroundColor: '#fff',
    padding: 14,
    fontSize: 15,
    color: '#111827',
  },
  helperText: {
    marginTop: 10,
    fontSize: 13,
    color: '#6b7280',
  },
  submitButton: {
    backgroundColor: '#16a34a',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
})