/**
 * POI Icons for map rendering
 * SVG icons embedded as data URIs for use in the rule engine
 */

// Icon definitions as SVG strings
const ICONS: Record<string, string> = {
  // Transport
  parking: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#3b82f6"><rect x="2" y="2" width="20" height="20" rx="3" fill="#3b82f6"/><text x="12" y="17" font-family="Arial" font-size="14" font-weight="bold" fill="white" text-anchor="middle">P</text></svg>`,

  bus_stop: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#22c55e"/><rect x="7" y="6" width="10" height="12" rx="2" fill="white"/><rect x="9" y="8" width="6" height="4" fill="#22c55e"/></svg>`,

  railway_station: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" fill="#7981B0"/><circle cx="8" cy="16" r="2" fill="white"/><circle cx="16" cy="16" r="2" fill="white"/><rect x="6" y="6" width="12" height="6" fill="white"/></svg>`,

  // Amenities
  restaurant: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#f97316"/><path d="M8 6v6c0 1 1 2 2 2h1v4h2v-4h1c1 0 2-1 2-2V6" fill="none" stroke="white" stroke-width="1.5"/></svg>`,

  cafe: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#92400e"/><path d="M7 8h8v6c0 2-1.5 3-4 3s-4-1-4-3V8z" fill="white"/><path d="M15 9h2c1 0 2 1 2 2s-1 2-2 2h-2" fill="none" stroke="white" stroke-width="1.5"/></svg>`,

  fast_food: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#eab308"/><path d="M6 12h12M6 12c0-3 2.5-5 6-5s6 2 6 5M6 12c0 2 2 4 6 4s6-2 6-4" fill="none" stroke="white" stroke-width="1.5"/></svg>`,

  pub: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#854d0e"/><path d="M8 7h8l-1 8H9L8 7z" fill="white"/><rect x="10" y="15" width="4" height="3" fill="white"/></svg>`,

  bank: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2" fill="#1e40af"/><path d="M12 5l8 4v2H4V9l8-4zM6 12h2v5H6zM11 12h2v5h-2zM16 12h2v5h-2zM4 18h16v2H4z" fill="white"/></svg>`,

  atm: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" fill="#1e40af"/><rect x="5" y="7" width="10" height="6" fill="#60a5fa"/><rect x="16" y="8" width="3" height="2" fill="#22c55e"/><rect x="16" y="11" width="3" height="2" fill="#ef4444"/></svg>`,

  pharmacy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#22c55e"/><rect x="10" y="6" width="4" height="12" fill="white"/><rect x="6" y="10" width="12" height="4" fill="white"/></svg>`,

  hospital: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2" fill="#dc2626"/><rect x="10" y="5" width="4" height="14" fill="white"/><rect x="5" y="10" width="14" height="4" fill="white"/></svg>`,

  police: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#1e3a8a"/><path d="M12 5l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4l2-4z" fill="#fbbf24"/></svg>`,

  fire_station: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#dc2626"/><path d="M12 5c0 0-4 4-4 8 0 2.5 2 4 4 4s4-1.5 4-4c0-4-4-8-4-8z" fill="#fbbf24"/></svg>`,

  post_office: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2" fill="#eab308"/><path d="M3 8l9 5 9-5" fill="none" stroke="white" stroke-width="1.5"/></svg>`,

  library: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2" fill="#7c3aed"/><rect x="5" y="6" width="3" height="12" fill="white"/><rect x="9" y="6" width="3" height="12" fill="white"/><rect x="13" y="6" width="3" height="12" fill="white"/><path d="M17 6l3 12h-3V6z" fill="white"/></svg>`,

  school: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="8" width="20" height="12" rx="1" fill="#f59e0b"/><path d="M12 4l10 4v2H2V8l10-4z" fill="#f59e0b"/><rect x="10" y="12" width="4" height="8" fill="#92400e"/></svg>`,

  // Religious
  place_of_worship: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l8 8v12H4V10l8-8z" fill="#6b7280"/><rect x="10" y="4" width="4" height="8" fill="#d4c4a8"/><rect x="6" y="10" width="12" height="2" fill="#d4c4a8"/></svg>`,

  // Tourism
  hotel: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="1" fill="#0ea5e9"/><rect x="5" y="6" width="4" height="3" fill="white"/><rect x="10" y="6" width="4" height="3" fill="white"/><rect x="15" y="6" width="4" height="3" fill="white"/><rect x="5" y="11" width="4" height="3" fill="white"/><rect x="10" y="11" width="4" height="3" fill="white"/><rect x="15" y="11" width="4" height="3" fill="white"/><rect x="10" y="16" width="4" height="4" fill="#1e3a8a"/></svg>`,

  museum: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l10 5v2H2V7l10-5z" fill="#78716c"/><rect x="4" y="9" width="16" height="11" fill="#a8a29e"/><rect x="6" y="11" width="3" height="7" fill="white"/><rect x="10.5" y="11" width="3" height="7" fill="white"/><rect x="15" y="11" width="3" height="7" fill="white"/><rect x="2" y="20" width="20" height="2" fill="#78716c"/></svg>`,

  viewpoint: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#0ea5e9"/><circle cx="12" cy="10" r="4" fill="white" stroke="#0ea5e9" stroke-width="1"/><path d="M12 14v4M8 18h8" stroke="white" stroke-width="2"/></svg>`,

  // Shops
  supermarket: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2" fill="#16a34a"/><path d="M6 8h4l2 8H6l0-8z" fill="white"/><circle cx="7" cy="18" r="1.5" fill="white"/><circle cx="11" cy="18" r="1.5" fill="white"/></svg>`,

  bakery: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#d97706"/><ellipse cx="12" cy="12" rx="6" ry="4" fill="#fbbf24"/><path d="M8 10c0-2 1.5-3 4-3s4 1 4 3" fill="none" stroke="#92400e" stroke-width="1"/></svg>`,

  convenience: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" fill="#0891b2"/><text x="12" y="15" font-family="Arial" font-size="8" font-weight="bold" fill="white" text-anchor="middle">24h</text></svg>`,

  // Nature
  tree: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="10" r="7" fill="#22c55e"/><rect x="10" y="15" width="4" height="6" fill="#92400e"/></svg>`,

  peak: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 4l8 16H4l8-16z" fill="#D08F55"/></svg>`,

  // Misc
  info: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#3b82f6"/><text x="12" y="17" font-family="serif" font-size="14" font-weight="bold" fill="white" text-anchor="middle">i</text></svg>`,

  toilets: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2" fill="#6b7280"/><circle cx="8" cy="6" r="2" fill="white"/><path d="M8 9v6M6 11h4M8 15l-2 4M8 15l2 4" stroke="white" stroke-width="1.5"/><circle cx="16" cy="6" r="2" fill="white"/><path d="M14 9h4v4l-1 6h-2l-1-6V9z" fill="white"/></svg>`,

  recycling: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#22c55e"/><path d="M12 6l3 4h-2v4h-2v-4H9l3-4zM7 14l3-4v2h4l-2 3.5L7 14zM17 14l-3-4v2h-4l2 3.5L17 14z" fill="white"/></svg>`,

  drinking_water: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#0ea5e9"/><path d="M12 6c-2 3-4 5-4 8 0 2 2 4 4 4s4-2 4-4c0-3-2-5-4-8z" fill="white"/></svg>`,
};

/**
 * Get an icon as a data URI for embedding in SVG
 */
export function getIconDataUri(iconName: string): string | null {
  const svg = ICONS[iconName];
  if (!svg) return null;

  // Encode as base64 data URI
  const base64 = btoa(svg);
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Get an icon as raw SVG string
 */
export function getIconSvg(iconName: string): string | null {
  return ICONS[iconName] || null;
}

/**
 * Get list of available icon names
 */
export function getAvailableIcons(): string[] {
  return Object.keys(ICONS);
}

/**
 * Map Maperitive icon paths to our icon names
 * Example: "icons/SJJB/png/transport_parking.p.32.png" -> "parking"
 */
export function resolveIconName(iconPath: string): string | null {
  // Extract icon name from path patterns like:
  // - icons/SJJB/png/transport_parking.p.32.png
  // - icons/SJJB/png/food_restaurant.p.32.png

  const match = iconPath.match(/(\w+)\.p\.\d+\.png$/i);
  if (match) {
    const fullName = match[1].toLowerCase();

    // Map common patterns
    const mappings: Record<string, string> = {
      'transport_parking': 'parking',
      'transport_bus_stop': 'bus_stop',
      'transport_roundabout_anticlockwise': 'parking', // fallback
      'food_restaurant': 'restaurant',
      'food_cafe': 'cafe',
      'food_fastfood2': 'fast_food',
      'food_pub': 'pub',
      'food_drinkingtap': 'drinking_water',
      'amenity_post_box': 'post_office',
      'amenity_post_office': 'post_office',
      'amenity_telephone': 'info',
      'amenity_firestation': 'fire_station',
      'amenity_police': 'police',
      'amenity_recycling': 'recycling',
      'amenity_toilets': 'toilets',
      'amenity_library': 'library',
      'health_hospital': 'hospital',
      'health_pharmacy': 'pharmacy',
      'money_bank2': 'bank',
      'money_atm2': 'atm',
      'shopping_supermarket': 'supermarket',
      'shopping_bakery': 'bakery',
      'shopping_convenience': 'convenience',
      'shopping_hairdresser': 'convenience',
      'shopping_diy': 'convenience',
      'education_school': 'school',
      'place_of_worship_christian3': 'place_of_worship',
      'tourist_memorial': 'viewpoint',
      'tourist_view_point': 'viewpoint',
      'tourist_museum': 'museum',
      'accommodation_hotel2': 'hotel',
      'barrier_gate': 'info',
    };

    return mappings[fullName] || null;
  }

  // Direct name lookup
  const simpleName = iconPath.replace(/^poi_/, '').toLowerCase();
  if (ICONS[simpleName]) {
    return simpleName;
  }

  return null;
}

export default ICONS;
