/** Contrato de dosificación v1. Misma forma de salida; sin cambiar las reglas del validador.
 * Separa IDs por modalidad/rol para no permitir, por ejemplo, series en un ejercicio
 * que el motor ejecuta como un único bloque temporal. No constituye una pauta clínica.
 */
export const DOSAGE_SCHEMA_VERSION = 'home-gym-dosage-schema/1';
const int = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const nil = () => ({ type: 'null' });
const FOCUSES = ['full_body','lower_body','upper_body','core','cardio','mobility','mixed'];
export function buildDosagePlanSchema(exercises, daysPerWeek) {
  if (!Array.isArray(exercises) || exercises.length < 4 ||
      !Number.isSafeInteger(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 5) {
    throw new Error('HGAI_CONTEXT_INVALID');
  }
  const seen = new Set();
  const groups = new Map();
  for (const e of exercises) {
    if (!e || !Number.isSafeInteger(e.id) || e.id <= 0 || seen.has(e.id) ||
        !['main','accessory','warmup','cooldown'].includes(e.session_role) ||
        !['repetitions','duration'].includes(e.exercise_mode)) {
      throw new Error('HGAI_CONTEXT_INVALID');
    }
    seen.add(e.id);
    const structural = ['warmup','cooldown'].includes(e.session_role);
    if (structural && e.exercise_mode !== 'duration') throw new Error('HGAI_CONTEXT_INVALID');
    const groupKey = e.exercise_mode === 'repetitions'
      ? (e.session_role === 'accessory' ? 'repetitions_accessory' : 'repetitions_main')
      : (structural ? e.session_role : 'duration');
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(e.id);
  }
  const branches = [...groups.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([key, ids]) => {
    const repetitions = key.startsWith('repetitions_');
    return {
      type: 'object', additionalProperties: false,
      required: ['exercise_id','sets','reps','duration_seconds','rest_seconds'],
      properties: {
        exercise_id: {type:'integer', enum:ids.sort((a,b)=>a-b)},
        sets: repetitions ? int(1,key==='repetitions_accessory'?3:6) : nil(),
        reps: repetitions ? int(1,30) : nil(),
        duration_seconds: repetitions ? nil() : int(30,['warmup','cooldown'].includes(key)?600:1200),
        rest_seconds: key==='cooldown' ? {type:'integer', enum:[0]} : int(0,300),
      },
    };
  });
  return {
    type: 'object', additionalProperties: false, required: ['schema_version','name','days'],
    properties: {
      schema_version: {type:'string',enum:['home-gym-plan/1']},
      name: {type:'string'},
      days: {type:'array',minItems:daysPerWeek,maxItems:daysPerWeek,items:{
        type:'object',additionalProperties:false,required:['day_number','title','focus','steps'],
        properties:{
          day_number:int(1,daysPerWeek), title:{type:'string'},
          focus:{type:'string',enum:FOCUSES},
          steps:{type:'array',minItems:4,maxItems:10,items:{anyOf:branches}},
        },
      }},
    },
  };
}
