import type { TechnicianOption } from '@puk/contracts';
import { normalizeString } from '@puk/contracts';

export interface TechnicianFilterCriteria {
  search?: string | null;
  city?: string | null;
  workshop?: string | null;
}

export function filterTechnicians(
  technicians: readonly TechnicianOption[],
  criteria: TechnicianFilterCriteria = {},
): TechnicianOption[] {
  const { search, city, workshop } = criteria;
  const normalizedSearch = search ? normalizeString(search) : '';
  const normalizedCity = city ? normalizeString(city) : '';
  const normalizedWorkshop = workshop ? normalizeString(workshop) : '';

  return technicians.filter((tech) => {
    if (normalizedCity && normalizeString(tech.city) !== normalizedCity) {
      return false;
    }
    if (normalizedWorkshop && normalizeString(tech.workshop) !== normalizedWorkshop) {
      return false;
    }
    if (normalizedSearch) {
      const matchName = normalizeString(tech.name).includes(normalizedSearch);
      const matchWorkshop = normalizeString(tech.workshop).includes(normalizedSearch);
      const matchCity = normalizeString(tech.city).includes(normalizedSearch);
      const matchState = normalizeString(tech.state).includes(normalizedSearch);
      const matchPhone = normalizeString(tech.phone).includes(normalizedSearch);
      const matchKey = normalizeString(tech.externalKey).includes(normalizedSearch);

      if (!matchName && !matchWorkshop && !matchCity && !matchState && !matchPhone && !matchKey) {
        return false;
      }
    }
    return true;
  });
}

export function getUniqueCities(technicians: readonly TechnicianOption[]): string[] {
  const cities = new Set<string>();
  for (const t of technicians) {
    if (t.city && t.city.trim()) {
      cities.add(t.city.trim());
    }
  }
  return Array.from(cities).sort((a, b) => a.localeCompare(b, 'es'));
}

export function getUniqueWorkshops(technicians: readonly TechnicianOption[]): string[] {
  const workshops = new Set<string>();
  for (const t of technicians) {
    if (t.workshop && t.workshop.trim()) {
      workshops.add(t.workshop.trim());
    }
  }
  return Array.from(workshops).sort((a, b) => a.localeCompare(b, 'es'));
}
