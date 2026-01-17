/**
 * Font configuration for map labels
 *
 * Fonts are loaded locally via @fontsource packages for offline support.
 * Google Fonts URLs are used for SVG exports to ensure standalone rendering.
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

// Google Fonts URLs for @font-face in exported SVG files
// These allow the SVG to render correctly when opened in external viewers
interface FontUrls {
  regular: string;
  medium: string;
  bold: string;
}

export const FONT_URLS: Record<FontFamily, FontUrls> = {
  'Roboto': {
    regular: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.woff2',
    medium: 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmEU9fBBc4.woff2',
    bold: 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc4.woff2',
  },
  'Inter': {
    regular: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2',
    medium: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI6fAZ9hiA.woff2',
    bold: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYAZ9hiA.woff2',
  },
  'Open Sans': {
    regular: 'https://fonts.gstatic.com/s/opensans/v34/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjZ0B4gaVI.woff2',
    medium: 'https://fonts.gstatic.com/s/opensans/v34/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjr0B4gaVI.woff2',
    bold: 'https://fonts.gstatic.com/s/opensans/v34/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsg-1x4gaVI.woff2',
  },
  'Noto Sans': {
    regular: 'https://fonts.gstatic.com/s/notosans/v28/o-0IIpQlx3QUlC5A4PNr5TRASf6M7Q.woff2',
    medium: 'https://fonts.gstatic.com/s/notosans/v28/o-0NIpQlx3QUlC5A4PNjXhFVadyB1Wk.woff2',
    bold: 'https://fonts.gstatic.com/s/notosans/v28/o-0NIpQlx3QUlC5A4PNjThFVadyB1Wk.woff2',
  },
};

// Default font family
export const DEFAULT_FONT_FAMILY: FontFamily = 'Roboto';

// Helper to get CSS font-family string with fallbacks
export function getFontFamilyCSS(font: FontFamily): string {
  return `'${font}', 'Arial', sans-serif`;
}
