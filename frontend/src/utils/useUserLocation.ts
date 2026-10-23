import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import { useLocationPermission } from "@/src/location/LocationPermission";

type Coords = { latitude: number; longitude: number };

// Asks for the location once (with the explanation modal first) and keeps the last known position.
export function useUserLocation() {
  const [userLoc, setUserLoc] = useState<Coords | null>(null);
  const { askForLocation } = useLocationPermission();

  const locate = useCallback(async (): Promise<Coords | null> => {
    try {
      if (!(await askForLocation())) return null;
      const loc = await Location.getCurrentPositionAsync({});
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    } catch {
      return null;
    }
  }, [askForLocation]);

  const requestLocation = useCallback(() => {
    locate().then((c) => { if (c) setUserLoc(c); });
  }, [locate]);

  useEffect(() => {
    let alive = true;
    locate().then((c) => { if (alive && c) setUserLoc(c); });
    return () => { alive = false; };
  }, [locate]);

  return { userLoc, requestLocation };
}
