/**
 * String similarity utilities for suggesting corrections
 */

/**
 * Maximum edit distance for typo suggestions
 */
export const MAX_EDIT_DISTANCE = 3;

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0]![j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1]!.toLowerCase() === str2[j - 1]!.toLowerCase() ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1, // deletion
        matrix[i]![j - 1]! + 1, // insertion
        matrix[i - 1]![j - 1]! + cost // substitution
      );
    }
  }

  return matrix[len1]![len2]!;
}

/**
 * Find similar strings within a maximum distance
 */
export function findSimilar(
  target: string,
  candidates: string[],
  maxDistance: number = MAX_EDIT_DISTANCE
): Array<{ value: string; distance: number }> {
  const similarities = candidates
    .map(candidate => ({
      value: candidate,
      distance: levenshteinDistance(target, candidate),
    }))
    .filter(item => item.distance >= 0 && item.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance);

  // Return top 3 suggestions
  return similarities.slice(0, 3);
}
