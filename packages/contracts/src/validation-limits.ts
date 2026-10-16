/** Maximum length for free-form order and execution notes, in UTF-16 code units. */
export const MAX_ORDER_NOTES_LENGTH = 5000;
/** Maximum length for new order client-name snapshots, in UTF-16 code units. */
export const MAX_CLIENT_NAME_SNAPSHOT_LENGTH = 200;
/** Maximum length for new service addresses, in UTF-16 code units. */
export const MAX_SERVICE_ADDRESS_LENGTH = 500;
/** Maximum length for new unit labels, in UTF-16 code units. */
export const MAX_ORDER_UNIT_LABEL_LENGTH = 100;
/** Maximum length for new unit make/model values, in UTF-16 code units. */
export const MAX_ORDER_UNIT_MAKE_MODEL_LENGTH = 200;
/** Maximum length for new unit serial numbers, in UTF-16 code units. */
export const MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH = 100;
/** Maximum length for new discrepancy descriptions, in UTF-16 code units. */
export const MAX_DISCREPANCY_DESCRIPTION_LENGTH = 1500;
/** Maximum length for each observed discrepancy snapshot value, in UTF-16 code units. */
export const MAX_OBSERVED_SNAPSHOT_VALUE_LENGTH = 500;
export const MAX_ORDER_UNITS = 100;
export const MAX_ORDER_EQUIPMENT = 500;
export const MAX_IMAGE_PIXELS = 40_000_000;
/** Prisma 7.10.0 PostgreSQL query compilation wraps larger offsets to uint32 (issue #41 B03). */
export const MAX_ORDER_QUERY_OFFSET = 4_294_967_295;

export const MIN_UNIT_YEAR = 1900;

export function getMaxUnitYear(now: Date = new Date()): number {
  const year = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Hermosillo',
    year: 'numeric',
  })
    .formatToParts(now)
    .find((part) => part.type === 'year')?.value;
  if (year === undefined) throw new RangeError('Could not resolve the business year.');
  return Number(year) + 1;
}

export function isValidUnitYear(year: number | null | undefined, now?: Date): boolean {
  return (
    year == null ||
    (Number.isSafeInteger(year) && year >= MIN_UNIT_YEAR && year <= getMaxUnitYear(now))
  );
}
