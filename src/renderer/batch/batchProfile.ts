/**
 * Batch export profile: the style, export options and page settings every territory of a
 * batch is exported with. The application writes it from its current settings; the command
 * line reads it. A profile is checked as a whole: a wrong value is refused, with the name
 * of the field, rather than replaced.
 */

import { RenderStyle } from '../types';
import { ExportOptions } from '../hooks/useExport';
import { DEFAULT_EXPORT_OPTIONS } from '../hooks/usePreferences';
import { MAPS_STYLE } from '../presets/defaultPresets';
import { migrateStyle } from '../presets/migrateStyle';
import { normalizeColor } from '../utils/colors';
import { DEFAULT_PAGE_SETTINGS, PAGE_SIZES_MM, PageFormat, PageSettings, planPage } from './pagePlan';
import L from 'leaflet';

export type BatchFormat = 'pdf' | 'png' | 'jpeg' | 'svg';
export const BATCH_FORMATS: readonly BatchFormat[] = ['pdf', 'png', 'jpeg', 'svg'];

/** Export options of the application, but the KML beside the map: the batch reads KML files */
export type BatchExportOptions = Omit<ExportOptions, 'kmlAlongside'>;

export interface BatchProfile {
  style: RenderStyle;
  formats: BatchFormat[];
  export: BatchExportOptions;
  page: PageSettings;
}

export type BatchProfileResult = { ok: true; profile: BatchProfile } | { ok: false; message: string };

class Refused extends Error {}

const STYLE_GROUPS = ['highway', 'building', 'landuse', 'natural', 'waterway'] as const;

export function defaultBatchProfile(): BatchProfile {
  const style = migrateStyle(structuredClone(MAPS_STYLE));
  return {
    style,
    formats: ['pdf'],
    export: {
      forceAllLabels: DEFAULT_EXPORT_OPTIONS.forceAllLabels,
      borderColor: style.borderColor,
      exteriorOverlay: DEFAULT_EXPORT_OPTIONS.exteriorOverlay,
      exteriorOverlayOpacity: DEFAULT_EXPORT_OPTIONS.exteriorOverlayOpacity,
      showPOI: true,
      showCompass: true,
      maxExportSizeEnabled: DEFAULT_EXPORT_OPTIONS.maxExportSizeEnabled,
      maxExportSizeKB: DEFAULT_EXPORT_OPTIONS.maxExportSizeKB,
      minQualityPercent: DEFAULT_EXPORT_OPTIONS.minQualityPercent,
    },
    page: { ...DEFAULT_PAGE_SETTINGS, formats: [...DEFAULT_PAGE_SETTINGS.formats] },
  };
}

export function serializeBatchProfile(profile: BatchProfile): string {
  return `${JSON.stringify(profile, null, 2)}\n`;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readStyle(value: unknown): RenderStyle {
  if (!isObject(value) || !STYLE_GROUPS.every(group => isObject(value[group]))) {
    throw new Refused(`Style incomplet : il doit contenir ${STYLE_GROUPS.join(', ')}.`);
  }
  return migrateStyle(structuredClone(value) as unknown as RenderStyle);
}

function readFormats(value: unknown): BatchFormat[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Refused(`Formats : liste non vide attendue parmi ${BATCH_FORMATS.join(', ')}.`);
  }
  const unknown = value.find(format => !BATCH_FORMATS.includes(format));
  if (unknown !== undefined) throw new Refused(`Format inconnu : ${String(unknown)}.`);
  return [...new Set(value as BatchFormat[])];
}

// Value of a field, its default when absent, refused when of the wrong kind
function field<T>(source: Record<string, unknown>, name: string, fallback: T, valid: (value: unknown) => boolean, expected: string): T {
  if (!(name in source)) return fallback;
  if (!valid(source[name])) throw new Refused(`${name} : ${expected} attendu.`);
  return source[name] as T;
}

const isBoolean = (value: unknown) => typeof value === 'boolean';
const inRange = (min: number, max: number) => (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

function readExport(value: unknown, defaults: BatchExportOptions, style: RenderStyle): BatchExportOptions {
  const source = isObject(value) ? value : {};
  const borderColor = field<unknown>(source, 'borderColor', style.borderColor, v => normalizeColor(v) !== undefined, 'une couleur');
  return {
    forceAllLabels: field(source, 'forceAllLabels', defaults.forceAllLabels, isBoolean, 'un booléen'),
    borderColor: normalizeColor(borderColor) as string,
    exteriorOverlay: field(source, 'exteriorOverlay', defaults.exteriorOverlay, isBoolean, 'un booléen'),
    exteriorOverlayOpacity: field(source, 'exteriorOverlayOpacity', defaults.exteriorOverlayOpacity, inRange(0, 1), 'un nombre entre 0 et 1'),
    showPOI: field(source, 'showPOI', defaults.showPOI, isBoolean, 'un booléen'),
    showCompass: field(source, 'showCompass', defaults.showCompass, isBoolean, 'un booléen'),
    maxExportSizeEnabled: field(source, 'maxExportSizeEnabled', defaults.maxExportSizeEnabled, isBoolean, 'un booléen'),
    maxExportSizeKB: field(source, 'maxExportSizeKB', defaults.maxExportSizeKB, inRange(1, Number.MAX_SAFE_INTEGER), 'un nombre positif de Ko'),
    minQualityPercent: field(source, 'minQualityPercent', defaults.minQualityPercent, inRange(10, 100), 'un pourcentage entre 10 et 100'),
  };
}

function readPage(value: unknown, defaults: PageSettings): PageSettings {
  const source = isObject(value) ? value : {};
  const formats = field<unknown[]>(source, 'formats', defaults.formats, v => Array.isArray(v), 'une liste de formats');
  const unknown = formats.find(format => typeof format !== 'string' || !(format in PAGE_SIZES_MM));
  if (unknown !== undefined) throw new Refused(`Format de page inconnu : ${String(unknown)}.`);
  if (formats.length === 0) throw new Refused('Formats de page : au moins un format attendu (a4, a3).');

  const page: PageSettings = {
    formats: formats as PageFormat[],
    dpi: field(source, 'dpi', defaults.dpi, inRange(1, 2400), 'une résolution en dpi'),
    marginMm: field(source, 'marginMm', defaults.marginMm, inRange(0, 100), 'une marge en mm'),
    minZoom: field(source, 'minZoom', defaults.minZoom, inRange(0, 22), 'un zoom entre 0 et 22'),
    maxZoom: field(source, 'maxZoom', defaults.maxZoom, inRange(0, 22), 'un zoom entre 0 et 22'),
  };
  if (page.minZoom > page.maxZoom) throw new Refused('Zoom minimal supérieur au zoom maximal.');
  // The page planner has the last word on what gives a page
  try {
    planPage(L.latLngBounds([0, 0], [0.001, 0.001]), page);
  } catch {
    throw new Refused('Réglages de page impossibles (marge trop grande pour le format).');
  }
  return page;
}

/** Profile of a JSON text, completed with the defaults, or why it is refused */
export function parseBatchProfile(text: string): BatchProfileResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, message: 'Profil illisible : JSON invalide.' };
  }
  if (!isObject(json)) return { ok: false, message: 'Profil illisible : objet JSON attendu.' };

  try {
    const defaults = defaultBatchProfile();
    const style = 'style' in json ? readStyle(json.style) : defaults.style;
    return {
      ok: true,
      profile: {
        style,
        formats: 'formats' in json ? readFormats(json.formats) : defaults.formats,
        export: readExport(json.export, defaults.export, style),
        page: readPage(json.page, defaults.page),
      },
    };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, message: error.message };
    throw error;
  }
}
