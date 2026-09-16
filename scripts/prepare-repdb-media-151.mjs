/**
 * PlazaFit 1.5.1 · Preparador LOCAL. Node 20+; sin npm adicional, red ni claves.
 * node scripts/prepare-repdb-media-151.mjs "REPDB" "SALIDA_NUEVA" --accept-license
 * Opcional: --only knee_push_up,dumbbell_biceps_curl
 * No publica ni activa medios. Las asociaciones existentes nunca se sobreescriben.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { REPDB_MAPPINGS } from './repdb-mappings-151.mjs';

const MAX_BYTES = 2 * 1024 * 1024;
const BUCKET = 'exercise-demonstrations';
const sqlString = (value) => value == null ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inTree = (parent, child) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
};
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseArgs(args) {
  const positionals = [];
  let accepted = false;
  let only = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--accept-license') { accepted = true; continue; }
    if (args[i] === '--only') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Falta la lista de códigos para --only.');
      only = [...new Set(args[++i].split(',').map((x) => x.trim()).filter(Boolean))];
      if (only.length === 0) throw new Error('--only no puede estar vacío.');
      continue;
    }
    if (args[i].startsWith('--')) throw new Error(`Opción desconocida: ${args[i]}`);
    positionals.push(args[i]);
  }
  if (positionals.length !== 2 || !accepted) {
    throw new Error('Uso: node scripts/prepare-repdb-media-151.mjs "REPDB" "SALIDA_NUEVA" --accept-license [--only codigo1,codigo2]\nLee LICENSE-DATA.md antes de aceptar.');
  }
  const wanted = only ? REPDB_MAPPINGS.filter((m) => only.includes(m.code)) : REPDB_MAPPINGS;
  if (only && wanted.length !== only.length) {
    throw new Error(`Códigos no incluidos en este lote: ${only.filter((c) => !wanted.some((m) => m.code === c)).join(', ')}`);
  }
  return { sourceArg: positionals[0], outputArg: positionals[1], mappings: wanted };
}

export function chooseFlatPaths(exercise) {
  const flat = exercise?.images?.flat;
  if (!isRecord(flat)) throw new Error(`Faltan imágenes flat para ${exercise?.id ?? 'ejercicio'}.`);
  if (typeof flat.start === 'string' && typeof flat.peak === 'string') {
    if (flat.start === flat.peak) throw new Error(`La pareja de ${exercise.id} repite el mismo archivo.`);
    return [flat.start, flat.peak];
  }
  if (flat.start != null || flat.peak != null) throw new Error(`Pareja start/peak incompleta en ${exercise.id}.`);
  if (typeof flat.main === 'string') return [flat.main];
  throw new Error(`No existen main ni start/peak válidos para ${exercise.id}.`);
}

export function validateWebp(bytes, sourcePath) {
  if (bytes.length < 20 || bytes.length > MAX_BYTES || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error(`Formato o tamaño no válido (WebP de hasta 2 MiB): ${sourcePath}`);
  }
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) throw new Error(`Contenedor WebP truncado o inconsistente: ${sourcePath}`);
  // Comprobación de contenedor. No es una revisión visual ni un decodificador de imagen.
}

function candidateTable(rows) {
  const values = rows.map((r) => `  (${[r.code,r.sourceId,r.first,r.second].map(sqlString).join(', ')})`).join(',\n');
  return `CREATE TEMPORARY TABLE pf151_media_batch (
  code text PRIMARY KEY, source_id text NOT NULL, first_path text NOT NULL, second_path text
) ON COMMIT DROP;
INSERT INTO pf151_media_batch (code,source_id,first_path,second_path) VALUES
${values};`;
}

export function buildMediaSql(rows, hashes) {
  const header = `-- PlazaFit Entrenamiento 1.5.1 · lote local de ${rows.length} asociaciones\n-- Licencia original SHA256: ${hashes.license}\n-- exercises.json SHA256: ${hashes.dataset}\n-- No modifica ejercicios, planes, sesiones ni recompensas.\n`;
  const table = candidateTable(rows);
  const link = `${header}BEGIN;
${table}
DO $check$
BEGIN
  IF to_regclass('public.exercise_demonstrations') IS NULL THEN
    RAISE EXCEPTION 'TRAINING_1_5_MEDIA_MIGRATION_REQUIRED';
  END IF;
  IF (SELECT count(*) FROM pf151_media_batch b JOIN public.home_exercises e ON e.code=b.code) <> ${rows.length} THEN
    RAISE EXCEPTION 'TRAINING_151_EXERCISES_MISSING: ejecutar primero 01-catalog-and-generator.sql';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='${BUCKET}' AND public IS FALSE) THEN
    RAISE EXCEPTION 'TRAINING_151_PRIVATE_BUCKET_REQUIRED';
  END IF;
END;
$check$;

INSERT INTO public.exercise_demonstrations (
  home_exercise_id, provider, provider_exercise_id, first_image_path, second_image_path,
  attribution, attribution_url, license_reference, hold_ms, is_active, reviewed_at
)
SELECT e.id,'repdb',b.source_id,b.first_path,b.second_path,
  'Exercise data by RepDB (repdb.co)','https://repdb.co',
  'LICENSE-DATA.md incluido en la copia local RepDB; SHA256 ${hashes.license}',1400,false,null
FROM pf151_media_batch b JOIN public.home_exercises e ON e.code=b.code
ON CONFLICT (home_exercise_id) DO NOTHING;

-- Piloto y otras asociaciones existentes permanecen exactamente como estaban.
SELECT b.code,d.id,d.is_active,d.reviewed_at,
  CASE WHEN d.provider='repdb' AND d.provider_exercise_id=b.source_id
      AND d.first_image_path=b.first_path AND d.second_image_path IS NOT DISTINCT FROM b.second_path
    THEN CASE WHEN d.is_active THEN 'EXISTENTE_ACTIVA_CONSERVADA'
      WHEN d.reviewed_at IS NULL THEN 'PENDIENTE_REVISION'
      ELSE 'DESACTIVADA_POR_ADMIN_CONSERVADA' END
    ELSE 'OTRA_ASOCIACION_CONSERVADA_NO_SUSTITUIDA' END AS resultado
FROM pf151_media_batch b JOIN public.home_exercises e ON e.code=b.code
JOIN public.exercise_demonstrations d ON d.home_exercise_id=e.id ORDER BY b.code;
COMMIT;
`;
  const activate = `${header}-- Revisa REVIEW.md y las imágenes antes de ejecutar.
-- Cambia SOLO v_revision_confirmada a true si apruebas todo este lote pendiente.
-- Para lotes menores usa --only al ejecutar el preparador.
BEGIN;
${table}
DO $review$
DECLARE
  v_revision_confirmada boolean := false;
BEGIN
  IF NOT v_revision_confirmada THEN
    RAISE EXCEPTION 'REVIEW_REQUIRED: revise cada asociación y cambie v_revision_confirmada a true';
  END IF;
  IF (SELECT count(*) FROM pf151_media_batch b JOIN public.home_exercises e ON e.code=b.code
      JOIN public.exercise_demonstrations d ON d.home_exercise_id=e.id) <> ${rows.length} THEN
    RAISE EXCEPTION 'TRAINING_151_MAPPING_NOT_READY: ejecute primero 02-link-expanded-media.sql';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pf151_media_batch b JOIN public.home_exercises e ON e.code=b.code
    JOIN public.exercise_demonstrations d ON d.home_exercise_id=e.id
    CROSS JOIN LATERAL (VALUES (b.first_path),(b.second_path)) needed(file_path)
    WHERE d.provider='repdb' AND d.provider_exercise_id=b.source_id
      AND d.first_image_path=b.first_path AND d.second_image_path IS NOT DISTINCT FROM b.second_path
      AND NOT d.is_active AND d.reviewed_at IS NULL AND needed.file_path IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM storage.objects obj
        WHERE obj.bucket_id='${BUCKET}' AND obj.name=needed.file_path)
  ) THEN
    RAISE EXCEPTION 'TRAINING_151_IMAGES_MISSING: suba las imágenes a las rutas de UPLOAD.md';
  END IF;
END;
$review$;

-- Solo se activan nuevas asociaciones pendientes y exactamente coincidentes.
-- No se reactivan recursos desactivados manualmente, ni se toca el piloto activo.
UPDATE public.exercise_demonstrations d SET is_active=true,reviewed_at=now()
FROM public.home_exercises e,pf151_media_batch b
WHERE e.code=b.code AND d.home_exercise_id=e.id
  AND d.provider='repdb' AND d.provider_exercise_id=b.source_id
  AND d.first_image_path=b.first_path AND d.second_image_path IS NOT DISTINCT FROM b.second_path
  AND NOT d.is_active AND d.reviewed_at IS NULL;

SELECT b.code,d.is_active,d.reviewed_at FROM pf151_media_batch b
JOIN public.home_exercises e ON e.code=b.code
JOIN public.exercise_demonstrations d ON d.home_exercise_id=e.id ORDER BY b.code;
COMMIT;
`;
  return { link, activate };
}

export async function prepareMedia({ sourceArg, outputArg, mappings }) {
  const source = await fs.realpath(path.resolve(sourceArg));
  const requestedOutput = path.resolve(outputArg);
  try { await fs.lstat(requestedOutput); throw new Error('La carpeta de salida ya existe: usa una nueva.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  // El padre debe existir y se resuelve para impedir escapar mediante symlinks.
  const realParent = await fs.realpath(path.dirname(requestedOutput));
  const output = path.join(realParent, path.basename(requestedOutput));
  if (inTree(source, output) || inTree(output, source)) throw new Error('Las carpetas origen y salida no deben solaparse.');

  const licenseBytes = await fs.readFile(path.join(source, 'LICENSE-DATA.md'));
  const license = licenseBytes.toString('utf8');
  if (!license.includes('RepDB')) throw new Error('No se reconoció la licencia de RepDB.');
  const datasetBytes = await fs.readFile(path.join(source, 'exercises.json'));
  const dataset = JSON.parse(datasetBytes.toString('utf8').replace(/^\uFEFF/, ''));
  if (!Array.isArray(dataset.exercises)) throw new Error('No se encontró exercises[] en exercises.json.');
  const byId = new Map();
  for (const item of dataset.exercises) {
    if (!isRecord(item) || typeof item.id !== 'string') throw new Error('Registro sin id válido en exercises.json.');
    if (byId.has(item.id)) throw new Error(`Id duplicado en RepDB: ${item.id}`);
    byId.set(item.id, item);
  }
  const rows = [];
  const copies = new Map();
  // Primero valida todos los archivos. Un error aquí no crea la carpeta de salida.
  for (const mapping of mappings) {
    const exercise = byId.get(mapping.sourceId);
    if (!exercise) throw new Error(`No existe ${mapping.sourceId} en esta copia de RepDB. No se sustituirá por otro ejercicio.`);
    const sourcePaths = chooseFlatPaths(exercise);
    const bucketPaths = [];
    for (const sourcePath of sourcePaths) {
      if (!/^images\/flat\/[a-z0-9_-]+\.webp$/.test(sourcePath)) throw new Error(`Ruta no permitida: ${sourcePath}`);
      const realFile = await fs.realpath(path.join(source, sourcePath));
      if (!inTree(source, realFile)) throw new Error('Archivo de origen fuera de la carpeta de RepDB.');
      const bytes = await fs.readFile(realFile);
      validateWebp(bytes, sourcePath);
      const hash = sha256(bytes);
      const bucketPath = `repdb/${mapping.sourceId}/${hash.slice(0,12)}-${path.basename(sourcePath)}`;
      copies.set(bucketPath, { bucketPath, bytes, sha256: hash, original: sourcePath });
      bucketPaths.push(bucketPath);
    }
    rows.push({ ...mapping, first: bucketPaths[0], second: bucketPaths[1] ?? null,
      sourceName: exercise.name_es ?? exercise.name_en ?? mapping.sourceId,
      sourceEquipment: exercise.equipment ?? null, sourceTags: Array.isArray(exercise.tags) ? exercise.tags : [] });
  }
  const hashes = { license: sha256(licenseBytes), dataset: sha256(datasetBytes) };
  const { link, activate } = buildMediaSql(rows, hashes);
  // Staging y rename: la salida final aparece solo cuando todos los archivos están listos.
  const staging = await fs.mkdtemp(path.join(realParent, '.plazafit-media-151-'));
  try {
    for (const c of copies.values()) {
      const dest = path.join(staging,'storage',...c.bucketPath.split('/'));
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest,c.bytes,{flag:'wx'});
    }
    await fs.writeFile(path.join(staging,'02-link-expanded-media.sql'),link,'utf8');
    await fs.writeFile(path.join(staging,'03-activate-reviewed-media.sql'),activate,'utf8');
    await fs.writeFile(path.join(staging,'LICENSE-DATA.md'),licenseBytes);
    await fs.writeFile(path.join(staging,'manifest.json'),JSON.stringify({
      bucket:BUCKET,createdAt:new Date().toISOString(),licenseSha256:hashes.license,
      datasetSha256:hashes.dataset,mappings:rows,
      files:[...copies.values()].map(({bytes,...c})=>c),
    },null,2),'utf8');
    const review = `# Revisión humana del lote\n\nNo activa medios automáticamente. Comprueba variante, postura y equipo; la herramienta no hace una validación profesional.\n\n${rows.map((r)=>`- [ ] **${r.code}** → \`${r.sourceId}\` (${r.second ? '2 imágenes' : '1 imagen'}). ${r.note ?? ''}`).join('\n')}\n\nEl piloto existente se conserva. Tampoco se sustituyen otras asociaciones ya creadas.\nDespués de revisar, cambia \`v_revision_confirmada\` a \`true\` en 03-activate-reviewed-media.sql.\nPara aprobar menos ejercicios genera un lote con --only.\n`;
    await fs.writeFile(path.join(staging,'REVIEW.md'),review,'utf8');
    await fs.writeFile(path.join(staging,'UPLOAD.md'),`# Subir medios a PlazaFit\n\nBucket privado: ${BUCKET}\n\nSube el CONTENIDO de storage/; la ruta remota debe comenzar por repdb/, no por storage/. No cambies el bucket a público.\n\nLos archivos llevan hash: si uno ya existe con el mismo nombre, omítelo; no es necesario sobreescribirlo.\n\n${[...copies.keys()].map((x)=>'- '+x).join('\n')}\n\n1. Ejecuta 02-link-expanded-media.sql después de 01-catalog-and-generator.sql.\n2. Revisa REVIEW.md y las imágenes.\n3. Confirma y ejecuta 03-activate-reviewed-media.sql.\n\nNo publiques esta carpeta como dataset, API ni paquete de medios. Atribución en la app: Exercise data by RepDB (repdb.co).\n`,'utf8');
    await fs.rename(staging,output);
  } catch (error) {
    await fs.rm(staging,{recursive:true,force:true});
    throw error;
  }
  return { output, mappingCount: rows.length, fileCount: copies.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareMedia(parseArgs(process.argv.slice(2)))
    .then((r)=>console.log(`Preparadas ${r.mappingCount} asociaciones y ${r.fileCount} imágenes en:\n${r.output}\nSigue UPLOAD.md y REVIEW.md. No se cambió Supabase ni se sobreescribió material existente.`))
    .catch((error)=>{ console.error(error instanceof Error ? error.message : error); process.exitCode=1; });
}
