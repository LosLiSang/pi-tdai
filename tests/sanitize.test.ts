import { describe, expect, it } from "vitest";
import {
  MAX_SEARCH_QUERY_CHARS,
  sanitizeSearchQuery,
  stripCodeBlocks,
  isTrivialPrompt,
} from "../src/sanitize.js";

describe("sanitizeSearchQuery", () => {
  it("truncates queries longer than MAX_SEARCH_QUERY_CHARS", () => {
    const longText = "a".repeat(5000);
    const result = sanitizeSearchQuery(longText);
    expect(result.length).toBe(MAX_SEARCH_QUERY_CHARS);
    expect(result).toBe("a".repeat(MAX_SEARCH_QUERY_CHARS));
  });

  it("strips code blocks when natural language text is present", () => {
    const prompt = "请分析这段代码：\n```typescript\nconst a = 1;\nconst b = 2;\n```\n并且给出优化建议。";
    const result = sanitizeSearchQuery(prompt);
    expect(result).toContain("请分析这段代码：");
    expect(result).toContain("并且给出优化建议。");
    expect(result).not.toContain("const a = 1");
  });

  it("falls back to raw code when only code blocks exist", () => {
    const codeOnly = "```typescript\nconsole.log('hello world');\n```";
    const result = sanitizeSearchQuery(codeOnly);
    expect(result).toBe("```typescript\nconsole.log('hello world');\n```");
  });

  it("strips tenant memory context tags from query", () => {
    const prompt = "<tenant-memory-context>old memory</tenant-memory-context>what is my project status?";
    const result = sanitizeSearchQuery(prompt);
    expect(result).toBe("what is my project status?");
  });

  it("returns empty string for blank input", () => {
    expect(sanitizeSearchQuery("")).toBe("");
    expect(sanitizeSearchQuery("   \n\t  ")).toBe("");
  });
});

describe("isTrivialPrompt", () => {
  it("identifies short conversational acknowledgments as trivial", () => {
    expect(isTrivialPrompt("ok")).toBe(true);
    expect(isTrivialPrompt("OK")).toBe(true);
    expect(isTrivialPrompt("yes")).toBe(true);
    expect(isTrivialPrompt("好的")).toBe(true);
    expect(isTrivialPrompt("继续")).toBe(true);
    expect(isTrivialPrompt("1")).toBe(true);
    expect(isTrivialPrompt("？")).toBe(true);
  });

  it("keeps meaningful questions as non-trivial", () => {
    expect(isTrivialPrompt("如何配置数据库")).toBe(false);
    expect(isTrivialPrompt("fix the bug in auth.ts")).toBe(false);
    expect(isTrivialPrompt("继续把单元测试写完")).toBe(false);
  });
});
