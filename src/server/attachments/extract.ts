import { strFromU8, unzipSync } from 'fflate';
import { extractText as extractPdfText } from 'unpdf';

import type { AttachmentKind } from '../../shared/types';
import { HttpError } from '../http';

export const MAX_EXTRACTED_CHARS = 60_000;
const MAX_XLSX_ROWS = 500;
const MAX_XLSX_COLS = 200;

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
};

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'jsonl',
  'ndjson',
  'xml',
  'svg',
  'html',
  'htm',
  'xhtml',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'env',
  'log',
  'rtf',
  'tex',
  'rst',
  'org',
  'adoc',
  // Source code & scripts
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'mts',
  'cts',
  'tsx',
  'py',
  'pyw',
  'pyi',
  'java',
  'c',
  'h',
  'cpp',
  'cc',
  'cxx',
  'hpp',
  'hh',
  'hxx',
  'cs',
  'go',
  'rb',
  'erb',
  'php',
  'swift',
  'kt',
  'kts',
  'rs',
  'sql',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'bat',
  'cmd',
  'r',
  'm',
  'mm',
  'scala',
  'clj',
  'cljs',
  'ex',
  'exs',
  'erl',
  'hrl',
  'hs',
  'lhs',
  'lua',
  'pl',
  'pm',
  'dart',
  'vue',
  'svelte',
  'astro',
  'css',
  'scss',
  'sass',
  'less',
  'graphql',
  'gql',
  'proto',
  'tf',
  'hcl',
  'nix',
  'dockerfile',
  'makefile',
  'cmake',
  'gradle',
  'properties',
  'gitignore',
  'gitattributes',
  'editorconfig',
]);

const LEGACY_OFFICE_MESSAGES: Record<string, string> = {
  doc: "Old .doc files can't be read — save it as .docx and try again.",
  ppt: "Old .ppt files can't be read — save it as .pptx and try again.",
  xls: "Old .xls files can't be read — save it as .xlsx and try again.",
};

const LEGACY_OFFICE_MIMES: Record<string, string> = {
  'application/msword': LEGACY_OFFICE_MESSAGES.doc,
  'application/vnd.ms-powerpoint': LEGACY_OFFICE_MESSAGES.ppt,
  'application/vnd.ms-excel': LEGACY_OFFICE_MESSAGES.xls,
};

const UNSUPPORTED_BINARY_EXTENSIONS = new Set([
  'zip',
  'gz',
  'gzip',
  'bz2',
  'xz',
  'tar',
  'tgz',
  '7z',
  'rar',
  'exe',
  'dll',
  'so',
  'dylib',
  'bin',
  'dmg',
  'iso',
  'apk',
  'ipa',
  'wasm',
  'class',
  'jar',
  'war',
  'o',
  'a',
  'mp3',
  'wav',
  'm4a',
  'aac',
  'ogg',
  'flac',
  'wma',
  'mp4',
  'mov',
  'avi',
  'mkv',
  'webm',
  'wmv',
  'flv',
  'm4v',
  'ttf',
  'otf',
  'woff',
  'woff2',
  'eot',
  'sqlite',
  'db',
  'psd',
  'ai',
  'sketch',
  'fig',
]);

const TEXT_MIMES = new Set([
  'application/json',
  'application/ld+json',
  'application/xml',
  'application/xhtml+xml',
  'application/javascript',
  'application/x-javascript',
  'application/typescript',
  'application/yaml',
  'application/x-yaml',
  'application/toml',
  'application/sql',
  'application/rtf',
  'application/x-sh',
  'application/x-httpd-php',
]);

const UNSUPPORTED_MSG = 'This file type isn\'t supported. Try PDF, Word, PowerPoint, Excel, text or an image.';

export function getExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const idx = base.lastIndexOf('.');
  if (idx <= 0 || idx === base.length - 1) return '';
  return base.slice(idx + 1).toLowerCase();
}

export function normalizeMime(mime?: string): string {
  return (mime ?? '').split(';')[0].trim().toLowerCase();
}

export function resolveImageMime(name: string, mime?: string): string {
  const clean = normalizeMime(mime);
  if (clean === 'image/jpg') return 'image/jpeg';
  if (clean && Object.values(IMAGE_MIME_BY_EXT).includes(clean)) return clean;
  const ext = getExtension(name);
  return IMAGE_MIME_BY_EXT[ext] ?? 'image/jpeg';
}

/**
 * Classifies an attachment by extension first, then MIME type.
 * Returns `null` when unknown (caller may still fall back to UTF-8 detection).
 */
export function detectKind(name: string, mime?: string): AttachmentKind | null {
  const ext = getExtension(name);
  const cleanMime = normalizeMime(mime);

  // Extension first
  if (ext) {
    if (ext in IMAGE_MIME_BY_EXT) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'docx' || ext === 'odt') return 'document';
    if (ext === 'pptx' || ext === 'odp') return 'presentation';
    if (ext === 'xlsx' || ext === 'ods') return 'spreadsheet';
    if (TEXT_EXTENSIONS.has(ext)) return 'text';
    if (ext in LEGACY_OFFICE_MESSAGES || UNSUPPORTED_BINARY_EXTENSIONS.has(ext)) return null;
  }

  // Then MIME
  if (cleanMime) {
    if (cleanMime === 'image/jpg' || Object.values(IMAGE_MIME_BY_EXT).includes(cleanMime)) return 'image';
    if (cleanMime === 'application/pdf') return 'pdf';
    if (
      cleanMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      cleanMime === 'application/vnd.oasis.opendocument.text'
    ) {
      return 'document';
    }
    if (
      cleanMime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      cleanMime === 'application/vnd.oasis.opendocument.presentation'
    ) {
      return 'presentation';
    }
    if (
      cleanMime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      cleanMime === 'application/vnd.oasis.opendocument.spreadsheet'
    ) {
      return 'spreadsheet';
    }
    if (cleanMime.startsWith('text/') || TEXT_MIMES.has(cleanMime)) return 'text';
  }

  return null;
}

function assertSupportedType(name: string, mime: string): void {
  const ext = getExtension(name);
  if (ext in LEGACY_OFFICE_MESSAGES) {
    throw new HttpError(415, LEGACY_OFFICE_MESSAGES[ext]);
  }
  if (mime in LEGACY_OFFICE_MIMES) {
    throw new HttpError(415, LEGACY_OFFICE_MIMES[mime]);
  }
  if (UNSUPPORTED_BINARY_EXTENSIONS.has(ext)) {
    throw new HttpError(415, UNSUPPORTED_MSG);
  }
  if (
    mime.startsWith('audio/') ||
    mime.startsWith('video/') ||
    mime.startsWith('font/') ||
    (mime.startsWith('image/') && !Object.values(IMAGE_MIME_BY_EXT).includes(mime) && mime !== 'image/jpg' && mime !== 'image/svg+xml') ||
    mime === 'application/zip' ||
    mime === 'application/gzip' ||
    mime === 'application/x-tar' ||
    mime === 'application/x-7z-compressed' ||
    mime === 'application/vnd.rar' ||
    mime === 'application/x-msdownload' ||
    mime === 'application/x-executable'
  ) {
    throw new HttpError(415, UNSUPPORTED_MSG);
  }
}

export function normalizeExtractedText(raw: string): { content: string; truncated: boolean } {
  const normalized = raw
    .replace(/\0/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (normalized.length > MAX_EXTRACTED_CHARS) {
    return { content: normalized.slice(0, MAX_EXTRACTED_CHARS), truncated: true };
  }
  return { content: normalized, truncated: false };
}

function decodeUtf8Strict(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // Reject likely binary payloads masquerading as ASCII with dense control bytes.
    let controlCount = 0;
    const sampleLen = Math.min(text.length, 4096);
    for (let i = 0; i < sampleLen; i++) {
      const code = text.charCodeAt(i);
      if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d && code !== 0x0c) {
        controlCount++;
      }
    }
    if (sampleLen > 0 && controlCount / sampleLen > 0.02) return null;
    return text.replace(/^\uFEFF/, '');
  } catch {
    return null;
  }
}

/** Strips RTF control words, ignorable groups, and formatting braces. */
export function stripRtf(rtf: string): string {
  const skipDestinations = new Set([
    'fonttbl',
    'colortbl',
    'stylesheet',
    'info',
    'pict',
    'object',
    'header',
    'footer',
    'headerl',
    'headerr',
    'headerf',
    'footerl',
    'footerr',
    'footerf',
    'listtable',
    'listoverridetable',
    'revtbl',
    'rsidtbl',
    'generator',
    'xmlnstbl',
    'fldinst',
  ]);

  const stack: { uc: number; skip: boolean }[] = [];
  let uc = 1;
  let skip = false;
  let out = '';
  let i = 0;

  while (i < rtf.length) {
    const ch = rtf[i];
    if (ch === '{') {
      stack.push({ uc, skip });
      // Check for \* ignorable destination or known non-body destination
      let j = i + 1;
      while (j < rtf.length && (rtf[j] === ' ' || rtf[j] === '\r' || rtf[j] === '\n')) j++;
      if (rtf[j] === '\\') {
        if (rtf[j + 1] === '*') {
          skip = true;
        } else {
          const m = rtf.slice(j + 1, j + 32).match(/^([a-zA-Z]+)/);
          if (m && skipDestinations.has(m[1])) skip = true;
        }
      }
      i++;
      continue;
    }

    if (ch === '}') {
      const prev = stack.pop();
      if (prev) {
        uc = prev.uc;
        skip = prev.skip;
      }
      i++;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      i++;
      continue;
    }

    if (ch === '\\') {
      i++;
      if (i >= rtf.length) break;
      const next = rtf[i];
      if (next === '\\' || next === '{' || next === '}') {
        if (!skip) out += next;
        i++;
        continue;
      }
      if (next === '~') {
        if (!skip) out += ' ';
        i++;
        continue;
      }
      if (next === '_') {
        if (!skip) out += '-';
        i++;
        continue;
      }
      if (next === '-' || next === '*') {
        i++;
        continue;
      }
      if (next === '\r' || next === '\n') {
        if (!skip) out += '\n';
        i++;
        continue;
      }
      if (next === "'") {
        const hex = rtf.slice(i + 1, i + 3);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          if (!skip) out += String.fromCharCode(parseInt(hex, 16));
          i += 3;
        } else {
          i++;
        }
        continue;
      }

      const ctrlMatch = rtf.slice(i).match(/^([a-zA-Z]+)(-?\d+)? ?/);
      if (ctrlMatch) {
        const word = ctrlMatch[1];
        const param = ctrlMatch[2] !== undefined ? Number(ctrlMatch[2]) : undefined;
        i += ctrlMatch[0].length;

        if (word === 'uc' && param !== undefined) {
          uc = Math.max(0, param);
        } else if (word === 'u' && param !== undefined) {
          const code = param < 0 ? param + 65536 : param;
          if (!skip && code >= 0 && code <= 0x10ffff) {
            out += String.fromCodePoint(code);
          }
          // Skip `uc` fallback characters (each \'hh counts as 1 fallback char)
          let toSkip = uc;
          while (toSkip > 0 && i < rtf.length) {
            if (rtf[i] === '\\' && rtf[i + 1] === "'" && /^[0-9a-fA-F]{2}$/.test(rtf.slice(i + 2, i + 4))) {
              i += 4;
            } else if (rtf[i] === '{' || rtf[i] === '}') {
              break;
            } else {
              i++;
            }
            toSkip--;
          }
        } else if (!skip) {
          if (word === 'par' || word === 'line') out += '\n';
          else if (word === 'tab') out += '\t';
          else if (word === 'emdash') out += '—';
          else if (word === 'endash') out += '–';
          else if (word === 'lquote') out += '‘';
          else if (word === 'rquote') out += '’';
          else if (word === 'ldblquote') out += '“';
          else if (word === 'rdblquote') out += '”';
          else if (word === 'bullet') out += '•';
        }
        continue;
      }

      i++;
      continue;
    }

    if (!skip) out += ch;
    i++;
  }

  return out;
}

/* XML & ZIP helpers -------------------------------------------------------- */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

export function decodeXmlEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (full, entity: string) => {
    if (entity.startsWith('#x')) {
      const cp = parseInt(entity.slice(2), 16);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : full;
    }
    if (entity.startsWith('#')) {
      const cp = parseInt(entity.slice(1), 10);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : full;
    }
    return NAMED_ENTITIES[entity] ?? full;
  });
}

function prepareXml(xml: string): string {
  return xml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, body: string) =>
      body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    );
}

interface XmlTagEvent {
  closing: boolean;
  selfClosing: boolean;
  name: string;
  attrs: string;
}

function scanXml(xml: string, onTag: (tag: XmlTagEvent) => void, onText: (text: string) => void): void {
  const clean = prepareXml(xml);
  const re = /<(\/?)([a-zA-Z0-9_:-]+)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(clean)) !== null) {
    if (match.index > lastIndex) {
      onText(clean.slice(lastIndex, match.index));
    }
    const closing = match[1] === '/';
    const name = match[2];
    const rawAttrs = match[3] ?? '';
    const selfClosing = !closing && /\/\s*$/.test(rawAttrs);
    const attrs = selfClosing ? rawAttrs.replace(/\/\s*$/, '') : rawAttrs;
    onTag({ closing, selfClosing, name, attrs });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < clean.length) {
    onText(clean.slice(lastIndex));
  }
}

function parseXmlAttrs(attrs: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrs)) !== null) {
    result[m[1]] = decodeXmlEntities(m[2] ?? m[3] ?? '');
  }
  return result;
}

function unzipArchive(bytes: Uint8Array): Record<string, Uint8Array> {
  try {
    return unzipSync(bytes);
  } catch {
    throw new HttpError(422, "Couldn't read that file. It may be corrupted or password-protected.");
  }
}

function readZipEntry(files: Record<string, Uint8Array>, targetPath: string): string | null {
  const normalized = targetPath.replace(/^\/+/, '');
  const exact = files[normalized];
  if (exact) return strFromU8(exact);
  const lower = normalized.toLowerCase();
  for (const [k, v] of Object.entries(files)) {
    if (k.toLowerCase() === lower) return strFromU8(v);
  }
  return null;
}

function resolveZipPath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = [...(baseDir ? baseDir.split('/') : []), ...target.split('/')];
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

/* Format extractors -------------------------------------------------------- */

export function extractDocx(bytes: Uint8Array): string {
  const files = unzipArchive(bytes);
  const docXml = readZipEntry(files, 'word/document.xml');
  if (!docXml) throw new HttpError(422, "Couldn't find readable content in that Word document.");

  const lines: string[] = [];
  const rowStack: string[][] = [];
  const cellStack: string[][] = [];
  let inPara = false;
  let inText = false;
  let paraText = '';

  scanXml(
    docXml,
    (tag) => {
      if (tag.name === 'w:tr') {
        if (!tag.closing && !tag.selfClosing) {
          rowStack.push([]);
        } else if (tag.closing) {
          const row = rowStack.pop();
          if (row && row.some((c) => c.length > 0)) {
            const rowLine = row.join(' | ');
            if (cellStack.length > 0) cellStack[cellStack.length - 1].push(rowLine);
            else lines.push(rowLine);
          }
        }
        return;
      }

      if (tag.name === 'w:tc') {
        if (!tag.closing && !tag.selfClosing) {
          cellStack.push([]);
        } else if (tag.closing) {
          const cell = cellStack.pop();
          if (cell && rowStack.length > 0) {
            rowStack[rowStack.length - 1].push(cell.join(' ').replace(/\s+/g, ' ').trim());
          }
        }
        return;
      }

      if (tag.name === 'w:p') {
        if (!tag.closing && !tag.selfClosing) {
          inPara = true;
          paraText = '';
        } else if (tag.closing && inPara) {
          const t = paraText.trim();
          if (cellStack.length > 0) {
            if (t) cellStack[cellStack.length - 1].push(t);
          } else if (t) {
            lines.push(t);
          }
          inPara = false;
          paraText = '';
        }
        return;
      }

      if (tag.name === 'w:t') {
        if (!tag.closing && !tag.selfClosing) inText = true;
        else if (tag.closing) inText = false;
        return;
      }

      if (inPara && !tag.closing) {
        if (tag.name === 'w:tab') paraText += '\t';
        else if (tag.name === 'w:br' || tag.name === 'w:cr') paraText += '\n';
      }
    },
    (text) => {
      if (inPara && inText) {
        paraText += decodeXmlEntities(text);
      }
    },
  );

  return lines.join('\n');
}

function extractDrawingMlParagraphs(xml: string): string[] {
  const paras: string[] = [];
  let inPara = false;
  let inText = false;
  let paraText = '';

  scanXml(
    xml,
    (tag) => {
      if (tag.name === 'a:p') {
        if (!tag.closing && !tag.selfClosing) {
          inPara = true;
          paraText = '';
        } else if (tag.closing && inPara) {
          const t = paraText.trim();
          if (t) paras.push(t);
          inPara = false;
          paraText = '';
        }
        return;
      }
      if (tag.name === 'a:t') {
        if (!tag.closing && !tag.selfClosing) inText = true;
        else if (tag.closing) inText = false;
        return;
      }
      if (inPara && !tag.closing) {
        if (tag.name === 'a:br') paraText += '\n';
        else if (tag.name === 'a:tab') paraText += '\t';
      }
    },
    (text) => {
      if (inPara && inText) paraText += decodeXmlEntities(text);
    },
  );

  return paras;
}

function findPptxNotesPath(files: Record<string, Uint8Array>, slideNum: number): string | null {
  const relsXml = readZipEntry(files, `ppt/slides/_rels/slide${slideNum}.xml.rels`);
  if (relsXml) {
    let notesTarget: string | null = null;
    scanXml(
      relsXml,
      (tag) => {
        if (tag.name === 'Relationship' && !tag.closing) {
          const attrs = parseXmlAttrs(tag.attrs);
          if (attrs.Type?.toLowerCase().includes('notesslide') && attrs.Target) {
            notesTarget = resolveZipPath('ppt/slides', attrs.Target);
          }
        }
      },
      () => {},
    );
    if (notesTarget) return notesTarget;
  }
  const fallback = `ppt/notesSlides/notesSlide${slideNum}.xml`;
  return readZipEntry(files, fallback) !== null ? fallback : null;
}

export function extractPptx(bytes: Uint8Array): string {
  const files = unzipArchive(bytes);
  const slides = Object.keys(files)
    .map((path) => {
      const m = path.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
      return m ? { num: Number(m[1]), path } : null;
    })
    .filter((s): s is { num: number; path: string } => s !== null)
    .sort((a, b) => a.num - b.num);

  if (!slides.length) {
    throw new HttpError(422, "Couldn't find any slides in that PowerPoint file.");
  }

  const sections: string[] = [];
  for (const slide of slides) {
    const slideXml = readZipEntry(files, slide.path);
    const bodyParas = slideXml ? extractDrawingMlParagraphs(slideXml) : [];
    const notesPath = findPptxNotesPath(files, slide.num);
    const notesXml = notesPath ? readZipEntry(files, notesPath) : null;
    const noteParas = notesXml ? extractDrawingMlParagraphs(notesXml) : [];

    if (!bodyParas.length && !noteParas.length) continue;

    const parts = [`Slide ${slide.num}:`];
    if (bodyParas.length) parts.push(bodyParas.join('\n'));
    if (noteParas.length) parts.push(`Notes:\n${noteParas.join('\n')}`);
    sections.push(parts.join('\n'));
  }

  return sections.join('\n\n');
}

function colRefToIndex(ref: string | undefined): number | null {
  if (!ref) return null;
  const m = ref.match(/^([A-Za-z]+)\d+$/);
  if (!m) return null;
  const letters = m[1].toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return col - 1;
}

function formatCsvRow(cells: string[]): string {
  let end = cells.length;
  while (end > 0 && cells[end - 1] === '') end--;
  if (end === 0) return '';
  return cells
    .slice(0, end)
    .map((cell) => {
      const clean = cell.replace(/\r\n?/g, '\n');
      return clean.includes(',') || clean.includes('"') || clean.includes('\n')
        ? `"${clean.replace(/"/g, '""')}"`
        : clean;
    })
    .join(',');
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  let inSi = false;
  let inText = false;
  let current = '';

  scanXml(
    xml,
    (tag) => {
      if (tag.name === 'si') {
        if (!tag.closing && !tag.selfClosing) {
          inSi = true;
          current = '';
        } else if (tag.closing && inSi) {
          strings.push(current);
          inSi = false;
          current = '';
        } else if (tag.selfClosing) {
          strings.push('');
        }
        return;
      }
      if (inSi && tag.name === 't') {
        if (!tag.closing && !tag.selfClosing) inText = true;
        else if (tag.closing) inText = false;
      }
    },
    (text) => {
      if (inSi && inText) current += decodeXmlEntities(text);
    },
  );

  return strings;
}

export function extractXlsx(bytes: Uint8Array): string {
  const files = unzipArchive(bytes);
  const sharedXml = readZipEntry(files, 'xl/sharedStrings.xml');
  const sharedStrings = sharedXml ? parseSharedStrings(sharedXml) : [];

  const relMap = new Map<string, string>();
  const relsXml = readZipEntry(files, 'xl/_rels/workbook.xml.rels');
  if (relsXml) {
    scanXml(
      relsXml,
      (tag) => {
        if (tag.name === 'Relationship' && !tag.closing) {
          const attrs = parseXmlAttrs(tag.attrs);
          if (attrs.Id && attrs.Target) {
            relMap.set(attrs.Id, resolveZipPath('xl', attrs.Target));
          }
        }
      },
      () => {},
    );
  }

  let sheets: { name: string; path: string }[] = [];
  const workbookXml = readZipEntry(files, 'xl/workbook.xml');
  if (workbookXml) {
    scanXml(
      workbookXml,
      (tag) => {
        if (tag.name === 'sheet' && !tag.closing) {
          const attrs = parseXmlAttrs(tag.attrs);
          const relId = attrs['r:id'] ?? attrs.id;
          const sheetPath = relId ? relMap.get(relId) : undefined;
          if (sheetPath) {
            sheets.push({ name: attrs.name || `Sheet ${sheets.length + 1}`, path: sheetPath });
          }
        }
      },
      () => {},
    );
  }

  if (!sheets.length) {
    sheets = Object.keys(files)
      .map((path) => {
        const m = path.match(/^xl\/worksheets\/sheet(\d+)\.xml$/i);
        return m ? { num: Number(m[1]), name: `Sheet ${m[1]}`, path } : null;
      })
      .filter((s): s is { num: number; name: string; path: string } => s !== null)
      .sort((a, b) => a.num - b.num);
  }

  if (!sheets.length) {
    throw new HttpError(422, "Couldn't find any sheets in that Excel workbook.");
  }

  const out: string[] = [];
  for (const sheet of sheets) {
    const sheetXml = readZipEntry(files, sheet.path);
    if (!sheetXml) continue;

    const rowLines: string[] = [];
    let truncatedRows = false;
    let inRow = false;
    let rowCells: string[] = [];
    let inCell = false;
    let cellType = '';
    let cellCol = 0;
    let inVal = false;
    let valText = '';
    let inInlineStr = false;
    let inInlineText = false;
    let inlineText = '';

    scanXml(
      sheetXml,
      (tag) => {
        if (tag.name === 'row') {
          if (!tag.closing && !tag.selfClosing) {
            if (rowLines.length >= MAX_XLSX_ROWS) {
              truncatedRows = true;
              inRow = false;
              return;
            }
            inRow = true;
            rowCells = [];
          } else if (tag.closing && inRow) {
            const line = formatCsvRow(rowCells);
            if (line) rowLines.push(line);
            inRow = false;
          }
          return;
        }

        if (!inRow) return;

        if (tag.name === 'c') {
          if (!tag.closing && !tag.selfClosing) {
            const attrs = parseXmlAttrs(tag.attrs);
            inCell = true;
            cellType = attrs.t ?? '';
            cellCol = colRefToIndex(attrs.r) ?? rowCells.length;
            inVal = false;
            valText = '';
            inInlineStr = false;
            inInlineText = false;
            inlineText = '';
          } else if (tag.closing && inCell) {
            let value = '';
            if (cellType === 's') {
              const idx = Number(valText.trim());
              value = Number.isInteger(idx) && idx >= 0 && idx < sharedStrings.length ? sharedStrings[idx] : '';
            } else if (cellType === 'inlineStr') {
              value = inlineText;
            } else if (cellType === 'b') {
              const v = valText.trim().toLowerCase();
              value = v === '1' || v === 'true' ? 'TRUE' : v === '0' || v === 'false' ? 'FALSE' : '';
            } else if (cellType === 'str' || cellType === 'e') {
              value = valText;
            } else {
              value = valText.trim();
            }

            if (cellCol >= 0 && cellCol < MAX_XLSX_COLS) {
              while (rowCells.length <= cellCol) rowCells.push('');
              rowCells[cellCol] = value;
            }
            inCell = false;
          }
          return;
        }

        if (!inCell) return;

        if (tag.name === 'v') {
          if (!tag.closing && !tag.selfClosing) {
            inVal = true;
            valText = '';
          } else if (tag.closing) {
            inVal = false;
          }
        } else if (tag.name === 'is') {
          if (!tag.closing && !tag.selfClosing) {
            inInlineStr = true;
            inlineText = '';
          } else if (tag.closing) {
            inInlineStr = false;
          }
        } else if (inInlineStr && tag.name === 't') {
          if (!tag.closing && !tag.selfClosing) inInlineText = true;
          else if (tag.closing) inInlineText = false;
        }
      },
      (text) => {
        if (!inCell) return;
        if (inVal) valText += decodeXmlEntities(text);
        else if (inInlineStr && inInlineText) inlineText += decodeXmlEntities(text);
      },
    );

    if (rowLines.length) {
      const sheetText = [`Sheet: ${sheet.name}`, ...rowLines];
      if (truncatedRows) sheetText.push(`[…truncated at ${MAX_XLSX_ROWS} rows]`);
      out.push(sheetText.join('\n'));
    }
  }

  return out.join('\n\n');
}

export function extractOpenDocument(bytes: Uint8Array, kind: 'document' | 'presentation' | 'spreadsheet'): string {
  const files = unzipArchive(bytes);
  const contentXml = readZipEntry(files, 'content.xml');
  if (!contentXml) {
    throw new HttpError(422, "Couldn't find readable content in that OpenDocument file.");
  }

  if (kind === 'spreadsheet') {
    const out: string[] = [];
    let inSheet = false;
    let sheetName = '';
    let rowLines: string[] = [];
    let truncatedRows = false;
    let inRow = false;
    let rowCells: string[] = [];
    let inCell = false;
    let cellRepeat = 1;
    let cellParas: string[] = [];
    let inPara = false;
    let paraText = '';

    scanXml(
      contentXml,
      (tag) => {
        if (tag.name === 'table:table') {
          if (!tag.closing && !tag.selfClosing) {
            const attrs = parseXmlAttrs(tag.attrs);
            inSheet = true;
            sheetName = attrs['table:name'] || `Sheet ${out.length + 1}`;
            rowLines = [];
            truncatedRows = false;
          } else if (tag.closing && inSheet) {
            if (rowLines.length) {
              const lines = [`Sheet: ${sheetName}`, ...rowLines];
              if (truncatedRows) lines.push(`[…truncated at ${MAX_XLSX_ROWS} rows]`);
              out.push(lines.join('\n'));
            }
            inSheet = false;
          }
          return;
        }
        if (!inSheet) return;

        if (tag.name === 'table:table-row') {
          if (!tag.closing && !tag.selfClosing) {
            if (rowLines.length >= MAX_XLSX_ROWS) {
              truncatedRows = true;
              inRow = false;
              return;
            }
            inRow = true;
            rowCells = [];
          } else if (tag.closing && inRow) {
            const line = formatCsvRow(rowCells);
            if (line) rowLines.push(line);
            inRow = false;
          }
          return;
        }
        if (!inRow) return;

        if (tag.name === 'table:table-cell' || tag.name === 'table:covered-table-cell') {
          if (tag.selfClosing) {
            const attrs = parseXmlAttrs(tag.attrs);
            const repeat = Math.min(Number(attrs['table:number-columns-repeated'] ?? 1) || 1, MAX_XLSX_COLS);
            for (let i = 0; i < repeat && rowCells.length < MAX_XLSX_COLS; i++) rowCells.push('');
          } else if (!tag.closing) {
            const attrs = parseXmlAttrs(tag.attrs);
            inCell = true;
            cellRepeat = Math.min(Number(attrs['table:number-columns-repeated'] ?? 1) || 1, 50);
            cellParas = [];
          } else if (tag.closing && inCell) {
            const val = cellParas.join(' ').trim();
            const repeat = val ? cellRepeat : Math.min(cellRepeat, MAX_XLSX_COLS - rowCells.length);
            for (let i = 0; i < repeat && rowCells.length < MAX_XLSX_COLS; i++) {
              rowCells.push(val);
            }
            inCell = false;
          }
          return;
        }
        if (!inCell) return;

        if (tag.name === 'text:p' || tag.name === 'text:h') {
          if (!tag.closing && !tag.selfClosing) {
            inPara = true;
            paraText = '';
          } else if (tag.closing && inPara) {
            const t = paraText.trim();
            if (t) cellParas.push(t);
            inPara = false;
            paraText = '';
          }
          return;
        }
        if (inPara && !tag.closing) {
          if (tag.name === 'text:tab') paraText += '\t';
          else if (tag.name === 'text:line-break') paraText += '\n';
          else if (tag.name === 'text:s') {
            const count = Number(parseXmlAttrs(tag.attrs)['text:c'] ?? 1) || 1;
            paraText += ' '.repeat(Math.min(count, 32));
          }
        }
      },
      (text) => {
        if (inCell && inPara) paraText += decodeXmlEntities(text);
      },
    );

    return out.join('\n\n');
  }

  // Document (.odt) or Presentation (.odp)
  const lines: string[] = [];
  const rowStack: string[][] = [];
  const cellStack: string[][] = [];
  let slideCount = 0;
  let inPara = false;
  let paraText = '';

  scanXml(
    contentXml,
    (tag) => {
      if (kind === 'presentation' && tag.name === 'draw:page' && !tag.closing && !tag.selfClosing) {
        slideCount++;
        lines.push(`${slideCount > 1 ? '\n' : ''}Slide ${slideCount}:`);
        return;
      }
      if (kind === 'presentation' && tag.name === 'presentation:notes' && !tag.closing && !tag.selfClosing) {
        lines.push('Notes:');
        return;
      }

      if (tag.name === 'table:table-row') {
        if (!tag.closing && !tag.selfClosing) {
          rowStack.push([]);
        } else if (tag.closing) {
          const row = rowStack.pop();
          if (row && row.some((c) => c.length > 0)) {
            const rowLine = row.join(' | ');
            if (cellStack.length > 0) cellStack[cellStack.length - 1].push(rowLine);
            else lines.push(rowLine);
          }
        }
        return;
      }

      if (tag.name === 'table:table-cell') {
        if (!tag.closing && !tag.selfClosing) {
          cellStack.push([]);
        } else if (tag.closing) {
          const cell = cellStack.pop();
          if (cell && rowStack.length > 0) {
            rowStack[rowStack.length - 1].push(cell.join(' ').replace(/\s+/g, ' ').trim());
          }
        }
        return;
      }

      if (tag.name === 'text:p' || tag.name === 'text:h') {
        if (!tag.closing && !tag.selfClosing) {
          inPara = true;
          paraText = '';
        } else if (tag.closing && inPara) {
          const t = paraText.trim();
          if (cellStack.length > 0) {
            if (t) cellStack[cellStack.length - 1].push(t);
          } else if (t) {
            lines.push(t);
          }
          inPara = false;
          paraText = '';
        }
        return;
      }

      if (inPara && !tag.closing) {
        if (tag.name === 'text:tab') paraText += '\t';
        else if (tag.name === 'text:line-break') paraText += '\n';
        else if (tag.name === 'text:s') {
          const count = Number(parseXmlAttrs(tag.attrs)['text:c'] ?? 1) || 1;
          paraText += ' '.repeat(Math.min(count, 32));
        }
      }
    },
    (text) => {
      if (inPara) paraText += decodeXmlEntities(text);
    },
  );

  return lines.join('\n');
}

export async function extractPdf(bytes: Uint8Array): Promise<string> {
  let text = '';
  try {
    const result = await extractPdfText(new Uint8Array(bytes), { mergePages: true });
    text = typeof result.text === 'string' ? result.text : '';
  } catch {
    throw new HttpError(422, "Couldn't read that PDF. Make sure it isn't password-protected or corrupted.");
  }

  if (!text.trim()) {
    throw new HttpError(422, 'This PDF has no selectable text. Take a photo of the pages instead.');
  }
  return text;
}

export async function extractDocumentText(
  bytes: Uint8Array,
  name: string,
  mime?: string,
): Promise<{ kind: Exclude<AttachmentKind, 'image'>; mimeType: string; content: string; truncated: boolean }> {
  const cleanMime = normalizeMime(mime);
  assertSupportedType(name, cleanMime);

  const detected = detectKind(name, cleanMime);
  if (detected === 'image') {
    throw new HttpError(500, 'Images must be processed via vision description.');
  }

  const ext = getExtension(name);
  let kind: Exclude<AttachmentKind, 'image'>;
  let rawText: string;

  if (detected === 'pdf') {
    kind = 'pdf';
    rawText = await extractPdf(bytes);
  } else if (detected === 'document') {
    kind = 'document';
    rawText = ext === 'odt' || cleanMime === 'application/vnd.oasis.opendocument.text'
      ? extractOpenDocument(bytes, 'document')
      : extractDocx(bytes);
  } else if (detected === 'presentation') {
    kind = 'presentation';
    rawText = ext === 'odp' || cleanMime === 'application/vnd.oasis.opendocument.presentation'
      ? extractOpenDocument(bytes, 'presentation')
      : extractPptx(bytes);
  } else if (detected === 'spreadsheet') {
    kind = 'spreadsheet';
    rawText = ext === 'ods' || cleanMime === 'application/vnd.oasis.opendocument.spreadsheet'
      ? extractOpenDocument(bytes, 'spreadsheet')
      : extractXlsx(bytes);
  } else if (detected === 'text') {
    kind = 'text';
    const decoded = decodeUtf8Strict(bytes);
    if (decoded === null) {
      throw new HttpError(422, "Couldn't read that text file (invalid UTF-8 encoding).");
    }
    rawText = ext === 'rtf' || cleanMime === 'application/rtf' || cleanMime === 'text/rtf'
      ? stripRtf(decoded)
      : decoded;
  } else {
    // Unknown extension/MIME: accept only if valid UTF-8 text without NUL bytes.
    const decoded = decodeUtf8Strict(bytes);
    if (decoded === null) {
      throw new HttpError(415, UNSUPPORTED_MSG);
    }
    kind = 'text';
    rawText = decoded;
  }

  const { content, truncated } = normalizeExtractedText(rawText);
  if (!content) {
    throw new HttpError(
      422,
      kind === 'pdf'
        ? 'This PDF has no selectable text. Take a photo of the pages instead.'
        : "Couldn't find any readable text in that file.",
    );
  }

  return {
    kind,
    mimeType: cleanMime || (kind === 'text' ? 'text/plain' : 'application/octet-stream'),
    content,
    truncated,
  };
}
