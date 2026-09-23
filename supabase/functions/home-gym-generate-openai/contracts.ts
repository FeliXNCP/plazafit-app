/** Contrato compartible por proveedores. No contiene JSX ni dependencias de Expo. */
export type Goal = 'stay_active' | 'general_fitness' | 'strength' | 'endurance' | 'mobility';
export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced';
export type Focus = 'full_body' | 'lower_body' | 'upper_body' | 'core' | 'cardio' | 'mobility' | 'mixed';
export type StepProposal = {
  exercise_id: number;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  rest_seconds: number;
};
export type GeneratedWorkoutPlan = {
  schema_version: 'home-gym-plan/1';
  name: string;
  days: { day_number: number; title: string; focus: Focus; steps: StepProposal[] }[];
};
export type ExerciseCandidate = {
  id: number; code: string; name: string; difficulty: FitnessLevel;
  exercise_mode: 'duration' | 'repetitions'; movement_pattern: string;
  exercise_family: string; session_role: 'main' | 'accessory' | 'warmup' | 'cooldown';
  estimated_seconds_per_set: number | null;
  equipment_codes: string[]; goals: Goal[];
};
export type WorkoutPlanGenerationInput = {
  contract_version: 'home-gym-input/1';
  profile: { goal: Goal; fitness_level: FitnessLevel; days_per_week: number; session_minutes: number; updated_at: string };
  equipment_codes: string[];
  allowed_exercises: ExerciseCandidate[];
  policy: { version: 'plazafit-validator/1'; max_session_seconds: number };
  reference: { plan_id: string | null; version: number | null; generator_version: string | null; updated_at?: string | null };
};
export type ValidationIssue = { code: string; path: string };
export type ValidationReport = {
  valid: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[];
  days: { day_number: number; estimated_seconds: number; estimated_minutes: number }[];
  validator_version: 'plazafit-validator/1';
};
export interface WorkoutPlanGenerator {
  readonly id: string;
  /** unknown deliberadamente: NUNCA confiar en un proveedor sin validar. */
  generate(input: WorkoutPlanGenerationInput): Promise<unknown>;
}
