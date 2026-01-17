/**
 * Font loader utility - loads fonts from @fontsource and converts to base64
 * for embedding in SVG exports (when size limit is disabled)
 */

import type { FontFamily } from '../constants/fonts';

// Import font files directly (webpack will convert them to data URLs)
// We only import latin subset for smaller file size
import robotoRegular from '@fontsource/roboto/files/roboto-latin-400-normal.woff2';
import robotoMedium from '@fontsource/roboto/files/roboto-latin-500-normal.woff2';
import robotoBold from '@fontsource/roboto/files/roboto-latin-700-normal.woff2';

import interRegular from '@fontsource/inter/files/inter-latin-400-normal.woff2';
import interMedium from '@fontsource/inter/files/inter-latin-500-normal.woff2';
import interBold from '@fontsource/inter/files/inter-latin-700-normal.woff2';

import openSansRegular from '@fontsource/open-sans/files/open-sans-latin-400-normal.woff2';
import openSansMedium from '@fontsource/open-sans/files/open-sans-latin-500-normal.woff2';
import openSansBold from '@fontsource/open-sans/files/open-sans-latin-700-normal.woff2';

import notoSansRegular from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2';
import notoSansMedium from '@fontsource/noto-sans/files/noto-sans-latin-500-normal.woff2';
import notoSansBold from '@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff2';

interface FontData {
  regular: string;
  medium: string;
  bold: string;
}

// Font data URLs (webpack converts woff2 imports to data URLs automatically)
const FONT_DATA_URLS: Record<FontFamily, FontData> = {
  'Roboto': {
    regular: robotoRegular,
    medium: robotoMedium,
    bold: robotoBold,
  },
  'Inter': {
    regular: interRegular,
    medium: interMedium,
    bold: interBold,
  },
  'Open Sans': {
    regular: openSansRegular,
    medium: openSansMedium,
    bold: openSansBold,
  },
  'Noto Sans': {
    regular: notoSansRegular,
    medium: notoSansMedium,
    bold: notoSansBold,
  },
};

/**
 * Get font data URLs for a given font family
 * These are already base64 encoded by webpack
 */
export function getFontDataURLs(fontFamily: FontFamily): FontData {
  return FONT_DATA_URLS[fontFamily];
}

/**
 * Check if fonts are embedded as data URLs
 */
export function hasFontDataURLs(fontFamily: FontFamily): boolean {
  const urls = FONT_DATA_URLS[fontFamily];
  return Boolean(urls?.regular && urls?.medium && urls?.bold);
}
