export type MapCoordinate = {
  latitude: number
  longitude: number
}

/**
 * Decodifica el formato Encoded Polyline de Google a coordenadas
 * compatibles con react-native-maps.
 */
export function decodeGooglePolyline(
  encodedPolyline: string
): MapCoordinate[] {
  if (!encodedPolyline) return []

  const coordinates: MapCoordinate[] = []

  let index = 0
  let latitude = 0
  let longitude = 0

  while (index < encodedPolyline.length) {
    let result = 0
    let shift = 0
    let byte = 0

    do {
      byte = encodedPolyline.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20 && index <= encodedPolyline.length)

    const latitudeDelta =
      result & 1
        ? ~(result >> 1)
        : result >> 1

    latitude += latitudeDelta

    result = 0
    shift = 0

    do {
      byte = encodedPolyline.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20 && index <= encodedPolyline.length)

    const longitudeDelta =
      result & 1
        ? ~(result >> 1)
        : result >> 1

    longitude += longitudeDelta

    coordinates.push({
      latitude: latitude / 1e5,
      longitude: longitude / 1e5,
    })
  }

  return coordinates
}
