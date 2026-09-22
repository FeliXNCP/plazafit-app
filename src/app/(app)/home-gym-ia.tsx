import Ionicons from '@expo/vector-icons/Ionicons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { applyOpenAIRequest, beginOpenAIRequest, executeOpenAIRequest, getOpenAIPilotState,
  openAIErrorMessage, readOpenAIRequest, type GenerationRequest, type PilotState } from '../../services/home-gym/openai-plan-service'

const LABELS: Record<string, string> = {
  queued:'Pendiente de envío',processing:'Procesando o pendiente de confirmación',ready:'Propuesta lista para revisar',
  rejected:'Propuesta rechazada',failed:'No se completó la generación',expired:'Propuesta caducada',applied:'Propuesta aplicada',
}
export default function HomeGymAIScreen() {
  const [state,setState]=useState<PilotState | null>(null)
  const [selected,setSelected]=useState<GenerationRequest | null>(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string | null>(null)
  const busyRef=useRef(false)
  const mounted=useRef(false)
  const refresh=useCallback(async()=>{
    try {
      const next=await getOpenAIPilotState()
      if(!mounted.current)return
      setState(next)
      setSelected(current=>next.requests.find(r=>r.id===current?.id)??next.requests[0]??null)
    }catch(e){if(mounted.current)setError(openAIErrorMessage(e))}
    finally{if(mounted.current)setLoading(false)}
  },[])
  useFocusEffect(useCallback(()=>{
    mounted.current=true
    void refresh()
    return ()=>{mounted.current=false}
  },[refresh]))

  async function run(operation:()=>Promise<GenerationRequest>) {
    if(busyRef.current)return
    busyRef.current=true;setBusy(true);setError(null)
    try {
      const result=await operation()
      if(mounted.current)setSelected(result)
    }catch(e){if(mounted.current)setError(openAIErrorMessage(e))}
    finally{
      // También consultar después de un error: begin/claim pudieron confirmarse.
      // refresh() solo lee Supabase; no reenvía la solicitud a OpenAI.
      if(mounted.current)await refresh()
      busyRef.current=false
      if(mounted.current)setBusy(false)
    }
  }
  function generate() {
    Alert.alert('Generación real con OpenAI',
      'Se enviarán tu objetivo, nivel, equipamiento y catálogo compatible a OpenAI. La llamada consume API, incluso si la propuesta es rechazada. Tu plan no cambiará hasta confirmarlo.',[
        {text:'Cancelar',style:'cancel'},
        {text:'Generar propuesta',onPress:()=>void run(async()=>{
          const request=await beginOpenAIRequest()
          if(mounted.current)setSelected(request)
          return request.status==='queued'?executeOpenAIRequest(request.id):request
        })},
      ])
  }
  function apply() {
    if(!selected)return
    const requestId=selected.id
    Alert.alert('Aplicar nueva versión',
      'Se archivará el plan actual y se crearán nuevos días. El historial se conserva, pero el progreso de esta versión empieza con sus propios días. La comprobación técnica no sustituye una revisión profesional.',[
      {text:'Cancelar',style:'cancel'},
      {text:'Aplicar',onPress:()=>void run(async()=>{
        const result=await applyOpenAIRequest(requestId)
        if(result.status==='applied')Alert.alert('Plan aplicado','Puedes abrirlo y ejecutarlo con el motor actual.',[
          {text:'Ver plan',onPress:()=>router.replace('/plan-casa')},
        ])
        return result
      })},
    ])
  }
  if(loading)return <SafeAreaView style={styles.center}><ActivityIndicator color="#16a34a" size="large" /></SafeAreaView>
  const pending=selected?.status==='processing'
  const hasProcessingRequest=(state?.requests??[]).some(request=>request.status==='processing')
  const canGenerate=state?.enabled&&state.allowed&&!busy&&!hasProcessingRequest&&state.used_today<state.daily_limit
  return <SafeAreaView style={styles.screen} edges={['bottom']}>
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>HOME GYM · PILOTO REAL</Text>
        <Text style={styles.heroTitle}>Una propuesta con IA</Text>
        <Text style={styles.heroText}>OpenAI organiza ejercicios de tu catálogo. PlazaFit valida la estructura y tú confirmas antes de reemplazar el plan.</Text>
        <Text style={styles.heroText}>{state?.model ?? 'Modelo del servidor'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Control de consumo</Text>
        <Text style={styles.text}>{state?.used_today ?? 0} de {state?.daily_limit ?? 3} solicitudes hoy · reinicio 00:00 UTC</Text>
        <Text style={styles.text}>Reserva interna: USD {(state?.reserved_usd??0).toFixed(2)} de {(state?.pilot_budget_usd??1).toFixed(2)}</Text>
        <Text style={styles.small}>Cada solicitud reserva USD 0,03 de forma conservadora. No es el cobro de OpenAI. No hay reintentos automáticos ni cambios a un modelo más caro.</Text>
      </View>
      {!state?.enabled||!state?.allowed?<View style={styles.warning}><Text style={styles.warningText}>{!state?.enabled?'Piloto desactivado en Supabase.':'Esta cuenta aún no está autorizada.'}</Text></View>:null}
      {error?<View style={styles.warning}><Text style={styles.warningText}>{error}</Text></View>:null}
      <Pressable accessibilityRole="button" style={[styles.primary,!canGenerate&&styles.disabled]} disabled={!canGenerate} onPress={generate}>
        {busy?<ActivityIndicator color="#fff" />:<Ionicons name="sparkles-outline" size={20} color="#fff" />}
        <Text style={styles.primaryText}>{busy?'Procesando…':'Generar propuesta con IA'}</Text>
      </Pressable>
      <Pressable disabled={busy} style={styles.secondary} onPress={()=>{setError(null);void refresh()}}><Text style={styles.secondaryText}>Consultar estado · sin otra llamada a OpenAI</Text></Pressable>
      {selected?<View style={styles.card}>
        <Text style={styles.title}>{LABELS[selected.status]}</Text>
        <Text style={styles.small}>Solicitud {selected.id.slice(0,8)} · {new Date(selected.created_at).toLocaleString('es-CL')}</Text>
        {selected.status==='queued'?<Pressable disabled={busy} style={styles.secondary} onPress={()=>void run(()=>executeOpenAIRequest(selected.id))}><Text style={styles.secondaryText}>Enviar esta solicitud pendiente</Text></Pressable>:null}
        {pending?<Text style={styles.text}>Si cerraste la app o hubo un problema de conexión, consulta el estado. La misma solicitud no se enviará dos veces al modelo. Si el resultado queda indeterminado, conserva la reserva y caduca en 30 minutos.</Text>:null}
        {selected.error_code?<Text style={styles.warningText}>{openAIErrorMessage(selected.error_code)}</Text>:null}
        {selected.usage_status==='reported'?<View style={styles.usage}>
          <Text style={styles.text}>Tokens: {selected.input_tokens} entrada · {selected.output_tokens} salida</Text>
          <Text style={styles.title}>Estimación: USD {(selected.estimated_cost_usd??0).toFixed(6)}</Text>
          <Text style={styles.small}>Estimación sin descuento de caché. Revisa el cargo definitivo en OpenAI Usage.</Text>
        </View>:<Text style={styles.small}>{selected.usage_status==='not_sent'?'Todavía no hay consumo reportado de OpenAI.':'Consumo no confirmado. No se supone que sea cero.'}</Text>}
        {selected.validation?.errors.map((issue,index)=><Text key={`${issue.path}-${index}`} style={styles.warningText}>{issue.code} · {issue.path}</Text>)}
        {selected.validation?.warnings.map((issue,index)=><Text key={`${issue.path}-${index}`} style={styles.small}>Aviso: {issue.code} · {issue.path}</Text>)}
        {selected.candidate?<>
          <Text style={styles.planTitle}>{selected.candidate.name}</Text>
          <Text style={styles.small}>Vista previa. No modifica tu plan ni otorga XP.</Text>
          {selected.candidate.days.map(day=><View key={day.day_number} style={styles.day}>
            <Text style={styles.title}>Día {day.day_number} · {day.title}</Text>
            <Text style={styles.small}>{selected.validation?.days.find(d=>d.day_number===day.day_number)?.estimated_minutes??'—'} min estimados</Text>
            {day.steps.map((step,index)=><View key={`${index}-${step.exercise_id}`} style={styles.step}>
              <Text style={styles.stepTitle}>{index+1}. {selected.exercise_labels[String(step.exercise_id)]??`Ejercicio ${step.exercise_id}`}</Text>
              <Text style={styles.small}>{step.duration_seconds!==null?`${step.duration_seconds} s`:`${step.sets} series · ${step.reps} repeticiones`} · descanso {step.rest_seconds} s</Text>
            </View>)}
          </View>)}
        </>:null}
        {selected.status==='ready'?<Pressable disabled={busy} style={[styles.primary,busy&&styles.disabled]} onPress={apply}><Text style={styles.primaryText}>Aplicar propuesta como nueva versión</Text></Pressable>:null}
        {selected.status==='applied'?<Pressable style={styles.secondary} onPress={()=>router.replace('/plan-casa')}><Text style={styles.secondaryText}>Volver al plan</Text></Pressable>:null}
      </View>:null}
      {(state?.requests.length??0)>1?<View style={styles.card}><Text style={styles.title}>Solicitudes recientes</Text>{state!.requests.map(r=><Pressable disabled={busy} key={r.id} style={styles.step} onPress={()=>void run(()=>readOpenAIRequest(r.id))}>
        <Text style={styles.stepTitle}>{LABELS[r.status]} · {r.id.slice(0,8)}</Text><Text style={styles.small}>{new Date(r.created_at).toLocaleString('es-CL')}</Text>
      </Pressable>)}</View>:null}
      <Text style={styles.small}>Piloto privado de desarrollo. No presenta una evaluación médica ni reemplaza la revisión de un profesional. El generador por reglas permanece disponible.</Text>
    </ScrollView>
  </SafeAreaView>
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#f0fdf4'},center:{flex:1,backgroundColor:'#f0fdf4',alignItems:'center',justifyContent:'center'},
  container:{padding:16,paddingBottom:30,gap:14},hero:{backgroundColor:'#166534',borderRadius:20,padding:20,gap:8},
  eyebrow:{color:'#bbf7d0',fontWeight:'800',fontSize:11},heroTitle:{color:'#fff',fontWeight:'900',fontSize:25},heroText:{color:'#dcfce7',fontSize:14,lineHeight:21},
  card:{backgroundColor:'#fff',borderColor:'#dcfce7',borderWidth:1,borderRadius:18,padding:17,gap:9},title:{color:'#111827',fontSize:16,fontWeight:'800'},
  text:{color:'#374151',fontSize:14,lineHeight:21},small:{color:'#6b7280',fontSize:12,lineHeight:18},warning:{backgroundColor:'#fef3c7',borderRadius:14,padding:14},
  warningText:{color:'#92400e',fontSize:13,lineHeight:20},primary:{minHeight:50,backgroundColor:'#16a34a',borderRadius:14,padding:14,alignItems:'center',justifyContent:'center',gap:8,flexDirection:'row'},
  primaryText:{color:'#fff',fontSize:14,fontWeight:'800',textAlign:'center'},secondary:{minHeight:46,borderRadius:13,borderWidth:1,borderColor:'#86efac',backgroundColor:'#fff',padding:13,alignItems:'center',justifyContent:'center'},
  secondaryText:{color:'#166534',fontWeight:'800',fontSize:13,textAlign:'center'},disabled:{opacity:0.5},usage:{backgroundColor:'#f0fdf4',padding:13,borderRadius:12,gap:6},
  planTitle:{color:'#166534',fontWeight:'900',fontSize:22,marginTop:10},day:{borderTopWidth:1,borderTopColor:'#dcfce7',paddingTop:15,gap:7},
  step:{paddingVertical:9,borderTopWidth:1,borderTopColor:'#ecfdf5',gap:3},stepTitle:{fontWeight:'700',fontSize:14,color:'#111827'},
})
