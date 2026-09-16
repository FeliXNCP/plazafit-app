import { supabase } from '../../lib/supabase'
import {
  type ExerciseDemonstrationData,
  parseDemonstrationRecords,
  safeHttpsUrl,
} from './exercise-demonstration-types'

const BUCKET = 'exercise-demonstrations'
const SIGNED_URL_LIFETIME_SECONDS = 2 * 60 * 60

export type SessionDemonstrations = Record<string, ExerciseDemonstrationData>

export async function fetchSessionDemonstrations(
  sessionId: string
): Promise<SessionDemonstrations> {
  const { data, error } = await supabase.rpc('get_my_workout_demonstrations', {
    p_session_id: sessionId,
  })
  if (error) throw error

  const records = parseDemonstrationRecords(data, sessionId)
  if (records.length === 0) return {}

  const paths = [...new Set(records.flatMap((entry) => entry.paths))]
  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_LIFETIME_SECONDS)
  if (signError) throw signError

  const urls = new Map<string, string>()
  for (const entry of signed ?? []) {
    const uri = safeHttpsUrl(entry.signedUrl)
    if (entry.path && uri && !entry.error) urls.set(entry.path, uri)
  }

  const byStepId: SessionDemonstrations = {}
  for (const item of records) {
    const frames = item.paths.flatMap((path) => {
      const uri = urls.get(path)
      return uri ? [{ uri, cacheKey: `${BUCKET}/${path}` }] : []
    })
    // Un archivo faltante no debe bloquear la sesión ni impedir usar la otra pose.
    byStepId[item.stepId] = {
      id: item.id,
      frames,
      holdMs: item.holdMs,
      attribution: item.attribution,
      attributionUrl: item.attributionUrl,
    }
  }
  return byStepId
}
