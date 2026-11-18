import { runSeat } from '../ai/rotation';
import { HttpError } from '../http';
import { normalizeExtractedText } from './extract';

const VISION_BUDGET_MS = 45_000;

const VISION_INSTRUCTION = `Describe this image for another AI model that cannot see it.
- Start with a single-line summary of what the image shows.
- Transcribe ALL visible text verbatim (OCR), preserving line breaks, headings, lists, code, and mathematical notation.
- For tables, charts, diagrams, or UI screenshots, reproduce the structure, labels, axes, values, and relationships accurately.
- For photographs or scenes, describe the visible subjects, setting, and relevant details objectively.
- Do not speculate, infer unseen context, or add commentary.
- Output plain Markdown.`;

export async function describeImage(
  bytes: Uint8Array,
  mimeType: string,
  signal?: AbortSignal,
): Promise<{ content: string; truncated: boolean }> {
  const base64 = Buffer.from(bytes).toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const timeoutSignal = AbortSignal.timeout(VISION_BUDGET_MS);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  try {
    const result = await runSeat({
      seatId: 'vision',
      seatName: 'Vision',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: VISION_INSTRUCTION },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      maxTokens: 1500,
      temperature: 0.2,
      signal: combinedSignal,
    });

    const normalized = normalizeExtractedText(result.text);
    if (!normalized.content) {
      throw new HttpError(503, "Couldn't read that image right now. Try again in a moment.");
    }
    return normalized;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(503, "Couldn't read that image right now. Try again in a moment.");
  }
}
