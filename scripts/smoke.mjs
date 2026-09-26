import { parseReadyFrame } from "../dist/index.js";

const frame = await parseReadyFrame(
  '{"type":"ready","protocolVersion":1,"supportedProtocolVersions":[1,2],"maxFrameBytes":1048576,"maxReassembledFrameBytes":67108864}',
);
if (
  frame.protocolVersion !== 1 ||
  frame.maxFrameBytes !== 1_048_576 ||
  frame.maxReassembledFrameBytes !== 67_108_864
)
  throw new Error("Unexpected OMP RPC ready contract");
