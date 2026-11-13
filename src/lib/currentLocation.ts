export interface BrowserCoordinates {
  latitude: number;
  longitude: number;
}

interface SupportedArea {
  name: string;
  latitude: number;
  longitude: number;
}

const supportedHyderabadAreas: SupportedArea[] = [
  { name: 'Madhapur / Hitech City', latitude: 17.4483, longitude: 78.3915 },
  { name: 'Gachibowli Financial District', latitude: 17.4401, longitude: 78.3489 },
  { name: 'Kukatpally / KPHB', latitude: 17.4849, longitude: 78.4138 },
  { name: 'Banjara Hills, Road 12', latitude: 17.4156, longitude: 78.4347 },
  { name: 'Jubilee Hills', latitude: 17.4325, longitude: 78.4071 },
  { name: 'Kondapur / Miyapur', latitude: 17.4969, longitude: 78.3596 },
  { name: 'Begumpet / Ameerpet', latitude: 17.4375, longitude: 78.4483 },
  { name: 'Secunderabad', latitude: 17.4399, longitude: 78.4983 },
];

const HYDERABAD_BOUNDS = {
  minLatitude: 17.2,
  maxLatitude: 17.65,
  minLongitude: 78.2,
  maxLongitude: 78.65,
};

function isWithinHyderabadBounds({ latitude, longitude }: BrowserCoordinates): boolean {
  return (
    latitude >= HYDERABAD_BOUNDS.minLatitude &&
    latitude <= HYDERABAD_BOUNDS.maxLatitude &&
    longitude >= HYDERABAD_BOUNDS.minLongitude &&
    longitude <= HYDERABAD_BOUNDS.maxLongitude
  );
}

function squaredDistance(a: BrowserCoordinates, b: SupportedArea): number {
  const latitudeScale = Math.cos((a.latitude * Math.PI) / 180);
  const latitudeDistance = a.latitude - b.latitude;
  const longitudeDistance = (a.longitude - b.longitude) * latitudeScale;
  return latitudeDistance ** 2 + longitudeDistance ** 2;
}

export function findNearestHyderabadArea(coordinates: BrowserCoordinates): string | null {
  if (!isWithinHyderabadBounds(coordinates)) return null;

  return supportedHyderabadAreas.reduce((nearest, area) => {
    if (!nearest || squaredDistance(coordinates, area) < squaredDistance(coordinates, nearest)) {
      return area;
    }
    return nearest;
  }, null as SupportedArea | null)?.name ?? null;
}

export function getGeolocationErrorMessage(error: Pick<GeolocationPositionError, 'code'>): string {
  switch (error.code) {
    case 1:
      return 'Location permission was blocked. Allow location access in your browser settings and try again.';
    case 2:
      return 'Your location could not be detected. Check device location services and try again.';
    case 3:
      return 'Location detection timed out. Try again from a place with a clearer GPS signal.';
    default:
      return 'Location is unavailable right now. You can choose an area from the location menu.';
  }
}

export function getCurrentBrowserPosition(): Promise<BrowserCoordinates> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new Error('GEOLOCATION_UNSUPPORTED'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      reject,
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      },
    );
  });
}
