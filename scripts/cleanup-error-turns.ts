/**
 * Removes stale "### Live Model Error" turns from chat history.
 *
 * When the OpenRouter free-model daily quota was exhausted, the orchestrator used
 * to persist placeholder error cards into `multi_agent_turns`. Those cards show up
 * in the user's chat history forever, so this script deletes every turn whose
 * `agent_responses` contains that marker, and then removes any `chat_threads`
 * rows that are left with no turns at all.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/cleanup-error-turns.ts           # apply
 *   npx tsx --env-file=.env scripts/cleanup-error-turns.ts --dry-run # report only
 */

import { client } from '../src/db';

const ERROR_MARKER = '### Live Model Error';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('\n===============================================================');
  console.log(`   CLEANUP: stale "${ERROR_MARKER}" turns ${dryRun ? '(dry run)' : ''}`);
  console.log('===============================================================\n');

  const stale: any = await client.unsafe(
    `SELECT id, thread_id, created_at, left(user_prompt, 60) AS prompt
       FROM multi_agent_turns
      WHERE agent_responses::text LIKE $1
      ORDER BY created_at`,
    [`%${ERROR_MARKER}%`]
  );

  if (stale.length === 0) {
    console.log('✅ No stale error turns found — nothing to delete.\n');
    await client.end();
    return;
  }

  console.log(`Found ${stale.length} stale error turn(s):`);
  for (const row of stale) {
    console.log(`  • ${row.id}  thread=${row.thread_id}  prompt="${row.prompt}"`);
  }

  if (dryRun) {
    console.log('\n(dry run — no rows were deleted)\n');
    await client.end();
    return;
  }

  const deletedTurns: any = await client.unsafe(
    `DELETE FROM multi_agent_turns
      WHERE agent_responses::text LIKE $1
      RETURNING id, thread_id`,
    [`%${ERROR_MARKER}%`]
  );
  console.log(`\n🗑️  Deleted ${deletedTurns.length} turn(s) from multi_agent_turns.`);

  const threadIds = Array.from(new Set(deletedTurns.map((r: any) => r.thread_id)));

  // Only remove threads that have no remaining turns, so real conversations stay.
  const orphaned: any = await client.unsafe(
    `DELETE FROM chat_threads t
      WHERE t.id = ANY($1::text[])
        AND NOT EXISTS (SELECT 1 FROM multi_agent_turns m WHERE m.thread_id = t.id)
      RETURNING id`,
    [threadIds]
  );
  console.log(`🗑️  Deleted ${orphaned.length} now-empty thread(s) from chat_threads.`);

  const [remaining]: any = await client.unsafe(
    `SELECT count(*)::int AS c FROM multi_agent_turns WHERE agent_responses::text LIKE $1`,
    [`%${ERROR_MARKER}%`]
  );
  console.log(`\n✅ Cleanup complete. Remaining stale error turns: ${remaining.c}\n`);

  await client.end();
}

main().catch(async (err) => {
  console.error('Cleanup failed:', err);
  try {
    await client.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
