export type CategoryKey =
  | "sports"
  | "nightlife"
  | "rooftop"
  | "food"
  | "arts"
  | "networking"
  | "gaming"
  | "outdoor"
  | "workshops"
  | "music"
  | "restaurant"
  | "cafe"
  | "other";

export type CategoryMeta = {
  key: CategoryKey;
  label: string;
  color: string; // vibrant neon hue (no orange)
  icon: string; // Ionicons name
  emoji: string;
  nightlife?: boolean; // age-restricted (18+) tag for alcohol/nightlife
};

export const CATEGORIES: CategoryMeta[] = [
  { key: "sports", label: "Sports & Fitness", color: "#FF5A79", icon: "barbell", emoji: "🏋️" },
  { key: "nightlife", label: "Nightlife & Clubs", color: "#4C7DFF", icon: "disc", emoji: "🪩", nightlife: true },
  { key: "rooftop", label: "Rooftop & Bar", color: "#FF7EB6", icon: "wine", emoji: "🍹", nightlife: true },
  { key: "food", label: "Food & Culinary", color: "#F2C14E", icon: "restaurant", emoji: "🍕" },
  { key: "arts", label: "Arts & Culture", color: "#F45CD6", icon: "color-palette", emoji: "🎨" },
  { key: "networking", label: "Networking", color: "#3AA0FF", icon: "briefcase", emoji: "💼" },
  { key: "gaming", label: "Gaming & E-Sports", color: "#22D3EE", icon: "game-controller", emoji: "🎮" },
  { key: "outdoor", label: "Outdoor & Nature", color: "#34D399", icon: "leaf", emoji: "🪵" },
  { key: "workshops", label: "Workshops", color: "#56CCF2", icon: "book", emoji: "📚" },
  { key: "music", label: "Music & Concerts", color: "#2DD4BF", icon: "musical-notes", emoji: "🎵" },
  { key: "restaurant", label: "Restaurant", color: "#F59E9E", icon: "restaurant", emoji: "🍽️" },
  { key: "cafe", label: "Café", color: "#C8A27C", icon: "cafe", emoji: "☕" },
  // "Sonstiges": hosts type their own short label (event.category_label) when nothing else fits.
  { key: "other", label: "Other", color: "#94A3B8", icon: "ellipsis-horizontal-circle", emoji: "✨" },
];

export const CATEGORY_LABEL_MAX = 30;

const FALLBACK: CategoryMeta = CATEGORIES[CATEGORIES.length - 1]; // unknown categories show as "Sonstiges"

export const categoryMeta = (cat: string): CategoryMeta =>
  CATEGORIES.find((c) => c.key === cat) || FALLBACK;

export const categoryColor = (cat: string): string => categoryMeta(cat).color;

// Display name of an event's category: the host's own text for "Sonstiges", otherwise the translated name.
export const categoryLabel = (e: { category: string; category_label?: string }, t: (k: string) => string): string => {
  if (e.category === "other" && e.category_label?.trim()) return e.category_label.trim();
  const key = CATEGORIES.some((c) => c.key === e.category) ? e.category : "other";
  return t(`cat_${key}`);
};

// Categories that are age-restricted (18+) — nightlife / alcohol tagged.
export const isAgeRestricted = (cat: string): boolean => !!categoryMeta(cat).nightlife;

export const DEFAULT_REGION = {
  latitude: 49.0089,
  longitude: 8.4069,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};
