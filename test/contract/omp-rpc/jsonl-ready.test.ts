import { describe, expect, it } from "vitest";
import {
  MAX_INITIAL_FRAME_BYTES,
  OmpRpcJsonlDecoder,
  OmpRpcReadyGate,
  parseReadyFrame,
} from "../../../src/runtime/omp/frames.js";

const ready = {
  type: "ready",
  protocolVersion: 1,
  supportedProtocolVersions: [1, 2],
  maxFrameBytes: 1_048_576,
  maxReassembledFrameBytes: 67_108_864,
};

function jsonBytes(value: unknown): Uint8Array {
  return Buffer.from(`${JSON.stringify(value)}\n`);
}

describe("OMP RPC incremental JSONL decoder", () => {
  it("preserves a UTF-8 character split across chunks", () => {
    const decoder = new OmpRpcJsonlDecoder();
    const bytes = jsonBytes({ type: "event", text: "你" });
    const split = bytes.indexOf(0xe4) + 1;

    expect(decoder.push(bytes.subarray(0, split))).toEqual([]);
    expect(decoder.push(bytes.subarray(split))).toEqual([
      { type: "event", text: "你" },
    ]);
  });

  it("decodes multiple frames from one chunk", () => {
    const decoder = new OmpRpcJsonlDecoder();
    expect(decoder.push(Buffer.from('{"type":"a"}\n{"type":"b"}\n'))).toEqual([
      { type: "a" },
      { type: "b" },
    ]);
  });

  it("accepts CRLF and ignores empty lines", () => {
    const decoder = new OmpRpcJsonlDecoder();
    expect(decoder.push(Buffer.from('\r\n{"type":"event"}\r\n\n'))).toEqual([
      { type: "event" },
    ]);
  });

  it.each([
    ["malformed JSON", Buffer.from("secret-payload{\n")],
    ["a JSON primitive", Buffer.from('"secret-payload"\n')],
  ])("rejects %s without reflecting input", (_label, input) => {
    const decoder = new OmpRpcJsonlDecoder();
    expect(() => decoder.push(input)).toThrow("Invalid OMP RPC JSONL frame");
    try {
      decoder.push(input);
    } catch (error) {
      expect(String(error)).not.toContain("secret-payload");
      expect(String(error).length).toBeLessThan(128);
    }
  });

  it("enforces the initial limit using UTF-8 bytes before parsing JSON", () => {
    const exactPayload = "你".repeat(
      Math.floor((MAX_INITIAL_FRAME_BYTES - 11) / 3),
    );
    const exact = Buffer.from(`{"text":"${exactPayload}"}`);
    const paddedExact = Buffer.concat([
      exact,
      Buffer.from(" ".repeat(MAX_INITIAL_FRAME_BYTES - exact.byteLength)),
      Buffer.from("\n"),
    ]);
    const decoder = new OmpRpcJsonlDecoder();
    expect(decoder.push(paddedExact)).toHaveLength(1);

    const oversized = Buffer.concat([
      Buffer.alloc(MAX_INITIAL_FRAME_BYTES + 1, 0x20),
      Buffer.from("\n"),
    ]);
    expect(() => new OmpRpcJsonlDecoder().push(oversized)).toThrow(
      "OMP RPC frame exceeds 1048576 bytes",
    );
  });

  it("rejects a non-empty residual frame at EOF", () => {
    const decoder = new OmpRpcJsonlDecoder();
    decoder.push(Buffer.from('{"type":"event"}'));
    expect(() => decoder.end()).toThrow("Incomplete OMP RPC frame at EOF");
  });

  it("accepts unknown fields on an object frame", () => {
    const decoder = new OmpRpcJsonlDecoder();
    expect(
      decoder.push(jsonBytes({ type: "future", extra: { version: 3 } })),
    ).toEqual([{ type: "future", extra: { version: 3 } }]);
  });
});

describe("OMP RPC ready negotiation gate", () => {
  it("rejects an absent ready frame with a bounded protocol error", async () => {
    await expect(parseReadyFrame("")).rejects.toThrow(
      "Invalid OMP RPC ready frame",
    );
  });

  it("returns only the public ready fields", () => {
    const gate = new OmpRpcReadyGate([1, 2]);
    expect(gate.accept({ ...ready, privateFutureField: "ignored" })).toEqual(
      ready,
    );
  });

  it("requires a supported version intersection", () => {
    const gate = new OmpRpcReadyGate([1, 2]);
    expect(() =>
      gate.accept({
        ...ready,
        protocolVersion: 3,
        supportedProtocolVersions: [3, 4],
      }),
    ).toThrow("No compatible OMP RPC protocol version");
  });

  it.each([
    ["missing frame limit", { maxFrameBytes: undefined }],
    ["zero frame limit", { maxFrameBytes: 0 }],
    ["fractional reassembled limit", { maxReassembledFrameBytes: 1.5 }],
    [
      "reassembled limit below frame limit",
      { maxFrameBytes: 100, maxReassembledFrameBytes: 99 },
    ],
  ])("rejects %s", (_label, changes) => {
    const gate = new OmpRpcReadyGate([1, 2]);
    expect(() => gate.accept({ ...ready, ...changes })).toThrow(
      "Invalid OMP RPC ready frame",
    );
  });

  it("fails closed when a business frame arrives before ready", () => {
    const gate = new OmpRpcReadyGate([1, 2]);
    expect(() => gate.accept({ type: "extension_event" })).toThrow(
      "OMP RPC frame received before ready",
    );
  });

  it("rejects a duplicate ready frame", () => {
    const gate = new OmpRpcReadyGate([1, 2]);
    gate.accept(ready);
    expect(() => gate.accept(ready)).toThrow("Duplicate OMP RPC ready frame");
  });

  it("passes unknown business objects after ready", () => {
    const gate = new OmpRpcReadyGate([1, 2]);
    gate.accept(ready);
    const future = { type: "future_event", payload: { version: 9 } };
    expect(gate.accept(future)).toBe(future);
  });
});
