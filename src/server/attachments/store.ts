import { and, eq, inArray } from 'drizzle-orm';

import type { AttachmentMeta } from '../../shared/types';
import { db } from '../db/client';
import { chatAttachments, type AttachmentRow } from '../db/schema';
import { HttpError } from '../http';

export const MAX_COUNCIL_ATTACHMENT_CHARS = 40_000;
export const REFINER_PREVIEW_CHARS = 1_500;

const TRUNCATION_MARKER = '\n[…truncated]';

export function toAttachmentMeta(row: AttachmentRow): AttachmentMeta {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    kind: row.kind,
    chars: row.content.length,
    truncated: row.truncated,
  };
}

/**
 * Loads attachments owned by `accountId` in the exact order requested.
 * Throws 400 if any id is missing or belongs to another account.
 */
export async function loadOwnedAttachments(accountId: number, ids: string[] | undefined): Promise<AttachmentRow[]> {
  if (!ids?.length) return [];
  const uniqueIds = [...new Set(ids)];

  const rows = await db
    .select()
    .from(chatAttachments)
    .where(and(eq(chatAttachments.accountId, accountId), inArray(chatAttachments.id, uniqueIds)));

  if (rows.length !== uniqueIds.length) {
    throw new HttpError(400, 'One of the attached files is no longer available. Remove it and try again.');
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  return uniqueIds.map((id) => byId.get(id)!);
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Allocates `totalBudget` fairly across files using water-filling so shorter
 * files are kept intact and longer files share the remaining budget evenly.
 */
function allocateCharBudgets(lengths: number[], totalBudget: number): number[] {
  const budgets = new Array<number>(lengths.length).fill(0);
  const indexed = lengths.map((len, i) => ({ len, i })).sort((a, b) => a.len - b.len);

  let remaining = totalBudget;
  for (let pos = 0; pos < indexed.length; pos++) {
    const left = indexed.length - pos;
    const share = Math.floor(remaining / left);
    const { len, i } = indexed[pos];
    const grant = Math.min(len, share);
    budgets[i] = grant;
    remaining -= grant;
  }
  return budgets;
}

function clipContent(text: string, budget: number, marker: string): string {
  if (text.length <= budget) return text;
  if (budget <= marker.length) return text.slice(0, budget);
  return `${text.slice(0, budget - marker.length)}${marker}`;
}

/** Builds the `<attachments>` block sent to each council seat (≤ 40,000 chars of content). */
export function buildAttachmentsBlock(attachments: AttachmentRow[]): string {
  if (!attachments.length) return '';
  const budgets = allocateCharBudgets(
    attachments.map((a) => a.content.length),
    MAX_COUNCIL_ATTACHMENT_CHARS,
  );

  const files = attachments.map((att, idx) => {
    const body = clipContent(att.content, budgets[idx], TRUNCATION_MARKER);
    return `<file name="${escapeXmlAttr(att.name)}" kind="${escapeXmlAttr(att.kind)}">\n${body}\n</file>`;
  });

  return `<attachments>\n${files.join('\n')}\n</attachments>`;
}

/** Builds the shorter `<attachments_preview>` block for the prompt refiner (~1,500 chars/file). */
export function buildAttachmentsPreview(attachments: AttachmentRow[]): string {
  if (!attachments.length) return '';
  const files = attachments.map((att) => {
    const preview = clipContent(att.content, REFINER_PREVIEW_CHARS, '\n[…preview truncated]');
    return `<file name="${escapeXmlAttr(att.name)}" kind="${escapeXmlAttr(att.kind)}">\n${preview}\n</file>`;
  });
  return `<attachments_preview>\n${files.join('\n')}\n</attachments_preview>`;
}
