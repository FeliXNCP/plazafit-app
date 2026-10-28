import { Text, View, StyleSheet } from 'react-native'
import { comparePlans, formatDose } from '../../services/home-gym/plan-adjustment-types'
import type { CandidatePlan } from '../../services/home-gym/openai-plan-service'
type Props={before:CandidatePlan|null;after:CandidatePlan|null;labels:Record<string,string>;version:number|null}
export function PlanAdjustmentComparison({before,after,labels,version}:Props) {
  const result=comparePlans(before,after)
  if(!result)return <View style={styles.box}><Text style={styles.title}>Comparación no disponible</Text><Text style={styles.small}>No se pudo leer la copia original. Actualiza el estado antes de aplicar.</Text></View>
  return <View style={styles.box}>
    <Text style={styles.title}>Qué cambió respecto de tu plan</Text>
    <Text style={styles.small}>Base: {result.beforeName}{version!==null?` · v${version}`:''}</Text>
    {!result.hasChanges?<Text style={styles.text}>La propuesta coincide con el plan original. Al confirmarla se conserva la misma versión y su progreso.</Text>:<>
      <Text style={styles.text}>{result.changedDays} de {result.days.length} días con cambios · {result.added} ejercicios añadidos · {result.removed} retirados</Text>
      {result.nameChanged?<Text style={styles.small}>Nombre: {result.beforeName} → {result.afterName}</Text>:null}
    </>}
    {result.days.map(day=><View key={day.dayNumber} style={styles.day}>
      <Text style={styles.dayTitle}>Día {day.dayNumber} · {day.changed?'Con cambios':'Sin cambios'}</Text>
      {day.beforeTitle!==day.afterTitle?<Text style={styles.small}>Título: {day.beforeTitle??'—'} → {day.afterTitle??'—'}</Text>:null}
      {day.beforeFocus!==day.afterFocus?<Text style={styles.small}>Enfoque: {day.beforeFocus??'—'} → {day.afterFocus??'—'}</Text>:null}
      {day.steps.filter(s=>s.kind!=='unchanged').map(step=><View key={step.exerciseId} style={styles.change}>
        <Text style={styles.changeTitle}>{step.kind==='added'?'Añadido':step.kind==='removed'?'Retirado':'Modificado'} · {labels[String(step.exerciseId)]??`Ejercicio ${step.exerciseId}`}</Text>
        {step.before?<Text style={styles.small}>Antes · paso {step.beforePosition}: {formatDose(step.before)}</Text>:null}
        {step.after?<Text style={styles.small}>Propuesta · paso {step.afterPosition}: {formatDose(step.after)}</Text>:null}
      </View>)}
      {day.unchangedSteps>0?<Text style={styles.small}>{day.unchangedSteps} pasos conservan posición y dosificación.</Text>:null}
    </View>)}
    <Text style={styles.note}>Comparación calculada por PlazaFit. Una salida y una entrada no prueban que sean un reemplazo equivalente. Revisa la propuesta completa: este resumen no verifica todo el significado de tu petición.</Text>
  </View>
}
const styles=StyleSheet.create({box:{borderRadius:15,borderWidth:1,borderColor:'#bbf7d0',padding:14,gap:9,backgroundColor:'#f0fdf4'},
 title:{fontSize:17,fontWeight:'800',color:'#111827'},text:{fontSize:14,lineHeight:21,color:'#374151'},small:{fontSize:12,lineHeight:18,color:'#4b5563'},
 day:{borderTopWidth:1,borderTopColor:'#bbf7d0',paddingTop:10,gap:6},dayTitle:{fontSize:14,fontWeight:'800',color:'#166534'},
 change:{paddingVertical:5,gap:3},changeTitle:{fontSize:13,fontWeight:'700',color:'#111827'},note:{fontSize:11,lineHeight:16,color:'#6b7280',marginTop:5}})
