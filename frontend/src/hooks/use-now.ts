import { useEffect, useState } from "react";

// The current time, refreshed every minute: "live" badges and pulsing pins switch on and off by themselves.
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
