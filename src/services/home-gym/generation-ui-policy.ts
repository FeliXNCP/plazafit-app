import type { GenerationRequest, PilotState } from './openai-plan-service'

export type GenerationMethod = 'rules' | 'ai'
export type AIGenerationGate = {
  canGenerate: boolean
  resumeRequest: GenerationRequest | null
  message: string | null
  remaining: number | null
}

/** Solo presentación. Las cuotas y permisos siguen aplicándose en PostgreSQL. */
export function getAIGenerationGate(
  state: PilotState | null,
  nowMs = Date.now(),
): AIGenerationGate {
  if (!state) return { canGenerate: false, resumeRequest: null, message: 'No se pudo consultar la disponibilidad de IA.', remaining: null }
  const remaining = Math.max(0, state.daily_limit - state.used_today)
  const requests = [...state.requests].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  const resumeRequest = requests.find((r) =>
    ['queued', 'processing', 'ready'].includes(r.status) && Date.parse(r.expires_at) > nowMs,
  ) ?? null
  // No sugerimos otra llamada cuando hay un trabajo/propuesta que se puede retomar.
  if (resumeRequest) return { canGenerate: false, resumeRequest, remaining, message: null }
  if (!state.enabled) return { canGenerate: false, resumeRequest: null, remaining, message: 'La generación con IA está desactivada por ahora.' }
  if (!state.allowed) return { canGenerate: false, resumeRequest: null, remaining, message: 'La generación con IA aún no está habilitada para esta cuenta.' }
  if (remaining === 0) return { canGenerate: false, resumeRequest: null, remaining, message: 'Alcanzaste el límite diario de IA. Se renueva a las 00:00 UTC.' }
  if (state.reserved_usd + 0.03 > state.pilot_budget_usd + 1e-9) return { canGenerate: false, resumeRequest: null, remaining, message: 'Se alcanzó el presupuesto disponible para generar con IA.' }
  const lastTime = requests.length ? Date.parse(requests[0].created_at) : NaN
  const cooldown = state.cooldown_seconds ?? 60
  const waitSeconds = Number.isFinite(lastTime) ? Math.ceil((lastTime + cooldown * 1000 - nowMs) / 1000) : 0
  if (waitSeconds > 0) return { canGenerate: false, resumeRequest: null, remaining, message: `Espera ${waitSeconds} s antes de crear otra propuesta.` }
  return { canGenerate: true, resumeRequest: null, remaining, message: null }
}

export function planOriginLabel(source: string): string {
  return source === 'ai' ? 'Con IA' : source === 'manual' ? 'Plan manual' : 'Reglas PlazaFit'
}
