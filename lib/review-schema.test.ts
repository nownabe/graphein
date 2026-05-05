import { describe, expect, it } from "bun:test";
import { CODE_REVIEW_JSON_SCHEMA, REVIEW_PROMPT } from "./review-schema.ts";

describe("CODE_REVIEW_JSON_SCHEMA", () => {
  it("has the correct top-level required fields", () => {
    expect(CODE_REVIEW_JSON_SCHEMA.required).toEqual([
      "schema_version",
      "status",
      "summary",
      "comment_markdown",
      "reviewed_ref",
      "findings",
    ]);
  });

  it("schema_version is fixed to 1.0", () => {
    expect(CODE_REVIEW_JSON_SCHEMA.properties.schema_version.const).toBe("1.0");
  });

  it("status only allows approved or changes_requested", () => {
    expect(CODE_REVIEW_JSON_SCHEMA.properties.status.enum).toEqual([
      "approved",
      "changes_requested",
    ]);
  });

  it("findings items have correct required fields", () => {
    expect(CODE_REVIEW_JSON_SCHEMA.properties.findings.items.required).toEqual([
      "title",
      "severity",
      "category",
      "description",
      "suggested_fix",
      "confidence",
      "location",
      "snippet",
    ]);
  });

  it("severity enum includes high, medium, low", () => {
    expect(CODE_REVIEW_JSON_SCHEMA.properties.findings.items.properties.severity.enum).toEqual([
      "high",
      "medium",
      "low",
    ]);
  });

  it("category enum includes expected values", () => {
    expect(CODE_REVIEW_JSON_SCHEMA.properties.findings.items.properties.category.enum).toEqual([
      "correctness",
      "regression",
      "security",
      "performance",
      "reliability",
      "missing_test",
    ]);
  });

  it("disallows additional properties at top level", () => {
    expect(CODE_REVIEW_JSON_SCHEMA.additionalProperties).toBe(false);
  });

  it("disallows additional properties in findings items", () => {
    expect(CODE_REVIEW_JSON_SCHEMA.properties.findings.items.additionalProperties).toBe(false);
  });

  it("reviewed_ref requires base and head", () => {
    expect(CODE_REVIEW_JSON_SCHEMA.properties.reviewed_ref.required).toEqual(["base", "head"]);
  });

  it("location requires path, line, and end_line", () => {
    expect(CODE_REVIEW_JSON_SCHEMA.properties.findings.items.properties.location.required).toEqual([
      "path",
      "line",
      "end_line",
    ]);
  });
});

describe("REVIEW_PROMPT", () => {
  it("contains {base} placeholder for replacement", () => {
    expect(REVIEW_PROMPT).toContain("{base}");
  });

  it("includes instructions for evaluating correctness", () => {
    expect(REVIEW_PROMPT).toContain("Correctness");
  });

  it("includes instructions for evaluating security", () => {
    expect(REVIEW_PROMPT).toContain("Security");
  });

  it("includes instructions for evaluating performance", () => {
    expect(REVIEW_PROMPT).toContain("Performance");
  });

  it("includes instructions for evaluating test coverage", () => {
    expect(REVIEW_PROMPT).toContain("Test coverage");
  });

  it("includes git diff instruction", () => {
    expect(REVIEW_PROMPT).toContain("git diff {base}...HEAD");
  });

  it("includes output format instructions", () => {
    expect(REVIEW_PROMPT).toContain("schema_version");
    expect(REVIEW_PROMPT).toContain("findings");
    expect(REVIEW_PROMPT).toContain("comment_markdown");
  });

  it("replaceAll {base} works correctly", () => {
    const replaced = REVIEW_PROMPT.replaceAll("{base}", "develop");
    expect(replaced).not.toContain("{base}");
    expect(replaced).toContain("develop");
  });
});
