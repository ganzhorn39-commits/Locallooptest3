import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { DateFilter } from "@/src/utils/eventTime";
import type { HostFilter } from "@/src/utils/filters";

// Filters from the filter sheet (date, distance, host type). Shared by map and explore, so a filter set
// on the map also applies to the list. Not persisted: every app start begins with "Alle kommenden".
type Ctx = {
  date: DateFilter;
  radiusKm: number | null;
  host: HostFilter;
  setDate: (d: DateFilter) => void;
  setRadiusKm: (km: number | null) => void;
  setHost: (h: HostFilter) => void;
  reset: () => void;
  activeCount: number;
};

const FilterCtx = createContext<Ctx>({} as Ctx);
const ALL: DateFilter = { kind: "all" };

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [date, setDate] = useState<DateFilter>(ALL);
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [host, setHost] = useState<HostFilter>("all");
  const reset = useCallback(() => { setDate(ALL); setRadiusKm(null); setHost("all"); }, []);
  const value = useMemo(() => ({
    date, radiusKm, host, setDate, setRadiusKm, setHost, reset,
    activeCount: (date.kind !== "all" ? 1 : 0) + (radiusKm !== null ? 1 : 0) + (host !== "all" ? 1 : 0),
  }), [date, radiusKm, host, reset]);
  return <FilterCtx.Provider value={value}>{children}</FilterCtx.Provider>;
}

export const useFilters = () => useContext(FilterCtx);
