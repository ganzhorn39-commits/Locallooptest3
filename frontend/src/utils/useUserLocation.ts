import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import { useLocationPermission } from "@/src/location/LocationPermission";

export function useUserLocation() {
  const [userLoc, setUserLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const { askForLocation } = useLocationPermission();

  const requestLocation = useCallback(async () => {
    try {
      if (!(await askForLocation())) return;
      const loc = await Location.getCurrentPositionAsync({});
      setUserLoc({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch {}
  }, [askForLocation]);

  useEffect(() => { requestLocation(); }, [requestLocation]);

  return { userLoc, requestLocation };
}
