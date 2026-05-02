/**
 * Nigerian states + FCT reference data.
 */

export interface NigerianState {
  code: string;
  name: string;
  capital: string;
  zone:
    | 'North Central'
    | 'North East'
    | 'North West'
    | 'South East'
    | 'South South'
    | 'South West';
}

export const NIGERIAN_STATES: readonly NigerianState[] = [
  { code: 'BEN', name: 'Benue', capital: 'Makurdi', zone: 'North Central' },
  { code: 'KOG', name: 'Kogi', capital: 'Lokoja', zone: 'North Central' },
  { code: 'KWA', name: 'Kwara', capital: 'Ilorin', zone: 'North Central' },
  { code: 'NAS', name: 'Nasarawa', capital: 'Lafia', zone: 'North Central' },
  { code: 'NIG', name: 'Niger', capital: 'Minna', zone: 'North Central' },
  { code: 'PLA', name: 'Plateau', capital: 'Jos', zone: 'North Central' },
  { code: 'FCT', name: 'Federal Capital Territory', capital: 'Abuja', zone: 'North Central' },
  { code: 'ADA', name: 'Adamawa', capital: 'Yola', zone: 'North East' },
  { code: 'BAU', name: 'Bauchi', capital: 'Bauchi', zone: 'North East' },
  { code: 'BOR', name: 'Borno', capital: 'Maiduguri', zone: 'North East' },
  { code: 'GOM', name: 'Gombe', capital: 'Gombe', zone: 'North East' },
  { code: 'TAR', name: 'Taraba', capital: 'Jalingo', zone: 'North East' },
  { code: 'YOB', name: 'Yobe', capital: 'Damaturu', zone: 'North East' },
  { code: 'JIG', name: 'Jigawa', capital: 'Dutse', zone: 'North West' },
  { code: 'KAD', name: 'Kaduna', capital: 'Kaduna', zone: 'North West' },
  { code: 'KAN', name: 'Kano', capital: 'Kano', zone: 'North West' },
  { code: 'KAT', name: 'Katsina', capital: 'Katsina', zone: 'North West' },
  { code: 'KEB', name: 'Kebbi', capital: 'Birnin Kebbi', zone: 'North West' },
  { code: 'SOK', name: 'Sokoto', capital: 'Sokoto', zone: 'North West' },
  { code: 'ZAM', name: 'Zamfara', capital: 'Gusau', zone: 'North West' },
  { code: 'ABI', name: 'Abia', capital: 'Umuahia', zone: 'South East' },
  { code: 'ANA', name: 'Anambra', capital: 'Awka', zone: 'South East' },
  { code: 'EBO', name: 'Ebonyi', capital: 'Abakaliki', zone: 'South East' },
  { code: 'ENU', name: 'Enugu', capital: 'Enugu', zone: 'South East' },
  { code: 'IMO', name: 'Imo', capital: 'Owerri', zone: 'South East' },
  { code: 'AKW', name: 'Akwa Ibom', capital: 'Uyo', zone: 'South South' },
  { code: 'BAY', name: 'Bayelsa', capital: 'Yenagoa', zone: 'South South' },
  { code: 'CRO', name: 'Cross River', capital: 'Calabar', zone: 'South South' },
  { code: 'DEL', name: 'Delta', capital: 'Asaba', zone: 'South South' },
  { code: 'EDO', name: 'Edo', capital: 'Benin City', zone: 'South South' },
  { code: 'RIV', name: 'Rivers', capital: 'Port Harcourt', zone: 'South South' },
  { code: 'EKI', name: 'Ekiti', capital: 'Ado Ekiti', zone: 'South West' },
  { code: 'LAG', name: 'Lagos', capital: 'Ikeja', zone: 'South West' },
  { code: 'OGU', name: 'Ogun', capital: 'Abeokuta', zone: 'South West' },
  { code: 'OND', name: 'Ondo', capital: 'Akure', zone: 'South West' },
  { code: 'OSU', name: 'Osun', capital: 'Osogbo', zone: 'South West' },
  { code: 'OYO', name: 'Oyo', capital: 'Ibadan', zone: 'South West' },
];

const stateByCode = new Map<string, NigerianState>(
  NIGERIAN_STATES.map((s) => [s.code, s]),
);

export function getStateByCode(code: string): NigerianState | undefined {
  return stateByCode.get(code.toUpperCase());
}

export function isValidStateCode(code: string): boolean {
  return stateByCode.has(code.toUpperCase());
}

export function getAllStatesSorted(): readonly NigerianState[] {
  return [...NIGERIAN_STATES].sort((a, b) => a.name.localeCompare(b.name));
}

export function getStatesByZone(): Record<NigerianState['zone'], NigerianState[]> {
  const grouped: Record<string, NigerianState[]> = {};
  for (const state of NIGERIAN_STATES) {
    if (!grouped[state.zone]) grouped[state.zone] = [];
    grouped[state.zone].push(state);
  }
  return grouped as Record<NigerianState['zone'], NigerianState[]>;
}