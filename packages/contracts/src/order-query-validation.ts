/** Parse the supported order-filter formats without normalizing impossible dates. */
export function parseOrderQueryDate(value: string): Date | undefined {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2}))?$/.exec(
      value,
    );
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]!) {
    return undefined;
  }

  if (match[4] !== undefined) {
    if (Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59) {
      return undefined;
    }
    const zone = match[8]!;
    if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59)) {
      return undefined;
    }
  }

  const date = new Date(match[4] === undefined ? `${value}T00:00:00.000Z` : value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}
