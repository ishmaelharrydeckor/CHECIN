/**
 * Friendly timezone choices for the sign-up and Settings screens.
 *
 * An organization's timezone decides which day a scan belongs to, who is late, and
 * the times people see (docs/SYSTEM-DESIGN.md, section 6). Admins used to have to
 * type a technical name like "Africa/Lagos" into a text box, and a typo silently
 * became UTC. This turns the browser's list of zones into labelled options such as
 * "Lagos, Nigeria (GMT+1)" that can be searched by city, country, zone name or offset.
 *
 * Pure functions (no React, no Firebase), so they are unit tested directly.
 */

export interface TimezoneOption {
  /** The IANA name stored on the organization, e.g. "Africa/Lagos". */
  id: string;
  /** What the person sees, e.g. "Lagos, Nigeria". */
  label: string;
  /** Offset from UTC right now, in minutes (daylight saving included). */
  offsetMinutes: number;
  /** e.g. "GMT+1" or "GMT+5:30". */
  offsetLabel: string;
  /** Lower-case text the search matches against. */
  search: string;
}

/** Country (or region) names for the zones people are most likely to choose. Others show city and area. */
const COUNTRY_HINTS: Record<string, string> = {
  "Africa/Accra": "Ghana",
  "Africa/Abidjan": "Côte d'Ivoire",
  "Africa/Lagos": "Nigeria",
  "Africa/Nairobi": "Kenya",
  "Africa/Johannesburg": "South Africa",
  "Africa/Cairo": "Egypt",
  "Africa/Addis_Ababa": "Ethiopia",
  "Africa/Dar_es_Salaam": "Tanzania",
  "Africa/Kampala": "Uganda",
  "Africa/Dakar": "Senegal",
  "Africa/Kinshasa": "DR Congo (west)",
  "Africa/Lubumbashi": "DR Congo (east)",
  "Africa/Lusaka": "Zambia",
  "Africa/Harare": "Zimbabwe",
  "Africa/Casablanca": "Morocco",
  "Africa/Algiers": "Algeria",
  "Africa/Tunis": "Tunisia",
  "Africa/Luanda": "Angola",
  "Africa/Maputo": "Mozambique",
  "Africa/Douala": "Cameroon",
  "Africa/Khartoum": "Sudan",
  "Africa/Kigali": "Rwanda",
  "Africa/Windhoek": "Namibia",
  "Africa/Gaborone": "Botswana",
  "Africa/Monrovia": "Liberia",
  "Africa/Freetown": "Sierra Leone",
  "Africa/Bamako": "Mali",
  "Africa/Ouagadougou": "Burkina Faso",
  "Africa/Lome": "Togo",
  "Africa/Porto-Novo": "Benin",
  "Africa/Niamey": "Niger",
  "Africa/Libreville": "Gabon",
  "Africa/Tripoli": "Libya",
  "Africa/Mogadishu": "Somalia",
  "Africa/Blantyre": "Malawi",
  "Africa/Banjul": "Gambia",
  "Europe/London": "United Kingdom",
  "Europe/Dublin": "Ireland",
  "Europe/Paris": "France",
  "Europe/Berlin": "Germany",
  "Europe/Madrid": "Spain",
  "Europe/Rome": "Italy",
  "Europe/Amsterdam": "Netherlands",
  "Europe/Lisbon": "Portugal",
  "Europe/Athens": "Greece",
  "Europe/Istanbul": "Turkey",
  "Europe/Moscow": "Russia",
  "Asia/Dubai": "United Arab Emirates",
  "Asia/Riyadh": "Saudi Arabia",
  "Asia/Kolkata": "India",
  "Asia/Calcutta": "India",
  "America/Buenos_Aires": "Argentina",
  "Asia/Saigon": "Vietnam",
  "Asia/Katmandu": "Nepal",
  "Asia/Rangoon": "Myanmar",
  "Europe/Kiev": "Ukraine",
  "Asia/Karachi": "Pakistan",
  "Asia/Dhaka": "Bangladesh",
  "Asia/Bangkok": "Thailand",
  "Asia/Singapore": "Singapore",
  "Asia/Hong_Kong": "Hong Kong",
  "Asia/Shanghai": "China",
  "Asia/Tokyo": "Japan",
  "Asia/Seoul": "South Korea",
  "Asia/Manila": "Philippines",
  "Asia/Jakarta": "Indonesia",
  "Asia/Kuala_Lumpur": "Malaysia",
  "Asia/Jerusalem": "Israel",
  "Asia/Beirut": "Lebanon",
  "Asia/Amman": "Jordan",
  "Asia/Qatar": "Qatar",
  "Asia/Kuwait": "Kuwait",
  "America/New_York": "United States (Eastern)",
  "America/Chicago": "United States (Central)",
  "America/Denver": "United States (Mountain)",
  "America/Los_Angeles": "United States (Pacific)",
  "America/Toronto": "Canada (Eastern)",
  "America/Vancouver": "Canada (Pacific)",
  "America/Mexico_City": "Mexico",
  "America/Sao_Paulo": "Brazil",
  "America/Bogota": "Colombia",
  "America/Lima": "Peru",
  "America/Argentina/Buenos_Aires": "Argentina",
  "America/Santiago": "Chile",
  "America/Jamaica": "Jamaica",
  "America/Port_of_Spain": "Trinidad and Tobago",
  "Australia/Sydney": "Australia (East)",
  "Australia/Melbourne": "Australia (East)",
  "Australia/Perth": "Australia (West)",
  "Pacific/Auckland": "New Zealand",
};

/** Browsers differ in which spelling of a place they list. Show the modern name people know. */
const CITY_NAMES: Record<string, string> = {
  "Asia/Calcutta": "Kolkata",
  "Asia/Saigon": "Ho Chi Minh City",
  "Asia/Katmandu": "Kathmandu",
  "Asia/Rangoon": "Yangon",
  "Europe/Kiev": "Kyiv",
};

export function isValidZone(name: unknown): name is string {
  if (typeof name !== "string" || !name.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** The city part of an IANA name: "America/Argentina/Buenos_Aires" -> "Buenos Aires". */
export function cityOf(zone: string): string {
  if (CITY_NAMES[zone]) return CITY_NAMES[zone];
  const last = zone.split("/").pop() ?? zone;
  return last.replace(/_/g, " ");
}

/** Minutes ahead of (positive) or behind (negative) UTC for a zone at a moment in time. */
export function offsetMinutes(zone: string, at: Date): number {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    // "GMT", "GMT+01:00", "GMT-05:30"
    const m = part?.match(/^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/);
    if (!m) return 0;
    if (!m[1]) return 0;
    const sign = m[1] === "-" ? -1 : 1;
    return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
  } catch {
    return 0;
  }
}

/** 0 -> "GMT+0", 60 -> "GMT+1", 330 -> "GMT+5:30", -300 -> "GMT-5". */
export function offsetLabel(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** What is shown for a zone: "Lagos, Nigeria" when we know the country, else "Kolkata (Asia)". */
export function labelFor(zone: string): string {
  if (zone === "UTC") return "UTC (no local time)";
  const hint = COUNTRY_HINTS[zone];
  const city = cityOf(zone);
  if (hint) return `${city}, ${hint}`;
  const area = zone.includes("/") ? zone.split("/")[0] : "";
  return area ? `${city} (${area})` : city;
}

/**
 * All choices, ordered from the earliest offset to the latest, then by name.
 * `names` is normally `Intl.supportedValuesOf("timeZone")`; "UTC" is added because that list leaves it out.
 */
export function buildTimezoneOptions(names: string[], at: Date): TimezoneOption[] {
  const all = new Set(names.filter(isValidZone));
  all.add("UTC");
  const options = [...all].map((id) => {
    const minutes = offsetMinutes(id, at);
    const label = labelFor(id);
    const off = offsetLabel(minutes);
    return {
      id,
      label,
      offsetMinutes: minutes,
      offsetLabel: off,
      search: `${label} ${id} ${id.replace(/_/g, " ")} ${off}`.toLowerCase(),
    };
  });
  return options.sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.label.localeCompare(b.label));
}

/**
 * Make sure the currently stored zone is among the options. A browser may list India as "Asia/Calcutta"
 * while an organization was saved as "Asia/Kolkata"; both are valid and must not look "not recognised".
 */
export function withZone(options: TimezoneOption[], zone: string, at: Date): TimezoneOption[] {
  if (!isValidZone(zone) || options.some((o) => o.id === zone)) return options;
  return buildTimezoneOptions([...options.map((o) => o.id), zone], at);
}

/**
 * Options matching what the person typed (city, country, zone name or offset such as "gmt+1").
 * Matches that start a word rank first. An empty search returns the first `limit` options.
 */
export function searchTimezones(options: TimezoneOption[], query: string, limit = 60): TimezoneOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options.slice(0, limit);
  const words = q.split(/\s+/);
  const matches = options.filter((o) => words.every((w) => o.search.includes(w)));
  const score = (o: TimezoneOption) =>
    o.label.toLowerCase().startsWith(q) ? 0 : o.search.split(/[\s/,()]+/).some((t) => t.startsWith(q)) ? 1 : 2;
  return matches.sort((a, b) => score(a) - score(b) || a.offsetMinutes - b.offsetMinutes).slice(0, limit);
}

/** The time there right now, e.g. "14:32" (24-hour). Empty if the zone is not valid. */
export function clockIn(zone: string, at: Date): string {
  if (!isValidZone(zone)) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

/** True if the zone is on UTC time all year (no offset in January or July), like Africa/Accra. */
export function sameAsUtcAllYear(zone: string, at: Date): boolean {
  const year = at.getUTCFullYear();
  return offsetMinutes(zone, new Date(Date.UTC(year, 0, 1))) === 0 && offsetMinutes(zone, new Date(Date.UTC(year, 6, 1))) === 0;
}

/**
 * A gentle warning for the common mistake: the organization is on UTC (often because nothing was
 * chosen) but the person's device is clearly somewhere else. Returns the zone the device suggests,
 * or null when there is nothing to warn about. A device in Accra is not flagged: Accra is the same
 * as UTC all year, so nothing would be wrong.
 */
export function suggestedInstead(current: string, detected: string | null | undefined, at: Date = new Date()): string | null {
  if (current !== "UTC") return null;
  if (!detected || detected === "UTC" || !isValidZone(detected)) return null;
  if (sameAsUtcAllYear(detected, at)) return null;
  return detected;
}
