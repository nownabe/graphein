/**
 * Parse a kudos message into individual entries.
 *
 * A new entry starts when a line begins with one or more user mentions (`<@U...>`)
 * or usergroup mentions (`<!subteam^S...>`). The leading mentions are the targets;
 * everything else (including inline mentions) is the message body.
 */

export interface ParsedKudosEntry {
  /** Raw Slack mention tokens that are targets, e.g. "<@U123>", "<!subteam^S456>" */
  targetMentions: string[];
  /** The full text of this entry (including the leading mentions) */
  message: string;
}

const MENTION_PATTERN = /^(<@U[A-Z0-9]+>|<!subteam\^S[A-Z0-9]+(?:\|[^>]*)?>)/;

export function parseKudosMessage(text: string): ParsedKudosEntry[] {
  const lines = text.split("\n");
  const entries: ParsedKudosEntry[] = [];
  let current: ParsedKudosEntry | null = null;

  for (const line of lines) {
    const trimmed = line.trimStart();

    // Check if this line starts with mention(s)
    if (MENTION_PATTERN.test(trimmed)) {
      // Extract all leading mentions
      const targets: string[] = [];
      let remaining = trimmed;
      while (true) {
        const match = remaining.match(MENTION_PATTERN);
        if (!match) break;
        targets.push(match[1]);
        remaining = remaining.slice(match[0].length).trimStart();
      }

      if (targets.length > 0) {
        // Start a new entry
        current = { targetMentions: targets, message: line };
        entries.push(current);
        continue;
      }
    }

    // Continuation line: append to current entry or skip
    if (current) {
      current.message += "\n" + line;
    }
    // If no current entry yet, skip lines before the first mention
  }

  // Trim trailing whitespace from messages
  for (const entry of entries) {
    entry.message = entry.message.trimEnd();
  }

  return entries;
}
