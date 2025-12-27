/**
 * Shared value validation utilities
 */

export function isValidBoolean(value: string): boolean {
  const lower = value.toLowerCase();
  return lower === 'true' || lower === 'false';
}

export function isValidInteger(value: string): boolean {
  return /^-?\d+$/.test(value);
}

export function isValidFloat(value: string): boolean {
  // Support regular floats (e.g., 3.234, .5, -1.2, -.1) and scientific notation (e.g., 1.5e10, 2.5E-3)
  // Requires at least one digit: either before decimal (\d+\.?\d*) or after decimal (\d*\.\d+)
  return /^-?(\d+\.?\d*|\d*\.\d+)([eE][+-]?\d+)?$/.test(value);
}

export function isValidByte(value: string): boolean {
  const num = parseInt(value, 10);
  return !isNaN(num) && num >= 0 && num <= 255 && isValidInteger(value);
}
