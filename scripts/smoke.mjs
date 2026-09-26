import { parseReadyFrame } from "../dist/index.js";

const frame = await parseReadyFrame('{"type":"ready","protocolVersion":1}');
if (frame.protocolVersion !== 1)
  throw new Error("Unexpected OMP RPC protocol version");
