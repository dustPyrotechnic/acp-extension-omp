import { TextDecoder } from "node:util";
import { z } from "zod";

export const MAX_INITIAL_FRAME_BYTES = 1_048_576;
export const MAX_REASSEMBLED_FRAME_BYTES = 67_108_864;

export type OmpRpcFrame = Record<string, unknown>;

const positiveSafeInteger = z.number().int().positive().safe();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

const readyFrameSchema = z
  .object({
    type: z.literal("ready"),
    protocolVersion: positiveSafeInteger,
    supportedProtocolVersions: z
      .array(positiveSafeInteger)
      .nonempty()
      .refine((versions) => new Set(versions).size === versions.length),
    maxFrameBytes: positiveSafeInteger.max(MAX_INITIAL_FRAME_BYTES),
    maxReassembledFrameBytes: positiveSafeInteger.max(
      MAX_REASSEMBLED_FRAME_BYTES,
    ),
  })
  .strip()
  .refine((frame) =>
    frame.supportedProtocolVersions.includes(frame.protocolVersion),
  )
  .refine((frame) => frame.maxReassembledFrameBytes >= frame.maxFrameBytes);

export type OmpReadyFrame = z.infer<typeof readyFrameSchema>;

function invalidFrame(): Error {
  return new Error("Invalid OMP RPC JSONL frame");
}

export class OmpRpcJsonlDecoder {
  readonly #maxFrameBytes: number;
  #buffer = Buffer.alloc(0);

  constructor(maxFrameBytes = MAX_INITIAL_FRAME_BYTES) {
    if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes <= 0) {
      throw new Error("Invalid OMP RPC frame byte limit");
    }
    this.#maxFrameBytes = maxFrameBytes;
  }

  push(chunk: Uint8Array): OmpRpcFrame[] {
    const input = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const frames: OmpRpcFrame[] = [];
    let offset = 0;

    while (offset < input.byteLength) {
      const newline = input.indexOf(0x0a, offset);
      if (newline === -1) {
        const remainder = input.subarray(offset);
        const totalBytes = this.#buffer.byteLength + remainder.byteLength;
        const trailingByte =
          remainder.at(-1) ?? this.#buffer.at(this.#buffer.byteLength - 1);
        const frameBytes = totalBytes - (trailingByte === 0x0d ? 1 : 0);
        if (frameBytes > this.#maxFrameBytes) {
          throw new Error(`OMP RPC frame exceeds ${this.#maxFrameBytes} bytes`);
        }
        this.#buffer = Buffer.concat([this.#buffer, remainder]);
        return frames;
      }

      const segment = input.subarray(offset, newline);
      const totalBytes = this.#buffer.byteLength + segment.byteLength;
      const trailingByte =
        segment.at(-1) ?? this.#buffer.at(this.#buffer.byteLength - 1);
      const frameBytes = totalBytes - (trailingByte === 0x0d ? 1 : 0);
      if (frameBytes > this.#maxFrameBytes) {
        throw new Error(`OMP RPC frame exceeds ${this.#maxFrameBytes} bytes`);
      }
      let line = Buffer.concat([this.#buffer, segment]);
      this.#buffer = Buffer.alloc(0);
      offset = newline + 1;
      if (line.at(-1) === 0x0d) line = line.subarray(0, -1);
      if (line.byteLength === 0) continue;

      let value: unknown;
      try {
        value = JSON.parse(utf8Decoder.decode(line));
      } catch {
        throw invalidFrame();
      }
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw invalidFrame();
      }
      frames.push(value as OmpRpcFrame);
    }

    return frames;
  }

  end(): void {
    if (this.#buffer.byteLength > 0) {
      throw new Error("Incomplete OMP RPC frame at EOF");
    }
  }
}

export class OmpRpcReadyGate {
  readonly #supportedProtocolVersions: ReadonlySet<number>;
  #ready = false;

  constructor(supportedProtocolVersions: readonly number[]) {
    if (
      supportedProtocolVersions.length === 0 ||
      supportedProtocolVersions.some(
        (version) => !Number.isSafeInteger(version) || version <= 0,
      )
    ) {
      throw new Error("Invalid local OMP RPC protocol versions");
    }
    this.#supportedProtocolVersions = new Set(supportedProtocolVersions);
  }

  accept(frame: OmpRpcFrame): OmpReadyFrame | OmpRpcFrame {
    if (!this.#ready) {
      if (frame.type !== "ready") {
        throw new Error("OMP RPC frame received before ready");
      }

      const parsed = readyFrameSchema.safeParse(frame);
      if (!parsed.success) throw new Error("Invalid OMP RPC ready frame");
      if (
        !parsed.data.supportedProtocolVersions.some((version) =>
          this.#supportedProtocolVersions.has(version),
        ) ||
        !this.#supportedProtocolVersions.has(parsed.data.protocolVersion)
      ) {
        throw new Error("No compatible OMP RPC protocol version");
      }

      this.#ready = true;
      return parsed.data;
    }

    if (frame.type === "ready") {
      throw new Error("Duplicate OMP RPC ready frame");
    }
    return frame;
  }
}

export async function parseReadyFrame(line: string): Promise<OmpReadyFrame> {
  if (line.includes("\n")) throw new Error("Invalid OMP RPC ready frame");
  const decoder = new OmpRpcJsonlDecoder();
  const frames = decoder.push(Buffer.from(`${line}\n`));
  const frame = frames[0];
  if (frame === undefined) throw new Error("Invalid OMP RPC ready frame");
  return new OmpRpcReadyGate([1, 2]).accept(frame) as OmpReadyFrame;
}
