import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";

// Named app themes:
//  - "standard": the original high-end dark obsidian theme with electric ice-blue primary
//    and emerald mint accents (glassmorphism, dark map style). Default.
//  - "gold": a bright "Gold & White" theme — white backgrounds, elegant gold accents/borders,
//    and standard realistic map colors (no dark map overlay).
//  - "sunset": "Electric Sunset" — warm off-white with a vivid coral/orange primary and violet accents (light map).
//  - "mint": "Fresh Mint" — dark slate with emerald green primary and bright mint accents (dark map).
const PALETTE = {
  surface: { standard: "#0A0B0D", gold: "#FFFFFF", sunset: "#FFF8F3", mint: "#0F1720" },
  onSurface: { standard: "#EDEEF2", gold: "#1C1A12", sunset: "#2A1A14", mint: "#E6EEF3" },
  surfaceSecondary: { standard: "#141519", gold: "#FBF8F0", sunset: "#FFFFFF", mint: "#16212C" },
  onSurfaceSecondary: { standard: "#C7C9D1", gold: "#3B3524", sunset: "#4A3329", mint: "#B9C7D2" },
  surfaceTertiary: { standard: "#1E2025", gold: "#F3ECD9", sunset: "#FFEDE3", mint: "#1E2B38" },
  onSurfaceTertiary: { standard: "#8A8D98", gold: "#8C7C50", sunset: "#8A5A46", mint: "#7F93A3" },
  surfaceInverse: { standard: "#FFFFFF", gold: "#1C1A12", sunset: "#2A1A14", mint: "#FFFFFF" },
  onSurfaceInverse: { standard: "#0E1013", gold: "#FFFFFF", sunset: "#FFFFFF", mint: "#0F1720" },
  brand: { standard: "#159AB8", gold: "#C9A227", sunset: "#E8501F", mint: "#059669" },
  onBrand: { standard: "#FFFFFF", gold: "#FFFFFF", sunset: "#FFFFFF", mint: "#FFFFFF" },
  brandTertiary: { standard: "#0E2A33", gold: "#F6EDD1", sunset: "#FFE1D3", mint: "#0B2E25" },
  onBrandTertiary: { standard: "#7FE0F2", gold: "#8A6D1F", sunset: "#A8360F", mint: "#6EE7B7" },
  accent: { standard: "#2EE6A6", gold: "#B8860B", sunset: "#7C3AED", mint: "#34D399" },
  onAccent: { standard: "#04160F", gold: "#FFFFFF", sunset: "#FFFFFF", mint: "#04130D" },
  success: { standard: "#2EE6A6", gold: "#0F9E74", sunset: "#12A150", mint: "#34D399" },
  warning: { standard: "#EFC94C", gold: "#B58900", sunset: "#C77700", mint: "#FBBF24" },
  error: { standard: "#FF6369", gold: "#E5484D", sunset: "#C81E4B", mint: "#F87171" },
  border: { standard: "#26282E", gold: "#E7D9AE", sunset: "#F3D9CC", mint: "#243241" },
  borderStrong: { standard: "#3A3D45", gold: "#D4BE7C", sunset: "#E8B9A3", mint: "#33465A" },
  pinNightlife: { standard: "#4C7DFF", gold: "#3C6BE0", sunset: "#5B5BF0", mint: "#4C7DFF" },
  pinFood: { standard: "#F2C14E", gold: "#C99A2E", sunset: "#E0A21A", mint: "#F2C14E" },
  pinSports: { standard: "#34D399", gold: "#2F9E5B", sunset: "#16A34A", mint: "#34D399" },
  pinCulture: { standard: "#3AA0FF", gold: "#2A86C4", sunset: "#2F7FD8", mint: "#3AA0FF" },
};

export type ThemeColors = { [K in keyof typeof PALETTE]: string };
export type ThemeName = "standard" | "gold" | "sunset" | "mint";
export const THEMES: ThemeName[] = ["standard", "gold", "sunset", "mint"];
const DARK_THEMES: ThemeName[] = ["standard", "mint"];

const THEME_KEY = "localloop_theme_name";

type Ctx = {
  theme: ThemeName;
  colors: ThemeColors;
  setTheme: (name: ThemeName) => void;
  isDark: boolean;
};

const ThemeCtx = createContext<Ctx>({} as Ctx);

function resolveColors(theme: ThemeName): ThemeColors {
  const out = {} as ThemeColors;
  (Object.keys(PALETTE) as (keyof typeof PALETTE)[]).forEach((k) => {
    out[k] = PALETTE[k][theme];
  });
  return out;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("standard");

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string>(THEME_KEY, "");
      setThemeState(THEMES.includes(saved as ThemeName) ? (saved as ThemeName) : "standard");
    })();
  }, []);

  const setTheme = useCallback((name: ThemeName) => {
    setThemeState(name);
    storage.setItem(THEME_KEY, name);
  }, []);

  return (
    <ThemeCtx.Provider value={{ theme, colors: resolveColors(theme), setTheme, isDark: DARK_THEMES.includes(theme) }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
