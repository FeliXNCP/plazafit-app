/** @typedef {import('./contracts.ts').WorkoutPlanGenerationInput} GenerationInput */
/** @typedef {import('./contracts.ts').ValidationReport} ValidationReport */
const DAY_KEYS = ['day_number', 'title', 'focus', 'steps'];
const STEP_KEYS = ['exercise_id', 'sets', 'reps', 'duration_seconds', 'rest_seconds'];
const FOCUSES = ['full_body','lower_body','upper_body','core','cardio','mobility','mixed'];
const LEVELS = {beginner:1, intermediate:2, advanced:3};
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value,k));
const integer = (value, min, max) => Number.isSafeInteger(value) && value>=min && value<=max;
const text = (value, max) => typeof value === 'string' && value.trim().length>0 && [...value.trim()].length<=max;

/** Valida datos no confiables sin corregirlos silenciosamente.
 * @param {unknown} candidate
 * @param {GenerationInput} context
 * @returns {ValidationReport}
 */
export function validateWorkoutPlan(candidate, context) {
  const result = {valid:false, errors:[], warnings:[], days:[], validator_version:'plazafit-validator/1'};
  const fail = (code,path) => result.errors.push({code,path});
  if (!exactKeys(candidate,['schema_version','name','days']) || candidate.schema_version!=='home-gym-plan/1' || !text(candidate.name,120) || !Array.isArray(candidate.days)) {
    fail('INVALID_PLAN_SHAPE','$'); return result;
  }
  if (candidate.days.length!==context.profile.days_per_week || !integer(candidate.days.length,1,5)) {
    fail('DAY_COUNT_MISMATCH','days'); return result;
  }
  const allowed = new Map(context.allowed_exercises.map(e=>[e.id,e]));
  const equipment = new Set(context.equipment_codes);
  const target = context.profile.session_minutes*60;
  candidate.days.forEach((day,di)=>{
    const dayPath=`days[${di}]`;
    if (!exactKeys(day,DAY_KEYS) || day.day_number!==di+1 || !text(day.title,120) || !FOCUSES.includes(day.focus) || !Array.isArray(day.steps)) {
      fail('INVALID_DAY_SHAPE',dayPath); return;
    }
    if (!integer(day.steps.length,4,10)) { fail('STEP_COUNT_INVALID',`${dayPath}.steps`); return; }
    const ids=new Set(), families=new Set();
    let mains=0, accessories=0, seconds=0;
    day.steps.forEach((step,si)=>{
      const path=`${dayPath}.steps[${si}]`;
      if (!exactKeys(step,STEP_KEYS) || !integer(step.exercise_id,1,Number.MAX_SAFE_INTEGER)) {fail('INVALID_STEP_SHAPE',path);return;}
      const e=allowed.get(step.exercise_id);
      if (!e) {fail('EXERCISE_NOT_ALLOWED',path);return;}
      if(ids.has(e.id))fail('DUPLICATE_EXERCISE',path); ids.add(e.id);
      const family=e.exercise_family??e.code;
      if(families.has(family))fail('DUPLICATE_FAMILY',path); families.add(family);
      if(!e.equipment_codes.every(code=>equipment.has(code)))fail('EQUIPMENT_NOT_AVAILABLE',path);
      if((LEVELS[e.difficulty]??99)>(LEVELS[context.profile.fitness_level]??0))fail('LEVEL_NOT_ALLOWED',path);
      if(si===0) {
        if(e.code!=='dynamic_warm_up'||e.session_role!=='warmup')fail('WARMUP_REQUIRED',path);
      } else if(si===day.steps.length-1) {
        if(e.code!=='cooldown_breathing'||e.session_role!=='cooldown')fail('COOLDOWN_REQUIRED',path);
      } else if(!['main','accessory'].includes(e.session_role))fail('STRUCTURAL_POSITION_INVALID',path);
      if(['main','accessory'].includes(e.session_role) && !e.goals.includes(context.profile.goal))fail('GOAL_NOT_ALLOWED',path);
      if(e.session_role==='main')mains++;
      if(e.session_role==='accessory')accessories++;
      let validDose=integer(step.rest_seconds,0,300);
      if(e.exercise_mode==='repetitions') {
        validDose=validDose && integer(step.sets,1,e.session_role==='accessory'?3:6) && integer(step.reps,1,30) && step.duration_seconds===null;
      } else if(e.exercise_mode==='duration') {
        validDose=validDose && step.sets===null && step.reps===null && integer(step.duration_seconds,30,['warmup','cooldown'].includes(e.session_role)?600:1200);
      } else validDose=false;
      if(!validDose){fail('INVALID_DOSAGE',path);return;}
      if(si===day.steps.length-1&&step.rest_seconds!==0)fail('FINAL_REST_NOT_ZERO',path);
      seconds+= e.exercise_mode==='duration'?step.duration_seconds:step.sets*(e.estimated_seconds_per_set??40)+(step.sets-1)*step.rest_seconds;
      if(si<day.steps.length-1)seconds+=step.rest_seconds;
    });
    if(mains<2)fail('MAIN_EXERCISES_INSUFFICIENT',dayPath);
    if(accessories>1 || (accessories>0 && (mains<3 || target<1800 || !['strength','general_fitness'].includes(context.profile.goal)||!['full_body','upper_body','mixed'].includes(day.focus))))fail('ACCESSORY_POLICY_VIOLATION',dayPath);
    if(seconds<300 || seconds>context.policy.max_session_seconds)fail('SESSION_DURATION_OUT_OF_RANGE',dayPath);
    else if(seconds<target*0.75)result.warnings.push({code:'SESSION_SHORTER_THAN_TARGET',path:dayPath});
    result.days.push({day_number:di+1,estimated_seconds:seconds,estimated_minutes:Math.ceil(seconds/60)});
  });
  result.valid=result.errors.length===0;
  return result;
}
