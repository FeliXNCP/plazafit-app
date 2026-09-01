import { supabase } from '../../lib/supabase'

export type RoutePoint = {
  latitude: number
  longitude: number
}

export type WalkingRoute = {
  distanceMeters: number
  durationSeconds: number
  encodedPolyline: string
}

type WalkingRouteFunctionResponse = {
  distanceMeters?: number
  durationSeconds?: number
  encodedPolyline?: string
  error?: string
  message?: string
}

async function readFunctionErrorMessage(
  error: unknown
): Promise<string> {
  const fallback =
    (error as { message?: string } | null)?.message ??
    'No se pudo calcular la ruta.'

  const context =
    (error as { context?: unknown } | null)?.context

  if (!(context instanceof Response)) {
    return fallback
  }

  try {
    const payload =
      (await context.clone().json()) as
        | WalkingRouteFunctionResponse
        | null

    return payload?.message ?? payload?.error ?? fallback
  } catch {
    return fallback
  }
}

export async function computeWalkingRoute(
  origin: RoutePoint,
  destination: RoutePoint
): Promise<WalkingRoute> {
  const { data, error } =
    await supabase.functions.invoke<WalkingRouteFunctionResponse>(
      'compute-walking-route',
      {
        body: {
          origin,
          destination,
        },
      }
    )

  if (error) {
    throw new Error(
      await readFunctionErrorMessage(error)
    )
  }

  const distanceMeters = Number(
    data?.distanceMeters
  )

  const durationSeconds = Number(
    data?.durationSeconds
  )

  const encodedPolyline =
    data?.encodedPolyline ?? ''

  if (
    !Number.isFinite(distanceMeters) ||
    distanceMeters < 0 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 0 ||
    !encodedPolyline
  ) {
    throw new Error(
      'El servicio devolvió una ruta incompleta.'
    )
  }

  return {
    distanceMeters,
    durationSeconds,
    encodedPolyline,
  }
}
