/**
 * Default road widths, shared by the SVG export and the map overlay so both draw
 * every highway tag the same way. Widths are in pixels at scale 1, before the
 * width scale of the highway style is applied (see scaleRoadWeight).
 */

import { RenderStyle } from '../types';

export interface RoadWeight {
  fill: number;
  casing: number;    // Fill plus the casing border on both sides
  fontSize: number;  // Road label size
}

const ROAD_WEIGHTS: Record<string, RoadWeight> = {
  motorway: { fill: 6, casing: 8, fontSize: 10 },
  trunk: { fill: 6, casing: 8, fontSize: 10 },
  primary: { fill: 5, casing: 7, fontSize: 9 },
  secondary: { fill: 4, casing: 6, fontSize: 8 },
  tertiary: { fill: 3, casing: 5, fontSize: 7 },
  residential: { fill: 2, casing: 4, fontSize: 6 },
  living_street: { fill: 2, casing: 4, fontSize: 6 },
  path: { fill: 1.5, casing: 2.5, fontSize: 5 },
  footway: { fill: 1.5, casing: 2.5, fontSize: 5 },
  pedestrian: { fill: 1.5, casing: 2.5, fontSize: 5 },
  track: { fill: 1.5, casing: 2.5, fontSize: 5 },
  cycleway: { fill: 2, casing: 3, fontSize: 5 },
};

const DEFAULT_ROAD_WEIGHT: RoadWeight = { fill: 2, casing: 4, fontSize: 6 };

// Railways: ties line over a wider rail base
const RAILWAY_WEIGHT = { fill: 2.5, casing: 4 };

export function getRailwayWeight(): { fill: number; casing: number } {
  return { ...RAILWAY_WEIGHT };
}

// Road levels from bottom to top: smaller roads are drawn under bigger ones
export const ROAD_DRAW_ORDER = [
  'path', 'footway', 'cycleway', 'residential', 'tertiary', 'secondary', 'primary', 'motorway',
] as const satisfies readonly (keyof RenderStyle['highway'])[];

// Highway style (road level) used for an OSM highway tag
export function getHighwayStyleKey(highway: string): keyof RenderStyle['highway'] {
  switch (highway) {
    case 'motorway':
    case 'trunk':
    case 'motorway_link':
    case 'trunk_link':
      return 'motorway';
    case 'primary':
    case 'primary_link':
      return 'primary';
    case 'secondary':
    case 'secondary_link':
      return 'secondary';
    case 'tertiary':
    case 'tertiary_link':
      return 'tertiary';
    case 'path':
    case 'track':
      return 'path';
    case 'footway':
    case 'pedestrian':
      return 'footway';
    case 'cycleway':
      return 'cycleway';
    default:
      // residential, living_street, unclassified, service and anything else
      return 'residential';
  }
}

// Links (ramps, slip roads) are narrower than their road, as on Google Maps
const LINK_WIDTH_RATIO = 2 / 3;

// OSM tags are free text: only own entries of the table count
function knownWeight(highway: string): RoadWeight | undefined {
  return Object.prototype.hasOwnProperty.call(ROAD_WEIGHTS, highway) ? ROAD_WEIGHTS[highway] : undefined;
}

export function getRoadWeight(highway: string): RoadWeight {
  const link = highway.match(/^(.+)_link$/);
  const road = link ? knownWeight(link[1]) : undefined;
  if (road) {
    const fill = Math.max(road.fill * LINK_WIDTH_RATIO, DEFAULT_ROAD_WEIGHT.fill);
    return { fill, casing: fill + (road.casing - road.fill), fontSize: DEFAULT_ROAD_WEIGHT.fontSize };
  }
  return { ...(knownWeight(highway) ?? DEFAULT_ROAD_WEIGHT) };
}
