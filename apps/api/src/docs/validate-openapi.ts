import { openApiDocument } from './openapi.js';

if (openApiDocument.openapi !== '3.1.0' || Object.keys(openApiDocument.paths).length === 0) {
  throw new Error('The OpenAPI document is incomplete.');
}

const serialized = JSON.stringify(openApiDocument);
const references = [...serialized.matchAll(/"\$ref":"#\/([^"#]+)"/g)].map((match) => match[1]);
for (const reference of references) {
  let current: unknown = openApiDocument;
  for (const segment of reference?.split('/') ?? []) {
    current =
      typeof current === 'object' && current !== null
        ? (current as Record<string, unknown>)[segment]
        : undefined;
  }
  if (current === undefined) throw new Error(`OpenAPI reference is broken: #/${reference}`);
}

process.stdout.write('OpenAPI document is valid.\n');
