/** Asociaciones EXPLÍCITAS. No contiene imágenes ni instrucciones del proveedor. */
export const REPDB_MAPPINGS = Object.freeze([
  // Piloto ya publicado: el SQL no sustituye ni desactiva ninguna asociación existente.
  { code: 'bodyweight_squat', sourceId: 'bodyweight-squat', pilot: true },
  { code: 'bird_dog', sourceId: 'bird-dog', pilot: true },
  { code: 'dead_bug', sourceId: 'dead-bug', pilot: true },
  { code: 'forearm_plank', sourceId: 'plank', pilot: true },
  // Ocho incorporaciones al catálogo de PlazaFit.
  { code: 'knee_push_up', sourceId: 'knee-push-ups' },
  { code: 'standard_push_up', sourceId: 'push-up' },
  { code: 'close_grip_push_up', sourceId: 'close-grip-push-ups' },
  { code: 'decline_push_up_bench', sourceId: 'decline-push-up', note: 'Verificar banco estable y pies elevados, no manos elevadas.' },
  { code: 'dumbbell_biceps_curl', sourceId: 'bicep-curl' },
  { code: 'dumbbell_hammer_curl', sourceId: 'hammer-curl' },
  { code: 'barbell_biceps_curl', sourceId: 'barbell-curl' },
  { code: 'dumbbell_concentration_curl', sourceId: 'concentration-curl', note: 'Variante sentada. PlazaFit exige mancuernas y banco; revisar apoyo y ambos lados.' },
  // Ocho ejercicios existentes. Nunca se empareja por similitud del nombre.
  { code: 'wall_push_up', sourceId: 'wall-push-ups' },
  { code: 'incline_push_up_bench', sourceId: 'incline-push-ups', note: 'Manos sobre un banco estable, pies en el suelo.' },
  { code: 'glute_bridge', sourceId: 'glute-bridge' },
  { code: 'reverse_lunge', sourceId: 'bodyweight-reverse-lunge', note: 'Sin mancuernas. reverse-lunge del proveedor es otra variante con carga.' },
  { code: 'dumbbell_floor_press', sourceId: 'dumbbell-floor-press', note: 'En el suelo, no sobre banco.' },
  { code: 'dumbbell_rdl', sourceId: 'dumbbell-romanian-deadlift' },
  { code: 'barbell_rdl', sourceId: 'romanian-deadlift' },
  { code: 'kettlebell_deadlift', sourceId: 'kettlebell-deadlift' },
]);
