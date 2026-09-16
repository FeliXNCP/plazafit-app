export type DemonstrationFrame = Readonly<{
  uri: string
  cacheKey: string
}>

export type ExerciseDemonstrationData = Readonly<{
  id: string
  frames: readonly DemonstrationFrame[]
  holdMs: number
  attribution: string
  attributionUrl: string | null
}>

export type DemonstrationRecord = {
  stepId: string
  id: string
  paths: string[]
  holdMs: number
  attribution: string
  attributionUrl: string | null
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function safeId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value)
  }
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return value
  return null
}

function safePath(value: unknown): string | null {
  if (typeof value !== 'string' || value.includes('..')) return null
  return /^[A-Za-z0-9][A-Za-z0-9_./-]*\.(webp|png|jpg|jpeg)$/.test(value)
    ? value
    : null
}

export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
      ? parsed.toString()
      : null
  } catch {
    return null
  }
}

export function parseDemonstrationRecords(
  value: unknown,
  expectedSessionId: string
): DemonstrationRecord[] {
  const root = record(value)
  if (root?.session_id !== expectedSessionId || !Array.isArray(root.items)) {
    throw new Error('INVALID_DEMONSTRATION_RESPONSE')
  }
  const result: DemonstrationRecord[] = []
  for (const item of root.items) {
    const raw = record(item)
    if (!raw) continue
    const stepId = safeId(raw.step_id)
    const id = safeId(raw.demonstration_id)
    const first = safePath(raw.first_image_path)
    if (!stepId || !id || !first) continue
    const second = safePath(raw.second_image_path)
    const hold = Number(raw.hold_ms)
    result.push({
      stepId,
      id,
      paths: second && second !== first ? [first, second] : [first],
      holdMs: Number.isFinite(hold) ? Math.max(800, Math.min(5000, hold)) : 1400,
      attribution: typeof raw.attribution === 'string' ? raw.attribution : '',
      attributionUrl: safeHttpsUrl(raw.attribution_url),
    })
  }
  return result
}
