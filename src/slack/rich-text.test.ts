import { describe, expect, test } from "bun:test";
import { blocksToMrkdwn } from "./rich-text";

describe("blocksToMrkdwn", () => {
  test("returns null for non-array input", () => {
    expect(blocksToMrkdwn(undefined)).toBeNull();
    expect(blocksToMrkdwn(null)).toBeNull();
    expect(blocksToMrkdwn("not blocks")).toBeNull();
  });

  test("returns null when blocks contain no rich_text", () => {
    expect(blocksToMrkdwn([{ type: "section", text: { type: "mrkdwn", text: "x" } }])).toBeNull();
  });

  test("renders a plain section as-is", () => {
    const out = blocksToMrkdwn([
      {
        type: "rich_text",
        elements: [
          {
            type: "rich_text_section",
            elements: [{ type: "text", text: "hello world" }],
          },
        ],
      },
    ]);
    expect(out).toBe("hello world");
  });

  test("applies bold/italic/strike/code style markers", () => {
    const out = blocksToMrkdwn([
      {
        type: "rich_text",
        elements: [
          {
            type: "rich_text_section",
            elements: [
              { type: "text", text: "plain " },
              { type: "text", text: "bold", style: { bold: true } },
              { type: "text", text: " " },
              { type: "text", text: "italic", style: { italic: true } },
              { type: "text", text: " " },
              { type: "text", text: "strike", style: { strike: true } },
              { type: "text", text: " " },
              { type: "text", text: "code", style: { code: true } },
            ],
          },
        ],
      },
    ]);
    expect(out).toBe("plain *bold* _italic_ ~strike~ `code`");
  });

  test("preserves leading/trailing whitespace outside wrappers", () => {
    const out = blocksToMrkdwn([
      {
        type: "rich_text",
        elements: [
          {
            type: "rich_text_section",
            elements: [{ type: "text", text: " bold ", style: { bold: true } }],
          },
        ],
      },
    ]);
    expect(out).toBe(" *bold* ");
  });

  test("renders user, channel, usergroup, broadcast mentions", () => {
    const out = blocksToMrkdwn([
      {
        type: "rich_text",
        elements: [
          {
            type: "rich_text_section",
            elements: [
              { type: "user", user_id: "U1" },
              { type: "text", text: " " },
              { type: "channel", channel_id: "C1" },
              { type: "text", text: " " },
              { type: "usergroup", usergroup_id: "S1" },
              { type: "text", text: " " },
              { type: "broadcast", range: "here" },
            ],
          },
        ],
      },
    ]);
    expect(out).toBe("<@U1> <#C1> <!subteam^S1> <!here>");
  });

  test("renders links with and without labels", () => {
    const out = blocksToMrkdwn([
      {
        type: "rich_text",
        elements: [
          {
            type: "rich_text_section",
            elements: [
              { type: "link", url: "https://example.com" },
              { type: "text", text: " " },
              { type: "link", url: "https://example.com", text: "example" },
            ],
          },
        ],
      },
    ]);
    expect(out).toBe("<https://example.com> <https://example.com|example>");
  });

  test("renders ordered list with items", () => {
    const out = blocksToMrkdwn([
      {
        type: "rich_text",
        elements: [
          {
            type: "rich_text_list",
            style: "ordered",
            indent: 0,
            elements: [
              {
                type: "rich_text_section",
                elements: [{ type: "text", text: "first" }],
              },
              {
                type: "rich_text_section",
                elements: [{ type: "text", text: "second" }],
              },
            ],
          },
        ],
      },
    ]);
    expect(out).toBe("1. first\n2. second");
  });

  test("renders bullet list with indent", () => {
    const out = blocksToMrkdwn([
      {
        type: "rich_text",
        elements: [
          {
            type: "rich_text_list",
            style: "bullet",
            indent: 1,
            elements: [
              {
                type: "rich_text_section",
                elements: [{ type: "text", text: "nested" }],
              },
            ],
          },
        ],
      },
    ]);
    expect(out).toBe("  - nested");
  });

  test("renders quote block with > prefix per line", () => {
    const out = blocksToMrkdwn([
      {
        type: "rich_text",
        elements: [
          {
            type: "rich_text_quote",
            elements: [{ type: "text", text: "line one\nline two" }],
          },
        ],
      },
    ]);
    expect(out).toBe("> line one\n> line two");
  });

  test("renders preformatted code block with fence", () => {
    const out = blocksToMrkdwn([
      {
        type: "rich_text",
        elements: [
          {
            type: "rich_text_preformatted",
            elements: [{ type: "text", text: "const x = 1;" }],
          },
        ],
      },
    ]);
    expect(out).toBe("```\nconst x = 1;\n```");
  });

  test("combines sections, lists, and quotes", () => {
    const out = blocksToMrkdwn([
      {
        type: "rich_text",
        elements: [
          {
            type: "rich_text_section",
            elements: [{ type: "text", text: "Title", style: { bold: true } }],
          },
          {
            type: "rich_text_list",
            style: "ordered",
            indent: 0,
            elements: [
              {
                type: "rich_text_section",
                elements: [{ type: "text", text: "item one" }],
              },
              {
                type: "rich_text_section",
                elements: [
                  { type: "text", text: "item " },
                  { type: "text", text: "two", style: { italic: true } },
                ],
              },
            ],
          },
          {
            type: "rich_text_quote",
            elements: [{ type: "text", text: "quoted" }],
          },
        ],
      },
    ]);
    expect(out).toBe("*Title*\n1. item one\n2. item _two_\n> quoted");
  });

  test("renders emoji shortcodes", () => {
    const out = blocksToMrkdwn([
      {
        type: "rich_text",
        elements: [
          {
            type: "rich_text_section",
            elements: [
              { type: "text", text: "nice " },
              { type: "emoji", name: "tada" },
            ],
          },
        ],
      },
    ]);
    expect(out).toBe("nice :tada:");
  });
});
