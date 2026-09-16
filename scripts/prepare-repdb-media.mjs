/**
 * Preparador LOCAL de cuatro asociaciones piloto, no importa el dataset a PlazaFit.
 * Uso: node scripts/prepare-repdb-media.mjs "RUTA_REPDB" "RUTA_SALIDA" --accept-license
 * Sin red, sin dependencias npm, sin claves, sin escritura en Supabase.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const PILOT = [
  { code: 'bodyweight_squat', sourceId: 'bodyweight-squat' },
  { code: 'bird_dog', sourceId: 'bird-dog' },
  { code: 'dead_bug', sourceId: 'dead-bug' },
  { code: 'forearm_plank', sourceId: 'plank' },
]
const quote = (s) => s === null ? 'null' : `'${String(s).replaceAll("'", "''")}'`
const sha = (data) => createHash('sha256').update(data).digest('hex')

async function main() {
  const [sourceArg, outputArg, accepted] = process.argv.slice(2)
  if (!sourceArg || !outputArg || accepted !== '--accept-license') {
    throw new Error('Uso: node scripts/prepare-repdb-media.mjs "RUTA_REPDB" "RUTA_SALIDA" --accept-license\nLee LICENSE-DATA.md del proveedor antes de continuar.')
  }
  const source = await fs.realpath(path.resolve(sourceArg))
  const output = path.resolve(outputArg)
  const relativeOutput = path.relative(source, output)
  if (!relativeOutput.startsWith('..') && !path.isAbsolute(relativeOutput)) {
    throw new Error('La carpeta de salida debe estar fuera de la carpeta original de RepDB.')
  }
  // Exigimos una carpeta nueva: no pisar material previo o medios ya publicados.
  try {
    await fs.access(output)
    throw new Error('La carpeta de salida ya existe. Elige una carpeta nueva para no sobrescribir archivos.')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const license = await fs.readFile(path.join(source, 'LICENSE-DATA.md'), 'utf8')
  const sourceJson = await fs.readFile(path.join(source, 'exercises.json'), 'utf8')
  const dataset = JSON.parse(sourceJson.replace(/^\uFEFF/, ''))
  if (!Array.isArray(dataset.exercises)) throw new Error('Formato de exercises.json no compatible.')
  if (!license.includes('RepDB')) throw new Error('No se reconoció LICENSE-DATA.md de RepDB.')

  const exercises = new Map(dataset.exercises.map((e) => [e.id, e]))
  const rows = []
  const copies = []
  for (const { code, sourceId } of PILOT) {
    const exercise = exercises.get(sourceId)
    const flat = exercise?.images?.flat
    if (!flat || typeof flat !== 'object') throw new Error(`No existen imágenes flat para ${sourceId}.`)
    const sourcePaths = flat.start && flat.peak
      ? [flat.start, flat.peak]
      : flat.main ? [flat.main] : []
    if (sourcePaths.length === 0) throw new Error(`Faltan main o start/peak para ${sourceId}.`)
    const bucketPaths = []
    for (const sourcePath of [...new Set(sourcePaths)]) {
      if (typeof sourcePath !== 'string' || !/^images\/flat\/[a-z0-9_-]+\.webp$/.test(sourcePath)) {
        throw new Error(`Ruta fuera de images/flat o inválida: ${sourcePath}`)
      }
      const localFile = await fs.realpath(path.join(source, sourcePath))
      const rel = path.relative(source, localFile)
      if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Ruta de origen fuera del repositorio.')
      const bytes = await fs.readFile(localFile)
      if (bytes.length > 2097152 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
        throw new Error(`No es un WebP válido de hasta 2 MB: ${sourcePath}`)
      }
      const digest = sha(bytes)
      const filename = `${digest.slice(0, 12)}-${path.basename(sourcePath)}`
      const bucketPath = `repdb/${sourceId}/${filename}`
      bucketPaths.push(bucketPath)
      copies.push({ bucketPath, bytes, original: sourcePath, sha256: digest })
    }
    rows.push({ code, sourceId, first: bucketPaths[0], second: bucketPaths[1] ?? null })
  }

  await fs.mkdir(path.join(output, 'storage'), { recursive: true })
  for (const item of copies) {
    const destination = path.join(output, 'storage', ...item.bucketPath.split('/'))
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.writeFile(destination, item.bytes, { flag: 'wx' })
  }

  const values = rows.map((r) => `  (${quote(r.code)}, ${quote(r.sourceId)}, ${quote(r.first)}, ${quote(r.second)})`).join(',\n')
  const codes = rows.map((r) => quote(r.code)).join(', ')
  const commonHeader = `-- Solo asociaciones piloto: no modifica ejercicios, planes ni sesiones.\n-- Recurso oficial RepDB, licencia revisada por el operador con --accept-license.\n-- SHA256 licencia: ${sha(license)}\n-- SHA256 exercises.json: ${sha(sourceJson)}\n`
  const linkSql = `${commonHeader}
begin;
do $$
begin
  if (select count(*) from public.home_exercises where code in (${codes})) <> ${rows.length} then
    raise exception 'PILOT_HOME_EXERCISES_NOT_FOUND';
  end if;
end;
$$;
with pilot(code, source_id, first_path, second_path) as (
  values
${values}
)
insert into public.exercise_demonstrations (
  home_exercise_id, provider, provider_exercise_id,
  first_image_path, second_image_path,
  attribution, attribution_url, license_reference, hold_ms, is_active, reviewed_at
)
select e.id, 'repdb', p.source_id, p.first_path, p.second_path,
  'Exercise data by RepDB (repdb.co)', 'https://repdb.co',
  'RepDB Free Tier License v1.0; original LICENSE-DATA.md SHA256 ${sha(license)}',
  1400, false, null
from pilot p join public.home_exercises e on e.code = p.code
on conflict (home_exercise_id) do update set
  provider = excluded.provider,
  provider_exercise_id = excluded.provider_exercise_id,
  first_image_path = excluded.first_image_path,
  second_image_path = excluded.second_image_path,
  attribution = excluded.attribution,
  attribution_url = excluded.attribution_url,
  license_reference = excluded.license_reference,
  hold_ms = excluded.hold_ms,
  is_active = false,
  reviewed_at = null;
commit;

-- Siguen INACTIVAS hasta revisar imágenes y ejecutar 03-activate-pilot.sql.
select e.code, d.id, d.is_active, d.first_image_path, d.second_image_path
from public.exercise_demonstrations d
join public.home_exercises e on e.id = d.home_exercise_id
where e.code in (${codes})
order by e.code;
`
  const activationSql = `${commonHeader}
-- EJECUTAR SOLO DESPUÉS DE REVISAR VISUALMENTE CADA ASOCIACIÓN Y SUBIR SUS IMÁGENES.
begin;
create temporary table pilot_activation(code, source_id, first_path, second_path) on commit drop as
  values
${values};
do $$
begin
  if (select count(*) from pilot_activation p
    join public.home_exercises e on e.code = p.code
    join public.exercise_demonstrations d on d.home_exercise_id = e.id
    where d.provider = 'repdb' and d.provider_exercise_id = p.source_id
      and d.first_image_path = p.first_path
      and d.second_image_path is not distinct from p.second_path) <> ${rows.length} then
    raise exception 'PILOT_MAPPING_NOT_READY';
  end if;
  if exists (
    select 1 from pilot_activation p
    cross join lateral (values (p.first_path), (p.second_path)) required(file_path)
    where required.file_path is not null and not exists (
      select 1 from storage.objects obj
      where obj.bucket_id = 'exercise-demonstrations' and obj.name = required.file_path
    )
  ) then
    raise exception 'PILOT_IMAGES_NOT_UPLOADED_TO_EXPECTED_PATHS';
  end if;
end;
$$;
update public.exercise_demonstrations d
set is_active = true, reviewed_at = now()
from public.home_exercises e, pilot_activation p
where e.code = p.code and d.home_exercise_id = e.id
  and d.provider = 'repdb' and d.first_image_path = p.first_path;
commit;
`
  await fs.writeFile(path.join(output, '02-link-pilot-media.sql'), linkSql, 'utf8')
  await fs.writeFile(path.join(output, '03-activate-pilot.sql'), activationSql, 'utf8')
  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({
    bucket: 'exercise-demonstrations', generatedAt: new Date().toISOString(),
    source: 'RepDB/exercise-dataset', licenseSha256: sha(license),
    datasetSha256: sha(sourceJson), mappings: rows,
    files: copies.map(({ bytes, ...item }) => item),
  }, null, 2), 'utf8')
  await fs.copyFile(path.join(source, 'LICENSE-DATA.md'), path.join(output, 'LICENSE-DATA.md'))
  await fs.writeFile(path.join(output, 'UPLOAD.md'), `# Carga piloto PlazaFit\n\nRevisa las imágenes: no se ha realizado una revisión profesional automática.\n\nBucket PRIVADO: exercise-demonstrations\n\nSube el CONTENIDO de storage/ al bucket, conservando repdb/ y subcarpetas. No agregues storage/ al nombre remoto.\n\n${copies.map((c) => '- ' + c.bucketPath).join('\n')}\n\nDespués ejecuta 02-link-pilot-media.sql y, solo si apruebas todas las asociaciones, 03-activate-pilot.sql. No publiques esta carpeta como dataset o API.\n`, 'utf8')
  console.log(`Preparadas ${rows.length} asociaciones y ${copies.length} imágenes en:\n${output}\nSigue UPLOAD.md. No se modificó Supabase ni el catálogo de ejercicios.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
