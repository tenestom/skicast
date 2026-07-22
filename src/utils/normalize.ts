/**
 * Cleans up a skier name by removing:
 * - leading numbers (e.g. bib numbers)
 * - trailing numbers
 * - standalone digits
 * while preserving spaces, hyphens, apostrophes, and accented characters.
 */
export function normalizeName(name: string): string {
  if (!name) return '';
  return name
    .replace(/(^\d+\s*|\s*\d+$)/g, '') // leading/trailing numbers
    .replace(/\b\d+\b/g, '')           // standalone digits
    .replace(/\s+/g, ' ')              // collapse multiple spaces
    .trim();
}

/**
 * Cleans up a club name by removing asterisks and extra whitespace.
 */
export function normalizeClub(club: string): string {
  if (!club) return '';
  return club
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes an entire Skier object (or partial).
 */
export function normalizeSkierData<T extends { name?: string; club?: string }>(skier: T): T {
  return {
    ...skier,
    name: skier.name ? normalizeName(skier.name) : skier.name,
    club: skier.club ? normalizeClub(skier.club) : skier.club,
  };
}
