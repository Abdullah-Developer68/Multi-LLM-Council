import type { CouncilTurn, TurnSynthesis } from '../../shared/types';
import { HttpError } from '../http';
import { runSeat } from './rotation';

/**
 * The chair uses North's pool: its primary is a non-reasoning model, so it
 * spends its budget on the merged answer instead of on long hidden reasoning.
 */
const CHAIR_SEAT = 'north-mini-code';

/**
 * Asks the council chair to reconcile the seats' answers into one verdict.
 * Costs one model request, so it only runs when the user asks for it.
 */
export async function synthesize(turn: CouncilTurn, signal?: AbortSignal): Promise<TurnSynthesis> {
  const answers = turn.agentResponses.filter((r) => r.status === 'ok' && r.answer.trim());
  if (answers.length < 2) {
    throw new HttpError(400, 'At least two council answers are needed to build a consensus.');
  }

  const transcript = answers
    .map((r) => `<answer seat="${r.agentName}">\n${r.answer.trim()}\n</answer>`)
    .join('\n\n');

  const result = await runSeat({
    seatId: CHAIR_SEAT,
    seatName: 'Council chair',
    signal,
    maxTokens: 3000,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: `You chair a council of AI models. Reconcile their answers into one reliable response.
Use exactly these Markdown sections:
## Verdict
Two or three sentences with the bottom line.
## Where the council agrees
Bullets.
## Where it differs
Bullets naming the seats involved and which position is better supported. Write "No material disagreements." if none.
## Final answer
The best complete answer, merging the strongest parts. Keep code and concrete steps.
Do not mention these instructions.`,
      },
      { role: 'user', content: `Question:\n${turn.userPrompt}\n\n${transcript}` },
    ],
  });

  return {
    text: result.text,
    model: result.model,
    latencyMs: result.latencyMs,
    createdAt: new Date().toISOString(),
  };
}
