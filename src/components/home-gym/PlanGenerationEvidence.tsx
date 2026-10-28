import { StyleSheet, Text, View } from 'react-native'
import { equipmentName, formatPlanDays, type PlanFacts, type GenerationTrace } from '../../services/home-gym/personalization-types'

type Props = { requestText: string; featureVersion: string | null; facts: PlanFacts | null }
export function PlanGenerationEvidence({ requestText, featureVersion, facts }: Props) {
  if (!featureVersion && !facts) return null
  return <View style={styles.wrap}>
    {featureVersion ? <View style={styles.request}>
      <Text style={styles.label}>TU PETICIÓN</Text>
      <Text selectable style={styles.text}>{requestText || 'Sin petición adicional. Se utilizó tu perfil Home Gym.'}</Text>
      <Text style={styles.small}>Guardada al confirmar esta solicitud; no cambia al editar tus preferencias después.</Text>
    </View> : null}
    {facts ? <View style={styles.facts}>
      <Text style={styles.title}>Así quedó la propuesta</Text>
      <Text style={styles.text}>{facts.plan_days} días programados · {facts.profile_days} días en el perfil utilizado.</Text>
      {facts.equipment.length === 0 ? <Text style={styles.text}>Los ejercicios de esta propuesta no requieren equipamiento del catálogo.</Text> :
        facts.equipment.map((item) => <View key={item.code} style={styles.row}>
          <Text style={styles.equipment}>{equipmentName(item.code)}</Text>
          <Text style={styles.text}>{formatPlanDays(item.day_numbers)}{item.day_count > 0 ? ` · ${item.day_count} de ${facts.plan_days} días` : ''}</Text>
        </View>)}
      <Text style={styles.small}>PlazaFit cuenta estos datos en el plan. No son una autoevaluación de la IA ni una verificación completa del texto libre: contrástalos con tu petición y revisa los ejercicios.</Text>
    </View> : featureVersion ? <Text style={styles.small}>El resumen calculado aparecerá cuando exista una propuesta válida.</Text> : null}
  </View>
}

const dateLabel = (value: string | null): string => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('es-CL') : 'No registrado'
export function GenerationTraceDetails({ trace, requestId, appliedPlanId }: { trace: GenerationTrace | null; requestId: string; appliedPlanId: string | null }) {
  if (!trace) return <Text style={styles.small}>Este registro no incluye la ficha de trazabilidad nueva.</Text>
  const rows: [string, string][] = [
    ['Solicitud de PlazaFit', requestId],
    ['Proveedor registrado', trace.provider ?? 'No registrado'],
    ['Modelo solicitado', trace.requested_model ?? 'No registrado'],
    ['Modelo devuelto', trace.response_model ?? 'No recibido'],
    ['Respuesta del proveedor', trace.response_id ?? 'No recibida'],
    ['Petición al proveedor (x-request-id)', trace.provider_request_id ?? 'No recibida'],
    ['Envío registrado', dateLabel(trace.dispatched_at)],
    ['Finalización registrada', dateLabel(trace.completed_at)],
    ['Versión del prompt ejecutado', trace.prompt_version ?? 'No registrada en esta solicitud'],
    ['Versión del esquema', trace.output_schema_version ?? 'No registrada en esta solicitud'],
    ['Validador', trace.validator_version ?? 'Sin informe'],
    ['Plan aplicado', appliedPlanId ?? 'Aún no aplicado'],
  ]
  return <View style={styles.trace}>
    <Text style={styles.title}>Registro de esta generación</Text>
    <Text style={styles.small}>Datos del servidor. Los identificadores recibidos permiten contrastar el registro; no son una certificación independiente.</Text>
    {rows.map(([label, value]) => <View key={label} style={styles.traceRow}>
      <Text style={styles.label}>{label}</Text><Text selectable style={styles.mono}>{value}</Text>
    </View>)}
  </View>
}
const styles = StyleSheet.create({
  wrap: { gap: 12, marginVertical: 8 }, request: { borderRadius: 14, padding: 14, backgroundColor: '#f0fdf4', gap: 7 },
  facts: { borderWidth: 1, borderColor: '#dcfce7', borderRadius: 14, padding: 14, gap: 9 },
  label: { fontSize: 11, fontWeight: '800', color: '#166534' }, title: { fontSize: 17, fontWeight: '800', color: '#111827' },
  text: { fontSize: 14, lineHeight: 21, color: '#374151' }, small: { fontSize: 12, lineHeight: 18, color: '#6b7280' },
  row: { paddingTop: 9, borderTopWidth: 1, borderTopColor: '#ecfdf5', gap: 3 }, equipment: { fontSize: 14, color: '#166534', fontWeight: '700' },
  trace: { gap: 9, paddingTop: 12 }, traceRow: { gap: 4, paddingVertical: 6 }, mono: { fontSize: 12, lineHeight: 18, color: '#374151' },
})
