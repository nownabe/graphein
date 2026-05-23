import { describe, expect, it } from "bun:test";
import { Mrkdwn, parseMrkdwn } from "./mrkdwn";

describe("parseMrkdwn - plain text", () => {
  it("parses plain text", () => {
    expect(parseMrkdwn("hello world")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", value: "hello world" }],
      },
    ]);
  });

  it("preserves internal newlines within a paragraph", () => {
    expect(parseMrkdwn("line1\nline2")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", value: "line1\nline2" }],
      },
    ]);
  });

  it("decodes HTML entities in text", () => {
    expect(parseMrkdwn("a &lt; b &amp; c &gt; d")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", value: "a < b & c > d" }],
      },
    ]);
  });

  it("returns no blocks for empty input", () => {
    expect(parseMrkdwn("")).toEqual([]);
  });
});

describe("parseMrkdwn - inline formatting", () => {
  it("parses bold", () => {
    expect(parseMrkdwn("*bold*")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "bold", children: [{ type: "text", value: "bold" }] }],
      },
    ]);
  });

  it("parses italic", () => {
    expect(parseMrkdwn("_italic_")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "italic", children: [{ type: "text", value: "italic" }] }],
      },
    ]);
  });

  it("parses strikethrough", () => {
    expect(parseMrkdwn("~gone~")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "strike", children: [{ type: "text", value: "gone" }] }],
      },
    ]);
  });

  it("does not treat intra-word underscores as italic", () => {
    expect(parseMrkdwn("snake_case_name")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", value: "snake_case_name" }],
      },
    ]);
  });

  it("does not treat intra-word asterisks as bold", () => {
    expect(parseMrkdwn("foo*bar*baz")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", value: "foo*bar*baz" }],
      },
    ]);
  });

  it("rejects wrappers with whitespace just inside the delimiters", () => {
    expect(parseMrkdwn("* not bold *")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", value: "* not bold *" }],
      },
    ]);
  });

  it("supports nested formatting", () => {
    expect(parseMrkdwn("*bold _and italic_*")).toEqual([
      {
        type: "paragraph",
        children: [
          {
            type: "bold",
            children: [
              { type: "text", value: "bold " },
              {
                type: "italic",
                children: [{ type: "text", value: "and italic" }],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("mixes surrounding text with bold", () => {
    expect(parseMrkdwn("say *hi* now")).toEqual([
      {
        type: "paragraph",
        children: [
          { type: "text", value: "say " },
          { type: "bold", children: [{ type: "text", value: "hi" }] },
          { type: "text", value: " now" },
        ],
      },
    ]);
  });
});

describe("parseMrkdwn - code", () => {
  it("parses inline code", () => {
    expect(parseMrkdwn("run `npm test` please")).toEqual([
      {
        type: "paragraph",
        children: [
          { type: "text", value: "run " },
          { type: "code", value: "npm test" },
          { type: "text", value: " please" },
        ],
      },
    ]);
  });

  it("does not format content inside inline code", () => {
    expect(parseMrkdwn("`*not bold*`")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "code", value: "*not bold*" }],
      },
    ]);
  });

  it("decodes entities inside inline code", () => {
    expect(parseMrkdwn("`a &lt; b`")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "code", value: "a < b" }],
      },
    ]);
  });

  it("parses fenced code block spanning multiple lines", () => {
    const blocks = parseMrkdwn("before\n```\nconst x = 1;\nconst y = 2;\n```\nafter");
    expect(blocks).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", value: "before" }],
      },
      { type: "codeblock", value: "const x = 1;\nconst y = 2;" },
      {
        type: "paragraph",
        children: [{ type: "text", value: "after" }],
      },
    ]);
  });

  it("does not format content inside a fenced code block", () => {
    expect(parseMrkdwn("```*not bold* <@U1>```")).toEqual([
      { type: "codeblock", value: "*not bold* <@U1>" },
    ]);
  });
});

describe("parseMrkdwn - lists", () => {
  it("parses a flat bullet list", () => {
    expect(parseMrkdwn("- one\n- two")).toEqual([
      {
        type: "list",
        ordered: false,
        items: [
          { inlines: [{ type: "text", value: "one" }], children: [] },
          { inlines: [{ type: "text", value: "two" }], children: [] },
        ],
      },
    ]);
  });

  it("parses a flat ordered list", () => {
    expect(parseMrkdwn("1. one\n2. two")).toEqual([
      {
        type: "list",
        ordered: true,
        items: [
          { inlines: [{ type: "text", value: "one" }], children: [] },
          { inlines: [{ type: "text", value: "two" }], children: [] },
        ],
      },
    ]);
  });

  it("parses unicode bullet markers", () => {
    expect(parseMrkdwn("• one\n• two")).toEqual([
      {
        type: "list",
        ordered: false,
        items: [
          { inlines: [{ type: "text", value: "one" }], children: [] },
          { inlines: [{ type: "text", value: "two" }], children: [] },
        ],
      },
    ]);
  });

  it("parses nested lists based on indent", () => {
    const blocks = parseMrkdwn("1. first\n    a. nested one\n    b. nested two\n2. second");
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: true,
        items: [
          {
            inlines: [{ type: "text", value: "first" }],
            children: [
              {
                type: "list",
                ordered: true,
                items: [
                  {
                    inlines: [{ type: "text", value: "nested one" }],
                    children: [],
                  },
                  {
                    inlines: [{ type: "text", value: "nested two" }],
                    children: [],
                  },
                ],
              },
            ],
          },
          { inlines: [{ type: "text", value: "second" }], children: [] },
        ],
      },
    ]);
  });

  it("parses inline formatting inside list items", () => {
    expect(parseMrkdwn("- *bold* item")).toEqual([
      {
        type: "list",
        ordered: false,
        items: [
          {
            inlines: [
              {
                type: "bold",
                children: [{ type: "text", value: "bold" }],
              },
              { type: "text", value: " item" },
            ],
            children: [],
          },
        ],
      },
    ]);
  });

  it("separates paragraphs from lists", () => {
    expect(parseMrkdwn("intro\n- one\n- two\noutro")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", value: "intro" }],
      },
      {
        type: "list",
        ordered: false,
        items: [
          { inlines: [{ type: "text", value: "one" }], children: [] },
          { inlines: [{ type: "text", value: "two" }], children: [] },
        ],
      },
      {
        type: "paragraph",
        children: [{ type: "text", value: "outro" }],
      },
    ]);
  });
});

describe("parseMrkdwn - quotes", () => {
  it("parses a single-line quote", () => {
    expect(parseMrkdwn("> hello")).toEqual([
      {
        type: "quote",
        children: [{ type: "text", value: "hello" }],
      },
    ]);
  });

  it("parses multi-line consecutive quoted lines as one quote", () => {
    expect(parseMrkdwn("> line one\n> line two")).toEqual([
      {
        type: "quote",
        children: [{ type: "text", value: "line one\nline two" }],
      },
    ]);
  });

  it("accepts `&gt;` as a quote marker", () => {
    expect(parseMrkdwn("&gt; escaped quote")).toEqual([
      {
        type: "quote",
        children: [{ type: "text", value: "escaped quote" }],
      },
    ]);
  });

  it("separates paragraphs from quotes", () => {
    expect(parseMrkdwn("intro\n> quoted\ntail")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", value: "intro" }],
      },
      {
        type: "quote",
        children: [{ type: "text", value: "quoted" }],
      },
      {
        type: "paragraph",
        children: [{ type: "text", value: "tail" }],
      },
    ]);
  });

  it("parses inline formatting inside a quote", () => {
    expect(parseMrkdwn("> *bold* inside")).toEqual([
      {
        type: "quote",
        children: [
          { type: "bold", children: [{ type: "text", value: "bold" }] },
          { type: "text", value: " inside" },
        ],
      },
    ]);
  });
});

describe("parseMrkdwn - entities", () => {
  it("parses user mention without label", () => {
    expect(parseMrkdwn("<@U123>")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "user", id: "U123", label: undefined }],
      },
    ]);
  });

  it("parses user mention with label", () => {
    expect(parseMrkdwn("<@U123|alice>")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "user", id: "U123", label: "alice" }],
      },
    ]);
  });

  it("parses channel mention", () => {
    expect(parseMrkdwn("<#C123|general>")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "channel", id: "C123", label: "general" }],
      },
    ]);
  });

  it("parses usergroup mention", () => {
    expect(parseMrkdwn("<!subteam^S123|team>")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "usergroup", id: "S123", label: "team" }],
      },
    ]);
  });

  it("parses @here broadcast", () => {
    expect(parseMrkdwn("<!here>")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "broadcast", name: "here", label: undefined }],
      },
    ]);
  });

  it("parses @channel broadcast with label", () => {
    expect(parseMrkdwn("<!channel|channel>")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "broadcast", name: "channel", label: "channel" }],
      },
    ]);
  });

  it("parses bare URL link", () => {
    expect(parseMrkdwn("<https://example.com>")).toEqual([
      {
        type: "paragraph",
        children: [
          {
            type: "link",
            url: "https://example.com",
            children: [{ type: "text", value: "https://example.com" }],
          },
        ],
      },
    ]);
  });

  it("parses labeled URL link", () => {
    expect(parseMrkdwn("<https://example.com|Example>")).toEqual([
      {
        type: "paragraph",
        children: [
          {
            type: "link",
            url: "https://example.com",
            children: [{ type: "text", value: "Example" }],
          },
        ],
      },
    ]);
  });

  it("parses mailto link", () => {
    expect(parseMrkdwn("<mailto:foo@bar.com>")).toEqual([
      {
        type: "paragraph",
        children: [
          {
            type: "link",
            url: "mailto:foo@bar.com",
            children: [{ type: "text", value: "foo@bar.com" }],
          },
        ],
      },
    ]);
  });

  it("parses date entity with fallback", () => {
    expect(parseMrkdwn("<!date^1700000000^{date_short}|Nov 14, 2023>")).toEqual([
      {
        type: "paragraph",
        children: [
          {
            type: "date",
            timestamp: 1700000000,
            format: "{date_short}",
            link: undefined,
            fallback: "Nov 14, 2023",
          },
        ],
      },
    ]);
  });

  it("parses date entity with link and fallback", () => {
    expect(parseMrkdwn("<!date^1700000000^{date_short}^https://example.com|Nov 14, 2023>")).toEqual(
      [
        {
          type: "paragraph",
          children: [
            {
              type: "date",
              timestamp: 1700000000,
              format: "{date_short}",
              link: "https://example.com",
              fallback: "Nov 14, 2023",
            },
          ],
        },
      ],
    );
  });

  it("treats unknown angle-bracket content as literal text", () => {
    expect(parseMrkdwn("<notanentity>")).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", value: "<notanentity>" }],
      },
    ]);
  });
});

describe("parseMrkdwn - emoji", () => {
  it("parses emoji shortcodes", () => {
    expect(parseMrkdwn("hello :smile: world")).toEqual([
      {
        type: "paragraph",
        children: [
          { type: "text", value: "hello " },
          { type: "emoji", name: "smile" },
          { type: "text", value: " world" },
        ],
      },
    ]);
  });

  it("supports +1 and compound emoji names", () => {
    expect(parseMrkdwn(":+1: :woman-cartwheeling:")).toEqual([
      {
        type: "paragraph",
        children: [
          { type: "emoji", name: "+1" },
          { type: "text", value: " " },
          { type: "emoji", name: "woman-cartwheeling" },
        ],
      },
    ]);
  });
});

describe("parseMrkdwn - complex combinations", () => {
  it("parses a realistic Slack message", () => {
    const src =
      "Hey <@U123>, please review *PR #42* by <!date^1700000000^{date_short}|Nov 14>.\n" +
      "See <https://example.com|the docs> and ping <!subteam^S9|frontend> if blocked.\n" +
      "> quote about `code`";
    const blocks = parseMrkdwn(src);
    expect(blocks.length).toBe(2);
    expect(blocks[0].type).toBe("paragraph");
    expect(blocks[1].type).toBe("quote");
    // Paragraph should contain user, bold, date, link, usergroup
    const types = (blocks[0] as { children: { type: string }[] }).children.map((c) => c.type);
    expect(types).toContain("user");
    expect(types).toContain("bold");
    expect(types).toContain("date");
    expect(types).toContain("link");
    expect(types).toContain("usergroup");
  });
});

describe("Mrkdwn JSX renderer", () => {
  const render = (text: string, options?: Parameters<typeof Mrkdwn>[0]["options"]) =>
    String(Mrkdwn({ text, options }));

  it("renders bold as <strong>", () => {
    expect(render("*bold*")).toContain("<strong>bold</strong>");
  });

  it("renders italic as <em>", () => {
    expect(render("_em_")).toContain("<em>em</em>");
  });

  it("renders strikethrough as <del>", () => {
    expect(render("~gone~")).toContain("<del>gone</del>");
  });

  it("renders inline code as <code>", () => {
    expect(render("`x`")).toContain("<code");
    expect(render("`x`")).toContain(">x</code>");
  });

  it("renders code block as <pre><code>", () => {
    const html = render("```\nfoo\n```");
    expect(html).toContain("<pre");
    expect(html).toContain("<code>");
    expect(html).toContain("foo");
  });

  it("renders a quote as <blockquote>", () => {
    expect(render("> hi")).toContain("<blockquote");
  });

  it("renders a link with href and rel=noopener", () => {
    const html = render("<https://example.com|Example>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(">Example");
  });

  it("renders a user mention using the provided users map", () => {
    const html = render("<@U123>", { users: { U123: "alice" } });
    expect(html).toContain("@alice");
  });

  it("prefers the inline label over the users map for a user mention", () => {
    const html = render("<@U123|bob>", { users: { U123: "alice" } });
    expect(html).toContain("@bob");
    expect(html).not.toContain("@alice");
  });

  it("renders channel mention with leading #", () => {
    const html = render("<#C1|general>");
    expect(html).toContain("#general");
  });

  it("renders @here broadcast", () => {
    const html = render("<!here>");
    expect(html).toContain("@here");
  });

  it("escapes HTML-unsafe characters in plain text", () => {
    const html = render("1 &lt; 2 and 3 &gt; 2");
    expect(html).toContain("1 &lt; 2 and 3 &gt; 2");
    // No raw `<` from user text should end up in output
    expect(html).not.toContain("1 < 2");
  });

  it("escapes HTML-unsafe characters injected directly", () => {
    const html = render("<script>alert(1)</script>");
    // `<script>` is not a recognized entity so it becomes literal text and must be escaped
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders javascript: link as plain text", () => {
    const html = render("<javascript:alert(1)|click me>");
    expect(html).not.toContain("href");
    expect(html).toContain("click me");
  });

  it("renders data: link as plain text", () => {
    const html = render("<data:text/html,<script>alert(1)</script>|payload>");
    expect(html).not.toContain("href");
    expect(html).toContain("payload");
  });

  it("renders vbscript: link as plain text", () => {
    const html = render("<vbscript:MsgBox(1)|click>");
    expect(html).not.toContain("href");
    expect(html).toContain("click");
  });

  it("allows https: links", () => {
    const html = render("<https://example.com|safe>");
    expect(html).toContain('href="https://example.com"');
  });

  it("allows mailto: links", () => {
    const html = render("<mailto:a@b.com|email>");
    expect(html).toContain('href="mailto:a@b.com"');
  });

  it("renders unicode emoji when resolved", () => {
    const html = render(":thumbsup:", {
      emoji: { thumbsup: { type: "unicode", value: "👍" } },
    });
    expect(html).toContain("👍");
    expect(html).not.toContain(":thumbsup:");
  });

  it("renders custom emoji as img when resolved to URL", () => {
    const html = render(":partyparrot:", {
      emoji: {
        partyparrot: {
          type: "url",
          value: "https://emoji.slack-edge.com/partyparrot.gif",
        },
      },
    });
    expect(html).toContain("<img");
    expect(html).toContain('src="https://emoji.slack-edge.com/partyparrot.gif"');
    expect(html).toContain('alt=":partyparrot:"');
  });

  it("falls back to raw shortcode when emoji is not resolved", () => {
    const html = render(":unknown_emoji:");
    expect(html).toContain(":unknown_emoji:");
  });
});
