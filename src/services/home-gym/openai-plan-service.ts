import { parseComparablePlan, type CandidatePlan } from './plan-adjustment-types'
import { supabase } from '../../lib/supabase'
import { normalizePersonalRequest, parseGenerationTrace, parsePlanFacts, type GenerationTrace, type PlanFacts } from './personalization-types'

export type GenerationStatus = 'queued' | 'processing' | 'ready' | 'rejected' | 'failed' | 'expired' | 'applied'
export type { CandidatePlan } from './plan-adjustment-types'

export type GenerationRequest = {
  id: string; status: GenerationStatus; model: string; error_code: string | null
  candidate: CandidatePlan | null; exercise_labels: Record<string, string>
  validation: { valid: boolean; errors: {code:string; path:string}[]; warnings: {code:string; path:string}[];
    days: {day_number:number; estimated_minutes:number}[] } | null
  applied_plan_id: string | null; created_at: string; expires_at: string
  attempts: number; response_id: string | null
  input_tokens: number | null; output_tokens: number | null; estimated_cost_usd: number | null
  usage_status: string
  request_preference: string; request_preference_version: string | null
  plan_facts: PlanFacts | null; trace: GenerationTrace | null
  generation_mode: 'create' | 'adjust'; base_plan: CandidatePlan | null
  base_plan_info: {id:string | null; name:string; version:number | null} | null
}
export type PilotState = {
  enabled: boolean; allowed: boolean; personalization_enabled: boolean; adjustment_enabled: boolean; model: string; daily_limit: number; used_today: number
  pilot_budget_usd: number; reserved_usd: number; cooldown_seconds?: number; requests: GenerationRequest[]
}
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const STATES: GenerationStatus[] = ['queued','processing','ready','rejected','failed','expired','applied']
const nullableNumber = (v: unknown): number | null => v == null || !Number.isFinite(Number(v)) ? null : Number(v)
function parseRequest(v: unknown): GenerationRequest {
  if (!record(v) || typeof v.id !== 'string' || !STATES.includes(v.status as GenerationStatus)) throw new Error('HGAI_INVALID_SERVER_RESPONSE')
  const candidate = v.candidate == null ? null : v.candidate
  if (candidate !== null && (!record(candidate) || candidate.schema_version !== 'home-gym-plan/1' || !Array.isArray(candidate.days))) throw new Error('HGAI_INVALID_SERVER_RESPONSE')
  return {
    id:v.id, status:v.status as GenerationStatus, model:String(v.model ?? ''), error_code:typeof v.error_code === 'string' ? v.error_code : null,
    candidate:candidate as CandidatePlan | null,
    exercise_labels:record(v.exercise_labels) ? Object.fromEntries(Object.entries(v.exercise_labels).filter((e): e is [string,string] => typeof e[1] === 'string')) : {},
    validation:record(v.validation) && Array.isArray(v.validation.errors) && Array.isArray(v.validation.warnings) && Array.isArray(v.validation.days)
      ? v.validation as unknown as GenerationRequest['validation'] : null,
    applied_plan_id:typeof v.applied_plan_id === 'string' ? v.applied_plan_id : null,
    created_at:String(v.created_at ?? ''),expires_at:String(v.expires_at ?? ''),attempts:Number(v.attempts ?? 0),
    response_id:typeof v.response_id === 'string' ? v.response_id : null,
    input_tokens:nullableNumber(v.input_tokens),output_tokens:nullableNumber(v.output_tokens),estimated_cost_usd:nullableNumber(v.estimated_cost_usd),
    usage_status:String(v.usage_status ?? 'unknown'),
    request_preference:typeof v.request_preference === 'string' ? v.request_preference : '',
    request_preference_version:typeof v.request_preference_version === 'string' ? v.request_preference_version : null,
    plan_facts:parsePlanFacts(v.plan_facts),trace:parseGenerationTrace(v.trace),
    generation_mode:v.generation_mode==='adjust'?'adjust':'create',
    base_plan:parseComparablePlan(v.base_plan),
    base_plan_info:record(v.base_plan_info) ? {id:typeof v.base_plan_info.id==='string'?v.base_plan_info.id:null,
      name:String(v.base_plan_info.name??''),version:nullableNumber(v.base_plan_info.version)} : null,
  }
}
export async function getOpenAIPilotState(): Promise<PilotState> {
  const {data,error}=await supabase.rpc('get_my_home_gym_openai_state')
  if(error)throw error
  if(!record(data) || !Array.isArray(data.requests))throw new Error('HGAI_INVALID_SERVER_RESPONSE')
  return {enabled:data.enabled===true,allowed:data.allowed===true,personalization_enabled:data.personalization_enabled===true,adjustment_enabled:data.adjustment_enabled===true,model:String(data.model ?? ''),
    daily_limit:Number(data.daily_limit),used_today:Number(data.used_today),pilot_budget_usd:Number(data.pilot_budget_usd),
    reserved_usd:Number(data.reserved_usd),cooldown_seconds:Number(data.cooldown_seconds ?? 60),requests:data.requests.map(parseRequest)}
}
export async function beginOpenAIRequest(requestText = '', personalized = false): Promise<GenerationRequest> {
  const note = normalizePersonalRequest(requestText)
  // La ruta original permanece disponible con la personalización desactivada.
  if (!personalized && note) throw new Error('HGAI_PERSONALIZATION_DISABLED')
  const {data,error}=personalized
    ? await supabase.rpc('begin_my_home_gym_personalized_request', { p_request_text: note })
    : await supabase.rpc('begin_my_home_gym_openai_request')
  if(error)throw error
  return parseRequest(data)
}
export async function beginAdjustmentRequest(planId: string, requestText: string): Promise<GenerationRequest> {
  const note=normalizePersonalRequest(requestText)
  if (!note) throw new Error('HGAI_ADJUSTMENT_TEXT_REQUIRED')
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(planId)) throw new Error('HGAI_ADJUSTMENT_PLAN_REQUIRED')
  const {data,error}=await supabase.rpc('begin_my_home_gym_adjustment_request',{p_plan_id:planId,p_request_text:note})
  if(error)throw error
  return parseRequest(data)
}
export async function readOpenAIRequest(id: string): Promise<GenerationRequest> {
  const {data,error}=await supabase.rpc('get_my_home_gym_openai_request',{p_request_id:id})
  if(error)throw error
  return parseRequest(data)
}
export async function executeOpenAIRequest(id: string): Promise<GenerationRequest> {
  const {data,error}=await supabase.functions.invoke('home-gym-generate-openai',{body:{requestId:id}})
  if(error) {
    const context: unknown=(error as {context?:unknown}).context
    if(context && typeof (context as Response).clone === 'function') {
      const body: unknown=await (context as Response).clone().json().catch(()=>null)
      if(record(body) && typeof body.error === 'string')throw new Error(body.error)
    }
    throw error
  }
  return parseRequest(data)
}
export async function applyOpenAIRequest(id: string): Promise<GenerationRequest> {
  const {data,error}=await supabase.rpc('apply_my_home_gym_openai_request',{p_request_id:id})
  if(error)throw error
  return parseRequest(data)
}
const MESSAGES: Record<string,string> = {
  HGAI_ADJUSTMENT_DISABLED:'Los ajustes con IA aún no están habilitados. No se creó otra solicitud.',
  HGAI_ADJUSTMENT_TEXT_REQUIRED:'Describe qué quieres cambiar antes de generar el ajuste.',
  HGAI_ADJUSTMENT_PLAN_REQUIRED:'Ese plan ya no está activo o no está disponible. Vuelve a Mi plan y abre el ajuste desde allí.',
  HGAI_ADJUSTMENT_PROFILE_CHANGED:'Tus preferencias cambiaron desde que se creó el plan. Crea un plan actualizado en vez de ajustar el anterior.',
  HGAI_ADJUSTMENT_BASE_INVALID:'El plan de origen no cumple el contrato actual de IA. Crea uno nuevo; esta operación no generó otra llamada.',
  HGAI_ADJUSTMENT_BASE_CHANGED:'El plan original cambió o se reemplazó. El ajuste pendiente ya no se puede aplicar.',
  HGAI_ADJUSTMENT_BASE_TOO_LARGE:'El plan es demasiado grande para esta operación. No se enviará al proveedor.',
  HGAI_ADJUSTMENT_VERSION_MISMATCH:'El servidor no confirmó que procesó la copia original del plan. Revisa el despliegue antes de repetir la generación.',
  HGAI_PERSONALIZATION_DISABLED:'La personalización por texto aún no está habilitada. Actualiza el estado; tu plan se conserva.',
  HGAI_PERSONALIZATION_VERSION_MISMATCH:'El servidor no pudo confirmar que procesó la petición. No se aplicó el plan. Revisa el despliegue antes de generar de nuevo.',
  HGAI_PENDING_REQUEST_DIFFERENT:'Hay una propuesta o solicitud vigente con otra petición. Actualiza el estado y revísala antes de crear otra.',
  HGAI_REQUEST_STATE_CHANGED:'La solicitud cambió de estado. Actualiza para revisarla; no se creó un segundo intento.',
  HGAI_PREFERENCE_TOO_LONG:'La petición puede tener como máximo 500 caracteres.',
  HGAI_INVALID_PREFERENCE:'La petición contiene caracteres no permitidos. Escribe una preferencia de entrenamiento en texto normal.',
  HGAI_UX2_SCHEMA_REQUIRED:'Falta actualizar el flujo de generación en la base de datos.',
  AUTH_REQUIRED:'Vuelve a iniciar sesión.',
  HGAI_DISABLED:'La generación con IA está desactivada. Las reglas de PlazaFit siguen disponibles.',
  HGAI_ACCESS_DENIED:'La generación con IA todavía no está habilitada para esta cuenta.',
  HGAI_DAILY_LIMIT:'Alcanzaste la cuota diaria de IA. Se reinicia a las 00:00 UTC.',
  HGAI_COOLDOWN:'Espera al menos 60 segundos desde tu última solicitud.',
  HGAI_PILOT_BUDGET:'El presupuesto disponible para IA está reservado. No se realizó otra llamada a OpenAI.',
  HGAI_REFERENCE_PLAN_REQUIRED:'La base aún exige un plan previo. Falta aplicar la actualización Home Gym UX v2.',
  HGAI_REFERENCE_PLAN_STALE:'La base aún exige un plan de referencia actualizado. Falta aplicar Home Gym UX v2.',
  HOME_GYM_PROFILE_REQUIRED:'Completa el perfil Home Gym.',
  HOME_GYM_ACTIVE_WORKOUT_BLOCKS_REGENERATION:'Finaliza o abandona tu entrenamiento Home Gym activo antes de reemplazar el plan.',
  HGAI_CONTEXT_CHANGED:'Tu perfil, catálogo o plan cambió. La propuesta anterior ya no se puede aplicar.',
  HGAI_REQUEST_EXPIRED:'La propuesta caducó. Se conserva tu plan actual.',
  HGAI_VALIDATION_FAILED:'La propuesta no pasó las reglas de PlazaFit. No se ha aplicado ni se volverá a generar automáticamente.',
  HGAI_PROVIDER_TIMEOUT:'OpenAI no respondió a tiempo. La petición pudo generar consumo. Consulta el resultado antes de solicitar otra.',
  HGAI_PROVIDER_NETWORK:'Se perdió la conexión con el proveedor. No se reintentará automáticamente.',
  HGAI_OUTPUT_INCOMPLETE:'La respuesta quedó incompleta. No se aplicó ni se realizó un segundo intento.',
  HGAI_PROVIDER_REFUSAL:'El proveedor no generó una propuesta para esta solicitud.',
  HGAI_OPENAI_KEY_MISSING:'Falta OPENAI_API_KEY en los secretos de Supabase.',
  HGAI_OPENAI_KEY_INVALID:'OpenAI rechazó la clave. Revisa el secreto del servidor.',
  HGAI_OPENAI_QUOTA:'OpenAI rechazó la solicitud por saldo o límite de consumo.',
  HGAI_MODEL_UNAVAILABLE:'El modelo configurado no está disponible para esta cuenta. No se elegirá otro automáticamente.',
  HGAI_OPENAI_PERMISSION:'La clave no tiene permiso para esta operación o modelo.',
  HGAI_OPENAI_RATE_LIMIT:'OpenAI limitó temporalmente las solicitudes. No se realizó otro intento.',
  HGAI_OPENAI_BAD_REQUEST:'OpenAI rechazó el formato o configuración de la solicitud. Hay que revisar la integración, no regenerar repetidamente.',
  HGAI_CONTEXT_TOO_LARGE:'El catálogo supera el tamaño permitido para esta generación.',
  HGAI_CATALOG_INSUFFICIENT:'No hay suficientes ejercicios compatibles para esta propuesta.',
  HGAI_VALIDATOR_INTERNAL_ERROR:'Falló el validador interno de PlazaFit. La solicitud se cerró y no se aplicó el plan. El consumo recibido quedó registrado; no se realizó otro intento.',
  HGAI_RESULT_NOT_CONFIRMED:'Esta solicitud fue cerrada sin confirmar el resultado. Se conserva su reserva: no se supone que el consumo haya sido cero. Una nueva propuesta es otra llamada pagada.',
  HGAI_BACKEND_ERROR:'Supabase no pudo confirmar la operación. Consulta el estado de esta solicitud antes de generar otra.',
  HGAI_PERSISTENCE_FAILED:'No se pudo guardar la nueva versión; tu plan anterior se conserva.',
  HGAI_TEMPORARY_FAILURE:'No se pudo confirmar el resultado. Usa Consultar estado; no se reenvía automáticamente a OpenAI.',
}
export function openAIErrorMessage(error: unknown): string {
  const raw=typeof error==='string' ? error : record(error) && typeof error.message==='string' ? error.message : error instanceof Error ? error.message : ''
  const code=raw.match(/\b(HGAI_[A-Z_]+|HOME_GYM_[A-Z_]+|AUTH_REQUIRED)\b/)?.[1]
  return code ? MESSAGES[code] ?? `No se completó la operación (${code}). Tu plan actual no se reemplazó.` : 'No se pudo confirmar la operación. Consulta el estado de la solicitud antes de repetirla.'
}
