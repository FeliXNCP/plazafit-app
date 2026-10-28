export type CandidatePlan = {
  schema_version: 'home-gym-plan/1'
  name: string
  days: {
    day_number: number; title: string; focus: string
    steps: { exercise_id: number; sets: number | null; reps: number | null; duration_seconds: number | null; rest_seconds: number }[]
  }[]
}
type Step = CandidatePlan['days'][number]['steps'][number]
type Day = CandidatePlan['days'][number]
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const int = (v: unknown, min: number, max: number): v is number => typeof v==='number' && Number.isSafeInteger(v) && v>=min && v<=max
const text = (v: unknown): v is string => typeof v==='string' && v.trim().length>0 && Array.from(v).length<=120
const nullableInt = (v: unknown, max: number) => v===null || int(v,0,max)
/** Solo prepara una comparación. No sustituye al validador ni acepta escrituras. */
export function parseComparablePlan(v: unknown): CandidatePlan | null {
  if (!record(v) || v.schema_version!=='home-gym-plan/1' || !text(v.name) || !Array.isArray(v.days) || !int(v.days.length,1,5)) return null
  const days: Day[]=[]
  for (let i=0;i<v.days.length;i++) {
    const d: unknown=v.days[i]
    if (!record(d)||d.day_number!==i+1||!text(d.title)||typeof d.focus!=='string'||!Array.isArray(d.steps)||!int(d.steps.length,1,10)) return null
    const steps: Step[]=[]; const ids=new Set<number>()
    for (const raw of d.steps as unknown[]) {
      if (!record(raw)||!int(raw.exercise_id,1,Number.MAX_SAFE_INTEGER)||ids.has(raw.exercise_id)||
          !nullableInt(raw.sets,6)||!nullableInt(raw.reps,30)||!nullableInt(raw.duration_seconds,1200)||!int(raw.rest_seconds,0,300)) return null
      ids.add(raw.exercise_id)
      steps.push({exercise_id:raw.exercise_id,sets:raw.sets as number|null,reps:raw.reps as number|null,
        duration_seconds:raw.duration_seconds as number|null,rest_seconds:raw.rest_seconds})
    }
    days.push({day_number:i+1,title:d.title,focus:d.focus,steps})
  }
  return {schema_version:'home-gym-plan/1',name:v.name,days}
}
export type StepChange = {
  exerciseId: number; before: Step | null; after: Step | null
  beforePosition: number | null; afterPosition: number | null
  kind:'added'|'removed'|'changed'|'unchanged'; dosageChanged:boolean; positionChanged:boolean
}
export type DayChanges = {
  dayNumber:number; beforeTitle:string | null; afterTitle:string | null
  beforeFocus:string | null; afterFocus:string | null; metadataChanged:boolean
  steps:StepChange[]; changed:boolean; unchangedSteps:number
}
export type PlanComparison = {
  hasChanges:boolean; nameChanged:boolean; beforeName:string; afterName:string
  days:DayChanges[]; changedDays:number; added:number; removed:number; dosageChanges:number; positionChanges:number
}
const doseEqual=(a:Step,b:Step) => a.sets===b.sets && a.reps===b.reps && a.duration_seconds===b.duration_seconds && a.rest_seconds===b.rest_seconds
/** Identidad: ejercicio dentro del mismo día. No supone reemplazos ni causalidad a partir del orden.
 * Un movimiento a otro día se muestra como salida/entrada. Un cambio de índice puede deberse a una inserción.
 * No evalúa semánticamente el texto pedido por el usuario.
 */
export function comparePlans(beforeValue: unknown, afterValue: unknown): PlanComparison | null {
  const before=parseComparablePlan(beforeValue),after=parseComparablePlan(afterValue)
  if(!before||!after)return null
  const result:PlanComparison={hasChanges:false,nameChanged:before.name!==after.name,beforeName:before.name,afterName:after.name,
    days:[],changedDays:0,added:0,removed:0,dosageChanges:0,positionChanges:0}
  const numbers=[...new Set([...before.days,...after.days].map(d=>d.day_number))].sort((a,b)=>a-b)
  for(const dayNumber of numbers) {
    const a=before.days.find(d=>d.day_number===dayNumber),b=after.days.find(d=>d.day_number===dayNumber)
    const changes:StepChange[]=[]
    for (const [idx, step] of (b?.steps??[]).entries()) {
      const prevIndex=a?.steps.findIndex(s=>s.exercise_id===step.exercise_id)??-1
      const prev=prevIndex>=0?a!.steps[prevIndex]:null
      const dosageChanged=prev!==null&&!doseEqual(prev,step)
      const positionChanged=prev!==null&&prevIndex!==idx
      const kind=prev===null?'added':dosageChanged||positionChanged?'changed':'unchanged'
      changes.push({exerciseId:step.exercise_id,before:prev,after:step,beforePosition:prev===null?null:prevIndex+1,
        afterPosition:idx+1,kind,dosageChanged,positionChanged})
    }
    for(const [idx,step] of (a?.steps??[]).entries()) if(!(b?.steps??[]).some(s=>s.exercise_id===step.exercise_id))
      changes.push({exerciseId:step.exercise_id,before:step,after:null,beforePosition:idx+1,afterPosition:null,
        kind:'removed',dosageChanged:false,positionChanged:false})
    const metadataChanged=!a||!b||a.title!==b.title||a.focus!==b.focus
    const changed=metadataChanged||changes.some(s=>s.kind!=='unchanged')
    result.days.push({dayNumber,beforeTitle:a?.title??null,afterTitle:b?.title??null,beforeFocus:a?.focus??null,
      afterFocus:b?.focus??null,metadataChanged,steps:changes,changed,unchangedSteps:changes.filter(s=>s.kind==='unchanged').length})
    if(changed)result.changedDays++
    result.added+=changes.filter(s=>s.kind==='added').length
    result.removed+=changes.filter(s=>s.kind==='removed').length
    result.dosageChanges+=changes.filter(s=>s.dosageChanged).length
    result.positionChanges+=changes.filter(s=>s.positionChanged).length
  }
  result.hasChanges=result.nameChanged||result.changedDays>0
  return result
}
export function formatDose(step:Step):string {
  const target=step.duration_seconds!==null
    ? step.duration_seconds%60===0?`${step.duration_seconds/60} min`:`${step.duration_seconds} s`
    : `${step.sets} series × ${step.reps} repeticiones`
  return `${target} · descanso ${step.rest_seconds} s`
}
