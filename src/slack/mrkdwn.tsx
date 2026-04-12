// Slack mrkdwn parser and JSX renderer.
//
// Slack stores message text as a mix of literal characters and Slack-specific
// entities wrapped in angle brackets (<@Uxxx>, <#Cxxx|general>, <http://…>).
// User-typed `<`, `>`, and `&` are escaped as `&lt;`, `&gt;`, `&amp;`. This
// module parses that text into an AST and renders it to Hono JSX.
//
// Supported:
//   - Bold (*...*), italic (_..._), strike (~...~)
//   - Inline code (`...`) and fenced code blocks (```...```)
//   - Block quotes (lines starting with `>` or `&gt;`)
//   - Links: <url>, <url|label>, <mailto:x@y>, <mailto:x@y|label>
//   - User mentions: <@U123>, <@U123|alice>
//   - Channel mentions: <#C123>, <#C123|general>
//   - Usergroup mentions: <!subteam^S123>, <!subteam^S123|team>
//   - Broadcasts: <!here>, <!channel>, <!everyone>, <!group>
//   - Date tokens: <!date^1700000000^{date_short}|fallback>
//   - Emoji shortcodes: :smile:
//   - HTML-entity escaped characters (&lt; &gt; &amp;)

// ---------- AST ----------

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "bold"; children: InlineNode[] }
  | { type: "italic"; children: InlineNode[] }
  | { type: "strike"; children: InlineNode[] }
  | { type: "link"; url: string; children: InlineNode[] }
  | { type: "user"; id: string; label?: string }
  | { type: "channel"; id: string; label?: string }
  | { type: "usergroup"; id: string; label?: string }
  | {
      type: "broadcast";
      name: "here" | "channel" | "everyone" | "group";
      label?: string;
    }
  | {
      type: "date";
      timestamp: number;
      format: string;
      link?: string;
      fallback?: string;
    }
  | { type: "emoji"; name: string };

export type ListItem = {
  inlines: InlineNode[];
  children: ListBlock[];
};

export type ListBlock = {
  type: "list";
  ordered: boolean;
  items: ListItem[];
};

export type BlockNode =
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "quote"; children: InlineNode[] }
  | { type: "codeblock"; value: string }
  | ListBlock;

// ---------- Parser ----------

const WORD = /[A-Za-z0-9_]/;

function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

type ListLine = { indent: number; ordered: boolean; text: string };

export function parseMrkdwn(input: string): BlockNode[] {
  const blocks: BlockNode[] = [];

  for (const seg of splitCodeBlocks(input)) {
    if (seg.type === "codeblock") {
      // Strip surrounding newlines and a single leading/trailing space that
      // shows up when the fences sit inline: ```code block ``` → "code block".
      const value = decodeEntities(seg.value)
        .replace(/^\n+|\n+$/g, "")
        .replace(/^ (.*?) $/s, "$1");
      blocks.push({ type: "codeblock", value });
      continue;
    }

    const lines = seg.value.split("\n");
    let paraBuf: string[] = [];
    let quoteBuf: string[] = [];
    let listBuf: ListLine[] = [];

    const flushPara = () => {
      if (paraBuf.length > 0) {
        const joined = paraBuf.join("\n").replace(/^\n+|\n+$/g, "");
        if (joined.length > 0) {
          blocks.push({ type: "paragraph", children: parseInline(joined) });
        }
        paraBuf = [];
      }
    };
    const flushQuote = () => {
      if (quoteBuf.length > 0) {
        blocks.push({
          type: "quote",
          children: parseInline(quoteBuf.join("\n")),
        });
        quoteBuf = [];
      }
    };
    const flushList = () => {
      if (listBuf.length > 0) {
        blocks.push(buildListTree(listBuf));
        listBuf = [];
      }
    };

    for (const line of lines) {
      const listLine = matchListLine(line);
      if (listLine) {
        flushPara();
        flushQuote();
        // If the new line's indent matches the current buffer's base indent
        // but its ordered/bullet style differs, start a new list block so
        // `1. a / 2. b / - c / - d` renders as two adjacent lists.
        if (listBuf.length > 0) {
          const baseIndent = Math.min(...listBuf.map((l) => l.indent));
          if (listLine.indent === baseIndent && listLine.ordered !== listBuf[0]!.ordered) {
            flushList();
          }
        }
        listBuf.push(listLine);
        continue;
      }
      const quoted = stripQuotePrefix(line);
      if (quoted !== null) {
        flushPara();
        flushList();
        quoteBuf.push(quoted);
        continue;
      }
      // Blank line terminates any open block and starts a new paragraph.
      if (line.trim() === "") {
        flushList();
        flushQuote();
        flushPara();
        continue;
      }
      flushList();
      flushQuote();
      paraBuf.push(line);
    }
    flushList();
    flushQuote();
    flushPara();
  }

  return blocks;
}

// Recognise a line that looks like a list item. Supports:
//   - "- text"  /  "* text"  /  "+ text"                 (bullet)
//   - "1. text"                                           (ordered)
//   - "• text"  /  "◦ text"  /  "▪ text"                 (unicode bullets)
// Leading whitespace becomes indent level (2 spaces per level).
function matchListLine(line: string): ListLine | null {
  // Slack does not use `*` or `+` for lists (those collide with bold markers
  // and stray text). We only recognise `-`, unicode bullets, and numbered
  // `1.` / `a.` style markers.
  const m = line.match(/^(\s*)([•◦▪‣·]|-|\d+\.|[a-zA-Z]\.)\s+(.*)$/);
  if (!m) return null;
  const [, ws, marker, rest] = m;
  const indent = Math.floor(ws.replace(/\t/g, "  ").length / 2);
  const ordered = /^\d+\.$/.test(marker) || /^[a-zA-Z]\.$/.test(marker);
  return { indent, ordered, text: rest };
}

// Build a nested list tree from flat list lines, using indent to detect
// children. Adjacent lines with different ordered/bullet style at the same
// indent still live in one list block (the top-level style wins).
function buildListTree(lines: ListLine[]): ListBlock {
  const minIndent = Math.min(...lines.map((l) => l.indent));
  const root: ListBlock = {
    type: "list",
    ordered: lines[0]!.ordered,
    items: [],
  };

  // Stack of (listBlock, indent)
  const stack: { list: ListBlock; indent: number }[] = [{ list: root, indent: minIndent }];

  for (const line of lines) {
    // Pop until we find a list whose indent is <= this line's indent.
    while (stack.length > 1 && stack[stack.length - 1]!.indent > line.indent) {
      stack.pop();
    }
    const top = stack[stack.length - 1]!;

    if (line.indent > top.indent) {
      // Start a nested list under the last item of top.
      const parentItems = top.list.items;
      const parent =
        parentItems[parentItems.length - 1] ??
        (parentItems.push({ inlines: [], children: [] }), parentItems[parentItems.length - 1]!);
      const nested: ListBlock = {
        type: "list",
        ordered: line.ordered,
        items: [{ inlines: parseInline(line.text), children: [] }],
      };
      parent.children.push(nested);
      stack.push({ list: nested, indent: line.indent });
    } else {
      top.list.items.push({
        inlines: parseInline(line.text),
        children: [],
      });
    }
  }

  return root;
}

function stripQuotePrefix(line: string): string | null {
  const m = line.match(/^(?:&gt;|>) ?(.*)$/);
  return m ? m[1] : null;
}

function splitCodeBlocks(src: string): { type: "text" | "codeblock"; value: string }[] {
  const parts: { type: "text" | "codeblock"; value: string }[] = [];
  const re = /```([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null = re.exec(src);
  while (m !== null) {
    if (m.index > last) {
      parts.push({ type: "text", value: src.slice(last, m.index) });
    }
    parts.push({ type: "codeblock", value: m[1] });
    last = re.lastIndex;
    m = re.exec(src);
  }
  if (last < src.length) {
    parts.push({ type: "text", value: src.slice(last) });
  }
  return parts;
}

function parseInline(text: string): InlineNode[] {
  const out: InlineNode[] = [];
  let buf = "";
  let i = 0;

  const flush = () => {
    if (buf) {
      out.push({ type: "text", value: decodeEntities(buf) });
      buf = "";
    }
  };

  while (i < text.length) {
    const c = text[i];

    // Inline code `...`
    if (c === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({
          type: "code",
          value: decodeEntities(text.slice(i + 1, end)),
        });
        i = end + 1;
        continue;
      }
    }

    // Angle-bracket entity <...>
    if (c === "<") {
      const end = text.indexOf(">", i + 1);
      if (end !== -1) {
        const node = parseEntity(text.slice(i + 1, end));
        if (node) {
          flush();
          out.push(node);
          i = end + 1;
          continue;
        }
      }
    }

    // Bold / italic / strike wrappers
    if (c === "*" || c === "_" || c === "~") {
      const w = tryWrapper(text, i, c);
      if (w) {
        flush();
        const kind = c === "*" ? "bold" : c === "_" ? "italic" : "strike";
        out.push({
          type: kind,
          children: parseInline(w.content),
        } as InlineNode);
        i = w.end;
        continue;
      }
    }

    // Emoji :name:
    if (c === ":") {
      const m = text.slice(i).match(/^:([a-z0-9_+-]+):/);
      if (m) {
        flush();
        out.push({ type: "emoji", name: m[1] });
        i += m[0].length;
        continue;
      }
    }

    buf += c;
    i++;
  }
  flush();
  return out;
}

function tryWrapper(
  text: string,
  start: number,
  delim: string,
): { content: string; end: number } | null {
  const prev = start > 0 ? text[start - 1] : "";
  if (prev && WORD.test(prev)) return null;
  const next = text[start + 1];
  if (!next || next === delim || /\s/.test(next)) return null;
  for (let i = start + 2; i < text.length; i++) {
    if (text[i] === delim) {
      if (/\s/.test(text[i - 1])) continue;
      const after = i + 1 < text.length ? text[i + 1] : "";
      if (after && WORD.test(after)) continue;
      return { content: text.slice(start + 1, i), end: i + 1 };
    }
  }
  return null;
}

function parseEntity(inner: string): InlineNode | null {
  if (!inner) return null;
  const pipe = inner.indexOf("|");
  const body = pipe === -1 ? inner : inner.slice(0, pipe);
  const label = pipe === -1 ? undefined : inner.slice(pipe + 1);

  if (body.startsWith("@")) {
    return { type: "user", id: body.slice(1), label };
  }
  if (body.startsWith("#")) {
    return { type: "channel", id: body.slice(1), label };
  }
  if (body.startsWith("!subteam^")) {
    return {
      type: "usergroup",
      id: body.slice("!subteam^".length),
      label,
    };
  }
  if (body.startsWith("!date^")) {
    const parts = body.slice("!date^".length).split("^");
    const timestamp = Number(parts[0]);
    if (!Number.isFinite(timestamp)) return null;
    return {
      type: "date",
      timestamp,
      format: parts[1] ?? "",
      link: parts[2],
      fallback: label,
    };
  }
  if (body.startsWith("!")) {
    const name = body.slice(1);
    if (name === "here" || name === "channel" || name === "everyone" || name === "group") {
      return { type: "broadcast", name, label };
    }
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(body)) {
    const displayUrl = body.replace(/^mailto:/, "");
    const children: InlineNode[] = label
      ? parseInline(label)
      : [{ type: "text", value: displayUrl }];
    return { type: "link", url: body, children };
  }
  return null;
}

// ---------- Renderer ----------

export interface MrkdwnOptions {
  users?: Record<string, string>;
  channels?: Record<string, string>;
  usergroups?: Record<string, string>;
}

export function Mrkdwn({ text, options }: { text: string; options?: MrkdwnOptions }) {
  const blocks = parseMrkdwn(text);
  const opts = options ?? {};
  return <div class="mrkdwn space-y-2">{blocks.map((b) => renderBlock(b, opts))}</div>;
}

function renderBlock(block: BlockNode, opts: MrkdwnOptions) {
  switch (block.type) {
    case "codeblock":
      return (
        <pre class="bg-surface-hover border border-edge rounded-[var(--radius-sm)] px-3 py-2 text-[12px] font-mono overflow-x-auto whitespace-pre">
          <code>{block.value}</code>
        </pre>
      );
    case "quote":
      return (
        <blockquote class="border-l-[3px] border-accent/60 bg-surface/40 pl-3 py-1 rounded-r whitespace-pre-wrap text-secondary">
          {renderInline(block.children, opts)}
        </blockquote>
      );
    case "paragraph":
      return (
        <p class="whitespace-pre-wrap leading-relaxed">{renderInline(block.children, opts)}</p>
      );
    case "list":
      return renderList(block, opts);
  }
}

function renderList(list: ListBlock, opts: MrkdwnOptions) {
  const itemNodes = list.items.map((item) => (
    <li class="leading-relaxed">
      {renderInline(item.inlines, opts)}
      {item.children.map((c) => renderList(c, opts))}
    </li>
  ));
  return list.ordered ? (
    <ol class="list-decimal pl-5 space-y-0.5 marker:text-muted">{itemNodes}</ol>
  ) : (
    <ul class="list-disc pl-5 space-y-0.5 marker:text-muted">{itemNodes}</ul>
  );
}

function renderInline(nodes: InlineNode[], opts: MrkdwnOptions) {
  return nodes.map((n) => renderInlineNode(n, opts));
}

function renderInlineNode(node: InlineNode, opts: MrkdwnOptions) {
  switch (node.type) {
    case "text":
      return node.value;
    case "code":
      return (
        <code class="bg-surface-hover border border-edge rounded px-1 text-[12px] font-mono">
          {node.value}
        </code>
      );
    case "bold":
      return <strong>{renderInline(node.children, opts)}</strong>;
    case "italic":
      return <em>{renderInline(node.children, opts)}</em>;
    case "strike":
      return <del>{renderInline(node.children, opts)}</del>;
    case "link": {
      const href = /^[a-z][a-z0-9+.-]*:/i.test(node.url) ? node.url : `https://${node.url}`;
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          hx-boost="false"
          class="text-accent no-underline border-b border-dotted border-accent hover:border-transparent"
        >
          {renderInline(node.children, opts)}
          <span class="inline-block align-[-1px] ml-0.5 text-[0.85em] opacity-70">↗</span>
        </a>
      );
    }
    case "user": {
      const name = node.label ?? opts.users?.[node.id] ?? node.id;
      return (
        <span class="text-accent bg-[var(--color-glow-accent)] px-1 rounded font-medium">
          @{name}
        </span>
      );
    }
    case "channel": {
      const name = node.label ?? opts.channels?.[node.id] ?? node.id;
      return <span class="text-accent font-medium">#{name}</span>;
    }
    case "usergroup": {
      const name = node.label ?? opts.usergroups?.[node.id] ?? node.id;
      return (
        <span class="text-accent bg-[var(--color-glow-accent)] px-1 rounded font-medium">
          @{name}
        </span>
      );
    }
    case "broadcast": {
      const raw = node.label ?? node.name;
      const display = raw.startsWith("@") ? raw : `@${raw}`;
      return (
        <span class="text-accent bg-[var(--color-glow-accent)] px-1 rounded font-medium">
          {display}
        </span>
      );
    }
    case "date": {
      const text = node.fallback ?? new Date(node.timestamp * 1000).toISOString();
      if (node.link) {
        return (
          <a
            href={node.link}
            target="_blank"
            rel="noopener noreferrer"
            hx-boost="false"
            class="text-accent hover:underline"
          >
            {text}
          </a>
        );
      }
      return <span>{text}</span>;
    }
    case "emoji":
      return <span>{`:${node.name}:`}</span>;
  }
}
