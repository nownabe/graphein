// Convert Slack `rich_text` blocks (from message.blocks[]) back into a Slack
// mrkdwn-ish string. The plain `message.text` field strips bold/italic/strike
// formatting and collapses lists into indented bullets, so we use the
// structured block data instead when available.
//
// Supported rich_text element types:
//   - rich_text_section       → inline text, joined with \n
//   - rich_text_list          → ordered (1.) or bullet (-) list with indent
//   - rich_text_quote         → lines prefixed with "> "
//   - rich_text_preformatted  → fenced ```code block```
//
// Inline elements: text (with style flags), user, channel, usergroup,
// broadcast, emoji, link.

type Style = {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
};

type InlineEl =
  | { type: "text"; text: string; style?: Style }
  | { type: "emoji"; name: string; unicode?: string }
  | { type: "user"; user_id: string }
  | { type: "channel"; channel_id: string }
  | { type: "usergroup"; usergroup_id: string }
  | { type: "broadcast"; range: "here" | "channel" | "everyone" | "group" }
  | { type: "link"; url: string; text?: string; style?: Style };

type SectionEl = { type: "rich_text_section"; elements: InlineEl[] };
type ListEl = {
  type: "rich_text_list";
  style: "ordered" | "bullet";
  indent?: number;
  elements: SectionEl[];
};
type QuoteEl = { type: "rich_text_quote"; elements: InlineEl[] };
type PreformattedEl = {
  type: "rich_text_preformatted";
  elements: InlineEl[];
};
type RichEl = SectionEl | ListEl | QuoteEl | PreformattedEl;

// Best-effort conversion. Returns null when `blocks` contains no usable
// rich_text data (in which case callers should fall back to `message.text`).
export function blocksToMrkdwn(blocks: unknown): string | null {
  if (!Array.isArray(blocks)) return null;
  const parts: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    if ((block as { type?: string }).type !== "rich_text") continue;
    const els = (block as { elements?: RichEl[] }).elements ?? [];
    parts.push(renderRichText(els));
  }
  const out = parts
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
  return out.length > 0 ? out : null;
}

function renderRichText(elements: RichEl[]): string {
  const out: string[] = [];
  for (const el of elements) {
    switch (el.type) {
      case "rich_text_section":
        out.push(renderInlines(el.elements));
        break;
      case "rich_text_list":
        out.push(renderList(el));
        break;
      case "rich_text_quote": {
        const inner = renderInlines(el.elements);
        out.push(
          inner
            .split("\n")
            .map((l) => `> ${l}`)
            .join("\n"),
        );
        break;
      }
      case "rich_text_preformatted": {
        const inner = el.elements
          .map((e) => (e.type === "text" ? e.text : e.type === "link" ? e.url : ""))
          .join("");
        out.push("```\n" + inner + "\n```");
        break;
      }
    }
  }
  return out.join("\n");
}

function renderList(list: ListEl): string {
  const indent = list.indent ?? 0;
  const pad = "  ".repeat(indent);
  const lines: string[] = [];
  list.elements.forEach((section, i) => {
    const marker = list.style === "ordered" ? `${i + 1}.` : "-";
    const text = renderInlines(section.elements);
    const [first = "", ...rest] = text.split("\n");
    lines.push(`${pad}${marker} ${first}`);
    for (const r of rest) lines.push(`${pad}  ${r}`);
  });
  return lines.join("\n");
}

function renderInlines(els: InlineEl[]): string {
  return els.map(renderInline).join("");
}

function renderInline(el: InlineEl): string {
  switch (el.type) {
    case "text":
      return applyStyle(el.text, el.style);
    case "emoji":
      return `:${el.name}:`;
    case "user":
      return `<@${el.user_id}>`;
    case "channel":
      return `<#${el.channel_id}>`;
    case "usergroup":
      return `<!subteam^${el.usergroup_id}>`;
    case "broadcast":
      return `<!${el.range}>`;
    case "link": {
      if (el.text && el.text !== el.url) {
        return `<${el.url}|${applyStyle(el.text, el.style)}>`;
      }
      return `<${el.url}>`;
    }
  }
}

// Wrap the non-whitespace content in style markers, preserving any leading or
// trailing whitespace outside the wrappers (our parser rejects wrappers that
// butt up against whitespace).
function applyStyle(text: string, style?: Style): string {
  if (!style || !text) return text;
  const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!m) return text;
  const [, lead, core, trail] = m;
  if (!core) return text;
  let wrapped = core;
  if (style.code) wrapped = `\`${wrapped}\``;
  if (style.bold) wrapped = `*${wrapped}*`;
  if (style.italic) wrapped = `_${wrapped}_`;
  if (style.strike) wrapped = `~${wrapped}~`;
  return `${lead}${wrapped}${trail}`;
}
