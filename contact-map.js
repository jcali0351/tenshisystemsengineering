(() => {
  const hero = document.getElementById('contact-map-hero');
  const stage = document.getElementById('cm-stage');
  const canvas = document.getElementById('cm-canvas');
  if (!hero || !stage || !canvas) return;
  const ctx = canvas.getContext('2d');

  const pinHost = document.getElementById('cm-pin-host');
  const pinServer = document.getElementById('cm-pin-server');
  const pinYou = document.getElementById('cm-pin-you');
  const youApproxEl = document.getElementById('cm-you-approx');
  const popover = document.getElementById('cm-popover');
  const popTag = document.getElementById('cm-pop-tag');
  const popTitle = document.getElementById('cm-pop-title');
  const popMeta = document.getElementById('cm-pop-meta');
  const popClose = document.getElementById('cm-pop-close');
  const popFocus = document.getElementById('cm-pop-focus');
  const popArcs = document.getElementById('cm-pop-arcs');
  const tooltip = document.getElementById('cm-tooltip');
  const tipCity = document.getElementById('cm-tip-city');
  const tipMeta = document.getElementById('cm-tip-meta');
  const zoomReadout = document.getElementById('cm-zoom-readout');
  const routeEl = document.getElementById('cm-route');
  const routePathEl = document.getElementById('cm-route-path');
  const routeTotalEl = document.getElementById('cm-route-total');
  const geoNote = document.getElementById('cm-geo-note');
  const locateBtn = document.getElementById('cm-locate');
  const youLegendBtn = document.getElementById('cm-legend-you');

  const WORLD_W = 1600;
  const WORLD_H = 820;
  const MERGE_KM = 80;
  const HOP_OVERHEAD_MS = 4;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const NODES = {
    host: {
      id: 'host',
      label: 'HOST',
      tag: 'Digital & Remote-First',
      title: 'Host — Downtown Madison, WI',
      lat: 43.0731,
      lon: -89.4012,
      tz: 'America/Chicago',
      coords: '43.0731° N, 89.4012° W'
    },
    server: {
      id: 'server',
      label: 'SERVER',
      tag: 'Hostinger · Kuala Lumpur',
      title: 'Server — Kuala Lumpur, Malaysia',
      lat: 3.1412,
      lon: 101.6865,
      tz: 'Asia/Kuala_Lumpur',
      coords: '3.1412° N, 101.6865° E'
    }
  };

  const VISITORS = [
    { city: 'Tokyo', country: 'Japan', lat: 35.6762, lon: 139.6503, tz: 'Asia/Tokyo', hub: 'server' },
    { city: 'London', country: 'UK', lat: 51.5072, lon: -0.1276, tz: 'Europe/London', hub: 'host' },
    { city: 'São Paulo', country: 'Brazil', lat: -23.5505, lon: -46.6333, tz: 'America/Sao_Paulo', hub: 'host' },
    { city: 'Sydney', country: 'Australia', lat: -33.8688, lon: 151.2093, tz: 'Australia/Sydney', hub: 'server' },
    { city: 'Berlin', country: 'Germany', lat: 52.52, lon: 13.405, tz: 'Europe/Berlin', hub: 'host' },
    { city: 'Lagos', country: 'Nigeria', lat: 6.5244, lon: 3.3792, tz: 'Africa/Lagos', hub: 'host' },
    { city: 'Toronto', country: 'Canada', lat: 43.6532, lon: -79.3832, tz: 'America/Toronto', hub: 'host' },
    { city: 'Seoul', country: 'South Korea', lat: 37.5665, lon: 126.978, tz: 'Asia/Seoul', hub: 'server' },
    { city: 'Mumbai', country: 'India', lat: 19.076, lon: 72.8777, tz: 'Asia/Kolkata', hub: 'server' },
    { city: 'Paris', country: 'France', lat: 48.8566, lon: 2.3522, tz: 'Europe/Paris', hub: 'host' },
    { city: 'Mexico City', country: 'Mexico', lat: 19.4326, lon: -99.1332, tz: 'America/Mexico_City', hub: 'host' },
    { city: 'Cape Town', country: 'South Africa', lat: -33.9249, lon: 18.4241, tz: 'Africa/Johannesburg', hub: 'host' },
    { city: 'Singapore', country: 'Singapore', lat: 1.3521, lon: 103.8198, tz: 'Asia/Singapore', hub: 'server' },
    { city: 'New York', country: 'USA', lat: 40.7128, lon: -74.006, tz: 'America/New_York', hub: 'host' },
    { city: 'Buenos Aires', country: 'Argentina', lat: -34.6037, lon: -58.3816, tz: 'America/Argentina/Buenos_Aires', hub: 'host' },
    { city: 'Dublin', country: 'Ireland', lat: 53.3498, lon: -6.2603, tz: 'Europe/Dublin', hub: 'host' },
    { city: 'Nairobi', country: 'Kenya', lat: -1.2921, lon: 36.8219, tz: 'Africa/Nairobi', hub: 'host' },
    { city: 'Auckland', country: 'New Zealand', lat: -36.8485, lon: 174.7633, tz: 'Pacific/Auckland', hub: 'server' },
    { city: 'Stockholm', country: 'Sweden', lat: 59.3293, lon: 18.0686, tz: 'Europe/Stockholm', hub: 'host' },
    { city: 'Cairo', country: 'Egypt', lat: 30.0444, lon: 31.2357, tz: 'Africa/Cairo', hub: 'host' }
  ];

  // Representative city per IANA time zone. Built-in only; no network lookup.
  const TZ_CITIES = {
    'America/New_York': { city: 'New York', country: 'USA', lat: 40.7128, lon: -74.006 },
    'America/Chicago': { city: 'Chicago', country: 'USA', lat: 41.8781, lon: -87.6298 },
    'America/Denver': { city: 'Denver', country: 'USA', lat: 39.7392, lon: -104.9903 },
    'America/Los_Angeles': { city: 'Los Angeles', country: 'USA', lat: 34.0522, lon: -118.2437 },
    'America/Phoenix': { city: 'Phoenix', country: 'USA', lat: 33.4484, lon: -112.074 },
    'America/Anchorage': { city: 'Anchorage', country: 'USA', lat: 61.2181, lon: -149.9003 },
    'America/Detroit': { city: 'Detroit', country: 'USA', lat: 42.3314, lon: -83.0458 },
    'America/Indiana/Indianapolis': { city: 'Indianapolis', country: 'USA', lat: 39.7684, lon: -86.1581 },
    'America/Indiana/Knox': { city: 'Knox', country: 'USA', lat: 41.2959, lon: -86.625 },
    'America/Indiana/Marengo': { city: 'Marengo', country: 'USA', lat: 38.3692, lon: -86.3436 },
    'America/Indiana/Petersburg': { city: 'Petersburg', country: 'USA', lat: 38.4917, lon: -87.2786 },
    'America/Indiana/Tell_City': { city: 'Tell City', country: 'USA', lat: 37.9514, lon: -86.7678 },
    'America/Indiana/Vevay': { city: 'Vevay', country: 'USA', lat: 38.7478, lon: -85.0672 },
    'America/Indiana/Vincennes': { city: 'Vincennes', country: 'USA', lat: 38.6773, lon: -87.5286 },
    'America/Indiana/Winamac': { city: 'Winamac', country: 'USA', lat: 41.0514, lon: -86.6031 },
    'America/Kentucky/Louisville': { city: 'Louisville', country: 'USA', lat: 38.2527, lon: -85.7585 },
    'America/Kentucky/Monticello': { city: 'Monticello', country: 'USA', lat: 36.8298, lon: -84.8491 },
    'America/Boise': { city: 'Boise', country: 'USA', lat: 43.615, lon: -116.2023 },
    'America/Menominee': { city: 'Menominee', country: 'USA', lat: 45.1078, lon: -87.6143 },
    'America/North_Dakota/Beulah': { city: 'Beulah', country: 'USA', lat: 47.2633, lon: -101.7779 },
    'America/North_Dakota/Center': { city: 'Center', country: 'USA', lat: 47.1147, lon: -101.2993 },
    'America/North_Dakota/New_Salem': { city: 'New Salem', country: 'USA', lat: 46.8444, lon: -101.4129 },
    'America/Adak': { city: 'Adak', country: 'USA', lat: 51.88, lon: -176.6581 },
    'America/Juneau': { city: 'Juneau', country: 'USA', lat: 58.3019, lon: -134.4197 },
    'America/Nome': { city: 'Nome', country: 'USA', lat: 64.5011, lon: -165.4064 },
    'America/Sitka': { city: 'Sitka', country: 'USA', lat: 57.0531, lon: -135.33 },
    'America/Yakutat': { city: 'Yakutat', country: 'USA', lat: 59.5469, lon: -139.7272 },
    'America/Metlakatla': { city: 'Metlakatla', country: 'USA', lat: 55.1292, lon: -131.5722 },
    'Pacific/Honolulu': { city: 'Honolulu', country: 'USA', lat: 21.3069, lon: -157.8583 },
    'America/Toronto': { city: 'Toronto', country: 'Canada', lat: 43.6532, lon: -79.3832 },
    'America/Vancouver': { city: 'Vancouver', country: 'Canada', lat: 49.2827, lon: -123.1207 },
    'America/Edmonton': { city: 'Edmonton', country: 'Canada', lat: 53.5461, lon: -113.4938 },
    'America/Winnipeg': { city: 'Winnipeg', country: 'Canada', lat: 49.8951, lon: -97.1384 },
    'America/Halifax': { city: 'Halifax', country: 'Canada', lat: 44.6488, lon: -63.5752 },
    'America/St_Johns': { city: "St. John's", country: 'Canada', lat: 47.5615, lon: -52.7126 },
    'America/Regina': { city: 'Regina', country: 'Canada', lat: 50.4452, lon: -104.6189 },
    'America/Whitehorse': { city: 'Whitehorse', country: 'Canada', lat: 60.7212, lon: -135.0568 },
    'America/Yellowknife': { city: 'Yellowknife', country: 'Canada', lat: 62.454, lon: -114.3718 },
    'America/Montreal': { city: 'Montreal', country: 'Canada', lat: 45.5017, lon: -73.5673 },
    'America/Mexico_City': { city: 'Mexico City', country: 'Mexico', lat: 19.4326, lon: -99.1332 },
    'America/Tijuana': { city: 'Tijuana', country: 'Mexico', lat: 32.5149, lon: -117.0382 },
    'America/Cancun': { city: 'Cancún', country: 'Mexico', lat: 21.1619, lon: -86.8515 },
    'America/Monterrey': { city: 'Monterrey', country: 'Mexico', lat: 25.6866, lon: -100.3161 },
    'America/Bogota': { city: 'Bogotá', country: 'Colombia', lat: 4.711, lon: -74.0721 },
    'America/Lima': { city: 'Lima', country: 'Peru', lat: -12.0464, lon: -77.0428 },
    'America/Guayaquil': { city: 'Guayaquil', country: 'Ecuador', lat: -2.1894, lon: -79.8891 },
    'America/Santiago': { city: 'Santiago', country: 'Chile', lat: -33.4489, lon: -70.6693 },
    'America/Sao_Paulo': { city: 'São Paulo', country: 'Brazil', lat: -23.5505, lon: -46.6333 },
    'America/Fortaleza': { city: 'Fortaleza', country: 'Brazil', lat: -3.7172, lon: -38.5433 },
    'America/Manaus': { city: 'Manaus', country: 'Brazil', lat: -3.119, lon: -60.0217 },
    'America/Recife': { city: 'Recife', country: 'Brazil', lat: -8.0476, lon: -34.877 },
    'America/Argentina/Buenos_Aires': { city: 'Buenos Aires', country: 'Argentina', lat: -34.6037, lon: -58.3816 },
    'America/Buenos_Aires': { city: 'Buenos Aires', country: 'Argentina', lat: -34.6037, lon: -58.3816 },
    'America/Caracas': { city: 'Caracas', country: 'Venezuela', lat: 10.4806, lon: -66.9036 },
    'America/La_Paz': { city: 'La Paz', country: 'Bolivia', lat: -16.5, lon: -68.15 },
    'America/Asuncion': { city: 'Asunción', country: 'Paraguay', lat: -25.2637, lon: -57.5759 },
    'America/Montevideo': { city: 'Montevideo', country: 'Uruguay', lat: -34.9011, lon: -56.1645 },
    'America/Panama': { city: 'Panama City', country: 'Panama', lat: 8.9824, lon: -79.5199 },
    'America/Costa_Rica': { city: 'San José', country: 'Costa Rica', lat: 9.9281, lon: -84.0907 },
    'America/Guatemala': { city: 'Guatemala City', country: 'Guatemala', lat: 14.6349, lon: -90.5069 },
    'America/El_Salvador': { city: 'San Salvador', country: 'El Salvador', lat: 13.6929, lon: -89.2182 },
    'America/Tegucigalpa': { city: 'Tegucigalpa', country: 'Honduras', lat: 14.0723, lon: -87.1921 },
    'America/Managua': { city: 'Managua', country: 'Nicaragua', lat: 12.115, lon: -86.2362 },
    'America/Havana': { city: 'Havana', country: 'Cuba', lat: 23.1136, lon: -82.3666 },
    'America/Jamaica': { city: 'Kingston', country: 'Jamaica', lat: 18.0179, lon: -76.8099 },
    'America/Puerto_Rico': { city: 'San Juan', country: 'Puerto Rico', lat: 18.4655, lon: -66.1057 },
    'America/Santo_Domingo': { city: 'Santo Domingo', country: 'Dominican Republic', lat: 18.4861, lon: -69.9312 },
    'America/Barbados': { city: 'Bridgetown', country: 'Barbados', lat: 13.0975, lon: -59.6167 },
    'America/Port_of_Spain': { city: 'Port of Spain', country: 'Trinidad and Tobago', lat: 10.6596, lon: -61.5086 },
    'America/Nassau': { city: 'Nassau', country: 'Bahamas', lat: 25.0443, lon: -77.3504 },
    'America/Martinique': { city: 'Fort-de-France', country: 'Martinique', lat: 14.6161, lon: -61.0589 },
    'America/Guadeloupe': { city: 'Pointe-à-Pitre', country: 'Guadeloupe', lat: 16.241, lon: -61.534 },
    'America/Cayenne': { city: 'Cayenne', country: 'French Guiana', lat: 4.9224, lon: -52.3135 },
    'America/Paramaribo': { city: 'Paramaribo', country: 'Suriname', lat: 5.852, lon: -55.2038 },
    'America/Godthab': { city: 'Nuuk', country: 'Greenland', lat: 64.1814, lon: -51.6941 },
    'America/Nuuk': { city: 'Nuuk', country: 'Greenland', lat: 64.1814, lon: -51.6941 },
    'US/Eastern': { city: 'New York', country: 'USA', lat: 40.7128, lon: -74.006 },
    'US/Central': { city: 'Chicago', country: 'USA', lat: 41.8781, lon: -87.6298 },
    'US/Mountain': { city: 'Denver', country: 'USA', lat: 39.7392, lon: -104.9903 },
    'US/Pacific': { city: 'Los Angeles', country: 'USA', lat: 34.0522, lon: -118.2437 },
    'US/Arizona': { city: 'Phoenix', country: 'USA', lat: 33.4484, lon: -112.074 },
    'US/Hawaii': { city: 'Honolulu', country: 'USA', lat: 21.3069, lon: -157.8583 },
    'US/Alaska': { city: 'Anchorage', country: 'USA', lat: 61.2181, lon: -149.9003 },
    'Canada/Eastern': { city: 'Toronto', country: 'Canada', lat: 43.6532, lon: -79.3832 },
    'Canada/Central': { city: 'Winnipeg', country: 'Canada', lat: 49.8951, lon: -97.1384 },
    'Canada/Mountain': { city: 'Edmonton', country: 'Canada', lat: 53.5461, lon: -113.4938 },
    'Canada/Pacific': { city: 'Vancouver', country: 'Canada', lat: 49.2827, lon: -123.1207 },
    'Canada/Atlantic': { city: 'Halifax', country: 'Canada', lat: 44.6488, lon: -63.5752 },
    'Canada/Newfoundland': { city: "St. John's", country: 'Canada', lat: 47.5615, lon: -52.7126 },
    'Europe/London': { city: 'London', country: 'UK', lat: 51.5072, lon: -0.1276 },
    'Europe/Dublin': { city: 'Dublin', country: 'Ireland', lat: 53.3498, lon: -6.2603 },
    'Europe/Paris': { city: 'Paris', country: 'France', lat: 48.8566, lon: 2.3522 },
    'Europe/Berlin': { city: 'Berlin', country: 'Germany', lat: 52.52, lon: 13.405 },
    'Europe/Amsterdam': { city: 'Amsterdam', country: 'Netherlands', lat: 52.3676, lon: 4.9041 },
    'Europe/Brussels': { city: 'Brussels', country: 'Belgium', lat: 50.8503, lon: 4.3517 },
    'Europe/Madrid': { city: 'Madrid', country: 'Spain', lat: 40.4168, lon: -3.7038 },
    'Europe/Rome': { city: 'Rome', country: 'Italy', lat: 41.9028, lon: 12.4964 },
    'Europe/Zurich': { city: 'Zurich', country: 'Switzerland', lat: 47.3769, lon: 8.5417 },
    'Europe/Vienna': { city: 'Vienna', country: 'Austria', lat: 48.2082, lon: 16.3738 },
    'Europe/Stockholm': { city: 'Stockholm', country: 'Sweden', lat: 59.3293, lon: 18.0686 },
    'Europe/Oslo': { city: 'Oslo', country: 'Norway', lat: 59.9139, lon: 10.7522 },
    'Europe/Copenhagen': { city: 'Copenhagen', country: 'Denmark', lat: 55.6761, lon: 12.5683 },
    'Europe/Helsinki': { city: 'Helsinki', country: 'Finland', lat: 60.1699, lon: 24.9384 },
    'Europe/Warsaw': { city: 'Warsaw', country: 'Poland', lat: 52.2297, lon: 21.0122 },
    'Europe/Prague': { city: 'Prague', country: 'Czechia', lat: 50.0755, lon: 14.4378 },
    'Europe/Budapest': { city: 'Budapest', country: 'Hungary', lat: 47.4979, lon: 19.0402 },
    'Europe/Athens': { city: 'Athens', country: 'Greece', lat: 37.9838, lon: 23.7275 },
    'Europe/Lisbon': { city: 'Lisbon', country: 'Portugal', lat: 38.7223, lon: -9.1393 },
    'Europe/Bucharest': { city: 'Bucharest', country: 'Romania', lat: 44.4268, lon: 26.1025 },
    'Europe/Sofia': { city: 'Sofia', country: 'Bulgaria', lat: 42.6977, lon: 23.3219 },
    'Europe/Istanbul': { city: 'Istanbul', country: 'Türkiye', lat: 41.0082, lon: 28.9784 },
    'Europe/Moscow': { city: 'Moscow', country: 'Russia', lat: 55.7558, lon: 37.6173 },
    'Europe/Kyiv': { city: 'Kyiv', country: 'Ukraine', lat: 50.4501, lon: 30.5234 },
    'Europe/Kiev': { city: 'Kyiv', country: 'Ukraine', lat: 50.4501, lon: 30.5234 },
    'Europe/Minsk': { city: 'Minsk', country: 'Belarus', lat: 53.9006, lon: 27.559 },
    'Europe/Riga': { city: 'Riga', country: 'Latvia', lat: 56.9496, lon: 24.1052 },
    'Europe/Tallinn': { city: 'Tallinn', country: 'Estonia', lat: 59.437, lon: 24.7536 },
    'Europe/Vilnius': { city: 'Vilnius', country: 'Lithuania', lat: 54.6872, lon: 25.2797 },
    'Europe/Belgrade': { city: 'Belgrade', country: 'Serbia', lat: 44.7866, lon: 20.4489 },
    'Europe/Zagreb': { city: 'Zagreb', country: 'Croatia', lat: 45.815, lon: 15.9819 },
    'Europe/Ljubljana': { city: 'Ljubljana', country: 'Slovenia', lat: 46.0569, lon: 14.5058 },
    'Europe/Bratislava': { city: 'Bratislava', country: 'Slovakia', lat: 48.1486, lon: 17.1077 },
    'Europe/Luxembourg': { city: 'Luxembourg', country: 'Luxembourg', lat: 49.6116, lon: 6.1319 },
    'Europe/Malta': { city: 'Valletta', country: 'Malta', lat: 35.8989, lon: 14.5146 },
    'Europe/Andorra': { city: 'Andorra la Vella', country: 'Andorra', lat: 42.5063, lon: 1.5218 },
    'Europe/Gibraltar': { city: 'Gibraltar', country: 'Gibraltar', lat: 36.1408, lon: -5.3536 },
    'Atlantic/Reykjavik': { city: 'Reykjavík', country: 'Iceland', lat: 64.1466, lon: -21.9426 },
    'Atlantic/Canary': { city: 'Las Palmas', country: 'Spain', lat: 28.1235, lon: -15.4363 },
    'Atlantic/Azores': { city: 'Ponta Delgada', country: 'Portugal', lat: 37.7394, lon: -25.6687 },
    'Atlantic/Madeira': { city: 'Funchal', country: 'Portugal', lat: 32.6669, lon: -16.9241 },
    'Asia/Tokyo': { city: 'Tokyo', country: 'Japan', lat: 35.6762, lon: 139.6503 },
    'Asia/Seoul': { city: 'Seoul', country: 'South Korea', lat: 37.5665, lon: 126.978 },
    'Asia/Shanghai': { city: 'Shanghai', country: 'China', lat: 31.2304, lon: 121.4737 },
    'Asia/Hong_Kong': { city: 'Hong Kong', country: 'Hong Kong', lat: 22.3193, lon: 114.1694 },
    'Asia/Taipei': { city: 'Taipei', country: 'Taiwan', lat: 25.033, lon: 121.5654 },
    'Asia/Singapore': { city: 'Singapore', country: 'Singapore', lat: 1.3521, lon: 103.8198 },
    'Asia/Kuala_Lumpur': { city: 'Kuala Lumpur', country: 'Malaysia', lat: 3.139, lon: 101.6869 },
    'Asia/Bangkok': { city: 'Bangkok', country: 'Thailand', lat: 13.7563, lon: 100.5018 },
    'Asia/Jakarta': { city: 'Jakarta', country: 'Indonesia', lat: -6.2088, lon: 106.8456 },
    'Asia/Makassar': { city: 'Makassar', country: 'Indonesia', lat: -5.1477, lon: 119.4327 },
    'Asia/Jayapura': { city: 'Jayapura', country: 'Indonesia', lat: -2.5916, lon: 140.669 },
    'Asia/Manila': { city: 'Manila', country: 'Philippines', lat: 14.5995, lon: 120.9842 },
    'Asia/Ho_Chi_Minh': { city: 'Ho Chi Minh City', country: 'Vietnam', lat: 10.8231, lon: 106.6297 },
    'Asia/Saigon': { city: 'Ho Chi Minh City', country: 'Vietnam', lat: 10.8231, lon: 106.6297 },
    'Asia/Kolkata': { city: 'Kolkata', country: 'India', lat: 22.5726, lon: 88.3639 },
    'Asia/Calcutta': { city: 'Kolkata', country: 'India', lat: 22.5726, lon: 88.3639 },
    'Asia/Dhaka': { city: 'Dhaka', country: 'Bangladesh', lat: 23.8103, lon: 90.4125 },
    'Asia/Karachi': { city: 'Karachi', country: 'Pakistan', lat: 24.8607, lon: 67.0011 },
    'Asia/Dubai': { city: 'Dubai', country: 'UAE', lat: 25.2048, lon: 55.2708 },
    'Asia/Riyadh': { city: 'Riyadh', country: 'Saudi Arabia', lat: 24.7136, lon: 46.6753 },
    'Asia/Jerusalem': { city: 'Jerusalem', country: 'Israel', lat: 31.7683, lon: 35.2137 },
    'Asia/Tehran': { city: 'Tehran', country: 'Iran', lat: 35.6892, lon: 51.389 },
    'Asia/Baghdad': { city: 'Baghdad', country: 'Iraq', lat: 33.3152, lon: 44.3661 },
    'Asia/Kuwait': { city: 'Kuwait City', country: 'Kuwait', lat: 29.3759, lon: 47.9774 },
    'Asia/Qatar': { city: 'Doha', country: 'Qatar', lat: 25.2854, lon: 51.531 },
    'Asia/Bahrain': { city: 'Manama', country: 'Bahrain', lat: 26.0667, lon: 50.5577 },
    'Asia/Muscat': { city: 'Muscat', country: 'Oman', lat: 23.588, lon: 58.3829 },
    'Asia/Amman': { city: 'Amman', country: 'Jordan', lat: 31.9454, lon: 35.9284 },
    'Asia/Beirut': { city: 'Beirut', country: 'Lebanon', lat: 33.8938, lon: 35.5018 },
    'Asia/Damascus': { city: 'Damascus', country: 'Syria', lat: 33.5138, lon: 36.2765 },
    'Asia/Tashkent': { city: 'Tashkent', country: 'Uzbekistan', lat: 41.2995, lon: 69.2401 },
    'Asia/Almaty': { city: 'Almaty', country: 'Kazakhstan', lat: 43.222, lon: 76.8512 },
    'Asia/Baku': { city: 'Baku', country: 'Azerbaijan', lat: 40.4093, lon: 49.8671 },
    'Asia/Tbilisi': { city: 'Tbilisi', country: 'Georgia', lat: 41.7151, lon: 44.8271 },
    'Asia/Yerevan': { city: 'Yerevan', country: 'Armenia', lat: 40.1792, lon: 44.4991 },
    'Asia/Kabul': { city: 'Kabul', country: 'Afghanistan', lat: 34.5553, lon: 69.2075 },
    'Asia/Kathmandu': { city: 'Kathmandu', country: 'Nepal', lat: 27.7172, lon: 85.324 },
    'Asia/Colombo': { city: 'Colombo', country: 'Sri Lanka', lat: 6.9271, lon: 79.8612 },
    'Asia/Yangon': { city: 'Yangon', country: 'Myanmar', lat: 16.8409, lon: 96.1735 },
    'Asia/Rangoon': { city: 'Yangon', country: 'Myanmar', lat: 16.8409, lon: 96.1735 },
    'Asia/Ulaanbaatar': { city: 'Ulaanbaatar', country: 'Mongolia', lat: 47.8864, lon: 106.9057 },
    'Asia/Novosibirsk': { city: 'Novosibirsk', country: 'Russia', lat: 55.0084, lon: 82.9357 },
    'Asia/Yekaterinburg': { city: 'Yekaterinburg', country: 'Russia', lat: 56.8389, lon: 60.6057 },
    'Asia/Krasnoyarsk': { city: 'Krasnoyarsk', country: 'Russia', lat: 56.0153, lon: 92.8932 },
    'Asia/Irkutsk': { city: 'Irkutsk', country: 'Russia', lat: 52.287, lon: 104.305 },
    'Asia/Yakutsk': { city: 'Yakutsk', country: 'Russia', lat: 62.0355, lon: 129.6755 },
    'Asia/Vladivostok': { city: 'Vladivostok', country: 'Russia', lat: 43.1332, lon: 131.9113 },
    'Asia/Magadan': { city: 'Magadan', country: 'Russia', lat: 59.5612, lon: 150.8094 },
    'Asia/Kamchatka': { city: 'Petropavlovsk-Kamchatsky', country: 'Russia', lat: 53.037, lon: 158.6559 },
    'Australia/Sydney': { city: 'Sydney', country: 'Australia', lat: -33.8688, lon: 151.2093 },
    'Australia/Melbourne': { city: 'Melbourne', country: 'Australia', lat: -37.8136, lon: 144.9631 },
    'Australia/Brisbane': { city: 'Brisbane', country: 'Australia', lat: -27.4705, lon: 153.026 },
    'Australia/Perth': { city: 'Perth', country: 'Australia', lat: -31.9505, lon: 115.8605 },
    'Australia/Adelaide': { city: 'Adelaide', country: 'Australia', lat: -34.9285, lon: 138.6007 },
    'Australia/Hobart': { city: 'Hobart', country: 'Australia', lat: -42.8821, lon: 147.3272 },
    'Australia/Darwin': { city: 'Darwin', country: 'Australia', lat: -12.4634, lon: 130.8456 },
    'Pacific/Auckland': { city: 'Auckland', country: 'New Zealand', lat: -36.8485, lon: 174.7633 },
    'Pacific/Fiji': { city: 'Suva', country: 'Fiji', lat: -18.1416, lon: 178.4419 },
    'Pacific/Guam': { city: 'Hagåtña', country: 'Guam', lat: 13.4443, lon: 144.7937 },
    'Pacific/Port_Moresby': { city: 'Port Moresby', country: 'Papua New Guinea', lat: -9.4438, lon: 147.1803 },
    'Pacific/Noumea': { city: 'Nouméa', country: 'New Caledonia', lat: -22.2758, lon: 166.458 },
    'Pacific/Tahiti': { city: 'Papeete', country: 'French Polynesia', lat: -17.5516, lon: -149.5585 },
    'Pacific/Samoa': { city: 'Apia', country: 'Samoa', lat: -13.8364, lon: -171.7649 },
    'Pacific/Apia': { city: 'Apia', country: 'Samoa', lat: -13.8364, lon: -171.7649 },
    'Pacific/Tongatapu': { city: "Nuku'alofa", country: 'Tonga', lat: -21.1394, lon: -175.2049 },
    'Africa/Johannesburg': { city: 'Johannesburg', country: 'South Africa', lat: -26.2041, lon: 28.0473 },
    'Africa/Cairo': { city: 'Cairo', country: 'Egypt', lat: 30.0444, lon: 31.2357 },
    'Africa/Lagos': { city: 'Lagos', country: 'Nigeria', lat: 6.5244, lon: 3.3792 },
    'Africa/Nairobi': { city: 'Nairobi', country: 'Kenya', lat: -1.2921, lon: 36.8219 },
    'Africa/Casablanca': { city: 'Casablanca', country: 'Morocco', lat: 33.5731, lon: -7.5898 },
    'Africa/Accra': { city: 'Accra', country: 'Ghana', lat: 5.6037, lon: -0.187 },
    'Africa/Tunis': { city: 'Tunis', country: 'Tunisia', lat: 36.8065, lon: 10.1815 },
    'Africa/Algiers': { city: 'Algiers', country: 'Algeria', lat: 36.7538, lon: 3.0588 },
    'Africa/Addis_Ababa': { city: 'Addis Ababa', country: 'Ethiopia', lat: 9.032, lon: 38.7469 },
    'Africa/Khartoum': { city: 'Khartoum', country: 'Sudan', lat: 15.5007, lon: 32.5599 },
    'Africa/Kampala': { city: 'Kampala', country: 'Uganda', lat: 0.3476, lon: 32.5825 },
    'Africa/Dar_es_Salaam': { city: 'Dar es Salaam', country: 'Tanzania', lat: -6.7924, lon: 39.2083 },
    'Africa/Maputo': { city: 'Maputo', country: 'Mozambique', lat: -25.9692, lon: 32.5732 },
    'Africa/Harare': { city: 'Harare', country: 'Zimbabwe', lat: -17.8252, lon: 31.0335 },
    'Africa/Lusaka': { city: 'Lusaka', country: 'Zambia', lat: -15.3875, lon: 28.3228 },
    'Africa/Windhoek': { city: 'Windhoek', country: 'Namibia', lat: -22.5609, lon: 17.0658 },
    'Africa/Abidjan': { city: 'Abidjan', country: "Côte d'Ivoire", lat: 5.36, lon: -4.0083 },
    'Africa/Dakar': { city: 'Dakar', country: 'Senegal', lat: 14.7167, lon: -17.4677 },
    'Africa/Tripoli': { city: 'Tripoli', country: 'Libya', lat: 32.8872, lon: 13.1913 },
    'Africa/Douala': { city: 'Douala', country: 'Cameroon', lat: 4.0511, lon: 9.7679 },
    'Africa/Kinshasa': { city: 'Kinshasa', country: 'DR Congo', lat: -4.4419, lon: 15.2663 }
  };

  // Closest well-known internet exchange / backbone point (built-in; illustrative).
  const IXPS = [
    { city: 'Chicago', name: 'Chicago IX', lat: 41.8781, lon: -87.6298 },
    { city: 'Ashburn', name: 'Ashburn IX', lat: 39.0438, lon: -77.4874 },
    { city: 'Los Angeles', name: 'Los Angeles IX', lat: 34.0522, lon: -118.2437 },
    { city: 'London', name: 'LINX · London', lat: 51.5072, lon: -0.1276 },
    { city: 'Frankfurt', name: 'DE-CIX · Frankfurt', lat: 50.1109, lon: 8.6821 },
    { city: 'Tokyo', name: 'JPIX · Tokyo', lat: 35.6762, lon: 139.6503 },
    { city: 'Singapore', name: 'Singapore IX', lat: 1.3521, lon: 103.8198 }
  ];

  // Major metros used as an approximate regional ISP hop.
  const METROS = [
    { city: 'New York', lat: 40.7128, lon: -74.006 },
    { city: 'Chicago', lat: 41.8781, lon: -87.6298 },
    { city: 'Los Angeles', lat: 34.0522, lon: -118.2437 },
    { city: 'Dallas', lat: 32.7767, lon: -96.797 },
    { city: 'Denver', lat: 39.7392, lon: -104.9903 },
    { city: 'Miami', lat: 25.7617, lon: -80.1918 },
    { city: 'Seattle', lat: 47.6062, lon: -122.3321 },
    { city: 'Toronto', lat: 43.6532, lon: -79.3832 },
    { city: 'Mexico City', lat: 19.4326, lon: -99.1332 },
    { city: 'São Paulo', lat: -23.5505, lon: -46.6333 },
    { city: 'London', lat: 51.5072, lon: -0.1276 },
    { city: 'Frankfurt', lat: 50.1109, lon: 8.6821 },
    { city: 'Paris', lat: 48.8566, lon: 2.3522 },
    { city: 'Amsterdam', lat: 52.3676, lon: 4.9041 },
    { city: 'Madrid', lat: 40.4168, lon: -3.7038 },
    { city: 'Stockholm', lat: 59.3293, lon: 18.0686 },
    { city: 'Moscow', lat: 55.7558, lon: 37.6173 },
    { city: 'Dubai', lat: 25.2048, lon: 55.2708 },
    { city: 'Mumbai', lat: 19.076, lon: 72.8777 },
    { city: 'Singapore', lat: 1.3521, lon: 103.8198 },
    { city: 'Hong Kong', lat: 22.3193, lon: 114.1694 },
    { city: 'Tokyo', lat: 35.6762, lon: 139.6503 },
    { city: 'Seoul', lat: 37.5665, lon: 126.978 },
    { city: 'Sydney', lat: -33.8688, lon: 151.2093 },
    { city: 'Johannesburg', lat: -26.2041, lon: 28.0473 },
    { city: 'Lagos', lat: 6.5244, lon: 3.3792 },
    { city: 'Cairo', lat: 30.0444, lon: 31.2357 }
  ];

  // Real coastlines: Natural Earth land 1:50m (public domain), precomputed by tools/build-contact-map-land.py
  let LAND = [];
  const LAND_URL = 'contact-map-land.json?v=1f235ae4';

  function project(lon, lat) {
    const x = ((lon + 180) / 360) * WORLD_W;
    const clampedLat = Math.max(-78, Math.min(82, lat));
    const y = ((85 - clampedLat) / 160) * WORLD_H;
    return { x, y };
  }

  const hostPt = project(NODES.host.lon, NODES.host.lat);
  const serverPt = project(NODES.server.lon, NODES.server.lat);
  const visitorPts = VISITORS.map((v, i) => ({
    ...v,
    ...project(v.lon, v.lat),
    phase: (i * 0.43) % 1
  }));

  const cam = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1, tx: WORLD_W / 2, ty: WORLD_H / 2, tzoom: 1, vx: 0, vy: 0 };
  let width = 0, height = 0, dpr = 1;
  let dragging = false, lastX = 0, lastY = 0, dragMoved = false;
  let showArcs = true;
  let activeNode = null;
  let hoveredVisitor = null;
  let hoveredHop = null;
  let ripples = [];
  let isVisible = true;
  let rafId = null;
  let you = null;
  let routeHops = null;
  let routeDraw = null;

  function worldToScreen(wx, wy) {
    return {
      x: (wx - cam.x) * cam.zoom + width / 2,
      y: (wy - cam.y) * cam.zoom + height / 2
    };
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - width / 2) / cam.zoom + cam.x,
      y: (sy - height / 2) / cam.zoom + cam.y
    };
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function closestPlace(list, lat, lon) {
    let best = list[0], bestD = Infinity;
    for (const item of list) {
      const d = haversineKm(lat, lon, item.lat, item.lon);
      if (d < bestD) { bestD = d; best = item; }
    }
    return { ...best, distKm: bestD };
  }

  function formatCoords(lat, lon) {
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lon >= 0 ? 'E' : 'W';
    const prec = Math.abs(lat * 100) % 1 === 0 && Math.abs(lon * 100) % 1 === 0 ? 2 : 4;
    return `${Math.abs(lat).toFixed(prec)}° ${ns}, ${Math.abs(lon).toFixed(prec)}° ${ew}`;
  }

  function hopLatency(km) {
    return Math.max(1, Math.round(km / 100 + HOP_OVERHEAD_MS));
  }

  function youPoint() {
    return you ? project(you.lon, you.lat) : null;
  }

  function hopPoint(hop) {
    return project(hop.lon, hop.lat);
  }

  function buildRoute(visitor) {
    const hops = [];
    hops.push({
      id: 'you',
      kind: 'you',
      short: 'You',
      label: visitor.precise ? 'You are here' : 'You are here (approx.)',
      title: visitor.precise ? 'You are here' : 'You are here (approx.)',
      tag: 'YOU',
      city: visitor.city,
      country: visitor.country || '',
      lat: visitor.lat,
      lon: visitor.lon,
      color: '#ffb067',
      tz: visitor.tz || ''
    });

    const metro = closestPlace(METROS, visitor.lat, visitor.lon);
    if (metro.distKm > MERGE_KM) {
      hops.push({
        id: 'metro',
        kind: 'metro',
        short: metro.city,
        label: metro.city + ' metro',
        title: metro.city + ' — regional ISP / metro',
        tag: 'ISP / METRO',
        city: metro.city,
        lat: metro.lat,
        lon: metro.lon,
        color: '#5eead4'
      });
    }

    const ixp = closestPlace(IXPS, visitor.lat, visitor.lon);
    const prev = hops[hops.length - 1];
    const ixpFar = haversineKm(prev.lat, prev.lon, ixp.lat, ixp.lon) > MERGE_KM;
    hops.push({
      id: 'ixp',
      kind: 'ixp',
      short: ixp.city + ' IX',
      label: ixp.name,
      title: ixp.name + ' — internet exchange',
      tag: 'INTERNET EXCHANGE',
      city: ixp.city,
      lat: ixp.lat,
      lon: ixp.lon,
      color: '#67e8f9',
      colocated: !ixpFar
    });

    hops.push({
      id: 'server',
      kind: 'server',
      short: 'Kuala Lumpur',
      label: 'Hostinger · Kuala Lumpur',
      title: NODES.server.title,
      tag: NODES.server.tag,
      city: 'Kuala Lumpur',
      lat: NODES.server.lat,
      lon: NODES.server.lon,
      color: '#a855f7'
    });

    hops.push({
      id: 'host',
      kind: 'host',
      short: 'Madison',
      label: 'Tenshi host · Madison',
      title: NODES.host.title,
      tag: NODES.host.tag,
      city: 'Madison',
      lat: NODES.host.lat,
      lon: NODES.host.lon,
      color: '#ff7a1a'
    });

    let totalMs = 0;
    for (let i = 0; i < hops.length - 1; i++) {
      const km = haversineKm(hops[i].lat, hops[i].lon, hops[i + 1].lat, hops[i + 1].lon);
      const ms = hopLatency(km);
      hops[i].nextKm = km;
      hops[i].nextMs = ms;
      totalMs += ms;
    }
    hops.totalMs = totalMs;
    return hops;
  }

  function collapseRoute(hops) {
    const drawn = [hops[0]];
    for (let i = 1; i < hops.length; i++) {
      const prev = drawn[drawn.length - 1];
      if (hops[i].colocated || haversineKm(prev.lat, prev.lon, hops[i].lat, hops[i].lon) <= MERGE_KM) {
        continue;
      }
      drawn.push(hops[i]);
    }
    if (drawn[drawn.length - 1].id !== hops[hops.length - 1].id) {
      drawn.push(hops[hops.length - 1]);
    }
    for (let i = 0; i < drawn.length - 1; i++) {
      const km = haversineKm(drawn[i].lat, drawn[i].lon, drawn[i + 1].lat, drawn[i + 1].lon);
      drawn[i].drawKm = km;
      drawn[i].drawMs = hopLatency(km);
    }
    return drawn;
  }

  function updateRouteHud() {
    if (!routeEl || !routePathEl || !routeTotalEl) return;
    if (!routeHops || routeHops.length < 2) {
      routeEl.hidden = true;
      return;
    }
    const parts = routeHops.map((h) => h.short);
    routePathEl.textContent = parts.join(' → ');
    routeTotalEl.textContent = `~${routeHops.totalMs} ms total · approximate / illustrative`;
    routeEl.hidden = false;
  }

  function updateYouChrome() {
    if (pinYou) {
      pinYou.hidden = !you;
      const label = you
        ? (you.precise ? 'You are here' : 'You are here (approx.)')
        : 'You are here';
      pinYou.setAttribute('aria-label', label);
    }
    if (youApproxEl) youApproxEl.hidden = !you || you.precise;
    if (youLegendBtn) youLegendBtn.hidden = !you;
  }

  function setYou(next) {
    you = next;
    routeHops = you ? buildRoute(you) : null;
    routeDraw = routeHops ? collapseRoute(routeHops) : null;
    updateYouChrome();
    updateRouteHud();
    if (activeNode === 'you' && you) openPopover('you');
  }

  function showGeoNote(msg) {
    if (!geoNote) return;
    geoNote.textContent = msg;
    geoNote.hidden = false;
  }

  function requestPreciseLocation() {
    if (geoNote) geoNote.hidden = true;
    if (!navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== 'function') {
      showGeoNote('Location is not available in this browser. The approximate pin is still shown.');
      return;
    }
    if (locateBtn) locateBtn.disabled = true;
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (locateBtn) locateBtn.disabled = false;
          const lat = Math.round(pos.coords.latitude * 100) / 100;
          const lon = Math.round(pos.coords.longitude * 100) / 100;
          let tz = you && you.tz;
          try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (e) { /* ignore */ }
          setYou({
            city: 'Your location',
            country: '',
            lat,
            lon,
            tz: tz || '',
            precise: true
          });
        },
        () => {
          if (locateBtn) locateBtn.disabled = false;
          showGeoNote('Location is unavailable. The approximate pin is still shown.');
        },
        { enableHighAccuracy: false, maximumAge: 0, timeout: 8000 }
      );
    } catch (e) {
      if (locateBtn) locateBtn.disabled = false;
      showGeoNote('Location is unavailable. The approximate pin is still shown.');
    }
  }

  function initYouFromTimezone() {
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* ignore */ }
    const place = tz && TZ_CITIES[tz];
    if (!place) return;
    setYou({ ...place, tz, precise: false });
  }

  function fitAll(instant = false) {
    const pts = [hostPt, serverPt, ...visitorPts];
    const yp = youPoint();
    if (yp) pts.push(yp);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const padX = width > 900 ? width * 0.22 : 28;
    const availW = Math.max(200, width - padX - (width > 700 ? 60 : 24));
    const availH = Math.max(200, height - 120);
    const scale = Math.min(availW / (maxX - minX), availH / (maxY - minY));
    const zMin = width > 700 ? 0.45 : 0.28;
    const z = Math.max(zMin, Math.min(2.2, scale));
    const offsetX = width > 900 ? -110 / z : 0;
    cam.tzoom = z;
    cam.tx = (minX + maxX) / 2 + offsetX;
    cam.ty = (minY + maxY) / 2;
    if (instant) {
      cam.zoom = cam.tzoom;
      cam.x = cam.tx;
      cam.y = cam.ty;
    }
  }

  function nodePoint(key) {
    if (key === 'host') return hostPt;
    if (key === 'server') return serverPt;
    if (key === 'you') return youPoint();
    const hop = routeHops && routeHops.find((h) => h.id === key);
    return hop ? hopPoint(hop) : null;
  }

  function focusNode(key) {
    const pt = nodePoint(key);
    if (!pt) return;
    cam.tzoom = Math.max(1.85, Math.min(2.6, width / 560));
    cam.tx = pt.x - (width > 900 ? 80 / cam.tzoom : 0);
    cam.ty = pt.y;
    openPopover(key);
  }

  function formatTime(tz) {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true
      }).format(new Date());
    } catch { return ''; }
  }

  function popoverModel(key) {
    if (key === 'host' || key === 'server') return NODES[key];
    if (key === 'you' && you) {
      return {
        id: 'you',
        label: 'YOU',
        tag: 'YOU',
        title: you.precise ? 'You are here' : 'You are here (approx.)',
        tz: you.tz,
        coords: formatCoords(you.lat, you.lon),
        hopMeta: you.precise
          ? 'City-level location (rounded). Nothing is stored or sent.'
          : `Approximate from time zone ${you.tz || 'unknown'}. Nothing is stored or sent.`
      };
    }
    const hop = routeHops && routeHops.find((h) => h.id === key);
    if (!hop) return null;
    return {
      id: hop.id,
      label: hop.short,
      tag: hop.tag,
      title: hop.title,
      coords: formatCoords(hop.lat, hop.lon),
      hopMeta: 'This hop is approximate / illustrative — a browser cannot traceroute.'
    };
  }

  function openPopover(key) {
    const node = popoverModel(key);
    if (!node) return;
    activeNode = key;
    popTag.textContent = node.tag;
    popTag.className = 'cm-popover-tag cm-popover-tag--' + (key === 'you' ? 'you' : key);
    popTitle.textContent = node.title;
    const bits = [];
    if (node.tz) bits.push(`<div><strong>Local Time:</strong> ${formatTime(node.tz)}</div>`);
    bits.push(`<div><strong>Coords:</strong> ${node.coords}</div>`);
    if (node.hopMeta) bits.push(`<div>${node.hopMeta}</div>`);
    popMeta.innerHTML = bits.join('');
    popFocus.textContent = cam.tzoom > 1.7 ? 'Fit All' : `Focus ${node.label}`;
    popover.hidden = false;
  }

  function spawnPing(visitor) {
    const v = visitor || visitorPts[Math.floor(Math.random() * visitorPts.length)];
    ripples.push({ x: v.x, y: v.y, t: 0, color: v.hub === 'server' ? '#a855f7' : '#ff7a1a' });
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fitAll(true);
  }

  function curveControl(p1, p2) {
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    return {
      mx: (p1.x + p2.x) / 2,
      my: (p1.y + p2.y) / 2 - Math.min(180, dist * 0.24),
      dist
    };
  }

  function curvePoint(p1, p2, u) {
    const { mx, my } = curveControl(p1, p2);
    const inv = 1 - u;
    return {
      x: inv * inv * p1.x + 2 * inv * u * mx + u * u * p2.x,
      y: inv * inv * p1.y + 2 * inv * u * my + u * u * p2.y
    };
  }

  function shortLon(lon1, lon2) {
    let l2 = lon2;
    if (l2 - lon1 > 180) l2 -= 360;
    if (lon1 - l2 > 180) l2 += 360;
    return l2;
  }

  function splitMeridian(lon1, lat1, lon2, lat2) {
    const l2 = shortLon(lon1, lon2);
    if (l2 >= -180 && l2 <= 180) {
      return [[{ lon: lon1, lat: lat1 }, { lon: l2, lat: lat2 }]];
    }
    const edge = l2 < -180 ? -180 : 180;
    const t = (edge - lon1) / (l2 - lon1);
    const latE = lat1 + t * (lat2 - lat1);
    const other = edge === -180 ? 180 : -180;
    const lon2N = l2 < -180 ? l2 + 360 : l2 - 360;
    return [
      [{ lon: lon1, lat: lat1 }, { lon: edge, lat: latE }],
      [{ lon: other, lat: latE }, { lon: lon2N, lat: lat2 }]
    ];
  }

  function drawArc(p1, p2, colorA, colorB, tOffset, isBackbone = false) {
    const { mx, my } = curveControl(p1, p2);

    const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
    grad.addColorStop(0, colorA);
    grad.addColorStop(1, colorB);

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.quadraticCurveTo(mx, my, p2.x, p2.y);
    ctx.strokeStyle = grad;
    ctx.lineWidth = (isBackbone ? 2.4 : 1.15) / cam.zoom;
    ctx.globalAlpha = isBackbone ? 0.85 : 0.36;
    ctx.stroke();

    if (!reduceMotion) {
      const drawPulse = (u, pulseColor, r) => {
        const pt = curvePoint(p1, p2, u);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r / cam.zoom, 0, Math.PI * 2);
        ctx.fillStyle = pulseColor;
        ctx.globalAlpha = 0.95;
        ctx.fill();
      };
      drawPulse(tOffset % 1, '#ffb36b', isBackbone ? 4.2 : 2.5);
      if (isBackbone) {
        drawPulse(1 - (tOffset % 1), '#d294ff', 4.2);
      }
    }
    ctx.globalAlpha = 1;
  }

  function strokeCurve(p1, p2, colorA, colorB, widthPx, alpha) {
    const { mx, my } = curveControl(p1, p2);
    const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
    grad.addColorStop(0, colorA);
    grad.addColorStop(1, colorB);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.quadraticCurveTo(mx, my, p2.x, p2.y);
    ctx.strokeStyle = grad;
    ctx.lineWidth = widthPx / cam.zoom;
    ctx.globalAlpha = alpha;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawRoute(time) {
    if (!routeDraw || routeDraw.length < 2) return;
    const compact = width < 700;
    const segs = [];

    for (let i = 0; i < routeDraw.length - 1; i++) {
      const a = routeDraw[i];
      const b = routeDraw[i + 1];
      const parts = splitMeridian(a.lon, a.lat, b.lon, b.lat);
      const pieces = parts.map((pair) => ({
        p1: project(pair[0].lon, pair[0].lat),
        p2: project(pair[1].lon, pair[1].lat),
        colorA: a.color,
        colorB: b.color
      }));
      const length = pieces.reduce((sum, pc) => sum + curveControl(pc.p1, pc.p2).dist, 0) || 1;
      segs.push({ a, b, pieces, length, ms: a.drawMs });
    }

    for (const seg of segs) {
      for (const pc of seg.pieces) {
        strokeCurve(pc.p1, pc.p2, seg.a.color, seg.b.color, 7.5, 0.18);
        strokeCurve(pc.p1, pc.p2, seg.a.color, seg.b.color, 2.6, 0.95);
      }
      if (!compact && seg.ms && seg.length * cam.zoom > 70) {
        const midPiece = seg.pieces[Math.floor(seg.pieces.length / 2)];
        const mid = curvePoint(midPiece.p1, midPiece.p2, 0.5);
        ctx.save();
        ctx.font = `600 ${11 / cam.zoom}px Inter, ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4 / cam.zoom;
        ctx.strokeStyle = 'rgba(6, 5, 10, 0.75)';
        ctx.fillStyle = '#f3eeff';
        const label = `~${seg.ms} ms`;
        ctx.strokeText(label, mid.x, mid.y);
        ctx.fillText(label, mid.x, mid.y);
        ctx.restore();
      }
    }

    if (!reduceMotion) {
      const total = segs.reduce((s, seg) => s + seg.length, 0) || 1;
      const u = (time * 0.22) % 1;
      let remain = u * total;
      for (const seg of segs) {
        if (remain > seg.length && seg !== segs[segs.length - 1]) {
          remain -= seg.length;
          continue;
        }
        let local = remain;
        for (const pc of seg.pieces) {
          const d = curveControl(pc.p1, pc.p2).dist || 1;
          if (local > d && pc !== seg.pieces[seg.pieces.length - 1]) {
            local -= d;
            continue;
          }
          const pt = curvePoint(pc.p1, pc.p2, Math.max(0, Math.min(1, local / d)));
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 8.5 / cam.zoom, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4.6 / cam.zoom, 0, Math.PI * 2);
          ctx.fillStyle = '#fff6e8';
          ctx.shadowColor = seg.b.color;
          ctx.shadowBlur = 16;
          ctx.fill();
          ctx.shadowBlur = 0;
          break;
        }
        break;
      }
    }

    for (const hop of routeDraw) {
      if (hop.kind === 'you' || hop.kind === 'server' || hop.kind === 'host') continue;
      const p = hopPoint(hop);
      const hot = hoveredHop && hoveredHop.id === hop.id;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (hot ? 6 : 4.2) / cam.zoom, 0, Math.PI * 2);
      ctx.fillStyle = hop.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, (hot ? 11 : 8) / cam.zoom, 0, Math.PI * 2);
      ctx.strokeStyle = hop.color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.4 / cam.zoom;
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (!compact) {
        ctx.save();
        ctx.font = `700 ${10.5 / cam.zoom}px Inter, ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineWidth = 4 / cam.zoom;
        ctx.strokeStyle = 'rgba(6, 5, 10, 0.8)';
        ctx.fillStyle = hop.color;
        ctx.strokeText(hop.short, p.x, p.y - 10 / cam.zoom);
        ctx.fillText(hop.short, p.x, p.y - 10 / cam.zoom);
        ctx.restore();
      }
    }
  }

  function hitHop(wx, wy) {
    if (!routeDraw) return null;
    const hitRadius = 14 / cam.zoom;
    for (const hop of routeDraw) {
      if (hop.kind === 'you' || hop.kind === 'server' || hop.kind === 'host') continue;
      const p = hopPoint(hop);
      if (Math.hypot(p.x - wx, p.y - wy) < hitRadius) return hop;
    }
    return null;
  }

  function popoverAnchor() {
    const pt = nodePoint(activeNode);
    if (!pt) return { x: width / 2, y: height / 2 };
    return worldToScreen(pt.x, pt.y);
  }

  function render(now) {
    if (!isVisible) { rafId = null; return; }
    const time = now * 0.001;

    if (!dragging) {
      cam.x += (cam.tx - cam.x) * 0.1 + cam.vx;
      cam.y += (cam.ty - cam.y) * 0.1 + cam.vy;
      cam.tx += cam.vx;
      cam.ty += cam.vy;
      cam.vx *= 0.9;
      cam.vy *= 0.9;
    }
    cam.zoom += (cam.tzoom - cam.zoom) * 0.12;
    if (zoomReadout) zoomReadout.textContent = Math.round(cam.zoom * 100) + '%';

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    // Graticule grid
    ctx.strokeStyle = 'rgba(155, 77, 255, 0.09)';
    ctx.lineWidth = 1 / cam.zoom;
    for (let lon = -180; lon <= 180; lon += 30) {
      const x = ((lon + 180) / 360) * WORLD_W;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); ctx.stroke();
    }
    for (let lat = -60; lat <= 75; lat += 25) {
      const y = ((85 - lat) / 160) * WORLD_H;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); ctx.stroke();
    }

    // Continents (each item is a polygon: a list of rings of [lon, lat]; rings are not pre-closed)
    ctx.fillStyle = '#161026';
    ctx.strokeStyle = 'rgba(155, 77, 255, 0.55)';
    ctx.lineWidth = 1.25 / cam.zoom;
    for (const poly of LAND) {
      ctx.beginPath();
      for (const ring of poly) {
        ring.forEach(([lon, lat], idx) => {
          const p = project(lon, lat);
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
      }
      ctx.fill('evenodd');
      ctx.stroke();
    }

    // Decorative visitor arcs
    if (showArcs) {
      for (const v of visitorPts) {
        const target = v.hub === 'server' ? serverPt : hostPt;
        const cA = v.hub === 'server' ? '#a855f7' : '#ff6b1a';
        const cB = v.hub === 'server' ? '#ff8533' : '#9b4dff';
        drawArc(v, target, cA, cB, time * 0.22 + v.phase, false);
      }
      if (!routeDraw) drawArc(hostPt, serverPt, '#ff7a1a', '#a855f7', time * 0.28, true);
    }

    drawRoute(time);

    // Radar rings for HOST & SERVER
    [
      { pt: hostPt, color: 'rgba(255, 122, 26,' },
      { pt: serverPt, color: 'rgba(168, 85, 247,' }
    ].forEach(({ pt, color }, idx) => {
      if (!reduceMotion) {
        for (let r = 0; r < 2; r++) {
          const p = (time * 0.55 + r * 0.5 + idx * 0.25) % 1;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, (8 + p * 42) / cam.zoom, 0, Math.PI * 2);
          ctx.strokeStyle = `${color}${(1 - p) * 0.65})`;
          ctx.lineWidth = 1.8 / cam.zoom;
          ctx.stroke();
        }
      }
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4.5 / cam.zoom, 0, Math.PI * 2);
      ctx.fillStyle = idx === 0 ? '#ff8533' : '#c084fc';
      ctx.fill();
    });

    const yp = youPoint();
    if (yp && !reduceMotion) {
      const p = (time * 0.5) % 1;
      ctx.beginPath();
      ctx.arc(yp.x, yp.y, (7 + p * 28) / cam.zoom, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 176, 103, ${(1 - p) * 0.7})`;
      ctx.lineWidth = 1.8 / cam.zoom;
      ctx.stroke();
    }
    if (yp) {
      ctx.beginPath();
      ctx.arc(yp.x, yp.y, 4.2 / cam.zoom, 0, Math.PI * 2);
      ctx.fillStyle = '#ffb067';
      ctx.fill();
    }

    // Visitor dots
    for (const v of visitorPts) {
      const isHover = hoveredVisitor === v;
      ctx.beginPath();
      ctx.arc(v.x, v.y, (isHover ? 6.5 : 3.6) / cam.zoom, 0, Math.PI * 2);
      ctx.fillStyle = isHover ? '#fff' : (v.hub === 'server' ? '#c084fc' : '#ff8c3a');
      ctx.fill();
      ctx.beginPath();
      ctx.arc(v.x, v.y, (isHover ? 11 : 7) / cam.zoom, 0, Math.PI * 2);
      ctx.strokeStyle = v.hub === 'server' ? 'rgba(168,85,247,0.45)' : 'rgba(255,122,26,0.45)';
      ctx.lineWidth = 1.2 / cam.zoom;
      ctx.stroke();
    }

    // Ping ripples
    ripples = ripples.filter(rp => rp.t < 1);
    for (const rp of ripples) {
      if (!reduceMotion) rp.t += 0.018;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, (6 + rp.t * 36) / cam.zoom, 0, Math.PI * 2);
      ctx.strokeStyle = rp.color;
      ctx.globalAlpha = 1 - rp.t;
      ctx.lineWidth = 2 / cam.zoom;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    const hs = worldToScreen(hostPt.x, hostPt.y);
    const ss = worldToScreen(serverPt.x, serverPt.y);
    pinHost.style.left = hs.x + 'px';
    pinHost.style.top = hs.y + 'px';
    pinServer.style.left = ss.x + 'px';
    pinServer.style.top = ss.y + 'px';
    if (pinYou && yp) {
      const ys = worldToScreen(yp.x, yp.y);
      pinYou.style.left = ys.x + 'px';
      pinYou.style.top = ys.y + 'px';
    }

    if (activeNode && !popover.hidden) {
      const pos = popoverAnchor();
      popover.style.left = Math.max(145, Math.min(width - 145, pos.x)) + 'px';
      popover.style.top = Math.max(190, pos.y) + 'px';
    }

    rafId = requestAnimationFrame(render);
  }

  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, .cm-popover')) return;
    dragging = true;
    dragMoved = false;
    stage.classList.add('is-dragging');
    lastX = e.clientX;
    lastY = e.clientY;
    cam.vx = cam.vy = 0;
    stage.setPointerCapture(e.pointerId);
  });

  stage.addEventListener('pointermove', (e) => {
    const rect = stage.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (dragging) {
      const dx = (e.clientX - lastX) / cam.zoom;
      const dy = (e.clientY - lastY) / cam.zoom;
      if (Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) > 3) dragMoved = true;
      cam.x -= dx; cam.tx = cam.x;
      cam.y -= dy; cam.ty = cam.y;
      cam.vx = -dx * 0.25;
      cam.vy = -dy * 0.25;
      lastX = e.clientX;
      lastY = e.clientY;
      tooltip.hidden = true;
      return;
    }

    const w = screenToWorld(sx, sy);
    const hop = hitHop(w.x, w.y);
    hoveredHop = hop;
    const hitRadius = 14 / cam.zoom;
    hoveredVisitor = hop ? null : (visitorPts.find(v => Math.hypot(v.x - w.x, v.y - w.y) < hitRadius) || null);
    if (hop) {
      const sp = worldToScreen(hopPoint(hop).x, hopPoint(hop).y);
      tipCity.textContent = hop.title;
      tipMeta.textContent = 'Approximate / illustrative hop';
      tooltip.style.left = sp.x + 'px';
      tooltip.style.top = sp.y + 'px';
      tooltip.hidden = false;
    } else if (hoveredVisitor) {
      const sp = worldToScreen(hoveredVisitor.x, hoveredVisitor.y);
      tipCity.textContent = `${hoveredVisitor.city}, ${hoveredVisitor.country}`;
      tipMeta.textContent = `Local ${formatTime(hoveredVisitor.tz)} • Routed via ${hoveredVisitor.hub.toUpperCase()}`;
      tooltip.style.left = sp.x + 'px';
      tooltip.style.top = sp.y + 'px';
      tooltip.hidden = false;
    } else {
      tooltip.hidden = true;
    }
  });

  const endDrag = (e) => {
    if (dragging && e && e.type === 'pointerup' && !dragMoved) {
      const rect = stage.getBoundingClientRect();
      const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const hop = hitHop(w.x, w.y);
      if (hop) openPopover(hop.id);
    }
    dragging = false;
    stage.classList.remove('is-dragging');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const before = screenToWorld(sx, sy);
    const factor = e.deltaY < 0 ? 1.16 : 0.86;
    cam.tzoom = Math.max(0.45, Math.min(4.5, cam.tzoom * factor));
    cam.tx = before.x - (sx - width / 2) / cam.tzoom;
    cam.ty = before.y - (sy - height / 2) / cam.tzoom;
  }, { passive: false });

  pinHost.addEventListener('click', () => openPopover('host'));
  pinServer.addEventListener('click', () => openPopover('server'));
  if (pinYou) pinYou.addEventListener('click', () => openPopover('you'));
  popClose.addEventListener('click', () => { popover.hidden = true; activeNode = null; });
  popFocus.addEventListener('click', () => {
    if (cam.tzoom > 1.7) { fitAll(); popFocus.textContent = `Focus ${popoverModel(activeNode)?.label || ''}`; }
    else { focusNode(activeNode); }
  });
  popArcs.addEventListener('click', () => { showArcs = !showArcs; });

  hero.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cm-action]');
    if (!btn) return;
    const act = btn.dataset.cmAction;
    if (act === 'host') focusNode('host');
    else if (act === 'server') focusNode('server');
    else if (act === 'you') { if (you) focusNode('you'); }
    else if (act === 'fit') { popover.hidden = true; activeNode = null; fitAll(); }
    else if (act === 'zoom-in') cam.tzoom = Math.min(4.5, cam.tzoom * 1.25);
    else if (act === 'zoom-out') cam.tzoom = Math.max(0.45, cam.tzoom * 0.8);
    else if (act === 'ping') spawnPing();
    else if (act === 'locate') requestPreciseLocation();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      isVisible = entries[0].isIntersecting;
      if (isVisible && !rafId) rafId = requestAnimationFrame(render);
    }, { threshold: 0.05 }).observe(stage);
  }

  setInterval(() => { if (isVisible && !reduceMotion) spawnPing(); }, 2800);
  window.addEventListener('resize', resize);
  initYouFromTimezone();
  resize();
  rafId = requestAnimationFrame(render);
  fetch(LAND_URL).then((r) => r.json()).then((data) => {
    LAND = data.polygons || [];
  }).catch(() => {});
})();
