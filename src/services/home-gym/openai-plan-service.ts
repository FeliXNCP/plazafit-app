import { supabase } from '../../lib/supabase'

export type GenerationStatus = 'queued' | 'processing' | 'ready' | 'rejected' | 'failed' | 'expired' | 'applied'
export type CandidatePlan = {
  schema_version: 'home-gym-plan/1'
  name: string
  days: {
    day_number: number; title: string; focus: string
    steps: { exercise_id: number; sets: number | null; reps: number | null; duration_seconds: number | null; rest_seconds: number }[]
  }[]
}

export type GenerationRequest = {
  id: string; status: GenerationStatus; model: string; error_code: string | null
  candidate: CandidatePlan | null; exercise_labels: Record<string, string>
  validation: { valid: boolean; errors: {code:string; path:string}[]; warnings: {code:string; path:string}[];
    days: {day_number:number; estimated_minutes:number}[] } | null
  applied_plan_id: string | null; created_at: string; expires_at: string
  attempts: number; response_id: string | null
  input_tokens: number | null; output_tokens: number | null; estimated_cost_usd: number | null
  usage_status: string
}
export type PilotState = {
  enabled: boolean; allowed: boolean; model: string; daily_limit: number; used_today: number
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
  }
}
export async function getOpenAIPilotState(): Promise<PilotState> {
  const {data,error}=await supabase.rpc('get_my_home_gym_openai_state')
  if(error)throw error
  if(!record(data) || !Array.isArray(data.requests))throw new Error('HGAI_INVALID_SERVER_RESPONSE')
  return {enabled:data.enabled===true,allowed:data.allowed===true,model:String(data.model ?? ''),
    daily_limit:Number(data.daily_limit),used_today:Number(data.used_today),pilot_budget_usd:Number(data.pilot_budget_usd),
    reserved_usd:Number(data.reserved_usd),cooldown_seconds:Number(data.cooldown_seconds ?? 60),requests:data.requests.map(parseRequest)}
}
export async function beginOpenAIRequest(): Promise<GenerationRequest> {
  const {data,error}=await supabase.rpc('begin_my_home_gym_openai_request')
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
