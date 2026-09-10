const SPECIAL: Record<string, string> = {
  wifi: 'Wi-Fi',
  'tv-display': 'TV display',
  'video-conf': 'Video conference',
  'dual-monitor': 'Dual monitor',
};

/** "video-conf" -> "Video conference", "natural-light" -> "Natural light". */
export function amenityLabel(amenity: string): string {
  const key = amenity.toLowerCase().trim();
  if (SPECIAL[key]) return SPECIAL[key];
  const spaced = key.replace(/[-_]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
