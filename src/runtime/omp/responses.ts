import type { OmpRpcFrame } from "./frames.js";

const MAX_COMMAND_LENGTH = 128;

export const OMP_RPC_QUERY_COMMANDS = [
  "get_state",
  "get_session_stats",
  "get_available_models",
  "get_available_commands",
] as const;

export interface OmpRpcTimeoutScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

interface OmpRpcResponseEnvelope {
  type: "response";
  id: number;
  command: string;
  success: boolean;
  body: unknown;
}

interface OmpRpcResponseResult {
  success: boolean;
  body: unknown;
}

export interface OmpRpcPendingRequest {
  readonly id: number;
  readonly command: string;
  readonly response: Promise<OmpRpcResponseResult>;
}

interface PendingEntry {
  readonly command: string;
  readonly resolve: (result: OmpRpcResponseResult) => void;
  readonly reject: (error: Error) => void;
  readonly timeoutHandle: unknown;
}

const defaultScheduler: OmpRpcTimeoutScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

function invalidResponse(): Error {
  return new Error("Invalid OMP RPC response envelope");
}

function parseResponse(frame: OmpRpcFrame): OmpRpcResponseEnvelope | undefined {
  if (frame.type !== "response") return undefined;
  if (
    !Number.isSafeInteger(frame.id) ||
    (frame.id as number) <= 0 ||
    typeof frame.command !== "string" ||
    frame.command.length === 0 ||
    frame.command.length > MAX_COMMAND_LENGTH ||
    typeof frame.success !== "boolean"
  ) {
    throw invalidResponse();
  }

  const { type: _type, id, command, success, ...body } = frame;
  return {
    type: "response",
    id: id as number,
    command,
    success,
    body,
  };
}

export class OmpRpcRequestRegistry {
  readonly #scheduler: OmpRpcTimeoutScheduler;
  readonly #pending = new Map<number, PendingEntry>();
  #nextId = 1;

  constructor(scheduler: OmpRpcTimeoutScheduler = defaultScheduler) {
    this.#scheduler = scheduler;
  }

  register(command: string, timeoutMs: number): OmpRpcPendingRequest {
    if (
      command.length === 0 ||
      command.length > MAX_COMMAND_LENGTH ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs <= 0
    ) {
      throw new Error("Invalid OMP RPC request registration");
    }
    if (!Number.isSafeInteger(this.#nextId)) {
      throw new Error("OMP RPC request ID space exhausted");
    }

    const id = this.#nextId++;
    let resolve!: (result: OmpRpcResponseResult) => void;
    let reject!: (error: Error) => void;
    const response = new Promise<OmpRpcResponseResult>((accept, decline) => {
      resolve = accept;
      reject = decline;
    });
    const timeoutHandle = this.#scheduler.setTimeout(() => {
      const pending = this.#pending.get(id);
      if (pending === undefined) return;
      this.#pending.delete(id);
      pending.reject(new Error("OMP RPC request timed out"));
    }, timeoutMs);
    this.#pending.set(id, { command, resolve, reject, timeoutHandle });

    return { id, command, response };
  }

  dispatch(frame: OmpRpcFrame): OmpRpcFrame | undefined {
    const response = parseResponse(frame);
    if (response === undefined) return frame;

    const pending = this.#pending.get(response.id);
    if (pending === undefined) throw new Error("Orphan OMP RPC response");
    if (pending.command !== response.command) {
      throw new Error("OMP RPC response command mismatch");
    }

    this.#pending.delete(response.id);
    this.#scheduler.clearTimeout(pending.timeoutHandle);
    pending.resolve({ success: response.success, body: response.body });
    return undefined;
  }

  failAll(error: Error): void {
    const pending = [...this.#pending.values()];
    this.#pending.clear();
    for (const entry of pending) {
      this.#scheduler.clearTimeout(entry.timeoutHandle);
      entry.reject(error);
    }
  }
}
