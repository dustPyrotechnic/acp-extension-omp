import { describe, expect, it } from "vitest";
import {
  OMP_RPC_QUERY_COMMANDS,
  OmpRpcRequestRegistry,
  type OmpRpcTimeoutScheduler,
} from "../../../src/runtime/omp/responses.js";

class FakeScheduler implements OmpRpcTimeoutScheduler {
  #nextHandle = 1;
  readonly #tasks = new Map<number, () => void>();

  setTimeout(callback: () => void, _delayMs: number): number {
    const handle = this.#nextHandle++;
    this.#tasks.set(handle, callback);
    return handle;
  }

  clearTimeout(handle: unknown): void {
    this.#tasks.delete(handle as number);
  }

  run(handle: number): void {
    const callback = this.#tasks.get(handle);
    if (callback === undefined) throw new Error("Unknown fake timer");
    this.#tasks.delete(handle);
    callback();
  }

  handles(): number[] {
    return [...this.#tasks.keys()];
  }
}

function response(
  id: number,
  command: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { type: "response", id, command, success: true, ...extra };
}

describe("OMP RPC response envelope", () => {
  it.each([
    ["zero id", { id: 0 }],
    ["unsafe id", { id: Number.MAX_SAFE_INTEGER + 1 }],
    ["empty command", { command: "" }],
    ["oversized command", { command: "x".repeat(129) }],
    ["missing success", { success: undefined }],
  ])("rejects %s with a bounded error", (_label, changes) => {
    const registry = new OmpRpcRequestRegistry(new FakeScheduler());
    const request = registry.register("get_state", 100);
    void request.response.catch(() => undefined);

    expect(() =>
      registry.dispatch({
        ...response(request.id, request.command),
        ...changes,
      }),
    ).toThrow("Invalid OMP RPC response envelope");
  });

  it("returns an unknown non-response object to the future event dispatcher", () => {
    const registry = new OmpRpcRequestRegistry(new FakeScheduler());
    const event = { type: "extension_event", privatePayload: { future: true } };

    expect(registry.dispatch(event)).toBe(event);
  });

  it("retains provider fields only as an internal unknown response body", async () => {
    const registry = new OmpRpcRequestRegistry(new FakeScheduler());
    const request = registry.register("get_state", 100);

    expect(
      registry.dispatch(
        response(request.id, request.command, {
          state: { privateFutureField: "opaque" },
        }),
      ),
    ).toBeUndefined();
    await expect(request.response).resolves.toEqual({
      success: true,
      body: { state: { privateFutureField: "opaque" } },
    });
  });
});

describe("OMP RPC request correlation", () => {
  it("uses connection-local positive IDs without reuse", () => {
    const registry = new OmpRpcRequestRegistry(new FakeScheduler());
    const first = registry.register("get_state", 100);
    const second = registry.register("get_available_models", 100);
    void first.response.catch(() => undefined);
    void second.response.catch(() => undefined);

    expect([first.id, second.id]).toEqual([1, 2]);
    registry.failAll(new Error("connection closed"));
    expect(registry.register("get_state", 100).id).toBe(3);
  });

  it("resolves inverse-order responses against the exact id and command", async () => {
    const registry = new OmpRpcRequestRegistry(new FakeScheduler());
    const first = registry.register("get_state", 100);
    const second = registry.register("get_available_commands", 100);

    registry.dispatch(response(second.id, second.command, { commands: [] }));
    registry.dispatch(response(first.id, first.command, { state: {} }));

    await expect(second.response).resolves.toEqual({
      success: true,
      body: { commands: [] },
    });
    await expect(first.response).resolves.toEqual({
      success: true,
      body: { state: {} },
    });
  });

  it("fails closed for a command mismatch without completing the request", async () => {
    const registry = new OmpRpcRequestRegistry(new FakeScheduler());
    const request = registry.register("get_state", 100);

    expect(() =>
      registry.dispatch(response(request.id, "get_session_stats")),
    ).toThrow("OMP RPC response command mismatch");
    registry.dispatch(response(request.id, request.command));
    await expect(request.response).resolves.toEqual({
      success: true,
      body: {},
    });
  });

  it("rejects duplicate and orphan responses", async () => {
    const registry = new OmpRpcRequestRegistry(new FakeScheduler());
    const request = registry.register("get_state", 100);
    registry.dispatch(response(request.id, request.command));
    await request.response;

    expect(() =>
      registry.dispatch(response(request.id, request.command)),
    ).toThrow("Orphan OMP RPC response");
    expect(() => registry.dispatch(response(999, "get_state"))).toThrow(
      "Orphan OMP RPC response",
    );
  });

  it("rejects every pending request exactly once on EOF or process exit", async () => {
    const scheduler = new FakeScheduler();
    const registry = new OmpRpcRequestRegistry(scheduler);
    const eofRequest = registry.register("get_state", 100);
    const exitRequest = registry.register("get_session_stats", 100);
    let eofRejections = 0;
    let exitRejections = 0;
    const eofObserved = eofRequest.response.catch((error: unknown) => {
      eofRejections += 1;
      throw error;
    });
    const exitObserved = exitRequest.response.catch((error: unknown) => {
      exitRejections += 1;
      throw error;
    });

    registry.failAll(new Error("OMP RPC EOF"));
    registry.failAll(new Error("OMP process exited"));

    await expect(eofObserved).rejects.toThrow("OMP RPC EOF");
    await expect(exitObserved).rejects.toThrow("OMP RPC EOF");
    expect([eofRejections, exitRejections]).toEqual([1, 1]);
    expect(scheduler.handles()).toEqual([]);
  });

  it("times out deterministically, clears the registry, and rejects a late response", async () => {
    const scheduler = new FakeScheduler();
    const registry = new OmpRpcRequestRegistry(scheduler);
    const request = registry.register("get_available_models", 50);
    const [handle] = scheduler.handles();
    expect(handle).toBeDefined();

    scheduler.run(handle!);

    await expect(request.response).rejects.toThrow("OMP RPC request timed out");
    expect(() =>
      registry.dispatch(response(request.id, request.command)),
    ).toThrow("Orphan OMP RPC response");
  });

  it("defines only the four observed query commands without payload parsing", () => {
    expect(OMP_RPC_QUERY_COMMANDS).toEqual([
      "get_state",
      "get_session_stats",
      "get_available_models",
      "get_available_commands",
    ]);
  });
});
