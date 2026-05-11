import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { CodeReviewResult } from "./review-schema.ts";

const APPROVED_RESULT: CodeReviewResult = {
  schema_version: "1.0",
  status: "approved",
  summary: "All changes look good.",
  comment_markdown: "LGTM",
  reviewed_ref: { base: "main", head: "abc123" },
  findings: [],
};

const CHANGES_REQUESTED_RESULT: CodeReviewResult = {
  schema_version: "1.0",
  status: "changes_requested",
  summary: "Found an issue.",
  comment_markdown: "Please fix the bug.",
  reviewed_ref: { base: "main", head: "def456" },
  findings: [
    {
      title: "Off-by-one error",
      severity: "high",
      category: "correctness",
      description: "Loop goes one past the end.",
      suggested_fix: "Use < instead of <=",
      confidence: "high",
      location: { path: "src/index.ts", line: 10, end_line: 10 },
      snippet: "for (let i = 0; i <= arr.length; i++)",
    },
  ],
};

function mockSpawn(stdout: string, exitCode = 0, stderr = "") {
  return spyOn(Bun, "spawn").mockImplementation(
    () =>
      ({
        stdout: new Response(stdout).body,
        stderr: new Response(stderr).body,
        exited: Promise.resolve(exitCode),
        kill: mock(),
      }) as any,
  );
}

describe("reviewByClaude", () => {
  let spawnSpy: ReturnType<typeof mockSpawn>;

  afterEach(() => {
    spawnSpy?.mockRestore();
  });

  it("returns structured_output from the Claude CLI envelope", async () => {
    const envelope = JSON.stringify({ structured_output: APPROVED_RESULT });
    spawnSpy = mockSpawn(envelope);

    const { reviewByClaude } = await import("./review-by-claude.ts");
    const result = await reviewByClaude();

    expect(result).toEqual(APPROVED_RESULT);
  });

  it("passes correct arguments to claude CLI", async () => {
    const envelope = JSON.stringify({ structured_output: APPROVED_RESULT });
    spawnSpy = mockSpawn(envelope);

    const { reviewByClaude } = await import("./review-by-claude.ts");
    await reviewByClaude({ base: "develop" });

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const args = spawnSpy.mock.calls[0][0] as string[];
    expect(args[0]).toBe("claude");
    expect(args[1]).toBe("-p");
    expect(args[2]).toContain("develop");
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
    expect(args).toContain("--json-schema");
  });

  it("throws when CLI exits with non-zero code", async () => {
    spawnSpy = mockSpawn("", 1, "auth error");

    const { reviewByClaude } = await import("./review-by-claude.ts");
    await expect(reviewByClaude()).rejects.toThrow("claude CLI exited with code 1: auth error");
  });

  it("throws when structured_output is missing from envelope", async () => {
    const envelope = JSON.stringify({ result: "something else" });
    spawnSpy = mockSpawn(envelope);

    const { reviewByClaude } = await import("./review-by-claude.ts");
    await expect(reviewByClaude()).rejects.toThrow("missing structured_output");
  });

  it("handles changes_requested results with findings", async () => {
    const envelope = JSON.stringify({ structured_output: CHANGES_REQUESTED_RESULT });
    spawnSpy = mockSpawn(envelope);

    const { reviewByClaude } = await import("./review-by-claude.ts");
    const result = await reviewByClaude();

    expect(result.status).toBe("changes_requested");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].title).toBe("Off-by-one error");
  });

  it("defaults base to main when not specified", async () => {
    const envelope = JSON.stringify({ structured_output: APPROVED_RESULT });
    spawnSpy = mockSpawn(envelope);

    const { reviewByClaude } = await import("./review-by-claude.ts");
    await reviewByClaude();

    const args = spawnSpy.mock.calls[0][0] as string[];
    const prompt = args[2];
    expect(prompt).toContain("main");
  });

  it("passes cwd option to spawn", async () => {
    const envelope = JSON.stringify({ structured_output: APPROVED_RESULT });
    spawnSpy = mockSpawn(envelope);

    const { reviewByClaude } = await import("./review-by-claude.ts");
    await reviewByClaude({ cwd: "/tmp/repo" });

    const spawnOpts = spawnSpy.mock.calls[0][1] as any;
    expect(spawnOpts.cwd).toBe("/tmp/repo");
  });
});
