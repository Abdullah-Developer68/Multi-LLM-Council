import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { ATTACHMENT_LIMITS, type AttachmentKind } from '@/shared/types';
import type { NewDraftAttachment } from '@/store/types';
import { pad2 } from './format';

const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.7;

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'avif']);
const SPREADSHEET_EXTS = new Set(['xls', 'xlsx', 'csv', 'tsv', 'ods', 'numbers']);
const PRESENTATION_EXTS = new Set(['ppt', 'pptx', 'odp', 'key']);
const DOCUMENT_EXTS = new Set(['doc', 'docx', 'rtf', 'odt', 'pages']);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

export function guessAttachmentKind(name: string, mimeType?: string | null): AttachmentKind {
  const mime = (mimeType ?? '').toLowerCase();
  const ext = extensionOf(name);

  if ((mime.startsWith('image/') && mime !== 'image/svg+xml') || IMAGE_EXTS.has(ext)) {
    return 'image';
  }
  if (mime === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime === 'text/csv' ||
    mime === 'text/tab-separated-values' ||
    SPREADSHEET_EXTS.has(ext)
  ) {
    return 'spreadsheet';
  }
  if (mime.includes('presentation') || mime.includes('powerpoint') || PRESENTATION_EXTS.has(ext)) {
    return 'presentation';
  }
  if (
    mime.includes('wordprocessing') ||
    mime.includes('msword') ||
    mime === 'application/rtf' ||
    mime.includes('opendocument.text') ||
    DOCUMENT_EXTS.has(ext)
  ) {
    return 'document';
  }
  return 'text';
}

function toJpegName(name: string): string {
  const trimmed = name.trim() || 'Photo';
  const dot = trimmed.lastIndexOf('.');
  const base = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  return `${base}.jpg`;
}

export function cameraPhotoName(now = new Date()): string {
  return `Photo ${pad2(now.getHours())}-${pad2(now.getMinutes())}.jpg`;
}

async function measureUriBytes(uri: string): Promise<number | null> {
  try {
    const res = await fetch(uri);
    const blob = await res.blob();
    return typeof blob.size === 'number' ? blob.size : null;
  } catch {
    return null;
  }
}

/** Downscales to ≤1600 px and re-encodes as JPEG (also converts HEIC). */
export async function prepareImageAsset(
  uri: string,
  preferredName: string,
  fallbackSize?: number,
): Promise<NewDraftAttachment> {
  const context = ImageManipulator.manipulate(uri, {
    maxWidth: MAX_IMAGE_EDGE,
    maxHeight: MAX_IMAGE_EDGE,
  });
  try {
    const rendered = await context.renderAsync();
    try {
      const saved = await rendered.saveAsync({
        compress: JPEG_QUALITY,
        format: SaveFormat.JPEG,
      });
      const measured = await measureUriBytes(saved.uri);
      return {
        name: toJpegName(preferredName),
        mimeType: 'image/jpeg',
        size: measured ?? fallbackSize ?? 0,
        kind: 'image',
        uri: saved.uri,
      };
    } finally {
      rendered.release();
    }
  } finally {
    context.release();
  }
}

function fallbackMimeType(kind: AttachmentKind): string {
  switch (kind) {
    case 'image':
      return 'image/jpeg';
    case 'pdf':
      return 'application/pdf';
    case 'document':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'presentation':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'spreadsheet':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    default:
      return 'text/plain';
  }
}

export interface PickerCallbacks {
  currentCount: number;
  onLimit: (message: string) => void;
  onError: (message: string) => void;
}

export async function pickFromLibrary(opts: PickerCallbacks): Promise<NewDraftAttachment[]> {
  const remaining = ATTACHMENT_LIMITS.maxFiles - opts.currentCount;
  if (remaining <= 0) {
    opts.onLimit(`You can attach up to ${ATTACHMENT_LIMITS.maxFiles} files per message.`);
    return [];
  }

  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 1,
    });
  } catch {
    opts.onError('Could not open the photo library.');
    return [];
  }
  if (result.canceled || !result.assets?.length) return [];

  if (result.assets.length > remaining) {
    opts.onLimit(`You can attach up to ${ATTACHMENT_LIMITS.maxFiles} files per message.`);
  }

  const picked = result.assets.slice(0, remaining);
  const out: NewDraftAttachment[] = [];
  for (let i = 0; i < picked.length; i++) {
    const asset = picked[i];
    const name = asset.fileName?.trim() || `Photo ${i + 1}.jpg`;
    try {
      const prepared = await prepareImageAsset(asset.uri, name, asset.fileSize);
      if (prepared.size > ATTACHMENT_LIMITS.maxBytes) {
        opts.onError(`“${prepared.name}” exceeds the 15 MB limit.`);
        continue;
      }
      out.push(prepared);
    } catch {
      opts.onError(`Could not process “${name}”.`);
    }
  }
  return out;
}

export async function pickDocuments(opts: PickerCallbacks): Promise<NewDraftAttachment[]> {
  const remaining = ATTACHMENT_LIMITS.maxFiles - opts.currentCount;
  if (remaining <= 0) {
    opts.onLimit(`You can attach up to ${ATTACHMENT_LIMITS.maxFiles} files per message.`);
    return [];
  }

  let result: DocumentPicker.DocumentPickerResult;
  try {
    result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: true,
      copyToCacheDirectory: true,
    });
  } catch {
    opts.onError('Could not open the file picker.');
    return [];
  }
  if (result.canceled || !result.assets?.length) return [];

  if (result.assets.length > remaining) {
    opts.onLimit(`You can attach up to ${ATTACHMENT_LIMITS.maxFiles} files per message.`);
  }

  const picked = result.assets.slice(0, remaining);
  const out: NewDraftAttachment[] = [];
  for (const asset of picked) {
    const name = asset.name?.trim() || 'Attachment';
    const kind = guessAttachmentKind(name, asset.mimeType);
    if (kind === 'image') {
      try {
        const prepared = await prepareImageAsset(asset.uri, name, asset.size);
        if (prepared.size > ATTACHMENT_LIMITS.maxBytes) {
          opts.onError(`“${prepared.name}” exceeds the 15 MB limit.`);
          continue;
        }
        out.push(prepared);
      } catch {
        opts.onError(`Could not process “${name}”.`);
      }
      continue;
    }

    const size = asset.size ?? (await measureUriBytes(asset.uri)) ?? 0;
    if (size > ATTACHMENT_LIMITS.maxBytes) {
      opts.onError(`“${name}” exceeds the 15 MB limit.`);
      continue;
    }

    out.push({
      name,
      mimeType: asset.mimeType?.trim() || fallbackMimeType(kind),
      size,
      kind,
      uri: asset.uri,
      webFile: asset.file,
    });
  }
  return out;
}
