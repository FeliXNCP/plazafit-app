import Ionicons from '@expo/vector-icons/Ionicons'
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { applyOpenAIRequest, beginOpenAIRequest, beginAdjustmentRequest, executeOpenAIRequest, getOpenAIPilotState,
  openAIErrorMessage, readOpenAIRequest, type GenerationRequest, type PilotState } from '../../services/home-gym/openai-plan-service'
import { PlanAdjustmentComparison } from '../../components/home-gym/PlanAdjustmentComparison'
import { comparePlans } from '../../services/home-gym/plan-adjustment-types'
import { GenerationTraceDetails, PlanGenerationEvidence } from '../../components/home-gym/PlanGenerationEvidence'
import { MAX_PERSONAL_REQUEST, normalizePersonalRequest } from '../../services/home-gym/personalization-types'
import { getAIGenerationGate } from '../../services/home-gym/generation-ui-policy'

const LABELS: Record<string, string> = {
  queued: 'Solicitud pendiente', processing: 'Preparando tu propuesta', ready: 'Revisa tu nuevo plan',
  rejected: 'La propuesta no pasó la validación', failed: 'No se completó la generación',
  expired: 'Propuesta caducada', applied: 'Plan aplicado',
}
type PlanContext = { configured: boolean; hasPlan: boolean; activeHomeSessionId: string | null
  planId: string | null; planName: string | null; matchesProfile: boolean }
const firstParam = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value

export default function HomeGymAIScreen() {
  const params = useLocalSearchParams<{mode?:string | string[];planId?:string | string[]}>()
  const adjusting = firstParam(params.mode) === 'adjust'
  const requestedPlanId = firstParam(params.planId) ?? null
  const [state, setState] = useState<PilotState | null>(null)
  const [selected, setSelected] = useState<GenerationRequest | null>(null)
  const [context, setContext] = useState<PlanContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requestText, setRequestText] = useState('')
  const [showDetails, setShowDetails] = useState(false)
  const [now, setNow] = useState(Date.now())
  const busyRef = useRef(false)
  const mounted = useRef(false)
  const readRevision = useRef(0)
  const scrollRef = useRef<ScrollView | null>(null)
  const proposalY = useRef(0)

  const refresh = useCallback(async () => {
    const revision = ++readRevision.current
    try {
      const [next, planResult, executionResult] = await Promise.all([
        getOpenAIPilotState(),
        supabase.rpc('get_my_active_home_gym_plan'),
        supabase.rpc('get_my_home_gym_execution_state'),
      ])
      if (!mounted.current || revision !== readRevision.current) return
      setState(next)
      setSelected((current) => next.requests.find((r) => r.id === current?.id)
        ?? getAIGenerationGate(next).resumeRequest ?? next.requests[0] ?? null)
      if (planResult.error) throw planResult.error
      if (executionResult.error) throw executionResult.error
      const plan = planResult.data as { configured?: boolean; has_active_plan?: boolean; matches_current_profile?: boolean; plan?:{id?:string;name?:string} } | null
      const execution = executionResult.data as { active_session?: { id?: string; workout_source?: string } | null } | null
      setContext({ configured: plan?.configured === true, hasPlan: plan?.has_active_plan === true,
        planId:plan?.plan?.id??null,planName:plan?.plan?.name??null,matchesProfile:plan?.matches_current_profile===true,
        activeHomeSessionId: execution?.active_session?.workout_source === 'home_gym' ? execution.active_session.id ?? null : null })
    } catch (e) {
      if (mounted.current && revision === readRevision.current) { setError(openAIErrorMessage(e)); setContext(null) }
    } finally {
      if (mounted.current && revision === readRevision.current) setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => {
    mounted.current = true
    setBusy(busyRef.current)
    void refresh()
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => { mounted.current = false; ++readRevision.current; clearInterval(timer) }
  }, [refresh]))

  const gate = getAIGenerationGate(state, now)
  const selectedExpired = !!selected && ['queued', 'processing', 'ready'].includes(selected.status)
    && Date.parse(selected.expires_at) <= now
  // Al caducar, solo consultar; nunca se vuelve a enviar automáticamente al proveedor.
  const refreshedExpiry = useRef<string | null>(null)
  useEffect(() => {
    if (selectedExpired && selected && refreshedExpiry.current !== selected.id && !busy) {
      refreshedExpiry.current = selected.id
      void refresh()
    }
  }, [selectedExpired, selected, busy, refresh])

  async function run(operation: () => Promise<GenerationRequest>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await operation()
      if (mounted.current) setSelected(result)
    } catch (e) {
      if (mounted.current) setError(openAIErrorMessage(e))
    } finally {
      // begin/claim pudieron confirmarse pese a un fallo HTTP: conservar consulta del hotfix.
      if (mounted.current) await refresh()
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const adjustmentReady = !adjusting || (!!state?.adjustment_enabled && !!context?.hasPlan && context.matchesProfile &&
    requestedPlanId !== null && requestedPlanId === context.planId && requestText.trim().length>0)
  const canGenerate = !!context?.configured && !context.activeHomeSessionId && !busy && gate.canGenerate && adjustmentReady
  const comparison = selected?.generation_mode==='adjust' ? comparePlans(selected.base_plan,selected.candidate) : null
  const comparisonMissing = selected?.generation_mode==='adjust' && !!selected.candidate && !comparison
  const unchangedAdjustment = selected?.generation_mode==='adjust' && comparison?.hasChanges===false

  function generate() {
    if (!canGenerate || busyRef.current) return
    const personalized = state?.personalization_enabled === true
    let note: string
    try { note = normalizePersonalRequest(personalized ? requestText : '') }
    catch (e) { setError(openAIErrorMessage(e)); return }
    Keyboard.dismiss()
    Alert.alert(adjusting ? 'Ajustar el plan con IA' : 'Crear propuesta con IA',
      'Usaremos tu perfil y catálogo compatible. Si escribiste una petición, se guardará con esta solicitud en PlazaFit y se enviará a OpenAI. No incluyas datos personales, diagnósticos ni claves. La llamada consume una solicitud aunque falle. Tu plan no cambiará hasta que lo aceptes.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: adjusting ? 'Generar ajuste' : 'Generar propuesta', onPress: () => void run(async () => {
          const request = adjusting
            ? await beginAdjustmentRequest(requestedPlanId!, note)
            : await beginOpenAIRequest(note, personalized)
          if (mounted.current) { setSelected(request); setRequestText('') }
          return request.status === 'queued' ? executeOpenAIRequest(request.id) : request
        }) },
      ])
  }
  function sendQueued() {
    if (!selected || selected.status !== 'queued' || selectedExpired || busyRef.current) return
    const requestId = selected.id
    Alert.alert('Enviar solicitud pendiente', 'Esta acción enviará la solicitud a la IA. Puede consumir API; tu plan no se reemplazará.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Enviar', onPress: () => void run(() => executeOpenAIRequest(requestId)) },
    ])
  }
  function apply() {
    if (!selected || selected.status !== 'ready' || selectedExpired || busyRef.current || !context || context.activeHomeSessionId || comparisonMissing) return
    const requestId = selected.id
    Alert.alert(unchangedAdjustment ? 'Mantener el plan actual' : context.hasPlan ? 'Reemplazar el plan actual' : 'Usar este plan',
      unchangedAdjustment ? 'No se detectaron cambios. Se conserva la misma versión, sus días y su progreso. La solicitud de IA ya realizada mantiene su consumo.' : context.hasPlan
        ? 'Se archivará el plan actual. El historial se conserva, pero el nuevo plan tendrá sus propios días y progreso.'
        : 'Este será tu primer plan Home Gym. Podrás comenzar sus sesiones desde Mi plan.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Usar plan', onPress: () => void run(async () => {
          const result = await applyOpenAIRequest(requestId)
          if (result.status === 'applied') Alert.alert('Tu plan está listo', unchangedAdjustment ? 'Se conservó el mismo plan y su progreso.' : 'Ya puedes comenzar a entrenar.', [
            { text: 'Ver plan', onPress: () => router.replace('/plan-casa') },
          ])
          return result
        }) },
      ])
  }
  function openExisting() {
    if (!gate.resumeRequest) return
    setSelected(gate.resumeRequest)
    scrollRef.current?.scrollTo({ y: proposalY.current, animated: true })
  }
  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color="#16a34a" size="large" /></SafeAreaView>
  const status = selectedExpired ? 'expired' : selected?.status
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <Stack.Screen options={{ title: adjusting ? 'Ajustar con IA' : 'Crear con IA' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Ionicons name="sparkles-outline" size={27} color="#dcfce7" />
          <Text style={styles.heroTitle}>{adjusting ? 'Ajusta tu semana' : 'Tu semana, con IA'}</Text>
          <Text style={styles.heroText}>{adjusting ? 'Partimos de tu plan actual. Describe un cambio y revisa las diferencias antes de aplicarlo.' : 'Una propuesta con tus ejercicios compatibles. Tú decides si usarla.'}</Text>
        </View>
        {adjusting ? <View style={styles.card}>
          <Text style={styles.title}>Plan de origen</Text>
          <Text style={styles.text}>{context?.planName ?? 'Plan no disponible'}</Text>
          {!state?.adjustment_enabled ? <Text style={styles.warningText}>Los ajustes aún no están habilitados.</Text> : null}
          {requestedPlanId !== context?.planId ? <Text style={styles.warningText}>El plan cambió. Vuelve a Mi plan y abre el ajuste desde la versión actual.</Text> : null}
          {context?.hasPlan && !context.matchesProfile ? <Text style={styles.warningText}>Tus preferencias cambiaron. Crea un plan actualizado en vez de ajustar esta versión.</Text> : null}
          <Text style={styles.small}>No cambia tus preferencias ni el plan mientras revisas. Si aceptas cambios, se crea otra versión con sus propios días y progreso; el historial se conserva.</Text>
        </View> : null}
        {error ? <View style={styles.warning}><Text style={styles.warningText}>{error}</Text></View> : null}
        {context?.configured === false ? <View style={styles.warning}>
          <Text style={styles.warningText}>Primero completa tus preferencias de Home Gym.</Text>
          <Pressable style={styles.secondary} onPress={() => router.push('/home-gym')}><Text style={styles.secondaryText}>Completar preferencias</Text></Pressable>
        </View> : null}
        {context?.activeHomeSessionId ? <View style={styles.warning}>
          <Text style={styles.warningText}>Tienes un entrenamiento en curso. Finalízalo o abandónalo antes de cambiar el plan.</Text>
          <Pressable style={styles.secondary} onPress={() => router.push({ pathname: '/entrenamiento/[id]', params: { id: context.activeHomeSessionId! } })}><Text style={styles.secondaryText}>Continuar entrenamiento</Text></Pressable>
        </View> : null}

        {gate.resumeRequest ? (
          gate.resumeRequest.id !== selected?.id ? <Pressable style={styles.primary} disabled={busy} onPress={openExisting}>
            <Text style={styles.primaryText}>{gate.resumeRequest.status === 'ready' ? 'Revisar propuesta pendiente' : 'Ver solicitud pendiente'}</Text>
          </Pressable> : null
        ) : <>
          {state?.personalization_enabled && context?.configured ? <View style={styles.card}>
            <Text style={styles.title}>{adjusting ? '¿Qué quieres cambiar?' : '¿Qué te gustaría priorizar?'}</Text>
            <Text style={styles.text}>{adjusting ? 'Describe el ajuste. Se pedirá conservar el resto cuando sea posible; podrás comprobar todos los cambios antes de confirmar.' : 'Opcional. Cuéntanos una preferencia para esta semana: un equipo que quieras usar o un ejercicio que prefieras evitar.'}</Text>
            <TextInput value={requestText} onChangeText={(value) => setRequestText(Array.from(value).slice(0, MAX_PERSONAL_REQUEST).join(''))}
              editable={!busy && !context.activeHomeSessionId} multiline maxLength={MAX_PERSONAL_REQUEST * 2}
              placeholder={adjusting ? "Por ejemplo: cambia la bicicleta del Día 4 por marcha en el lugar y conserva el resto cuando sea posible." : "Por ejemplo: usa la bicicleta en los días 2 y 4 del plan."}
              placeholderTextColor="#6b7280" textAlignVertical="top" style={styles.preferenceInput}
              accessibilityLabel={adjusting ? "Cambio solicitado al plan actual" : "Petición opcional para la generación con IA"} />
            <Text style={styles.counter}>{Array.from(requestText).length}/{MAX_PERSONAL_REQUEST}</Text>
            <Text style={styles.small}>Se utilizará tu perfil actual. Habla de Día 1, Día 2… del plan. No incluyas datos personales, información médica ni contraseñas.</Text>
            <Text style={styles.small}>El texto se guarda con la solicitud y se envía a OpenAI solo cuando confirmas. No modifica el perfil ni elimina los límites del catálogo.</Text>
          </View> : null}
          <Text style={styles.small}>{gate.message ?? `${gate.remaining ?? 0} ${(gate.remaining ?? 0) === 1 ? 'solicitud de IA disponible' : 'solicitudes de IA disponibles'} hoy.`}</Text>
          <Pressable style={[styles.primary, !canGenerate && styles.disabled]} disabled={!canGenerate} onPress={generate} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="sparkles-outline" size={20} color="#fff" />}
            <Text style={styles.primaryText}>{busy ? 'Procesando…' : adjusting ? 'Generar ajuste' : 'Generar propuesta'}</Text>
          </Pressable>
        </>}
        <Pressable disabled={busy} style={styles.refresh} onPress={() => { setError(null); void refresh() }} accessibilityRole="button">
          <Ionicons name="refresh-outline" size={17} color="#166534" /><Text style={styles.secondaryText}>Actualizar estado</Text>
        </Pressable>

        {selected ? <View style={styles.card} onLayout={(event) => { proposalY.current = event.nativeEvent.layout.y }}>
          <Text style={styles.title}>{LABELS[status ?? selected.status]}</Text>
          <PlanGenerationEvidence requestText={selected.request_preference} featureVersion={selected.request_preference_version} facts={selected.plan_facts} />
          {status === 'queued' ? <><Text style={styles.text}>La solicitud está guardada y todavía no se ha confirmado su envío.</Text><Pressable disabled={busy} style={styles.secondary} onPress={sendQueued}><Text style={styles.secondaryText}>Enviar solicitud pendiente</Text></Pressable></> : null}
          {status === 'processing' ? <><View style={styles.statusLine}><ActivityIndicator color="#166534" /><Text style={styles.text}>Preparando o confirmando el resultado…</Text></View><Text style={styles.small}>Puedes actualizar el estado. Eso no genera otra propuesta ni reenvía la solicitud.</Text></> : null}
          {status === 'expired' ? <Text style={styles.warningText}>Esta propuesta ya caducó. Tu plan actual se conserva; una nueva generación requiere otra confirmación.</Text> : null}
          {selected.error_code ? <Text style={styles.warningText}>{openAIErrorMessage(selected.error_code)}</Text> : null}
          {(selected.validation?.errors.length ?? 0) > 0 ? <Text style={styles.warningText}>El resultado no cumple las reglas del catálogo y no se aplicó. Puedes revisar el motivo en Detalles de generación.</Text> : null}
          {(selected.validation?.warnings.length ?? 0) > 0 ? <Text style={styles.small}>Hay observaciones sobre la propuesta; revísalas en los detalles antes de usarla.</Text> : null}
          {selected.generation_mode==='adjust' && selected.candidate ?
            <PlanAdjustmentComparison before={selected.base_plan} after={selected.candidate} labels={selected.exercise_labels} version={selected.base_plan_info?.version??null} /> : null}
          {selected.candidate ? <>
            <Text style={styles.planTitle}>{selected.candidate.name}</Text>
            <Text style={styles.small}>{status === 'applied' ? 'Propuesta guardada como plan.' : 'Vista previa: aún no reemplaza tu plan.'}</Text>
            {selected.candidate.days.map((day) => <View key={day.day_number} style={styles.day}>
              <Text style={styles.title}>Día {day.day_number} · {day.title}</Text>
              <Text style={styles.small}>{selected.validation?.days.find((d) => d.day_number === day.day_number)?.estimated_minutes ?? '—'} min estimados</Text>
              {day.steps.map((step, index) => <View key={`${index}-${step.exercise_id}`} style={styles.step}>
                <Text style={styles.stepTitle}>{index + 1}. {selected.exercise_labels[String(step.exercise_id)] ?? `Ejercicio ${step.exercise_id}`}</Text>
                <Text style={styles.small}>{step.duration_seconds !== null ? `${step.duration_seconds} s` : `${step.sets} series · ${step.reps} repeticiones`} · descanso {step.rest_seconds} s</Text>
              </View>)}
            </View>)}
          </> : null}
          {status === 'ready' ? <Pressable disabled={busy || !context || !!context.activeHomeSessionId || comparisonMissing} style={[styles.primary, (busy || !context || !!context.activeHomeSessionId || comparisonMissing) && styles.disabled]} onPress={apply}><Text style={styles.primaryText}>{unchangedAdjustment ? 'Conservar mi plan' : selected.generation_mode==='adjust' ? 'Aplicar estos cambios' : 'Usar este plan'}</Text></Pressable> : null}
          {status === 'applied' ? <Pressable style={styles.secondary} onPress={() => router.replace('/plan-casa')}><Text style={styles.secondaryText}>Ver mi plan</Text></Pressable> : null}
        </View> : null}

        <View style={styles.card}>
          <Pressable style={styles.detailsToggle} onPress={() => setShowDetails((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showDetails }}>
            <Text style={styles.secondaryText}>Detalles de generación</Text><Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={19} color="#166534" />
          </Pressable>
          {showDetails ? <>
            <Text style={styles.small}>Modelo configurado: {state?.model ?? '—'}</Text>
            <Text style={styles.small}>{state?.used_today ?? 0} de {state?.daily_limit ?? '—'} solicitudes hoy · reinicio 00:00 UTC.</Text>
            <Text style={styles.small}>Reserva interna: USD {(state?.reserved_usd ?? 0).toFixed(2)} de {(state?.pilot_budget_usd ?? 0).toFixed(2)}. Cada solicitud reserva USD 0,03; no equivale al cargo del proveedor.</Text>
            {selected ? <>
              <Text style={styles.small}>Solicitud {selected.id.slice(0, 8)} · {new Date(selected.created_at).toLocaleString('es-CL')} · {LABELS[status ?? selected.status]}</Text>
              <Text style={styles.small}>Operación: {selected.generation_mode==='adjust'?'Ajuste de plan existente':'Creación de plan'}</Text>
              <Text style={styles.small}>Modelo de la solicitud: {selected.model}</Text>
              {selected.usage_status === 'reported' ? <Text style={styles.small}>Tokens: {selected.input_tokens} entrada · {selected.output_tokens} salida. Estimación: USD {(selected.estimated_cost_usd ?? 0).toFixed(6)}. Confirma el cargo en el proveedor.</Text>
                : <Text style={styles.small}>{selected.usage_status === 'not_sent' ? 'Envío al proveedor no registrado.' : 'Consumo sin confirmar; no se supone que sea cero.'}</Text>}
              <GenerationTraceDetails trace={selected.trace} requestId={selected.id} appliedPlanId={selected.applied_plan_id} />
              {selected.validation?.errors.map((issue, i) => <Text key={`e-${i}`} style={styles.warningText}>{issue.code} · {issue.path}</Text>)}
              {selected.validation?.warnings.map((issue, i) => <Text key={`w-${i}`} style={styles.small}>Observación: {issue.code} · {issue.path}</Text>)}
            </> : null}
            <Text style={styles.small}>No se reintenta automáticamente ni se cambia de modelo. Actualizar estado solo consulta Supabase.</Text>
            {(state?.requests.length ?? 0) > 0 ? <Text style={styles.title}>Solicitudes recientes</Text> : null}
            {state?.requests.map((r) => <Pressable disabled={busy} key={r.id} style={styles.step} onPress={() => void run(() => readOpenAIRequest(r.id))}>
              <Text style={styles.stepTitle}>{LABELS[r.status]} · {r.id.slice(0, 8)}</Text><Text style={styles.small}>{new Date(r.created_at).toLocaleString('es-CL')}</Text>
            </Pressable>)}
          </> : null}
        </View>
        <Text style={styles.small}>La propuesta se revisa con reglas técnicas. No sustituye una evaluación profesional del entrenamiento.</Text>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f0fdf4' }, center: { flex: 1, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, paddingBottom: 30, gap: 14 }, hero: { backgroundColor: '#166534', borderRadius: 20, padding: 20, gap: 9 },
  heroTitle: { color: '#fff', fontWeight: '900', fontSize: 25 }, heroText: { color: '#dcfce7', fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: '#fff', borderColor: '#dcfce7', borderWidth: 1, borderRadius: 18, padding: 17, gap: 10 }, title: { color: '#111827', fontSize: 17, fontWeight: '800' },
  text: { color: '#374151', fontSize: 14, lineHeight: 21, flexShrink: 1 }, small: { color: '#6b7280', fontSize: 12, lineHeight: 18 }, warning: { backgroundColor: '#fef3c7', borderRadius: 14, padding: 14, gap: 9 },
  warningText: { color: '#92400e', fontSize: 13, lineHeight: 20 }, primary: { minHeight: 50, backgroundColor: '#16a34a', borderRadius: 14, padding: 14, alignItems: 'center', justifyContent: 'center', gap: 8, flexDirection: 'row' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center' }, secondary: { minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: '#86efac', backgroundColor: '#fff', padding: 13, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#166534', fontWeight: '800', fontSize: 13, textAlign: 'center' }, disabled: { opacity: 0.5 },
  planTitle: { color: '#166534', fontWeight: '900', fontSize: 22, marginTop: 6 }, day: { borderTopWidth: 1, borderTopColor: '#dcfce7', paddingTop: 15, gap: 7 },
  step: { paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#ecfdf5', gap: 3 }, stepTitle: { fontWeight: '700', fontSize: 14, color: '#111827' },
  detailsToggle: { minHeight: 38, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, statusLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  preferenceInput: { minHeight: 120, borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 12, padding: 12, fontSize: 15, lineHeight: 22, color: '#111827', backgroundColor: '#f9fafb' },
  counter: { textAlign: 'right', color: '#6b7280', fontSize: 12 },
  refresh: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
})
