export { }

declare const Deno: {
  env: {
    get(name: string): string | undefined
  }
  serve(
    handler: (request: Request) => Response | Promise<Response>
  ): void
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Coordinate = {
  latitude: number
  longitude: number
}

type RouteRequestBody = {
  origin?: Coordinate
  destination?: Coordinate
}

type GoogleRouteResponse = {
  routes?: Array<{
    distanceMeters?: number
    duration?: string
    polyline?: {
      encodedPolyline?: string
    }
  }>
  error?: {
    code?: number
    message?: string
    status?: string
  }
}

function jsonResponse(
  body: unknown,
  status = 200
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type':
        'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function isValidCoordinate(
  value: unknown
): value is Coordinate {
  if (!value || typeof value !== 'object') {
    return false
  }

  const coordinate = value as Partial<Coordinate>

  return (
    typeof coordinate.latitude === 'number' &&
    Number.isFinite(coordinate.latitude) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    typeof coordinate.longitude === 'number' &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180
  )
}

function parseGoogleDuration(
  duration: string | undefined
) {
  if (!duration) return null

  const match = duration.match(
    /^(\d+(?:\.\d+)?)s$/
  )

  if (!match) return null

  const seconds = Number(match[1])

  return Number.isFinite(seconds)
    ? Math.ceil(seconds)
    : null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    })
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      {
        error: 'METHOD_NOT_ALLOWED',
        message: 'Solo se permite POST.',
      },
      405
    )
  }

  const authorization =
    request.headers.get('Authorization')

  /*
   * La función debe mantenerse con verify_jwt = true.
   * Esta comprobación adicional evita exponer el proxy
   * a llamadas que no incluyan sesión de usuario.
   */
  if (
    !authorization?.startsWith('Bearer ')
  ) {
    return jsonResponse(
      {
        error: 'AUTH_REQUIRED',
        message:
          'Debes iniciar sesión para calcular una ruta.',
      },
      401
    )
  }

  const googleApiKey = Deno.env.get(
    'GOOGLE_ROUTES_API_KEY'
  )

  if (!googleApiKey) {
    console.error(
      'GOOGLE_ROUTES_API_KEY is not configured'
    )

    return jsonResponse(
      {
        error: 'ROUTING_NOT_CONFIGURED',
        message:
          'El servicio de rutas todavía no está configurado.',
      },
      503
    )
  }

  let body: RouteRequestBody

  try {
    body = await request.json()
  } catch {
    return jsonResponse(
      {
        error: 'INVALID_JSON',
        message:
          'La solicitud no contiene un JSON válido.',
      },
      400
    )
  }

  if (
    !isValidCoordinate(body.origin) ||
    !isValidCoordinate(body.destination)
  ) {
    return jsonResponse(
      {
        error: 'INVALID_COORDINATES',
        message:
          'El origen o destino contiene coordenadas inválidas.',
      },
      400
    )
  }

  try {
    const googleResponse = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googleApiKey,
          'X-Goog-FieldMask':
            'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
        },
        body: JSON.stringify({
          origin: {
            location: {
              latLng: body.origin,
            },
          },
          destination: {
            location: {
              latLng: body.destination,
            },
          },
          travelMode: 'WALK',
          languageCode: 'es-CL',
          units: 'METRIC',
          polylineQuality: 'OVERVIEW',
          polylineEncoding:
            'ENCODED_POLYLINE',
        }),
      }
    )

    const responseText =
      await googleResponse.text()

    let googlePayload: GoogleRouteResponse = {}

    if (responseText) {
      try {
        googlePayload = JSON.parse(
          responseText
        ) as GoogleRouteResponse
      } catch {
        console.error(
          'Routes API returned non-JSON response',
          responseText
        )
      }
    }

    if (!googleResponse.ok) {
      console.error(
        'Routes API error',
        googleResponse.status,
        googlePayload.error
      )

      return jsonResponse(
        {
          error: 'GOOGLE_ROUTES_ERROR',
          message:
            googlePayload.error?.message ??
            'Google no pudo calcular la ruta.',
        },
        502
      )
    }

    const route = googlePayload.routes?.[0]

    const distanceMeters = Number(
      route?.distanceMeters
    )

    const durationSeconds =
      parseGoogleDuration(route?.duration)

    const encodedPolyline =
      route?.polyline?.encodedPolyline ?? ''

    if (
      !Number.isFinite(distanceMeters) ||
      distanceMeters < 0 ||
      durationSeconds === null ||
      !encodedPolyline
    ) {
      return jsonResponse(
        {
          error: 'ROUTE_NOT_FOUND',
          message:
            'No encontramos una ruta peatonal disponible entre ambos puntos.',
        },
        404
      )
    }

    return jsonResponse({
      distanceMeters,
      durationSeconds,
      encodedPolyline,
    })
  } catch (error) {
    console.error(
      'Unexpected routing error',
      error
    )

    return jsonResponse(
      {
        error: 'ROUTING_REQUEST_FAILED',
        message:
          'No fue posible comunicarse con el servicio de rutas.',
      },
      502
    )
  }
})
