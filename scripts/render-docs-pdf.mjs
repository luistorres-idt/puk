import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpRoot = path.join(root, 'tmp/pdfs/mermaid-render');
const outRoot = path.join(root, 'output/pdf/por-documento');
const mmdc = path.join(root, 'node_modules/.bin/mmdc');
const chromium = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const puppeteerConfig = path.join(tmpRoot, 'puppeteer.json');
const mermaidConfig = path.join(tmpRoot, 'mermaid-config.json');
const fontPackage = path.join(root, 'node_modules/@fontsource/poppins/files');
const fontConfig = path.join(tmpRoot, 'fonts.conf');
const rendererFontDir = path.join(tmpRoot, 'fontconfig');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', env: process.env });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}):\n${result.stderr || result.stdout}`);
}
function getArgs() {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf('--file');
  return { selected: fileIndex >= 0 ? args[fileIndex + 1] : null, rebuildBundle: args.includes('--bundle') };
}
async function markdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(full);
  }
  return files;
}

await mkdir(tmpRoot, { recursive: true });
const fontCache = path.join(tmpRoot, 'font-cache');
await mkdir(fontCache, { recursive: true });
await mkdir(rendererFontDir, { recursive: true });
for (const weight of [400, 500, 600, 700]) {
  const filename = `poppins-latin-${weight}-normal.woff2`;
  await (await import('node:fs/promises')).copyFile(path.join(fontPackage, filename), path.join(rendererFontDir, filename));
}
await writeFile(fontConfig, `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig><include>/etc/fonts/fonts.conf</include><dir>${rendererFontDir}</dir><cachedir>${fontCache}</cachedir></fontconfig>`);
process.env.FONTCONFIG_FILE = fontConfig;
await writeFile(puppeteerConfig, JSON.stringify({ executablePath: chromium, args: ['--no-sandbox', '--disable-setuid-sandbox'] }));
const poppinsCss = await buildPoppinsCss();
const mermaidCss = path.join(tmpRoot, 'mermaid-poppins.css');
await writeFile(mermaidCss, `svg { font-family: Poppins, sans-serif !important; } * { font-family: Poppins, sans-serif !important; } p,span,foreignObject *,.label,.cluster-label,.nodeLabel,.edgeLabel { font-family: Poppins, sans-serif !important; }`);
await writeFile(mermaidConfig, JSON.stringify({ theme: 'neutral', themeVariables: { fontFamily: 'Poppins, sans-serif', fontSize: '14px' } }));
const { selected, rebuildBundle } = getArgs();
let sources = await markdownFiles(root);
sources = sources.filter((file) => !file.includes(`${path.sep}node_modules${path.sep}`) && !file.includes(`${path.sep}infra${path.sep}cdk.out${path.sep}`));
if (selected) {
  const abs = path.resolve(root, selected);
  if (!abs.startsWith(`${root}${path.sep}`) || !abs.endsWith('.md')) throw new Error('--file must point to a Markdown file inside the repository');
  sources = [abs];
}

for (const source of sources) {
  const relative = path.relative(root, source);
  const output = path.join(outRoot, relative.replace(/\.md$/i, '.pdf'));
  const sourceText = await readFile(source, 'utf8');
  if (relative === 'MANUAL_USUARIO.md') {
    await renderUserManual(sourceText, output, path.join(root, 'MANUAL_USUARIO.pdf'));
    console.log(`${relative} -> ${path.relative(root, output)} and MANUAL_USUARIO.pdf (16:9)`);
    continue;
  }
  if (!selected && !(await exists(output))) continue;
  const docTemp = path.join(tmpRoot, relative.replaceAll(path.sep, '__').replace(/\.md$/i, ''));
  await mkdir(docTemp, { recursive: true });
  const htmlMarkdown = await renderMermaid(sourceText, docTemp, puppeteerConfig, mermaidConfig, mermaidCss);
  const diagramIndex = (sourceText.match(/^```mermaid\s*$/gm) ?? []).length;
  const body = marked.parse(htmlMarkdown, { gfm: true, breaks: false });
  await mkdir(path.dirname(output), { recursive: true });
  const htmlFile = path.join(docTemp, 'document.html');
  const pdfFile = path.join(docTemp, 'document.pdf');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 20mm 18mm 20mm; }
    ${poppinsCss}
    body { font: 10pt/1.48 Poppins, sans-serif; color: #1e293b; }
    h1,h2,h3,h4 { color:#102d4e; line-height:1.2; break-after:avoid; }
    h1 { font-size:24pt; border-bottom:2px solid #0c7194; padding-bottom:7pt; }
    h2 { font-size:17pt; margin-top:22pt; }
    h3 { font-size:13pt; margin-top:17pt; }
    p,ul,ol,table,blockquote,pre { margin:7pt 0 10pt; }
    ul,ol { padding-left:22pt; }
    li { margin:3pt 0; }
    a { color:#006b8f; text-decoration:none; }
    blockquote { border-left:3px solid #0c7194; padding:3pt 12pt; color:#475569; background:#f1f5f9; }
    code { font-family:Poppins, sans-serif; font-size:9pt; background:#f1f5f9; padding:1pt 3pt; }
    pre { white-space:pre-wrap; background:#f1f5f9; padding:9pt; border-radius:4pt; }
    pre code { background:none; padding:0; }
    table { border-collapse:collapse; width:100%; font-size:9pt; }
    th,td { border:1px solid #cbd5e1; padding:5pt; vertical-align:top; }
    th { background:#eaf1f6; text-align:left; }
    img { max-width:100%; }
    .diagram { text-align:center; margin:14pt 0; break-inside:avoid; }
    .diagram img { max-width:100%; max-height:230mm; }
    .diagram svg { display:block; width:100%; height:auto; max-height:230mm; }
    hr { border:0; border-top:1px solid #cbd5e1; }
  </style></head><body>${body}</body></html>`;
  await writeFile(htmlFile, html);
  run(chromium, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-pdf-header-footer', `--print-to-pdf=${pdfFile}`, pathToFileURL(htmlFile).href]);
  await (await import('node:fs/promises')).copyFile(pdfFile, output);
  console.log(`${relative} -> ${path.relative(root, output)} (${diagramIndex} Mermaid diagram(s))`);
}

if (!selected) {
  const guide = path.join(root, 'output/pdf/integracion-google-drive-guia-administrativa.pdf');
  await renderAdminDriveGuide(guide);
  console.log(`Administrative Google Drive guide -> ${path.relative(root, guide)}`);
}

if (rebuildBundle || !selected) {
  const pdfs = [];
  async function collect(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) await collect(full);
      else if (item.name.endsWith('.pdf')) pdfs.push(full);
    }
  }
  await collect(outRoot);
  const guide = path.join(root, 'output/pdf/integracion-google-drive-guia-administrativa.pdf');
  if (await exists(guide)) pdfs.push(guide);
  const bundle = path.join(root, 'output/pdf/PAQUETE_DOCUMENTACION_PRODUCTO.pdf');
  if (pdfs.length) run('/usr/bin/pdfunite', [...pdfs.sort(), bundle]);
  console.log(`Rebuilt bundle from ${pdfs.length} per-document PDFs`);
}

async function renderMermaid(text, dir, puppeteerConfig, mermaidConfig, cssFile) {
  let n = 0;
  const replacements = [];
  const markers = [];
  const replaced = text.replace(/^```mermaid\s*\n([\s\S]*?)^```\s*$/gm, (_match, source) => {
    const id = n++;
    const input = path.join(dir, `diagram-${id}.mmd`);
    const svg = path.join(dir, `diagram-${id}.svg`);
    const marker = `MERMAID_INLINE_SVG_${id}_PLACEHOLDER`;
    markers.push({ marker, svg, id });
    replacements.push((async () => {
      await writeFile(input, source.trim() + '\n');
      run(mmdc, ['-i', input, '-o', svg, '-p', puppeteerConfig, '-c', mermaidConfig, '-C', cssFile, '-q']);
    })());
    return `\n\n${marker}\n\n`;
  });
  await Promise.all(replacements);
  let result = replaced;
  for (const { marker, svg, id } of markers) {
    const svgMarkup = widenSvgLabelBoxes((await readFile(svg, 'utf8')).replaceAll('my-svg', `mermaid-${id}`));
    result = result.replace(marker, `<div class="diagram" role="img" aria-label="Diagram ${id + 1}">${svgMarkup}</div>`);
  }
  return result;
}
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

function widenSvgLabelBoxes(svg) {
  return svg.replace(/<g class="[^"]*label[^"]*"[^>]*transform="translate\((-?[\d.]+),\s*(-?[\d.]+)\)"[^>]*>[\s\S]*?<\/foreignObject>/g, (match, xText) => {
    const widthMatch = match.match(/<foreignObject width="([\d.]+)"/);
    if (!widthMatch) return match;
    const width = Number(widthMatch[1]);
    const expanded = Math.min(140, Math.max(width + 10, Math.ceil(width * 1.3)));
    const centeredX = Number(xText) + width / 2 - expanded / 2;
    return match
      .replace(/transform="translate\(-?[\d.]+,/, `transform="translate(${centeredX},`)
      .replace(/(<foreignObject width=")[\d.]+/, `$1${expanded}`)
      .replace(/max-width: [\d.]+px/g, `max-width: ${expanded}px`)
      .replace(/width: [\d.]+px/g, `width: ${expanded}px`);
  });
}

async function buildPoppinsCss() {
  const weights = [400, 500, 600, 700];
  const rules = [];
  for (const weight of weights) {
    for (const subset of ['latin', 'latin-ext']) {
      const filename = `poppins-${subset}-${weight}-normal.woff2`;
      const bytes = await readFile(path.join(fontPackage, filename));
      const unicodeRange = subset === 'latin'
        ? 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
        : 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
      rules.push(`@font-face{font-family:Poppins;font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2');unicode-range:${unicodeRange};}`);
    }
  }
  return rules.join('\n');
}

async function renderUserManual(sourceText, documentOutput, rootOutput) {
  const frontmatter = sourceText.match(/^---\n([\s\S]*?)\n---\s*\n/);
  let markdown = frontmatter ? sourceText.slice(frontmatter[0].length) : sourceText;
  const styleMatch = frontmatter?.[1].match(/^(?: {2})?style: \|\n((?:[ \t]+.*\n?)*)/m);
  const authoredStyles = styleMatch
    ? styleMatch[1].split('\n').map((line) => line.replace(/^ {2}/, '')).join('\n')
    : '';
  markdown = markdown.replace(/^## (.+)$/gm, (heading, title, offset) => {
    // The title slide includes the subtitle; every following level-two section starts a slide.
    if (offset < markdown.indexOf('## ')) return heading;
    const firstHeading = markdown.indexOf('## ');
    if (offset === firstHeading) return heading;
    // Keep the long administrator account notes with the beginning/continuation of order creation.
    if (title.startsWith('4. Guía Administrador: 1. Crear Orden') || title.startsWith('4. Guía Administrador: 2. Gestión de Unidades')) return heading;
    return `<div class="manual-pagebreak"></div>\n\n${heading}`;
  });
  markdown = markdown.replace(/^### Administrar cuentas administradoras$/m, '<div class="manual-pagebreak"></div>\n\n### Administrar cuentas administradoras');
  const body = marked.parse(markdown, { gfm: true, breaks: false });
  const css = `@page{size:13.333in 7.5in;margin:34px 54px 32px;
      @top-left{content:'Bull Dog Solution — Manual de Usuario y Presentación Operativa';font:10px Poppins,sans-serif;color:#64748b;vertical-align:middle}
      @bottom-left{content:'Manual operativo | Sistema de Órdenes de Servicio';font:9px Poppins,sans-serif;color:#64748b;border-top:1px solid #cbd5e1;vertical-align:top;padding-top:5px}
      @bottom-right{content:counter(page) ' / ' counter(pages);font:9px Poppins,sans-serif;color:#64748b;border-top:1px solid #cbd5e1;vertical-align:top;padding-top:5px}}
    ${poppinsCss}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;color:#1e293b;font-family:Poppins,sans-serif}
    body{font-size:15px;line-height:1.34;padding:5px 0}
    .manual-pagebreak{break-before:page;height:34px}
    h1,h2,h3,h4{break-after:avoid;color:#102d4e;line-height:1.14}
    h1{font-size:30px;border-bottom:2px solid #0c7194;padding-bottom:9px;margin:18px 0 16px}
    h2{font-size:22px;margin:9px 0 15px;color:#006b8f}
    h3{font-size:17px;margin:16px 0 8px}
    p,ul,ol,blockquote,table{margin:7px 0 12px}
    ul,ol{padding-left:24px} li{margin:4px 0}
    table{border-collapse:collapse;width:100%;font-size:13px}
    th,td{border:1px solid #cbd5e1;padding:8px;vertical-align:top}
    th{background:#eaf1f6;text-align:left}
    blockquote{border-left:3px solid #0c7194;padding:8px 14px;color:#475569;background:#f1f5f9}
    code{font-family:Poppins,sans-serif;font-size:.9em;background:#f1f5f9;padding:1px 4px;border-radius:3px}
    a{color:#006b8f;text-decoration:none}
    .badge{display:inline-block;padding:3px 7px;border-radius:5px;font-size:.85em;font-weight:700}
    .badge-admin{background:#dbeafe;color:#1e40af}.badge-tech{background:#dcfce7;color:#166534}.badge-error{background:#fee2e2;color:#991b1b}
    .flow-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}
    .flow-card{background:#f8fafc;border:2px solid #cbd5e1;border-radius:8px;padding:10px 6px;text-align:center;font-size:.88rem;line-height:1.25}
    .flow-card.admin{border-color:#93c5fd;background:#eff6ff;color:#1e40af}.flow-card.tech{border-color:#86efac;background:#f0fdf4;color:#166534}
    .flow-card.final{border-color:#fde047;background:#fefce8;color:#854d0e;font-weight:700}
    .flow-alt{background:#fef2f2;border-left:4px solid #ef4444;padding:8px 12px;font-size:.9rem;margin:12px 0;color:#991b1b}
    .step-num{display:inline-block;width:22px;height:22px;line-height:22px;border-radius:50%;background:rgba(0,0,0,.1);font-size:.75rem;font-weight:700;margin-bottom:4px}
    hr{border:0;border-top:1px solid #cbd5e1}
    ${authoredStyles}`;
  const docTitle = 'Bull Dog Solution - Manual de Usuario';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${docTitle}</title><style>${css}</style></head><body>${body}</body></html>`;
  const work = path.join(tmpRoot, 'manual');
  await mkdir(work, { recursive: true });
  const htmlFile = path.join(work, 'manual.html');
  const pdfFile = path.join(work, 'manual.pdf');
  await writeFile(htmlFile, html);
  printPdf(htmlFile, pdfFile);
  const { copyFile } = await import('node:fs/promises');
  await mkdir(path.dirname(documentOutput), { recursive: true });
  await copyFile(pdfFile, documentOutput);
  await copyFile(pdfFile, rootOutput);
}

function printPdf(htmlFile, pdfFile) {
  run(chromium, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-pdf-header-footer', '--print-to-pdf-no-header', `--print-to-pdf=${pdfFile}`, pathToFileURL(htmlFile).href]);
}

async function renderAdminDriveGuide(output) {
  const work = path.join(tmpRoot, 'admin-drive-guide');
  await mkdir(work, { recursive: true });
  const htmlFile = path.join(work, 'guide.html');
  const pdfFile = path.join(work, 'guide.pdf');
  const pages = [
    `<h1>Archivos de órdenes en Google Drive</h1><p class="subtitle">Qué guarda la aplicación, cómo se consulta y qué falta para operarlo.</p>
      <div class="notice"><strong>Estado actual:</strong> Drive está integrado y seleccionado por la infraestructura como destino de staging. AWS staging está eliminado y no hay un despliegue de producción. La configuración de IaC no significa que exista un entorno activo.</div>
      <h2>Qué cambia en la práctica</h2><div class="three-col">
      <article><h3>Organización</h3><p>Las fotos se agrupan por cliente, unidad/serie y orden. La firma y el PDF se guardan una sola vez por orden.</p></article>
      <article><h3>Acceso privado</h3><p>El personal consulta desde Bull Dog Solution. La API autoriza cada acceso; no se comparten enlaces públicos ni credenciales de Google.</p></article>
      <article><h3>Responsabilidad</h3><p>Drive es un servicio externo. Capacidad, retención, recuperación y permisos deben quedar acordados antes del uso real.</p></article></div>
      <h2>Qué está implementado y qué no</h2><p>La aplicación soporta cargas y lecturas autenticadas de fotografías, firmas y reportes PDF con referencias persistidas. El adaptador de Drive y su integración están en el código; la IaC declara Drive para un futuro staging.</p>
      <div class="notice"><strong>Antes del uso real:</strong> recrear staging, configurar credenciales y hojas de prueba, validar fotos, firmas, PDFs, permisos y recuperación en un entorno controlado. Después, aprobar por separado cualquier despliegue productivo.</div>
      <p class="small">Archivos históricos: los objetos S3 existentes fueron datos de prueba y no se migran automáticamente a Drive. Esta guía no autoriza su eliminación física.</p>`,
    `<h1>Cómo se organizan los documentos</h1><p>La aplicación resuelve los archivos mediante referencias guardadas en la base de datos; no depende de que alguien reconstruya la ruta a mano.</p>
      <div class="tree"><div class="tree-root">Drive compartido de la organización</div><div class="tree-branch"><div class="tree-node">Carpeta del cliente</div><div class="tree-forks">
      <section><div class="tree-node">Unidad del vehículo<br><small>Serie o VIN</small></div><div class="tree-leaf">Carpeta de la orden<br><small>Folio de servicio</small></div><div class="tree-end">Fotografías<br><small>Evidencia de esa unidad</small></div></section>
      <section><div class="tree-node">Órdenes<br><small>Documentos comunes</small></div><div class="tree-leaf">Carpeta de la orden<br><small>Folio de servicio</small></div><div class="tree-end">Firma y versiones PDF<br><small>Una vez por orden</small></div></section>
      </div></div></div>
      <h2>Ejemplo de lectura</h2><p>Para el cliente Transportes del Norte, la evidencia de la unidad VIN 1HGBH41JXMN109186 queda bajo la carpeta de esa unidad y el folio de servicio. La firma y las versiones del reporte de la misma orden se consultan en el área Órdenes, bajo el mismo folio.</p>
      <div class="notice"><strong>Importante:</strong> el nombre visible de una carpeta no autoriza el acceso. El permiso se valida en la aplicación y las rutas autenticadas entregan el archivo.</div>`,
    `<h1>Quién valida cada parte</h1><p>La integración no sustituye las decisiones de seguridad, cumplimiento ni operación del entorno.</p>
      <div class="process"><article><h3>Personal autorizado</h3><p>Envía una foto o solicita ver un documento desde la orden.</p></article><b>›</b><article><h3>Aplicación</h3><p>Comprueba identidad y acceso a la orden; registra referencias y auditoría.</p></article><b>›</b><article><h3>Drive compartido</h3><p>Guarda el archivo privado en la carpeta correspondiente.</p></article></div>
      <p class="small">La consulta recorre el camino de regreso a través de la API; el navegador no recibe credenciales de Drive ni una URL pública.</p>
      <h2>Responsabilidades principales</h2><div class="four-col"><article><h3>Administración de Workspace / TI</h3><p>Aprobar el Drive compartido, compartirlo con la identidad de servicio y definir capacidad y acceso.</p></article><article><h3>Seguridad y operación</h3><p>Resguardar y rotar credenciales; acordar monitoreo, respaldos y recuperación.</p></article><article><h3>Negocio y cumplimiento</h3><p>Aprobar acceso, retención y eliminación definitiva de fotos, firmas y reportes.</p></article><article><h3>Equipo Bull Dog Solution</h3><p>Recrear el ambiente y validar cargas, descargas, reintentos y permisos antes de habilitarlo.</p></article></div>
      <h2>Lista previa al uso real</h2><div class="checks"><span>☐ Entorno desplegado y configuración verificada</span><span>☐ Acceso de Drive y capacidad aprobados</span><span>☐ Fotos, firmas y PDF probados extremo a extremo</span><span>☐ Retención y borrado aprobados</span><span>☐ Recuperación y monitoreo definidos</span><span>☐ Reversión y responsables documentados</span></div>`
  ];
  const pageHeaders = ['BULL DOG SOLUTION · GUÍA EJECUTIVA PARA ADMINISTRACIÓN', 'BULL DOG SOLUTION · ESTRUCTURA DE ARCHIVOS', 'BULL DOG SOLUTION · OPERACIÓN Y RESPONSABILIDADES'];
  const css = `@page{size:A4;margin:0}
    ${poppinsCss} *{box-sizing:border-box} body{margin:0;color:#1e293b;font:12px/1.5 Poppins,sans-serif}
    .page{height:297mm;padding:17mm 18mm 20mm;position:relative;page-break-after:always}
    .page:last-child{page-break-after:auto}.page-header{color:#64748b;font-size:9px;letter-spacing:.04em;margin-bottom:20px}.page-footer{position:absolute;bottom:9mm;left:18mm;right:18mm;border-top:1px solid #cbd5e1;padding-top:6px;color:#64748b;font-size:8px;display:flex;justify-content:space-between}
    h1{font-size:24px;color:#102d4e;line-height:1.2;margin:0 0 8px} h2{font-size:16px;color:#102d4e;margin:20px 0 8px} h3{font-size:12px;color:#102d4e;margin:0 0 6px} p{margin:6px 0 10px}
    .subtitle{font-size:15px;color:#475569;margin-bottom:18px}.notice{padding:12px 14px;border-left:4px solid #0c7194;background:#edf7fa;margin:16px 0;font-size:11px}
    .three-col,.four-col{display:grid;gap:10px}.three-col{grid-template-columns:repeat(3,1fr);margin:8px 0 18px}.four-col{grid-template-columns:repeat(2,1fr);margin:8px 0 15px}
    article{padding:11px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc} article p{margin:0}
    .small{font-size:10px;color:#475569}.tree{text-align:center;margin:16px auto 20px;max-width:500px}.tree-root,.tree-node,.tree-leaf,.tree-end{display:inline-block;padding:9px 15px;border:1px solid #94a3b8;border-radius:5px;background:#f8fafc;min-width:180px}
    .tree-root{background:#edf7fa;font-weight:700;border-color:#0c7194}.tree-branch{border-top:2px solid #cbd5e1;margin:20px 20px 0;padding-top:16px}.tree-forks{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:12px}.tree-forks section{display:flex;flex-direction:column;align-items:center;gap:8px}.tree-forks small{color:#64748b}
    .tree-leaf,.tree-end{min-width:155px}.tree-end{background:#f1f5f9}.process{display:grid;grid-template-columns:1fr 28px 1fr 28px 1fr;align-items:center;gap:7px;margin:18px 0}.process article{text-align:center;min-height:100px;display:flex;flex-direction:column;justify-content:center}.process>b{text-align:center;font-size:25px;color:#0c7194}
    .checks{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;margin-top:8px}.checks span{padding:7px;border-bottom:1px solid #e2e8f0;font-size:10px}
    `;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Bull Dog Solution - Google Drive</title><style>${css}</style></head><body>${pages.map((page, i) => `<section class="page"><div class="page-header">${pageHeaders[i]}</div>${page}<div class="page-footer"><span>Bull Dog Solution · Almacenamiento privado de órdenes</span><span>Estado al 2 de octubre de 2026 · ${i + 1} / 3</span></div></section>`).join('')}</body></html>`;
  await writeFile(htmlFile, html);
  printPdf(htmlFile, pdfFile);
  const { copyFile } = await import('node:fs/promises');
  await mkdir(path.dirname(output), { recursive: true });
  await copyFile(pdfFile, output);
}
