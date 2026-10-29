# Scripts Package (`scripts/`)

Automated documentation and diagram PDF generation pipeline for the Bull Dog Solution monorepo.

## Overview

Houses utility scripts for compiling repository documentation and architecture diagrams into high-fidelity PDF documents. Renders Markdown files and embedded Mermaid diagrams into publication-ready A4 and 16:9 presentation PDFs using `marked`, Mermaid CLI (`mmdc`), and headless Chromium, and merges multi-page artifacts via `pdfunite`.

## Interface

| Command / Symbol                                 | Type                 | Description                                                                                                        |
| ------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `node scripts/render-docs-pdf.mjs`               | CLI Command          | Executes full documentation rendering pipeline (user manual, administrative guides, product documentation bundle). |
| `node scripts/render-docs-pdf.mjs --file <path>` | CLI Command          | Compiles a single specified markdown document to PDF.                                                              |
| `node scripts/render-docs-pdf.mjs --bundle`      | CLI Command          | Forces rebuilding of the unified product documentation bundle (`output/pdf/PAQUETE_DOCUMENTACION_PRODUCTO.pdf`).   |
| `pnpm docs:pdf`                                  | Script Alias         | Root workspace alias executing `node scripts/render-docs-pdf.mjs`.                                                 |
| `CHROMIUM_PATH`                                  | Environment Variable | Optional override for headless Chromium binary path (defaults to `/usr/bin/chromium`).                             |

## Invariants

- **Repository Boundary**: Repository root is resolved relative to `import.meta.url` (parent directory); `--file` paths must reside within the repository and end with `.md`.
- **System Tool Dependencies**: Requires host system binaries: Chromium (at `CHROMIUM_PATH` or `/usr/bin/chromium`) and `/usr/bin/pdfunite`.
- **Local Tool Dependencies**: Requires local dev dependencies `@mermaid-js/mermaid-cli` (`mmdc` executable in `node_modules/.bin`), `marked`, and `@fontsource/poppins`.
- **Font Isolation**: Dynamically creates and configures fontconfig configuration pointing to isolated temporary Poppins WOFF2 fonts during generation.
- **Selective Rendering**: In full mode without `--file`, standard documentation markdown files are rendered only if their target PDF already exists in `output/pdf/por-documento`.

## Side Effects

- Spawns child processes for `mmdc`, headless Chromium, and `/usr/bin/pdfunite`.
- Mutates `process.env.FONTCONFIG_FILE` during script execution.
- Generates intermediate render artifacts in `tmp/pdfs/mermaid-render/`.
- Writes output PDFs to `output/pdf/por-documento/`, `output/pdf/integracion-google-drive-guia-administrativa.pdf`, `output/pdf/PAQUETE_DOCUMENTACION_PRODUCTO.pdf`, and root `MANUAL_USUARIO.pdf`.

## Verification

```bash
pnpm docs:pdf
```
