/**
 * Color validation: every color of a style ends up in the CSS of the SVG export and in
 * canvas strokes, and may come from an imported ruleset. Colors are normalized to
 * six-digit hex, the only form color inputs and casing derivation read.
 */

import { FeatureStyle, LabelStyle, RenderStyle, TunnelStyle } from '../types';

// CSS named colors (CSS Color Module Level 4), without transparent
const NAMED_COLORS = new Map<string, string>(Object.entries({
  aliceblue: 'f0f8ff', antiquewhite: 'faebd7', aqua: '00ffff', aquamarine: '7fffd4', azure: 'f0ffff',
  beige: 'f5f5dc', bisque: 'ffe4c4', black: '000000', blanchedalmond: 'ffebcd', blue: '0000ff',
  blueviolet: '8a2be2', brown: 'a52a2a', burlywood: 'deb887', cadetblue: '5f9ea0', chartreuse: '7fff00',
  chocolate: 'd2691e', coral: 'ff7f50', cornflowerblue: '6495ed', cornsilk: 'fff8dc', crimson: 'dc143c',
  cyan: '00ffff', darkblue: '00008b', darkcyan: '008b8b', darkgoldenrod: 'b8860b', darkgray: 'a9a9a9',
  darkgreen: '006400', darkgrey: 'a9a9a9', darkkhaki: 'bdb76b', darkmagenta: '8b008b', darkolivegreen: '556b2f',
  darkorange: 'ff8c00', darkorchid: '9932cc', darkred: '8b0000', darksalmon: 'e9967a', darkseagreen: '8fbc8f',
  darkslateblue: '483d8b', darkslategray: '2f4f4f', darkslategrey: '2f4f4f', darkturquoise: '00ced1',
  darkviolet: '9400d3', deeppink: 'ff1493', deepskyblue: '00bfff', dimgray: '696969', dimgrey: '696969',
  dodgerblue: '1e90ff', firebrick: 'b22222', floralwhite: 'fffaf0', forestgreen: '228b22', fuchsia: 'ff00ff',
  gainsboro: 'dcdcdc', ghostwhite: 'f8f8ff', gold: 'ffd700', goldenrod: 'daa520', gray: '808080',
  green: '008000', greenyellow: 'adff2f', grey: '808080', honeydew: 'f0fff0', hotpink: 'ff69b4',
  indianred: 'cd5c5c', indigo: '4b0082', ivory: 'fffff0', khaki: 'f0e68c', lavender: 'e6e6fa',
  lavenderblush: 'fff0f5', lawngreen: '7cfc00', lemonchiffon: 'fffacd', lightblue: 'add8e6', lightcoral: 'f08080',
  lightcyan: 'e0ffff', lightgoldenrodyellow: 'fafad2', lightgray: 'd3d3d3', lightgreen: '90ee90',
  lightgrey: 'd3d3d3', lightpink: 'ffb6c1', lightsalmon: 'ffa07a', lightseagreen: '20b2aa',
  lightskyblue: '87cefa', lightslategray: '778899', lightslategrey: '778899', lightsteelblue: 'b0c4de',
  lightyellow: 'ffffe0', lime: '00ff00', limegreen: '32cd32', linen: 'faf0e6', magenta: 'ff00ff',
  maroon: '800000', mediumaquamarine: '66cdaa', mediumblue: '0000cd', mediumorchid: 'ba55d3',
  mediumpurple: '9370db', mediumseagreen: '3cb371', mediumslateblue: '7b68ee', mediumspringgreen: '00fa9a',
  mediumturquoise: '48d1cc', mediumvioletred: 'c71585', midnightblue: '191970', mintcream: 'f5fffa',
  mistyrose: 'ffe4e1', moccasin: 'ffe4b5', navajowhite: 'ffdead', navy: '000080', oldlace: 'fdf5e6',
  olive: '808000', olivedrab: '6b8e23', orange: 'ffa500', orangered: 'ff4500', orchid: 'da70d6',
  palegoldenrod: 'eee8aa', palegreen: '98fb98', paleturquoise: 'afeeee', palevioletred: 'db7093',
  papayawhip: 'ffefd5', peachpuff: 'ffdab9', peru: 'cd853f', pink: 'ffc0cb', plum: 'dda0dd',
  powderblue: 'b0e0e6', purple: '800080', rebeccapurple: '663399', red: 'ff0000', rosybrown: 'bc8f8f',
  royalblue: '4169e1', saddlebrown: '8b4513', salmon: 'fa8072', sandybrown: 'f4a460', seagreen: '2e8b57',
  seashell: 'fff5ee', sienna: 'a0522d', silver: 'c0c0c0', skyblue: '87ceeb', slateblue: '6a5acd',
  slategray: '708090', slategrey: '708090', snow: 'fffafa', springgreen: '00ff7f', steelblue: '4682b4',
  tan: 'd2b48c', teal: '008080', thistle: 'd8bfd8', tomato: 'ff6347', turquoise: '40e0d0', violet: 'ee82ee',
  wheat: 'f5deb3', white: 'ffffff', whitesmoke: 'f5f5f5', yellow: 'ffff00', yellowgreen: '9acd32',
}));

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/;
// Comma or space separated channels, with an optional alpha (ignored)
const SEP = '(?:\\s*,\\s*|\\s+)';
const ALPHA = '(?:\\s*[,/]\\s*[\\d.]+%?)?';
const RGB = new RegExp(`^rgba?\\(\\s*([\\d.]+%?)${SEP}([\\d.]+%?)${SEP}([\\d.]+%?)${ALPHA}\\s*\\)$`);
const HSL = new RegExp(`^hsla?\\(\\s*([\\d.]+)(?:deg)?${SEP}([\\d.]+)%${SEP}([\\d.]+)%${ALPHA}\\s*\\)$`);

function channel(value: string): number | undefined {
  const number = parseFloat(value);
  if (!Number.isFinite(number)) return undefined;
  const scaled = value.endsWith('%') ? (number / 100) * 255 : number;
  return scaled >= 0 && scaled <= 255 ? Math.round(scaled) : undefined;
}

const hex2 = (value: number) => value.toString(16).padStart(2, '0');

/**
 * Six-digit lowercase hex form of a CSS color (hex, rgb(), rgba() or named; alpha is
 * dropped), or undefined when the value is not a color
 */
export function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const color = value.trim().toLowerCase();

  const hex = color.match(HEX)?.[1];
  if (hex) {
    const digits = hex.length <= 4 ? [...hex.slice(0, 3)].map(digit => digit + digit).join('') : hex.slice(0, 6);
    return `#${digits}`;
  }

  const rgb = color.match(RGB);
  if (rgb) {
    const channels = rgb.slice(1, 4).map(channel);
    return channels.every((value): value is number => value !== undefined) ? `#${channels.map(hex2).join('')}` : undefined;
  }

  const hsl = color.match(HSL);
  if (hsl) {
    const [hue, saturation, lightness] = [parseFloat(hsl[1]) % 360, parseFloat(hsl[2]) / 100, parseFloat(hsl[3]) / 100];
    if (saturation > 1 || lightness > 1) return undefined;
    const a = saturation * Math.min(lightness, 1 - lightness);
    const f = (n: number) => {
      const k = (n + hue / 30) % 12;
      return Math.round((lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
    };
    return `#${[f(0), f(8), f(4)].map(hex2).join('')}`;
  }

  const named = NAMED_COLORS.get(color);
  return named ? `#${named}` : undefined;
}

const FALLBACK_FEATURE_COLOR = '#888888';

// Opacity between 0 and 1; values that are not numbers fall back
function opacityOf(value: unknown, fallback: number): number {
  return typeof value === 'number' && !Number.isNaN(value) ? Math.min(Math.max(value, 0), 1) : fallback;
}

const isTransparent = (value: unknown) => typeof value === 'string' && value.trim().toLowerCase() === 'transparent';

function sanitizeFeature(featureStyle: FeatureStyle): FeatureStyle {
  // A transparent fill or line is drawn fully transparent
  const transparent = isTransparent(featureStyle.color);
  const result: FeatureStyle = {
    ...featureStyle,
    color: transparent ? '#000000' : normalizeColor(featureStyle.color) ?? FALLBACK_FEATURE_COLOR,
    opacity: transparent ? 0 : opacityOf(featureStyle.opacity, 1),
  };
  const strokeColor = normalizeColor(featureStyle.strokeColor);
  if (strokeColor) result.strokeColor = strokeColor;
  else delete result.strokeColor;
  // A transparent outline or casing is hidden
  if (isTransparent(featureStyle.strokeColor)) result.casingLineStyle = 'none';
  return result;
}

function sanitizeGroup<T extends Record<string, FeatureStyle>>(group: T): T {
  return Object.fromEntries(
    Object.entries(group).map(([key, featureStyle]) => [key, sanitizeFeature(featureStyle)])
  ) as T;
}

// Tunnel styles and labels only set some colors: invalid ones are dropped
function sanitizePartial<T extends TunnelStyle | Partial<LabelStyle>>(values: T, keys: readonly string[]): T {
  const result: Record<string, unknown> = { ...values };
  for (const key of keys) {
    if (!(key in result)) continue;
    const color = normalizeColor(result[key]);
    if (color) result[key] = color;
    else delete result[key];
  }
  return result as T;
}

const LABEL_KEYS: readonly (keyof LabelStyle)[] = [
  'roadColor', 'areaColor', 'waterColor', 'forestColor', 'houseNumberColor', 'haloColor',
];

/**
 * Copy of a style whose colors are all six-digit hex and whose opacities and border
 * width are numbers: invalid feature colors fall back to gray, invalid outline, tunnel
 * and label colors are dropped (derived or default)
 */
export function sanitizeStyle(style: RenderStyle): RenderStyle {
  const result: RenderStyle = {
    ...style,
    backgroundColor: normalizeColor(style.backgroundColor) ?? '#f5f5f5',
    interiorColor: normalizeColor(style.interiorColor) ?? '#ffffff',
    borderColor: normalizeColor(style.borderColor) ?? '#000000',
    borderWidth: typeof style.borderWidth === 'number' && Number.isFinite(style.borderWidth) && style.borderWidth >= 0
      ? style.borderWidth : 1,
    strokeOpacity: opacityOf(style.strokeOpacity, 1),
    fillOpacity: opacityOf(style.fillOpacity, 0),
    highway: sanitizeGroup(style.highway),
    building: sanitizeGroup(style.building),
    landuse: sanitizeGroup(style.landuse),
    natural: sanitizeGroup(style.natural),
    waterway: sanitizeGroup(style.waterway),
  };
  if (style.railway) result.railway = sanitizeGroup(style.railway);
  if (style.highwayTunnel) result.highwayTunnel = sanitizePartial(style.highwayTunnel, ['color', 'strokeColor']);
  if (style.waterwayTunnel) result.waterwayTunnel = sanitizePartial(style.waterwayTunnel, ['color', 'strokeColor']);
  if (style.labels) result.labels = sanitizePartial(style.labels, LABEL_KEYS);
  return result;
}
