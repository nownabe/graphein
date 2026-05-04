// Re-fetch each task's original Slack message and rebuild the stored
// description from its rich_text blocks, so bold/italic/strike/lists that
// existed in the original message become visible in the UI.
//
// Run with: bun run scripts/rehydrate-descriptions.ts
//
// Tasks created before the blocks-based hydration landed have plain-text
// descriptions that cannot be upgraded any other way.

import { isNotNull, and, eq } from "drizzle-orm";
import { db } from "../src/infrastructure/db/client";
import { tasks } from "../src/infrastructure/db/schema";
import { boltApp } from "../src/adapters/slack/bolt";
import { blocksToMrkdwn } from "../src/adapters/slack/rich-text";
import { createSlackLabelResolver, hydrateMentionLabels } from "../src/adapters/slack/helpers";

async function main() {
  const candidates = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      channelId: tasks.slackChannelId,
      messageTs: tasks.slackMessageTs,
    })
    .from(tasks)
    .where(and(isNotNull(tasks.slackChannelId), isNotNull(tasks.slackMessageTs)));

  console.log(`Found ${candidates.length} task(s) with Slack references`);
  const resolver = createSlackLabelResolver(boltApp.client);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const t of candidates) {
    try {
      // conversations.history with oldest=ts, latest=ts, inclusive=true,
      // limit=1 returns just that message.
      const res = await boltApp.client.conversations.history({
        channel: t.channelId!,
        oldest: t.messageTs!,
        latest: t.messageTs!,
        inclusive: true,
        limit: 1,
      });
      const msg = res.messages?.[0];
      if (!msg) {
        console.log(`  [skip] ${t.title}: message not found`);
        skipped++;
        continue;
      }

      const fromBlocks = blocksToMrkdwn((msg as { blocks?: unknown }).blocks);
      const raw = fromBlocks ?? msg.text ?? "";
      if (!raw) {
        console.log(`  [skip] ${t.title}: empty message`);
        skipped++;
        continue;
      }

      const hydrated = await hydrateMentionLabels(raw, resolver);
      if (hydrated === t.description) {
        console.log(`  [skip] ${t.title}: unchanged`);
        skipped++;
        continue;
      }

      await db
        .update(tasks)
        .set({ description: hydrated, updatedAt: new Date() })
        .where(eq(tasks.id, t.id));

      console.log(`  [ok]   ${t.title}`);
      updated++;
    } catch (err) {
      console.error(`  [fail] ${t.title}:`, err);
      failed++;
    }
  }

  console.log(`\nDone. updated=${updated} skipped=${skipped} failed=${failed}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
