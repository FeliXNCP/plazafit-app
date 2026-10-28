import { validateWorkoutPlan } from './validator.mjs';
import { readPersonalPreference } from './personalization-input.mjs';
export const ADJUSTMENT_VERSION = 'home-gym-adjustment/1';
export const ADJUSTMENT_PROMPT_VERSION = 'plazafit-adjust-plan/1';
/** El hash identifica la copia del servidor. No es firma ni prueba criptográfica de autoría. */
export function readAdjustment(context) {
  const raw = context?.adjustment;
  if (raw === undefined || raw === null) return { enabled: false, plan: null, hash: null };
  if (typeof raw !== 'object' || Array.isArray(raw) || raw.version !== ADJUSTMENT_VERSION ||
      typeof raw.base_plan_hash !== 'string' || !/^[a-f0-9]{32}$/.test(raw.base_plan_hash))
    throw new Error('HGAI_ADJUSTMENT_VERSION_MISMATCH');
  const preference = readPersonalPreference(context);
  if (!preference.enabled || !preference.text) throw new Error('HGAI_ADJUSTMENT_TEXT_REQUIRED');
  const validation = validateWorkoutPlan(raw.base_plan, context);
  if (!validation.valid) throw new Error('HGAI_ADJUSTMENT_BASE_INVALID');
  if (new TextEncoder().encode(JSON.stringify(raw.base_plan)).byteLength > 40000)
    throw new Error('HGAI_ADJUSTMENT_BASE_TOO_LARGE');
  // Copia permitida explícita; no incorpora generación_metadata, ids personales o historial.
  const plan = {schema_version:'home-gym-plan/1',name:raw.base_plan.name,
    days:raw.base_plan.days.map(d=>({day_number:d.day_number,title:d.title,focus:d.focus,
      steps:d.steps.map(s=>({exercise_id:s.exercise_id,sets:s.sets,reps:s.reps,
        duration_seconds:s.duration_seconds,rest_seconds:s.rest_seconds}))}))};
  return {enabled:true,plan,hash:raw.base_plan_hash};
}
