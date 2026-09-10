/** "video-conf" -> "Video conf", "natural-light" -> "Natural light". */
export function amenityLabel(amenity: string): string {
  const spaced = amenity.replace(/[-_]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
