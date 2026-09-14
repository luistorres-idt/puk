import { describe, expect, it } from 'vitest';
import type { TechnicianOption } from '@puk/contracts';
import { filterTechnicians, getUniqueCities, getUniqueWorkshops } from './technician-filter.js';

const mockTechnicians: TechnicianOption[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Juan Pérez',
    workshop: 'Taller Central',
    city: 'Hermosillo',
    state: 'Sonora',
    phone: '6621234567',
    externalKey: 'TEC-0001',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Carlos López',
    workshop: 'Taller Norte',
    city: 'Nogales',
    state: 'Sonora',
    phone: '6629876543',
    externalKey: 'TEC-0002',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'María García',
    workshop: 'Taller Central',
    city: 'Ciudad Obregón',
    state: 'Sonora',
    phone: '6441112233',
    externalKey: 'TEC-0003',
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    name: 'Roberto Gómez',
    workshop: null,
    city: null,
    state: null,
    phone: null,
    externalKey: 'TEC-0004',
  },
];

describe('technician-filter', () => {
  it('returns all technicians when no criteria are provided', () => {
    const result = filterTechnicians(mockTechnicians);
    expect(result).toHaveLength(4);
  });

  it('filters by city (ignoring accents and case)', () => {
    const result = filterTechnicians(mockTechnicians, { city: 'ciudad obregon' });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('María García');
  });

  it('filters by workshop (ignoring case)', () => {
    const result = filterTechnicians(mockTechnicians, { workshop: 'taller central' });
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.externalKey)).toEqual(['TEC-0001', 'TEC-0003']);
  });

  it('filters by combined city and workshop', () => {
    const result = filterTechnicians(mockTechnicians, {
      city: 'Hermosillo',
      workshop: 'Taller Central',
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.externalKey).toBe('TEC-0001');
  });

  it('filters by search term matching name with diacritics', () => {
    const result = filterTechnicians(mockTechnicians, { search: 'perez' });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Juan Pérez');
  });

  it('filters by search term matching externalKey', () => {
    const result = filterTechnicians(mockTechnicians, { search: 'TEC-0002' });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Carlos López');
  });

  it('filters by search term matching phone', () => {
    const result = filterTechnicians(mockTechnicians, { search: '644111' });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('María García');
  });

  it('extracts unique sorted cities excluding null/empty', () => {
    const cities = getUniqueCities(mockTechnicians);
    expect(cities).toEqual(['Ciudad Obregón', 'Hermosillo', 'Nogales']);
  });

  it('extracts unique sorted workshops excluding null/empty', () => {
    const workshops = getUniqueWorkshops(mockTechnicians);
    expect(workshops).toEqual(['Taller Central', 'Taller Norte']);
  });
});
