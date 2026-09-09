import * as v from 'valibot';

export const ExternalClientSchema = v.object({
  id: v.pipe(v.string(), v.nonEmpty()),
  name: v.pipe(v.string(), v.nonEmpty()),
});

export type ExternalClient = v.InferOutput<typeof ExternalClientSchema>;

export const ExternalEquipmentSchema = v.object({
  externalKey: v.pipe(v.string(), v.nonEmpty()),
  id: v.nullable(v.string()),
  imei: v.nullable(v.string()),
  brand: v.nullable(v.string()),
  model: v.nullable(v.string()),
  line: v.nullable(v.string()),
  iccid: v.nullable(v.string()),
  carrier: v.nullable(v.string()),
  condition: v.nullable(v.string()),
  currentClient: v.nullable(v.string()),
  serviceStatus: v.nullable(v.string()),
  unit: v.nullable(v.string()),
  unitMakeModel: v.nullable(v.string()),
  unitYear: v.nullable(v.string()),
  unitSerialNumber: v.nullable(v.string()),
  serviceType: v.nullable(v.string()),
  rowNumber: v.number(),
  hasValidIdentity: v.boolean(),
  rawValues: v.record(v.string(), v.string()),
});

export type ExternalEquipment = v.InferOutput<typeof ExternalEquipmentSchema>;

export const CatalogSearchQuerySchema = v.object({
  search: v.optional(v.string()),
});

export type CatalogSearchQuery = v.InferOutput<typeof CatalogSearchQuerySchema>;

export const CatalogMetadataSchema = v.object({
  fetchedAt: v.pipe(v.string(), v.isoTimestamp()),
  total: v.number(),
});

export type CatalogMetadata = v.InferOutput<typeof CatalogMetadataSchema>;

/**
 * Normalizes a string by:
 * 1. Removing diacritics / accents (NFD).
 * 2. Trimming leading and trailing whitespace.
 * 3. Converting to lowercase.
 * 4. Collapsing multiple consecutive spaces into a single space.
 */
export function normalizeString(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Compares normalized client names while ignoring supported Mexican legal suffixes.
 */
export function isMatchingClient(
  clientA: string | null | undefined,
  clientB: string | null | undefined,
): boolean {
  const normA = normalizeString(clientA);
  const normB = normalizeString(clientB);

  if (!normA || !normB) {
    return false;
  }
  if (normA === normB) {
    return true;
  }

  return stripLegalSuffix(normA) === stripLegalSuffix(normB);
}

function stripLegalSuffix(value: string): string {
  return value
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+s a de c v$/i, '')
    .replace(/\s+s de r l de c v$/i, '')
    .replace(/\s+s a p i de c v$/i, '')
    .trim();
}
