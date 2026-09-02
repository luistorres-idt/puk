import { openApiDocument } from './openapi.js';

if (openApiDocument.openapi !== '3.1.0' || Object.keys(openApiDocument.paths).length === 0) {
  throw new Error('The OpenAPI document is incomplete.');
}

process.stdout.write('OpenAPI document is valid.\n');
