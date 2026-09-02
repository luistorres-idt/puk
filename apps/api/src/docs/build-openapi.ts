import { writeFile } from 'node:fs/promises';

import { openApiDocument } from './openapi.js';

const outputPath = new URL('../../openapi.json', import.meta.url);

await writeFile(outputPath, `${JSON.stringify(openApiDocument, null, 2)}\n`, 'utf8');
process.stdout.write(`OpenAPI document written to ${outputPath.pathname}.\n`);
