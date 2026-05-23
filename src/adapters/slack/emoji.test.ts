import { describe, expect, it } from "bun:test";
import {
  resolveStandardEmoji,
  resolveEmoji,
  resolveEmojiMap,
  createCustomEmojiResolver,
} from "./emoji";

describe("resolveStandardEmoji", () => {
  it("resolves common emoji shortcodes", () => {
    expect(resolveStandardEmoji("smile")).toBe("😄");
    expect(resolveStandardEmoji("thumbsup")).toBe("👍");
    expect(resolveStandardEmoji("+1")).toBe("👍");
    expect(resolveStandardEmoji("rocket")).toBe("🚀");
    expect(resolveStandardEmoji("heart")).toBe("❤️");
  });

  it("returns undefined for unknown shortcodes", () => {
    expect(resolveStandardEmoji("not_a_real_emoji_xyz")).toBeUndefined();
  });

  it("resolves compound emoji names with underscores", () => {
    expect(resolveStandardEmoji("woman_cartwheeling")).toBe("🤸‍♀️");
  });

  it("resolves hyphenated Slack emoji names by normalizing to underscores", () => {
    expect(resolveStandardEmoji("woman-cartwheeling")).toBe("🤸‍♀️");
    // Verify the hyphen form returns the same result as the underscore form
    expect(resolveStandardEmoji("woman-cartwheeling")).toBe(
      resolveStandardEmoji("woman_cartwheeling"),
    );
  });
});

describe("resolveEmoji", () => {
  it("resolves standard emoji without custom resolver", async () => {
    const result = await resolveEmoji("rocket");
    expect(result).toEqual({ type: "unicode", value: "🚀" });
  });

  it("falls back to custom resolver for unknown names", async () => {
    const customResolver = async (name: string) =>
      name === "partyparrot" ? "https://emoji.example.com/partyparrot.gif" : undefined;

    const result = await resolveEmoji("partyparrot", customResolver);
    expect(result).toEqual({
      type: "url",
      value: "https://emoji.example.com/partyparrot.gif",
    });
  });

  it("returns undefined when nothing resolves", async () => {
    const result = await resolveEmoji("totally_unknown");
    expect(result).toBeUndefined();
  });

  it("prefers standard emoji over custom resolver", async () => {
    const customResolver = async (_name: string) => "https://example.com/custom.png";

    const result = await resolveEmoji("rocket", customResolver);
    expect(result).toEqual({ type: "unicode", value: "🚀" });
  });
});

describe("resolveEmojiMap", () => {
  it("batch-resolves multiple emoji", async () => {
    const customResolver = async (name: string) =>
      name === "custom" ? "https://example.com/custom.png" : undefined;

    const result = await resolveEmojiMap(["rocket", "custom", "unknown"], customResolver);
    expect(result.rocket).toEqual({ type: "unicode", value: "🚀" });
    expect(result.custom).toEqual({ type: "url", value: "https://example.com/custom.png" });
    expect(result.unknown).toBeUndefined();
  });
});

describe("createCustomEmojiResolver", () => {
  it("calls emoji.list only once for concurrent lookups", async () => {
    let listCallCount = 0;
    const fakeClient = {
      emoji: {
        list: async () => {
          listCallCount++;
          return {
            emoji: {
              partyparrot: "https://emoji.example.com/partyparrot.gif",
              shipit_custom: "https://emoji.example.com/shipit.png",
            },
          };
        },
      },
    };

    const resolver = createCustomEmojiResolver(fakeClient as never);
    const [a, b] = await Promise.all([resolver("partyparrot"), resolver("shipit_custom")]);

    expect(a).toBe("https://emoji.example.com/partyparrot.gif");
    expect(b).toBe("https://emoji.example.com/shipit.png");
    expect(listCallCount).toBe(1);
  });
});
