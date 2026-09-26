#!/usr/bin/env node

export {
  MAX_INITIAL_FRAME_BYTES,
  OmpRpcJsonlDecoder,
  OmpRpcReadyGate,
  parseReadyFrame,
  type OmpReadyFrame,
  type OmpRpcFrame,
} from "./runtime/omp/frames.js";
