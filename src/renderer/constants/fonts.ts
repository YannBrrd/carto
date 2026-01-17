/**
 * Font configuration for map labels
 *
 * Fonts are loaded locally via @fontsource packages for offline support.
 * Font files are embedded as base64 in SVG exports for standalone rendering.
 */

// Font weights used across all fonts
export const FONT_WEIGHTS = {
  regular: 400,
  medium: 500,
  bold: 700,
} as const;

// Available fonts for map labels
export type FontFamily = 'Roboto' | 'Inter' | 'Open Sans' | 'Noto Sans';

// Font metadata for UI display
export const FONT_INFO: Record<FontFamily, { name: string; description: string }> = {
  'Roboto': {
    name: 'Roboto',
    description: 'Neutre et polyvalente (défaut)',
  },
  'Inter': {
    name: 'Inter',
    description: 'Moderne et très lisible',
  },
  'Open Sans': {
    name: 'Open Sans',
    description: 'Style Google Maps classique',
  },
  'Noto Sans': {
    name: 'Noto Sans',
    description: 'Support universel (multilangue)',
  },
};

// Default font family
export const DEFAULT_FONT_FAMILY: FontFamily = 'Roboto';

// List of valid font families for runtime validation
export const VALID_FONT_FAMILIES: readonly FontFamily[] = ['Roboto', 'Inter', 'Open Sans', 'Noto Sans'];

// Helper to validate if a string is a valid FontFamily
export function isValidFontFamily(font: string): font is FontFamily {
  return VALID_FONT_FAMILIES.includes(font as FontFamily);
}

// Helper to get CSS font-family string with fallbacks
export function getFontFamilyCSS(font: FontFamily): string {
  return `'${font}', 'Arial', sans-serif`;
}
