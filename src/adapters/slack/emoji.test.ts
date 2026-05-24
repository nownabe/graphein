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

  it("resolves custom alias to standard emoji as unicode type", async () => {
    // When a custom emoji is an alias to a standard emoji, the custom resolver
    // returns the unicode character. resolveEmoji should wrap it as unicode type.
    const customResolver = async (name: string) => (name === "custom_thumbsup" ? "👍" : undefined);

    const result = await resolveEmoji("custom_thumbsup", customResolver);
    expect(result).toEqual({ type: "unicode", value: "👍" });
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

  it("resolves custom emoji via Slack API (emoji.list) end-to-end", async () => {
    let apiCalled = false;
    const fakeClient = {
      emoji: {
        list: async () => {
          apiCalled = true;
          return {
            emoji: {
              partyparrot: "https://emoji.slack-edge.com/T123/partyparrot/abc.gif",
              my_thumbsup: "alias:thumbsup",
            },
          };
        },
      },
    };

    const customResolver = createCustomEmojiResolver(fakeClient as never);
    const result = await resolveEmojiMap(
      ["rocket", "partyparrot", "my_thumbsup", "unknown"],
      customResolver,
    );

    expect(apiCalled).toBe(true);
    // Standard emoji resolved via gemoji
    expect(result.rocket).toEqual({ type: "unicode", value: "🚀" });
    // Custom emoji resolved via Slack API → image URL
    expect(result.partyparrot).toEqual({
      type: "url",
      value: "https://emoji.slack-edge.com/T123/partyparrot/abc.gif",
    });
    // Custom alias to standard emoji → unicode
    expect(result.my_thumbsup).toEqual({ type: "unicode", value: "👍" });
    // Unknown emoji not resolved
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

  it("resolves alias to another custom emoji", async () => {
    const fakeClient = {
      emoji: {
        list: async () => ({
          emoji: {
            my_parrot: "alias:partyparrot",
            partyparrot: "https://emoji.example.com/partyparrot.gif",
          },
        }),
      },
    };

    const resolver = createCustomEmojiResolver(fakeClient as never);
    const result = await resolver("my_parrot");
    expect(result).toBe("https://emoji.example.com/partyparrot.gif");
  });

  it("resolves alias to a standard emoji by returning the unicode value", async () => {
    const fakeClient = {
      emoji: {
        list: async () => ({
          emoji: {
            custom_thumbsup: "alias:thumbsup",
          },
        }),
      },
    };

    const resolver = createCustomEmojiResolver(fakeClient as never);
    const result = await resolver("custom_thumbsup");
    expect(result).toBe("👍");
  });

  it("resolves custom emoji with URL via emoji.list API call", async () => {
    let apiCalled = false;
    const fakeClient = {
      emoji: {
        list: async () => {
          apiCalled = true;
          return {
            emoji: {
              partyparrot: "https://emoji.slack-edge.com/T123/partyparrot/abc.gif",
              company_logo: "https://emoji.slack-edge.com/T123/company_logo/def.png",
            },
          };
        },
      },
    };

    const resolver = createCustomEmojiResolver(fakeClient as never);
    const result = await resolver("partyparrot");

    expect(apiCalled).toBe(true);
    expect(result).toBe("https://emoji.slack-edge.com/T123/partyparrot/abc.gif");
  });

  it("retries emoji.list after a transient failure", async () => {
    let callCount = 0;
    const fakeClient = {
      emoji: {
        list: async () => {
          callCount++;
          if (callCount === 1) throw new Error("transient");
          return { emoji: { custom: "https://emoji.example.com/custom.gif" } };
        },
      },
    };

    const resolver = createCustomEmojiResolver(fakeClient as never);

    // First call fails — should return undefined, not cache the failure.
    const first = await resolver("custom");
    expect(first).toBeUndefined();
    expect(callCount).toBe(1);

    // Second call retries the API and succeeds.
    const second = await resolver("custom");
    expect(second).toBe("https://emoji.example.com/custom.gif");
    expect(callCount).toBe(2);
  });
});
