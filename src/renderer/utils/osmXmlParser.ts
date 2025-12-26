/**
 * OSM XML Parser
 * Parses .osm XML files and converts to Overpass JSON format
 * Uses browser DOMParser - no external dependencies
 */

import { OSMBounds } from '../types';

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  members?: Array<{ type: string; ref: number; role: string }>;
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  elements: OverpassElement[];
}

export interface ParsedOSMData {
  data: OverpassResponse;
  bounds: OSMBounds | null;
}

/**
 * Parse tags from an OSM element
 */
function parseTags(element: Element): Record<string, string> | undefined {
  const tagElements = element.querySelectorAll(':scope > tag');
  if (tagElements.length === 0) return undefined;

  const tags: Record<string, string> = {};
  for (let i = 0; i < tagElements.length; i++) {
    const tag = tagElements[i];
    const k = tag.getAttribute('k');
    const v = tag.getAttribute('v');
    if (k && v) {
      tags[k] = v;
    }
  }
  return tags;
}

/**
 * Parse OSM XML string to Overpass JSON format
 */
export function parseOSMXml(xmlContent: string): ParsedOSMData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, 'application/xml');

  // Check for parsing errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Format XML invalide: ' + parseError.textContent);
  }

  const elements: OverpassElement[] = [];

  // Parse bounds
  let bounds: OSMBounds | null = null;
  const boundsEl = doc.querySelector('bounds');
  if (boundsEl) {
    bounds = {
      minlat: parseFloat(boundsEl.getAttribute('minlat') || '0'),
      minlon: parseFloat(boundsEl.getAttribute('minlon') || '0'),
      maxlat: parseFloat(boundsEl.getAttribute('maxlat') || '0'),
      maxlon: parseFloat(boundsEl.getAttribute('maxlon') || '0'),
    };
  }

  // Parse nodes
  const nodeElements = doc.querySelectorAll('osm > node');
  for (let i = 0; i < nodeElements.length; i++) {
    const node = nodeElements[i];
    const id = parseInt(node.getAttribute('id') || '0', 10);
    const lat = parseFloat(node.getAttribute('lat') || '0');
    const lon = parseFloat(node.getAttribute('lon') || '0');

    const element: OverpassElement = {
      type: 'node',
      id,
      lat,
      lon,
    };

    const tags = parseTags(node);
    if (tags) element.tags = tags;

    elements.push(element);

    // Update bounds from nodes if not defined
    if (!bounds) {
      bounds = { minlat: lat, minlon: lon, maxlat: lat, maxlon: lon };
    } else {
      bounds.minlat = Math.min(bounds.minlat, lat);
      bounds.minlon = Math.min(bounds.minlon, lon);
      bounds.maxlat = Math.max(bounds.maxlat, lat);
      bounds.maxlon = Math.max(bounds.maxlon, lon);
    }
  }

  // Parse ways
  const wayElements = doc.querySelectorAll('osm > way');
  for (let i = 0; i < wayElements.length; i++) {
    const way = wayElements[i];
    const id = parseInt(way.getAttribute('id') || '0', 10);

    // Get node references
    const ndElements = way.querySelectorAll(':scope > nd');
    const nodes: number[] = [];
    for (let j = 0; j < ndElements.length; j++) {
      const ref = parseInt(ndElements[j].getAttribute('ref') || '0', 10);
      if (ref) nodes.push(ref);
    }

    const element: OverpassElement = {
      type: 'way',
      id,
      nodes,
    };

    const tags = parseTags(way);
    if (tags) element.tags = tags;

    elements.push(element);
  }

  // Parse relations
  const relationElements = doc.querySelectorAll('osm > relation');
  for (let i = 0; i < relationElements.length; i++) {
    const relation = relationElements[i];
    const id = parseInt(relation.getAttribute('id') || '0', 10);

    // Get member references
    const memberElements = relation.querySelectorAll(':scope > member');
    const members: Array<{ type: string; ref: number; role: string }> = [];
    for (let j = 0; j < memberElements.length; j++) {
      const member = memberElements[j];
      members.push({
        type: member.getAttribute('type') || '',
        ref: parseInt(member.getAttribute('ref') || '0', 10),
        role: member.getAttribute('role') || '',
      });
    }

    const element: OverpassElement = {
      type: 'relation',
      id,
      members,
    };

    const tags = parseTags(relation);
    if (tags) element.tags = tags;

    elements.push(element);
  }

  console.log(`Parsed OSM file: ${elements.length} elements (${nodeElements.length} nodes, ${wayElements.length} ways, ${relationElements.length} relations)`);

  return {
    data: { elements },
    bounds,
  };
}

/**
 * Check if requested bounds are within the loaded data bounds
 */
export function boundsWithinData(
  requested: { south: number; west: number; north: number; east: number },
  dataBounds: OSMBounds
): boolean {
  return (
    requested.south >= dataBounds.minlat &&
    requested.west >= dataBounds.minlon &&
    requested.north <= dataBounds.maxlat &&
    requested.east <= dataBounds.maxlon
  );
}
