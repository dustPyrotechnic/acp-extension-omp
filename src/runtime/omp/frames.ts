import { z } from "zod";

const supportedProtocolVersions = new Set([1, 2]);

const readyFrameSchema = z
  .object({
    type: z.literal("ready"),
    protocolVersion: z.number().int().positive(),
  })
  .passthrough();

export type OmpReadyFrame = z.infer<typeof readyFrameSchema>;

export async function parseReadyFrame(line: string): Promise<OmpReadyFrame> {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error("Invalid OMP RPC ready frame JSON");
  }

  const frame = readyFrameSchema.parse(value);
  if (!supportedProtocolVersions.has(frame.protocolVersion)) {
    throw new Error(
      `Unsupported OMP RPC protocol version: ${frame.protocolVersion}`,
    );
  }
  return frame;
}
