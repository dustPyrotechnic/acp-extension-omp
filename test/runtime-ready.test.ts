import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseReadyFrame } from "../src/runtime/omp/frames.js";

const fixture = fileURLToPath(
  new URL("./fixtures/omp-rpc-process.mjs", import.meta.url),
);

async function readFixture(frame?: string): Promise<string> {
  const child = spawn(
    process.execPath,
    frame === undefined ? [fixture] : [fixture, frame],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  for await (const chunk of child.stdout) stdout += chunk;
  const [code] = await Promise.all([
    new Promise<number | null>((resolve) => child.once("close", resolve)),
  ]);
  expect(code).toBe(0);
  return stdout.trim();
}

describe("synthetic OMP RPC child-process fixture", () => {
  it("accepts the complete ready contract across a child-process boundary", async () => {
    await expect(parseReadyFrame(await readFixture())).resolves.toEqual({
      type: "ready",
      protocolVersion: 1,
      supportedProtocolVersions: [1, 2],
      maxFrameBytes: 1_048_576,
      maxReassembledFrameBytes: 67_108_864,
    });
  });

  it("rejects an unsupported protocol version", async () => {
    const line = await readFixture(
      '{"type":"ready","protocolVersion":3,"supportedProtocolVersions":[3],"maxFrameBytes":1048576,"maxReassembledFrameBytes":67108864}',
    );
    await expect(parseReadyFrame(line)).rejects.toThrow(
      "No compatible OMP RPC protocol version",
    );
  });
});
