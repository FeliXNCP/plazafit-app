export const MAX_PERSONAL_REQUEST = 500
export type PlanFacts = {
  version: 'plazafit-plan-facts/1'
  source: 'plazafit_backend'
  plan_days: number
  profile_days: number
  equipment: { code: string; day_numbers: number[]; day_count: number }[]
  days: { day_number: number; step_count: number; equipment_codes: string[] }[]
  free_text_verified: false
}
export type GenerationTrace = {
  provider: string | null; requested_model: string | null; response_model: string | null
  response_id: string | null; provider_request_id: string | null
  created_at: string | null; dispatched_at: string | null; completed_at: string | null; applied_at: string | null
  prompt_version: string | null; output_schema_version: string | null; validator_version: string | null
  latency_ms: number | null
  profile_used: { goal: string | null; fitness_level: string | null; days_per_week: number | null; session_minutes: number | null }
}
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): string | null => typeof v === 'string' ? v : null
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')
const ints = (v: unknown): v is number[] => Array.isArray(v) && v.every(integer)
export function normalizePersonalRequest(value: string): string {
  const note = value.replace(/\r\n?/g, '\n').replace(/^[ \t\n]+|[ \t\n]+$/g, '')
  if (Array.from(note).length > MAX_PERSONAL_REQUEST) throw new Error('HGAI_PREFERENCE_TOO_LONG')
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(note)) throw new Error('HGAI_INVALID_PREFERENCE')
  return note
}
export function parsePlanFacts(v: unknown): PlanFacts | null {
  if (!record(v) || v.version !== 'plazafit-plan-facts/1' || v.source !== 'plazafit_backend' || v.free_text_verified !== false ||
      !integer(v.plan_days) || !integer(v.profile_days) || !Array.isArray(v.equipment) || !Array.isArray(v.days)) return null
  const equipment: PlanFacts['equipment'] = []
  for (const e of v.equipment) {
    if (!record(e) || typeof e.code !== 'string' || !ints(e.day_numbers) || !integer(e.day_count) || e.day_count !== new Set(e.day_numbers).size) return null
    equipment.push({ code: e.code, day_numbers: e.day_numbers, day_count: e.day_count })
  }
  const days: PlanFacts['days'] = []
  for (const d of v.days) {
    if (!record(d) || !integer(d.day_number) || !integer(d.step_count) || !strings(d.equipment_codes)) return null
    days.push({ day_number: d.day_number, step_count: d.step_count, equipment_codes: d.equipment_codes })
  }
  return { version: v.version, source: v.source, plan_days: v.plan_days, profile_days: v.profile_days, equipment, days, free_text_verified: false }
}
export function parseGenerationTrace(v: unknown): GenerationTrace | null {
  if (!record(v) || v.source !== 'server_record') return null
  const p = record(v.profile_used) ? v.profile_used : {}
  return { provider: text(v.provider), requested_model: text(v.requested_model), response_model: text(v.response_model),
    response_id: text(v.response_id), provider_request_id: text(v.provider_request_id),
    created_at: text(v.created_at), dispatched_at: text(v.dispatched_at), completed_at: text(v.completed_at), applied_at: text(v.applied_at),
    prompt_version: text(v.prompt_version), output_schema_version: text(v.output_schema_version), validator_version: text(v.validator_version),
    latency_ms: integer(v.latency_ms) ? v.latency_ms : null,
    profile_used: { goal: text(p.goal), fitness_level: text(p.fitness_level), days_per_week: integer(p.days_per_week) ? p.days_per_week : null,
      session_minutes: integer(p.session_minutes) ? p.session_minutes : null } }
}
const EQUIPMENT_NAMES: Record<string, string> = {
  dumbbells: 'Mancuernas', resistance_bands: 'Bandas elásticas', bench: 'Banco', barbell: 'Barra y discos',
  kettlebell: 'Kettlebell', pull_up_bar: 'Barra de dominadas', stationary_bike: 'Bicicleta estática',
  treadmill: 'Cinta de correr', multi_gym: 'Máquina multifunción', mat: 'Colchoneta', exercise_mat: 'Colchoneta',
}
export const equipmentName = (code: string): string => EQUIPMENT_NAMES[code] ?? code
export function formatPlanDays(values: number[]): string {
  const days = [...new Set(values)].sort((a, b) => a - b)
  if (days.length === 0) return 'No aparece en esta propuesta'
  if (days.length === 1) return `Día ${days[0]}`
  return `Días ${days.slice(0, -1).join(', ')} y ${days[days.length - 1]}`
}
