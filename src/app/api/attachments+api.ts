import { ATTACHMENT_LIMITS, type AttachmentKind } from '../../shared/types';
import { requireUser } from '../../server/auth/session';
import { detectKind, extractDocumentText, resolveImageMime } from '../../server/attachments/extract';
import { toAttachmentMeta } from '../../server/attachments/store';
import { describeImage } from '../../server/attachments/vision';
import { db } from '../../server/db/client';
import { chatAttachments } from '../../server/db/schema';
import { HttpError, json, route } from '../../server/http';
import { newId } from '../../server/turns';

const MAX_MB = Math.round(ATTACHMENT_LIMITS.maxBytes / (1024 * 1024));

type WebFormData = { get(name: string): FormDataEntryValue | null };
type FormFile = Blob & { name?: string };

function isFileLike(entry: unknown): entry is FormFile {
  return (
    entry !== null &&
    typeof entry === 'object' &&
    typeof (entry as Blob).arrayBuffer === 'function' &&
    typeof (entry as Blob).size === 'number'
  );
}

/**
 * Accepts a multipart/form-data upload (`file`), extracts text (or describes
 * images via a vision model), stores the extracted text in `chat_attachments`,
 * and returns `201 { attachment: AttachmentMeta }`. Raw bytes are not stored.
 */
export const POST = route(async (request) => {
  const user = await requireUser(request);

  let formData: WebFormData;
  try {
    formData = (await request.formData()) as unknown as WebFormData;
  } catch {
    throw new HttpError(400, 'Request body must be multipart/form-data.');
  }

  const entry = formData.get('file');
  if (!isFileLike(entry)) {
    throw new HttpError(400, 'Attach a file in the "file" field.');
  }

  const name = (typeof entry.name === 'string' ? entry.name : '').trim();
  if (!name) {
    throw new HttpError(400, 'Uploaded file must have a name.');
  }

  if (entry.size === 0) {
    throw new HttpError(400, 'The uploaded file is empty.');
  }
  if (entry.size > ATTACHMENT_LIMITS.maxBytes) {
    throw new HttpError(413, `File is too large. Maximum size is ${MAX_MB} MB.`);
  }

  const bytes = new Uint8Array(await entry.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new HttpError(400, 'The uploaded file is empty.');
  }
  if (bytes.byteLength > ATTACHMENT_LIMITS.maxBytes) {
    throw new HttpError(413, `File is too large. Maximum size is ${MAX_MB} MB.`);
  }

  const detected = detectKind(name, entry.type);
  let kind: AttachmentKind;
  let mimeType: string;
  let content: string;
  let truncated: boolean;

  if (detected === 'image') {
    kind = 'image';
    mimeType = resolveImageMime(name, entry.type);
    const described = await describeImage(bytes, mimeType, request.signal);
    content = described.content;
    truncated = described.truncated;
  } else {
    const extracted = await extractDocumentText(bytes, name, entry.type);
    kind = extracted.kind;
    mimeType = extracted.mimeType;
    content = extracted.content;
    truncated = extracted.truncated;
  }

  const [row] = await db
    .insert(chatAttachments)
    .values({
      id: newId('att'),
      accountId: user.id,
      name,
      mimeType,
      size: bytes.byteLength,
      kind,
      content,
      truncated,
    })
    .returning();

  return json({ attachment: toAttachmentMeta(row) }, 201);
});
