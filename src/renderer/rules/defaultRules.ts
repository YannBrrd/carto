/**
 * Default rulesets for the rule engine
 * Converted from the old style preset system
 */

import { Ruleset, FeatureDefinition, RenderRule, MapProperties } from './types';

/**
 * Common feature definitions used across all rulesets
 */
export const COMMON_FEATURES: FeatureDefinition[] = [
  // Highway features
  {
    name: 'highway_motorway',
    geometryTypes: ['line'],
    conditions: { key: 'highway', operator: 'equals', value: 'motorway' },
  },
  {
    name: 'highway_motorway_link',
    geometryTypes: ['line'],
    conditions: { key: 'highway', operator: 'equals', value: 'motorway_link' },
  },
  {
    name: 'highway_trunk',
    geometryTypes: ['line'],
    conditions: { key: 'highway', operator: 'equals', value: 'trunk' },
  },
  {
    name: 'highway_trunk_link',
    geometryTypes: ['line'],
    conditions: { key: 'highway', operator: 'equals', value: 'trunk_link' },
  },
  {
    name: 'highway_primary',
    geometryTypes: ['line'],
    conditions: { key: 'highway', operator: 'equals', value: 'primary' },
  },
  {
    name: 'highway_primary_link',
    geometryTypes: ['line'],
    conditions: { key: 'highway', operator: 'equals', value: 'primary_link' },
  },
  {
    name: 'highway_secondary',
    geometryTypes: ['line'],
    conditions: { key: 'highway', operator: 'equals', value: 'secondary' },
  },
  {
    name: 'highway_tertiary',
    geometryTypes: ['line'],
    conditions: { key: 'highway', operator: 'equals', value: 'tertiary' },
  },
  {
    name: 'highway_residential',
    geometryTypes: ['line'],
    conditions: { key: 'highway', operator: 'equals', value: 'residential' },
  },
  {
    name: 'highway_unclassified',
    geometryTypes: ['line'],
    conditions: { key: 'highway', operator: 'equals', value: 'unclassified' },
  },
  {
    name: 'highway_service',
    geometryTypes: ['line'],
    conditions: { key: 'highway', operator: 'equals', value: 'service' },
  },
  {
    name: 'highway_living_street',
    geometryTypes: ['line'],
    conditions: { key: 'highway', operator: 'equals', value: 'living_street' },
  },
  {
    name: 'highway_pedestrian',
    geometryTypes: ['line', 'area'],
    conditions: { key: 'highway', operator: 'equals', value: 'pedestrian' },
  },
  {
    name: 'highway_footway',
    geometryTypes: ['line'],
    conditions: { key: 'highway', operator: 'equals', value: 'footway' },
  },
  {
    name: 'highway_cycleway',
    geometryTypes: ['line'],
    conditions: { key: 'highway', operator: 'equals', value: 'cycleway' },
  },
  {
    name: 'highway_path',
    geometryTypes: ['line'],
    conditions: { key: 'highway', operator: 'equals', value: 'path' },
  },
  {
    name: 'highway_track',
    geometryTypes: ['line'],
    conditions: { key: 'highway', operator: 'equals', value: 'track' },
  },
  {
    name: 'highway_steps',
    geometryTypes: ['line'],
    conditions: { key: 'highway', operator: 'equals', value: 'steps' },
  },

  // Building features
  {
    name: 'building',
    geometryTypes: ['area'],
    conditions: { key: 'building', operator: 'exists' },
  },
  {
    name: 'building_residential',
    geometryTypes: ['area'],
    conditions: {
      type: 'or',
      conditions: [
        { key: 'building', operator: 'equals', value: 'residential' },
        { key: 'building', operator: 'equals', value: 'apartments' },
        { key: 'building', operator: 'equals', value: 'house' },
      ],
    },
  },
  {
    name: 'building_commercial',
    geometryTypes: ['area'],
    conditions: {
      type: 'or',
      conditions: [
        { key: 'building', operator: 'equals', value: 'commercial' },
        { key: 'building', operator: 'equals', value: 'retail' },
        { key: 'building', operator: 'equals', value: 'office' },
      ],
    },
  },
  {
    name: 'building_industrial',
    geometryTypes: ['area'],
    conditions: {
      type: 'or',
      conditions: [
        { key: 'building', operator: 'equals', value: 'industrial' },
        { key: 'building', operator: 'equals', value: 'warehouse' },
      ],
    },
  },
  {
    name: 'building_religious',
    geometryTypes: ['area'],
    conditions: {
      type: 'or',
      conditions: [
        { key: 'building', operator: 'equals', value: 'church' },
        { key: 'building', operator: 'equals', value: 'chapel' },
        { key: 'building', operator: 'equals', value: 'cathedral' },
        { key: 'building', operator: 'equals', value: 'mosque' },
        { key: 'building', operator: 'equals', value: 'synagogue' },
        { key: 'building', operator: 'equals', value: 'temple' },
      ],
    },
  },

  // Natural features
  {
    name: 'natural_water',
    geometryTypes: ['area'],
    conditions: {
      type: 'or',
      conditions: [
        { key: 'natural', operator: 'equals', value: 'water' },
        { key: 'waterway', operator: 'equals', value: 'riverbank' },
        { key: 'landuse', operator: 'equals', value: 'reservoir' },
        { key: 'landuse', operator: 'equals', value: 'basin' },
      ],
    },
  },
  {
    name: 'natural_wood',
    geometryTypes: ['area'],
    conditions: {
      type: 'or',
      conditions: [
        { key: 'natural', operator: 'equals', value: 'wood' },
        { key: 'landuse', operator: 'equals', value: 'forest' },
      ],
    },
  },
  {
    name: 'natural_grassland',
    geometryTypes: ['area'],
    conditions: {
      type: 'or',
      conditions: [
        { key: 'natural', operator: 'equals', value: 'grassland' },
        { key: 'landuse', operator: 'equals', value: 'grass' },
        { key: 'landuse', operator: 'equals', value: 'meadow' },
        { key: 'leisure', operator: 'equals', value: 'park' },
      ],
    },
  },
  {
    name: 'natural_beach',
    geometryTypes: ['area'],
    conditions: { key: 'natural', operator: 'equals', value: 'beach' },
  },

  // Landuse features
  {
    name: 'landuse_residential',
    geometryTypes: ['area'],
    conditions: { key: 'landuse', operator: 'equals', value: 'residential' },
  },
  {
    name: 'landuse_commercial',
    geometryTypes: ['area'],
    conditions: { key: 'landuse', operator: 'equals', value: 'commercial' },
  },
  {
    name: 'landuse_industrial',
    geometryTypes: ['area'],
    conditions: { key: 'landuse', operator: 'equals', value: 'industrial' },
  },
  {
    name: 'landuse_farmland',
    geometryTypes: ['area'],
    conditions: {
      type: 'or',
      conditions: [
        { key: 'landuse', operator: 'equals', value: 'farmland' },
        { key: 'landuse', operator: 'equals', value: 'farm' },
        { key: 'landuse', operator: 'equals', value: 'farmyard' },
      ],
    },
  },

  // Waterway features
  {
    name: 'waterway_river',
    geometryTypes: ['line'],
    conditions: { key: 'waterway', operator: 'equals', value: 'river' },
  },
  {
    name: 'waterway_stream',
    geometryTypes: ['line'],
    conditions: { key: 'waterway', operator: 'equals', value: 'stream' },
  },
  {
    name: 'waterway_canal',
    geometryTypes: ['line'],
    conditions: { key: 'waterway', operator: 'equals', value: 'canal' },
  },
  {
    name: 'waterway_drain',
    geometryTypes: ['line'],
    conditions: { key: 'waterway', operator: 'equals', value: 'drain' },
  },

  // Railway features
  {
    name: 'railway_rail',
    geometryTypes: ['line'],
    conditions: { key: 'railway', operator: 'equals', value: 'rail' },
  },
  {
    name: 'railway_light_rail',
    geometryTypes: ['line'],
    conditions: { key: 'railway', operator: 'equals', value: 'light_rail' },
  },
  {
    name: 'railway_tram',
    geometryTypes: ['line'],
    conditions: { key: 'railway', operator: 'equals', value: 'tram' },
  },
  {
    name: 'railway_platform',
    geometryTypes: ['line', 'area'],
    conditions: {
      type: 'or',
      conditions: [
        { key: 'railway', operator: 'equals', value: 'platform' },
        { key: 'public_transport', operator: 'equals', value: 'platform' },
      ],
    },
  },

  // Amenity/POI features
  {
    name: 'amenity_parking',
    geometryTypes: ['point', 'area'],
    conditions: { key: 'amenity', operator: 'equals', value: 'parking' },
  },
  {
    name: 'amenity_school',
    geometryTypes: ['point', 'area'],
    conditions: { key: 'amenity', operator: 'equals', value: 'school' },
  },
  {
    name: 'amenity_hospital',
    geometryTypes: ['point', 'area'],
    conditions: { key: 'amenity', operator: 'equals', value: 'hospital' },
  },
  {
    name: 'amenity_restaurant',
    geometryTypes: ['point'],
    conditions: { key: 'amenity', operator: 'equals', value: 'restaurant' },
  },

  // Place features
  {
    name: 'place_city',
    geometryTypes: ['point'],
    conditions: { key: 'place', operator: 'equals', value: 'city' },
  },
  {
    name: 'place_town',
    geometryTypes: ['point'],
    conditions: { key: 'place', operator: 'equals', value: 'town' },
  },
  {
    name: 'place_village',
    geometryTypes: ['point'],
    conditions: { key: 'place', operator: 'equals', value: 'village' },
  },
  {
    name: 'place_suburb',
    geometryTypes: ['point'],
    conditions: { key: 'place', operator: 'equals', value: 'suburb' },
  },
];

/**
 * Google Maps style ruleset
 */
export const GOOGLE_MAPS_RULESET: Ruleset = {
  name: 'Google Maps',
  features: COMMON_FEATURES,
  properties: {
    'map-background-color': '#f5f5f5',
    'font-family': 'Roboto, Arial, sans-serif',
    'font-weight': 'normal',
    'text-halo-width': '35%',
    'text-halo-opacity': 0.9,
    'text-halo-color': '#ffffff',
  },
  rules: [
    // Landuse - residential areas
    {
      target: { featurePattern: 'landuse_residential' },
      properties: [
        { property: 'fill-color', value: '#f5f5f5' },
        { property: 'fill-opacity', value: 0.5 },
        { property: 'line-style', value: 'none' },
      ],
      draws: ['fill'],
      conditionals: [],
    },
    // Landuse - commercial areas
    {
      target: { featurePattern: 'landuse_commercial' },
      properties: [
        { property: 'fill-color', value: '#f0f0f0' },
        { property: 'fill-opacity', value: 0.5 },
        { property: 'line-style', value: 'none' },
      ],
      draws: ['fill'],
      conditionals: [],
    },
    // Landuse - industrial areas
    {
      target: { featurePattern: 'landuse_industrial' },
      properties: [
        { property: 'fill-color', value: '#e8e8e8' },
        { property: 'fill-opacity', value: 0.5 },
        { property: 'line-style', value: 'none' },
      ],
      draws: ['fill'],
      conditionals: [],
    },
    // Landuse - farmland
    {
      target: { featurePattern: 'landuse_farmland' },
      properties: [
        { property: 'fill-color', value: '#e8f5e9' },
        { property: 'fill-opacity', value: 0.7 },
        { property: 'line-style', value: 'none' },
      ],
      draws: ['fill'],
      conditionals: [],
    },
    // Natural - water
    {
      target: { featurePattern: 'natural_water' },
      properties: [
        { property: 'fill-color', value: '#aadaff' },
        { property: 'fill-opacity', value: 1 },
        { property: 'line-style', value: 'none' },
      ],
      draws: ['fill'],
      conditionals: [],
    },
    // Natural - wood/forest
    {
      target: { featurePattern: 'natural_wood' },
      properties: [
        { property: 'fill-color', value: '#c3ecb2' },
        { property: 'fill-opacity', value: 1 },
        { property: 'line-style', value: 'none' },
      ],
      draws: ['fill'],
      conditionals: [],
    },
    // Natural - grassland/parks
    {
      target: { featurePattern: 'natural_grassland' },
      properties: [
        { property: 'fill-color', value: '#bbdaa4' },
        { property: 'fill-opacity', value: 0.8 },
        { property: 'line-style', value: 'none' },
      ],
      draws: ['fill'],
      conditionals: [],
    },
    // Natural - beach
    {
      target: { featurePattern: 'natural_beach' },
      properties: [
        { property: 'fill-color', value: '#fff2af' },
        { property: 'fill-opacity', value: 1 },
        { property: 'line-style', value: 'none' },
      ],
      draws: ['fill'],
      conditionals: [],
    },
    // Buildings
    {
      target: { featurePattern: 'building*' },
      properties: [
        { property: 'fill-color', value: '#e8e8e8' },
        { property: 'fill-opacity', value: 1 },
        { property: 'line-color', value: '#d0d0d0' },
        { property: 'line-width', value: 0.5 },
        { property: 'min-zoom', value: 15 },
      ],
      draws: ['fill', 'line'],
      conditionals: [
        {
          type: 'if',
          featurePattern: 'building_religious',
          properties: [{ property: 'fill-color', value: '#d4c4a8' }],
          draws: [],
          children: [],
        },
      ],
    },
    // Waterways
    {
      target: { featurePattern: 'waterway*' },
      properties: [
        { property: 'line-color', value: '#aadaff' },
        { property: 'line-width', value: { type: 'zoom-dependent', stops: [{ zoom: 10, value: 1 }, { zoom: 14, value: 3 }, { zoom: 18, value: 6 }] } },
      ],
      draws: ['line', 'text'],
      conditionals: [
        {
          type: 'if',
          featurePattern: 'waterway_stream',
          properties: [
            { property: 'line-width', value: { type: 'zoom-dependent', stops: [{ zoom: 12, value: 1 }, { zoom: 16, value: 2 }] } },
          ],
          draws: [],
          children: [],
        },
      ],
    },
    // Highways - motorway
    {
      target: { featurePattern: 'highway_motorway*' },
      properties: [
        { property: 'line-color', value: '#9ca3af' },
        { property: 'line-width', value: { type: 'zoom-dependent', stops: [{ zoom: 8, value: 2 }, { zoom: 12, value: 4 }, { zoom: 16, value: 8 }] } },
        { property: 'line-join', value: 'round' },
        { property: 'line-start-cap', value: 'round' },
        { property: 'line-end-cap', value: 'round' },
      ],
      draws: ['line', 'text'],
      conditionals: [],
    },
    // Highways - primary
    {
      target: { featurePattern: 'highway_primary*' },
      properties: [
        { property: 'line-color', value: '#d1d5db' },
        { property: 'line-width', value: { type: 'zoom-dependent', stops: [{ zoom: 10, value: 2 }, { zoom: 14, value: 4 }, { zoom: 18, value: 8 }] } },
        { property: 'line-join', value: 'round' },
        { property: 'line-start-cap', value: 'round' },
        { property: 'line-end-cap', value: 'round' },
        { property: 'min-zoom', value: 10 },
      ],
      draws: ['line', 'text'],
      conditionals: [],
    },
    // Highways - secondary
    {
      target: { featurePattern: 'highway_secondary' },
      properties: [
        { property: 'line-color', value: '#e5e7eb' },
        { property: 'line-width', value: { type: 'zoom-dependent', stops: [{ zoom: 11, value: 1.5 }, { zoom: 14, value: 3 }, { zoom: 18, value: 7 }] } },
        { property: 'line-join', value: 'round' },
        { property: 'line-start-cap', value: 'round' },
        { property: 'line-end-cap', value: 'round' },
        { property: 'min-zoom', value: 11 },
      ],
      draws: ['line', 'text'],
      conditionals: [],
    },
    // Highways - tertiary
    {
      target: { featurePattern: 'highway_tertiary' },
      properties: [
        { property: 'line-color', value: '#f3f4f6' },
        { property: 'line-width', value: { type: 'zoom-dependent', stops: [{ zoom: 12, value: 1 }, { zoom: 15, value: 2 }, { zoom: 18, value: 6 }] } },
        { property: 'line-join', value: 'round' },
        { property: 'line-start-cap', value: 'round' },
        { property: 'line-end-cap', value: 'round' },
        { property: 'min-zoom', value: 12 },
      ],
      draws: ['line', 'text'],
      conditionals: [],
    },
    // Highways - residential/unclassified
    {
      target: { featurePattern: 'highway_residential' },
      properties: [
        { property: 'line-color', value: '#ffffff' },
        { property: 'line-width', value: { type: 'zoom-dependent', stops: [{ zoom: 13, value: 1 }, { zoom: 16, value: 2 }, { zoom: 18, value: 5 }] } },
        { property: 'border-style', value: 'solid' },
        { property: 'border-color', value: '#e5e7eb' },
        { property: 'border-width', value: '15%' },
        { property: 'line-join', value: 'round' },
        { property: 'min-zoom', value: 13 },
      ],
      draws: ['line', 'text'],
      conditionals: [],
    },
    // Highways - service
    {
      target: { featurePattern: 'highway_service' },
      properties: [
        { property: 'line-color', value: '#ffffff' },
        { property: 'line-width', value: { type: 'zoom-dependent', stops: [{ zoom: 14, value: 0.5 }, { zoom: 17, value: 1.5 }, { zoom: 18, value: 3 }] } },
        { property: 'min-zoom', value: 14 },
      ],
      draws: ['line'],
      conditionals: [],
    },
    // Highways - footway/path
    {
      target: { featurePattern: 'highway_footway' },
      properties: [
        { property: 'line-color', value: '#d5d8db' },
        { property: 'line-width', value: 1 },
        { property: 'line-style', value: 'dot' },
        { property: 'line-opacity', value: 0.7 },
        { property: 'min-zoom', value: 15 },
      ],
      draws: ['line'],
      conditionals: [],
    },
    // Highways - cycleway
    {
      target: { featurePattern: 'highway_cycleway' },
      properties: [
        { property: 'line-color', value: '#4a80f5' },
        { property: 'line-width', value: 1 },
        { property: 'line-style', value: 'dash' },
        { property: 'line-opacity', value: 0.8 },
        { property: 'min-zoom', value: 14 },
      ],
      draws: ['line'],
      conditionals: [],
    },
    // Highways - path
    {
      target: { featurePattern: 'highway_path' },
      properties: [
        { property: 'line-color', value: '#d5d8db' },
        { property: 'line-width', value: 1 },
        { property: 'line-style', value: 'dash' },
        { property: 'line-opacity', value: 0.7 },
        { property: 'min-zoom', value: 15 },
      ],
      draws: ['line'],
      conditionals: [],
    },
    // Railway
    {
      target: { featurePattern: 'railway_rail' },
      properties: [
        { property: 'line-color', value: '#888888' },
        { property: 'line-width', value: 2 },
        { property: 'line-style', value: 'dashlong' },
        { property: 'border-style', value: 'solid' },
        { property: 'border-color', value: '#666666' },
        { property: 'border-width', value: '25%' },
        { property: 'min-zoom', value: 12 },
      ],
      draws: ['line'],
      conditionals: [],
    },
    // Place labels
    {
      target: { featurePattern: 'place*' },
      properties: [
        { property: 'font-weight', value: 'bold' },
        { property: 'text-color', value: '#333333' },
      ],
      draws: ['text'],
      conditionals: [
        {
          type: 'if',
          featurePattern: 'place_city',
          properties: [
            { property: 'font-size', value: { type: 'zoom-dependent', stops: [{ zoom: 6, value: 12 }, { zoom: 10, value: 16 }, { zoom: 14, value: 20 }] } },
            { property: 'min-zoom', value: 6 },
          ],
          draws: [],
          children: [],
        },
        {
          type: 'elseif',
          featurePattern: 'place_town',
          properties: [
            { property: 'font-size', value: { type: 'zoom-dependent', stops: [{ zoom: 9, value: 10 }, { zoom: 12, value: 14 }, { zoom: 16, value: 18 }] } },
            { property: 'min-zoom', value: 9 },
          ],
          draws: [],
          children: [],
        },
        {
          type: 'elseif',
          featurePattern: 'place_village',
          properties: [
            { property: 'font-size', value: { type: 'zoom-dependent', stops: [{ zoom: 12, value: 10 }, { zoom: 16, value: 14 }] } },
            { property: 'min-zoom', value: 12 },
          ],
          draws: [],
          children: [],
        },
        {
          type: 'elseif',
          featurePattern: 'place_suburb',
          properties: [
            { property: 'font-size', value: { type: 'zoom-dependent', stops: [{ zoom: 13, value: 10 }, { zoom: 16, value: 14 }] } },
            { property: 'min-zoom', value: 13 },
            { property: 'text-color', value: '#666666' },
          ],
          draws: [],
          children: [],
        },
      ],
    },
  ],
};

/**
 * OSM Carto style ruleset
 */
export const OSM_CARTO_RULESET: Ruleset = {
  name: 'OpenStreetMap',
  features: COMMON_FEATURES,
  properties: {
    'map-background-color': '#f2efe9',
    'font-family': 'DejaVu Sans, Arial, sans-serif',
    'font-weight': 'normal',
    'text-halo-width': '35%',
    'text-halo-opacity': 0.75,
    'text-halo-color': '#f2efe9',
  },
  rules: [
    // Landuse - residential
    {
      target: { featurePattern: 'landuse_residential' },
      properties: [
        { property: 'fill-color', value: '#dcdcdc' },
        { property: 'fill-opacity', value: 0.5 },
        { property: 'line-style', value: 'none' },
      ],
      draws: ['fill'],
      conditionals: [],
    },
    // Landuse - commercial
    {
      target: { featurePattern: 'landuse_commercial' },
      properties: [
        { property: 'fill-color', value: '#f2dad9' },
        { property: 'fill-opacity', value: 0.5 },
        { property: 'line-style', value: 'none' },
      ],
      draws: ['fill'],
      conditionals: [],
    },
    // Landuse - industrial
    {
      target: { featurePattern: 'landuse_industrial' },
      properties: [
        { property: 'fill-color', value: '#ebdbe8' },
        { property: 'fill-opacity', value: 0.5 },
        { property: 'line-style', value: 'none' },
      ],
      draws: ['fill'],
      conditionals: [],
    },
    // Landuse - farmland
    {
      target: { featurePattern: 'landuse_farmland' },
      properties: [
        { property: 'fill-color', value: '#eef0d5' },
        { property: 'fill-opacity', value: 0.7 },
        { property: 'line-style', value: 'none' },
      ],
      draws: ['fill'],
      conditionals: [],
    },
    // Natural - water
    {
      target: { featurePattern: 'natural_water' },
      properties: [
        { property: 'fill-color', value: '#aad3df' },
        { property: 'fill-opacity', value: 1 },
        { property: 'line-style', value: 'none' },
      ],
      draws: ['fill'],
      conditionals: [],
    },
    // Natural - wood/forest
    {
      target: { featurePattern: 'natural_wood' },
      properties: [
        { property: 'fill-color', value: '#add19e' },
        { property: 'fill-opacity', value: 1 },
        { property: 'line-style', value: 'none' },
      ],
      draws: ['fill'],
      conditionals: [],
    },
    // Natural - grassland/parks
    {
      target: { featurePattern: 'natural_grassland' },
      properties: [
        { property: 'fill-color', value: '#c8facc' },
        { property: 'fill-opacity', value: 0.8 },
        { property: 'line-style', value: 'none' },
      ],
      draws: ['fill'],
      conditionals: [],
    },
    // Natural - beach
    {
      target: { featurePattern: 'natural_beach' },
      properties: [
        { property: 'fill-color', value: '#fff1ba' },
        { property: 'fill-opacity', value: 1 },
        { property: 'line-style', value: 'none' },
      ],
      draws: ['fill'],
      conditionals: [],
    },
    // Buildings - OSM salmon/brown style
    {
      target: { featurePattern: 'building*' },
      properties: [
        { property: 'fill-color', value: '#d9b99b' },
        { property: 'fill-opacity', value: 1 },
        { property: 'line-color', value: '#b5a186' },
        { property: 'line-width', value: 0.5 },
        { property: 'min-zoom', value: 15 },
      ],
      draws: ['fill', 'line'],
      conditionals: [
        {
          type: 'if',
          featurePattern: 'building_commercial',
          properties: [{ property: 'fill-color', value: '#c9a686' }],
          draws: [],
          children: [],
        },
        {
          type: 'elseif',
          featurePattern: 'building_industrial',
          properties: [{ property: 'fill-color', value: '#b8a08c' }],
          draws: [],
          children: [],
        },
        {
          type: 'elseif',
          featurePattern: 'building_religious',
          properties: [{ property: 'fill-color', value: '#a0a0a0' }],
          draws: [],
          children: [],
        },
      ],
    },
    // Waterways
    {
      target: { featurePattern: 'waterway*' },
      properties: [
        { property: 'line-color', value: '#aad3df' },
        { property: 'line-width', value: { type: 'zoom-dependent', stops: [{ zoom: 10, value: 1 }, { zoom: 14, value: 3 }, { zoom: 18, value: 6 }] } },
        { property: 'text-color', value: '#aad3df' },
        { property: 'font-weight', value: 'normal' },
        { property: 'min-zoom', value: 13 },
      ],
      draws: ['line', 'text'],
      conditionals: [],
    },
    // Highways - motorway (pink)
    {
      target: { featurePattern: 'highway_motorway*' },
      properties: [
        { property: 'line-color', value: '#e892a2' },
        { property: 'line-width', value: { type: 'zoom-dependent', stops: [{ zoom: 8, value: 2 }, { zoom: 12, value: 5 }, { zoom: 16, value: 10 }] } },
        { property: 'border-style', value: 'solid' },
        { property: 'border-color', value: '#dc2a67' },
        { property: 'border-width', value: '15%' },
        { property: 'line-join', value: 'round' },
        { property: 'line-start-cap', value: 'round' },
        { property: 'line-end-cap', value: 'round' },
      ],
      draws: ['line', 'text'],
      conditionals: [],
    },
    // Highways - primary (light orange)
    {
      target: { featurePattern: 'highway_primary*' },
      properties: [
        { property: 'line-color', value: '#fcd6a4' },
        { property: 'line-width', value: { type: 'zoom-dependent', stops: [{ zoom: 10, value: 2 }, { zoom: 14, value: 4 }, { zoom: 18, value: 10 }] } },
        { property: 'border-style', value: 'solid' },
        { property: 'border-color', value: '#c97700' },
        { property: 'border-width', value: '15%' },
        { property: 'line-join', value: 'round' },
        { property: 'min-zoom', value: 8 },
      ],
      draws: ['line', 'text'],
      conditionals: [],
    },
    // Highways - secondary (light yellow)
    {
      target: { featurePattern: 'highway_secondary' },
      properties: [
        { property: 'line-color', value: '#f7fabf' },
        { property: 'line-width', value: { type: 'zoom-dependent', stops: [{ zoom: 11, value: 1.5 }, { zoom: 14, value: 3 }, { zoom: 18, value: 8 }] } },
        { property: 'border-style', value: 'solid' },
        { property: 'border-color', value: '#8a7a00' },
        { property: 'border-width', value: '10%' },
        { property: 'line-join', value: 'round' },
        { property: 'min-zoom', value: 10 },
      ],
      draws: ['line', 'text'],
      conditionals: [],
    },
    // Highways - tertiary
    {
      target: { featurePattern: 'highway_tertiary' },
      properties: [
        { property: 'line-color', value: '#ffffff' },
        { property: 'line-width', value: { type: 'zoom-dependent', stops: [{ zoom: 12, value: 1 }, { zoom: 15, value: 2 }, { zoom: 18, value: 6 }] } },
        { property: 'border-style', value: 'solid' },
        { property: 'border-color', value: '#bbb' },
        { property: 'border-width', value: '15%' },
        { property: 'line-join', value: 'round' },
        { property: 'min-zoom', value: 12 },
      ],
      draws: ['line', 'text'],
      conditionals: [],
    },
    // Highways - residential
    {
      target: { featurePattern: 'highway_residential' },
      properties: [
        { property: 'line-color', value: '#ffffff' },
        { property: 'line-width', value: { type: 'zoom-dependent', stops: [{ zoom: 13, value: 1 }, { zoom: 16, value: 2 }, { zoom: 18, value: 5 }] } },
        { property: 'border-style', value: 'solid' },
        { property: 'border-color', value: '#bbb' },
        { property: 'border-width', value: '15%' },
        { property: 'line-join', value: 'round' },
        { property: 'min-zoom', value: 13 },
      ],
      draws: ['line', 'text'],
      conditionals: [],
    },
    // Highways - footway/path (brown)
    {
      target: { featurePattern: 'highway_footway' },
      properties: [
        { property: 'line-color', value: '#fa8072' },
        { property: 'line-width', value: 1 },
        { property: 'line-style', value: 'dot' },
        { property: 'line-opacity', value: 0.6 },
        { property: 'min-zoom', value: 15 },
      ],
      draws: ['line'],
      conditionals: [],
    },
    {
      target: { featurePattern: 'highway_path' },
      properties: [
        { property: 'line-color', value: '#d4a373' },
        { property: 'line-width', value: 1 },
        { property: 'line-style', value: 'dash' },
        { property: 'line-opacity', value: 0.6 },
        { property: 'min-zoom', value: 15 },
      ],
      draws: ['line'],
      conditionals: [],
    },
    // Highways - cycleway (blue)
    {
      target: { featurePattern: 'highway_cycleway' },
      properties: [
        { property: 'line-color', value: '#0000ff' },
        { property: 'line-width', value: 1 },
        { property: 'line-style', value: 'dash' },
        { property: 'line-opacity', value: 0.6 },
        { property: 'min-zoom', value: 14 },
      ],
      draws: ['line'],
      conditionals: [],
    },
    // Railway
    {
      target: { featurePattern: 'railway_rail' },
      properties: [
        { property: 'line-color', value: '#999999' },
        { property: 'line-width', value: 2 },
        { property: 'line-style', value: 'dashlong' },
        { property: 'border-style', value: 'solid' },
        { property: 'border-color', value: '#555555' },
        { property: 'border-width', value: '25%' },
        { property: 'min-zoom', value: 12 },
      ],
      draws: ['line'],
      conditionals: [],
    },
    // Place labels
    {
      target: { featurePattern: 'place*' },
      properties: [
        { property: 'font-weight', value: 'bold' },
        { property: 'text-color', value: '#000000' },
      ],
      draws: ['text'],
      conditionals: [
        {
          type: 'if',
          featurePattern: 'place_city',
          properties: [
            { property: 'font-size', value: { type: 'zoom-dependent', stops: [{ zoom: 6, value: 12 }, { zoom: 10, value: 16 }, { zoom: 14, value: 20 }] } },
            { property: 'min-zoom', value: 6 },
          ],
          draws: [],
          children: [],
        },
        {
          type: 'elseif',
          featurePattern: 'place_town',
          properties: [
            { property: 'font-size', value: { type: 'zoom-dependent', stops: [{ zoom: 9, value: 10 }, { zoom: 12, value: 14 }, { zoom: 16, value: 18 }] } },
            { property: 'min-zoom', value: 9 },
          ],
          draws: [],
          children: [],
        },
        {
          type: 'elseif',
          featurePattern: 'place_village',
          properties: [
            { property: 'font-size', value: { type: 'zoom-dependent', stops: [{ zoom: 12, value: 10 }, { zoom: 16, value: 14 }] } },
            { property: 'min-zoom', value: 12 },
          ],
          draws: [],
          children: [],
        },
        {
          type: 'elseif',
          featurePattern: 'place_suburb',
          properties: [
            { property: 'font-size', value: { type: 'zoom-dependent', stops: [{ zoom: 13, value: 10 }, { zoom: 16, value: 14 }] } },
            { property: 'min-zoom', value: 13 },
            { property: 'text-color', value: '#555555' },
          ],
          draws: [],
          children: [],
        },
      ],
    },
  ],
};

/**
 * Get the default ruleset to use
 */
export function getDefaultRuleset(): Ruleset {
  return GOOGLE_MAPS_RULESET;
}

/**
 * Get all available built-in rulesets
 */
export function getBuiltInRulesets(): Ruleset[] {
  return [GOOGLE_MAPS_RULESET, OSM_CARTO_RULESET];
}
