/**
 * The 50 largest US cities, for one-click nationwide coverage. Each entry
 * becomes a SourcingMarket; RentCast and Realie both cover all of them.
 */
export interface Metro {
  city: string;
  state: string;
}

export const US_METROS: readonly Metro[] = [
  { city: 'New York', state: 'NY' },
  { city: 'Los Angeles', state: 'CA' },
  { city: 'Chicago', state: 'IL' },
  { city: 'Houston', state: 'TX' },
  { city: 'Phoenix', state: 'AZ' },
  { city: 'Philadelphia', state: 'PA' },
  { city: 'San Antonio', state: 'TX' },
  { city: 'San Diego', state: 'CA' },
  { city: 'Dallas', state: 'TX' },
  { city: 'Jacksonville', state: 'FL' },
  { city: 'Austin', state: 'TX' },
  { city: 'Fort Worth', state: 'TX' },
  { city: 'San Jose', state: 'CA' },
  { city: 'Columbus', state: 'OH' },
  { city: 'Charlotte', state: 'NC' },
  { city: 'Indianapolis', state: 'IN' },
  { city: 'San Francisco', state: 'CA' },
  { city: 'Seattle', state: 'WA' },
  { city: 'Denver', state: 'CO' },
  { city: 'Oklahoma City', state: 'OK' },
  { city: 'Nashville', state: 'TN' },
  { city: 'Washington', state: 'DC' },
  { city: 'El Paso', state: 'TX' },
  { city: 'Las Vegas', state: 'NV' },
  { city: 'Boston', state: 'MA' },
  { city: 'Detroit', state: 'MI' },
  { city: 'Portland', state: 'OR' },
  { city: 'Louisville', state: 'KY' },
  { city: 'Memphis', state: 'TN' },
  { city: 'Baltimore', state: 'MD' },
  { city: 'Milwaukee', state: 'WI' },
  { city: 'Albuquerque', state: 'NM' },
  { city: 'Tucson', state: 'AZ' },
  { city: 'Fresno', state: 'CA' },
  { city: 'Sacramento', state: 'CA' },
  { city: 'Kansas City', state: 'MO' },
  { city: 'Mesa', state: 'AZ' },
  { city: 'Atlanta', state: 'GA' },
  { city: 'Omaha', state: 'NE' },
  { city: 'Colorado Springs', state: 'CO' },
  { city: 'Raleigh', state: 'NC' },
  { city: 'Miami', state: 'FL' },
  { city: 'Virginia Beach', state: 'VA' },
  { city: 'Oakland', state: 'CA' },
  { city: 'Minneapolis', state: 'MN' },
  { city: 'Tulsa', state: 'OK' },
  { city: 'Tampa', state: 'FL' },
  { city: 'Arlington', state: 'TX' },
  { city: 'New Orleans', state: 'LA' },
  { city: 'Cleveland', state: 'OH' },
];

export function metroLabel(m: Metro): string {
  return `${m.city}, ${m.state}`;
}
