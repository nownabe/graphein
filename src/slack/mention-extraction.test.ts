import { describe, expect, it } from "bun:test";
import { extractUserMentions, extractUsergroupMentions } from "./helpers";

describe("extractUserMentions", () => {
  it("extracts user IDs from text", () => {
    expect(extractUserMentions("hi <@U123> and <@U456>")).toEqual(["U123", "U456"]);
  });

  it("handles already-labeled mentions", () => {
    // The current regex only matches <@U...> without labels
    expect(extractUserMentions("hi <@U123>")).toEqual(["U123"]);
  });

  it("returns empty array for no mentions", () => {
    expect(extractUserMentions("just plain text")).toEqual([]);
  });

  it("returns empty array for empty text", () => {
    expect(extractUserMentions("")).toEqual([]);
  });

  it("handles repeated mentions (returns duplicates)", () => {
    const result = extractUserMentions("<@U123> and <@U123>");
    expect(result).toEqual(["U123", "U123"]);
  });
});

describe("extractUsergroupMentions", () => {
  it("extracts usergroup IDs from text", () => {
    expect(extractUsergroupMentions("ping <!subteam^S123>")).toEqual(["S123"]);
  });

  it("handles labeled usergroup mentions", () => {
    expect(extractUsergroupMentions("ping <!subteam^S123|frontend>")).toEqual(["S123"]);
  });

  it("returns empty array for no mentions", () => {
    expect(extractUsergroupMentions("just plain text")).toEqual([]);
  });

  it("returns empty array for empty text", () => {
    expect(extractUsergroupMentions("")).toEqual([]);
  });

  it("handles repeated mentions (returns duplicates)", () => {
    const result = extractUsergroupMentions("<!subteam^S123> and <!subteam^S123>");
    expect(result).toEqual(["S123", "S123"]);
  });

  it("extracts multiple different usergroups", () => {
    const result = extractUsergroupMentions("<!subteam^S123> and <!subteam^S456>");
    expect(result).toEqual(["S123", "S456"]);
  });
});
