import { describe, expect, it } from "bun:test";
import { hydrateMentionLabels, type MentionLabelResolver } from "./helpers";

function makeResolver(data: {
  users?: Record<string, string>;
  channels?: Record<string, string>;
  usergroups?: Record<string, string>;
}): MentionLabelResolver & { calls: { user: string[]; channel: string[]; usergroup: string[] } } {
  const calls = { user: [] as string[], channel: [] as string[], usergroup: [] as string[] };
  return {
    calls,
    async user(id) {
      calls.user.push(id);
      return data.users?.[id];
    },
    async channel(id) {
      calls.channel.push(id);
      return data.channels?.[id];
    },
    async usergroup(id) {
      calls.usergroup.push(id);
      return data.usergroups?.[id];
    },
  };
}

describe("hydrateMentionLabels", () => {
  it("rewrites an unlabeled user mention with a display label", async () => {
    const resolver = makeResolver({ users: { U123: "alice" } });
    const out = await hydrateMentionLabels("hi <@U123>", resolver);
    expect(out).toBe("hi <@U123|alice>");
  });

  it("rewrites an unlabeled channel mention", async () => {
    const resolver = makeResolver({ channels: { C123: "general" } });
    const out = await hydrateMentionLabels("see <#C123>", resolver);
    expect(out).toBe("see <#C123|general>");
  });

  it("rewrites an unlabeled usergroup mention", async () => {
    const resolver = makeResolver({ usergroups: { S123: "frontend" } });
    const out = await hydrateMentionLabels("ping <!subteam^S123>", resolver);
    expect(out).toBe("ping <!subteam^S123|frontend>");
  });

  it("leaves already-labeled entities untouched", async () => {
    const resolver = makeResolver({
      users: { U1: "alice" },
      channels: { C1: "general" },
      usergroups: { S1: "fe" },
    });
    const input = "<@U1|bob> <#C1|random> <!subteam^S1|team>";
    const out = await hydrateMentionLabels(input, resolver);
    expect(out).toBe(input);
    // And the resolver should not have been called since nothing is unlabeled
    expect(resolver.calls.user).toEqual([]);
    expect(resolver.calls.channel).toEqual([]);
    expect(resolver.calls.usergroup).toEqual([]);
  });

  it("leaves mentions untouched when the resolver returns undefined", async () => {
    const resolver = makeResolver({});
    const out = await hydrateMentionLabels(
      "<@U1> <#C1> <!subteam^S1>",
      resolver,
    );
    expect(out).toBe("<@U1> <#C1> <!subteam^S1>");
  });

  it("deduplicates repeated mentions into a single resolver call per id", async () => {
    const resolver = makeResolver({
      users: { U1: "alice" },
      channels: { C1: "general" },
      usergroups: { S1: "fe" },
    });
    const input =
      "<@U1> and <@U1> in <#C1> and <#C1>, cc <!subteam^S1> <!subteam^S1>";
    const out = await hydrateMentionLabels(input, resolver);
    expect(out).toBe(
      "<@U1|alice> and <@U1|alice> in <#C1|general> and <#C1|general>, cc <!subteam^S1|fe> <!subteam^S1|fe>",
    );
    expect(resolver.calls.user).toEqual(["U1"]);
    expect(resolver.calls.channel).toEqual(["C1"]);
    expect(resolver.calls.usergroup).toEqual(["S1"]);
  });

  it("handles a realistic mixed message", async () => {
    const resolver = makeResolver({
      users: { U1: "alice", U2: "bob" },
      channels: { C1: "general" },
      usergroups: { S1: "frontend" },
    });
    const input =
      "Hey <@U1> and <@U2>, please post in <#C1>. cc <!subteam^S1>. Deadline <!date^1700000000^{date_short}|Nov 14>.";
    const out = await hydrateMentionLabels(input, resolver);
    expect(out).toBe(
      "Hey <@U1|alice> and <@U2|bob>, please post in <#C1|general>. cc <!subteam^S1|frontend>. Deadline <!date^1700000000^{date_short}|Nov 14>.",
    );
  });

  it("returns the input unchanged when there are no entities", async () => {
    const resolver = makeResolver({});
    expect(await hydrateMentionLabels("plain text", resolver)).toBe(
      "plain text",
    );
  });
});
