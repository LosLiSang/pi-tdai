import { describe, expect, it } from "vitest";
import {
  buildSessionId,
  collectCaptureBatch,
  CURSOR_ENTRY_TYPE,
  restoreCursor,
} from "../src/session.js";

describe("session capture", () => {
  it("starts from the current tail when no cursor marker exists", () => {
    const entries = [
      { type: "message", id: "u1", message: { role: "user", content: "old", timestamp: 1 } },
      { type: "message", id: "a1", message: { role: "assistant", content: [{ type: "text", text: "old reply" }], timestamp: 2 } },
    ];
    expect(restoreCursor(entries)).toBe("a1");
  });

  it("restores a persisted cursor marker", () => {
    const entries = [
      { type: "message", id: "a1", message: { role: "assistant", content: "old" } },
      {
        type: "custom",
        id: "c1",
        customType: CURSOR_ENTRY_TYPE,
        data: { lastMessageEntryId: "a1" },
      },
      { type: "message", id: "u2", message: { role: "user", content: "new" } },
    ];
    expect(restoreCursor(entries)).toBe("a1");
  });

  it("collects only new successful user/assistant messages", () => {
    const entries = [
      { type: "message", id: "a1", message: { role: "assistant", content: "old", timestamp: 1 } },
      { type: "message", id: "u2", message: { role: "user", content: "remember this", timestamp: 2 } },
      { type: "message", id: "t1", message: { role: "toolResult", content: "ignored", timestamp: 3 } },
      {
        type: "message",
        id: "a2",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "answer\n```ts\nconst secret = 1\n```" }],
          stopReason: "stop",
          timestamp: 4,
        },
      },
    ];

    const batch = collectCaptureBatch(entries, "a1", true);
    expect(batch.lastMessageEntryId).toBe("a2");
    expect(batch.hasSuccessfulAssistant).toBe(true);
    expect(batch.messages).toEqual([
      { role: "user", content: "remember this", timestamp: new Date(2).toISOString() },
      { role: "assistant", content: "answer", timestamp: new Date(4).toISOString() },
    ]);
  });

  it("does not finalize a batch that only contains an errored assistant", () => {
    const batch = collectCaptureBatch([
      { type: "message", id: "u1", message: { role: "user", content: "hello", timestamp: 1 } },
      {
        type: "message",
        id: "a1",
        message: { role: "assistant", content: "failed", stopReason: "error", timestamp: 2 },
      },
    ], undefined, true);

    expect(batch.hasSuccessfulAssistant).toBe(false);
  });

  it("builds a namespaced remote session id", () => {
    expect(buildSessionId("pi", "abc")).toBe("pi:abc");
    expect(buildSessionId("", "abc")).toBe("abc");
  });
});
