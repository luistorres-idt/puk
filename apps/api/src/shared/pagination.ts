import * as v from 'valibot';

const directionSchema = v.picklist(['asc', 'desc']);

export function paginationSchema<const T extends readonly [string, ...string[]]>(
  sortableFields: T,
) {
  return v.object({
    direction: v.optional(directionSchema, 'asc'),
    limit: v.optional(
      v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.minValue(1), v.maxValue(100)),
      '20',
    ),
    page: v.optional(v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.minValue(1)), '1'),
    sort: v.optional(v.picklist(sortableFields), sortableFields[0]),
  });
}

export function pageMeta(page: number, limit: number, total: number) {
  return { limit, page, pages: Math.ceil(total / limit), total };
}
