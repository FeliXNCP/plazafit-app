import Ionicons from '@expo/vector-icons/Ionicons'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getOpenAIPilotState, type PilotState } from '../../services/home-gym/openai-plan-service'
import { getAIGenerationGate, type GenerationMethod } from '../../services/home-gym/generation-ui-policy'

type Props = {
  visible: boolean
  hasActivePlan: boolean
  onClose: () => void
  onRules: () => void
  onAI: () => void
}

/** Elegir un método no ejecuta una generación: hace falta confirmar el botón inferior. */
export function PlanGenerationSheet({ visible, hasActivePlan, onClose, onRules, onAI }: Props) {
  const insets = useSafeAreaInsets()
  const [method, setMethod] = useState<GenerationMethod | null>(null)
  const [state, setState] = useState<PilotState | null>(null)
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(Date.now())
  const submitted = useRef(false)
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    submitted.current = false
    setMethod(null)
    setState(null)
    setLoading(true)
    // Solo lee Supabase; no llama al proveedor ni consume una solicitud.
    void getOpenAIPilotState().then((result) => {
      if (!cancelled) setState(result)
    }).catch(() => {
      if (!cancelled) setState(null)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [visible])
  const gate = getAIGenerationGate(state, now)
  const canContinue = method === 'rules' || (method === 'ai' && !loading && (gate.canGenerate || !!gate.resumeRequest))
  const actionLabel = method === 'rules' ? (hasActivePlan ? 'Reemplazar con reglas' : 'Crear con reglas')
    : gate.resumeRequest ? (gate.resumeRequest.status === 'ready' ? 'Revisar propuesta' : 'Ver solicitud pendiente')
      : 'Continuar con IA'
  function confirm() {
    if (!canContinue || submitted.current) return
    submitted.current = true
    method === 'rules' ? onRules() : onAI()
  }
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cerrar selector de generación" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16), marginTop: insets.top + 12 }]} accessibilityViewIsModal>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <View style={styles.flex}>
                <Text style={styles.eyebrow}>HOME GYM</Text>
                <Text style={styles.title}>{hasActivePlan ? 'Crear nuevo plan' : 'Crear mi plan'}</Text>
              </View>
              <Pressable style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar">
                <Ionicons name="close" size={23} color="#166534" />
              </Pressable>
            </View>
            <Text style={styles.body}>Elige cómo preparar tu semana. Ambos métodos usan tu perfil y ejercicios compatibles.</Text>
            {(['rules', 'ai'] as const).map((option) => (
              <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: method === option }}
                style={[styles.option, method === option && styles.selected]} onPress={() => setMethod(option)}>
                <View style={styles.icon}><Ionicons name={option === 'rules' ? 'git-branch-outline' : 'sparkles-outline'} size={23} color="#166534" /></View>
                <View style={styles.flex}>
                  <Text style={styles.optionTitle}>{option === 'rules' ? 'Reglas PlazaFit' : 'Con IA'}</Text>
                  <Text style={styles.optionText}>{option === 'rules'
                    ? 'Crea y guarda el plan con reglas predefinidas, sin usar solicitudes de IA.'
                    : 'Recibe una propuesta y revísala antes de usarla. La generación utiliza una solicitud de IA.'}</Text>
                </View>
                <Ionicons name={method === option ? 'checkmark-circle' : 'ellipse-outline'} size={22} color="#16a34a" />
              </Pressable>
            ))}
            {method === 'ai' && (loading
              ? <View style={styles.status}><ActivityIndicator color="#166534" /><Text style={styles.small}>Consultando disponibilidad…</Text></View>
              : <Text style={styles.small}>{gate.resumeRequest ? 'Ya tienes una solicitud. La abriremos sin generar otra.' : gate.message ?? `${gate.remaining} solicitudes disponibles hoy. La llamada se confirmará en la siguiente pantalla.`}</Text>)}
            {hasActivePlan && method === 'rules' ? <View style={styles.warning}>
              <Text style={styles.warningText}>Al confirmar se archivará tu plan actual. El historial se conserva; el nuevo plan comienza con sus propios días y progreso.</Text>
            </View> : <Text style={styles.small}>{hasActivePlan ? 'Tu plan actual se conserva mientras revisas una propuesta con IA.' : 'Puedes crear tu primer plan directamente con cualquiera de los dos métodos.'}</Text>}
            <Pressable onPress={confirm} disabled={!canContinue} accessibilityRole="button" style={[styles.primary, !canContinue && styles.disabled]}>
              <Text style={styles.primaryText}>{method ? actionLabel : 'Selecciona un método'}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '94%', borderTopLeftRadius: 25, borderTopRightRadius: 25, backgroundColor: '#f0fdf4' },
  content: { padding: 20, gap: 14 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12 }, flex: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#15803d', fontWeight: '800', fontSize: 11 }, title: { color: '#111827', fontSize: 24, fontWeight: '800', marginTop: 3 },
  close: { width: 44, height: 44, backgroundColor: '#fff', borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  body: { color: '#4b5563', fontSize: 14, lineHeight: 21 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#fff', borderColor: '#dcfce7', borderWidth: 1, borderRadius: 17 },
  selected: { borderColor: '#16a34a', backgroundColor: '#dcfce7' }, icon: { width: 44, height: 44, backgroundColor: '#f0fdf4', borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { color: '#111827', fontSize: 16, fontWeight: '800' }, optionText: { color: '#4b5563', fontSize: 13, lineHeight: 19, marginTop: 4 },
  status: { flexDirection: 'row', gap: 8, alignItems: 'center' }, small: { color: '#6b7280', fontSize: 12, lineHeight: 18 },
  warning: { padding: 13, borderRadius: 12, backgroundColor: '#fef3c7' }, warningText: { color: '#92400e', fontSize: 13, lineHeight: 19 },
  primary: { minHeight: 50, backgroundColor: '#16a34a', borderRadius: 14, padding: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 }, disabled: { opacity: 0.45 },
})
