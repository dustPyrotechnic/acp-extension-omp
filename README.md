# ACP Extension OMP

Candidate Apache-2.0 ACP adapter for Oh My Pi (OMP). The adapter is developed in
`dustPyrotechnic/acp-extension-omp` until Lody maintainers confirm its long-term
owner, repository URL, and integration model.

## Architecture

The adapter is a deep module between standard ACP/Core consumers and OMP RPC.
It will launch the user's installed OMP executable as:

```text
OMP_PATH=/absolute/path/to/omp
omp --mode rpc --no-extensions -e <packaged-lody-extension.mjs>
```

It never launches native `omp acp`, bundles OMP, discovers ambient extensions,
or exposes OMP-private payloads to Lody.

## Development

Requires Node.js 22.14 or newer and pnpm 10.20.0.

```sh
pnpm install
pnpm check
pnpm build
pnpm smoke
```

`pnpm contract:real` is an opt-in, fail-closed command. Task 1R will add the
controlled real OMP 18.2.8 session and usage probes. Until then it always exits
nonzero, even when `OMP_PATH` is present.

Synthetic fixtures prove parser and process-boundary behavior only.

## Implemented OMP RPC boundary

The adapter currently provides a bounded incremental JSONL decoder and the
initial `ready` negotiation gate. Before parsing JSON it limits each UTF-8
frame to 1 MiB, accepts LF or CRLF, ignores empty lines, rejects incomplete
EOF frames, and reports bounded errors without echoing payloads.

The first non-empty object must be a complete `ready` frame with a compatible
protocol version and valid frame limits. Extra ready fields are ignored at the
public boundary.

After negotiation, the internal correlation substrate validates bounded
`response` envelopes and matches them by both connection-local request ID and
exact command. Requests use deterministic injected timeouts; mismatches,
duplicates, orphans, late responses, EOF, and process exit fail closed without
completing an unrelated request. Unknown provider response fields remain an
opaque internal body for a future command-specific parser and are not exposed
through ACP.

The only recorded query command names are `get_state`, `get_session_stats`,
`get_available_models`, and `get_available_commands`. Their provider payloads
are not parsed, and session statistics do not produce model usage. Unknown
non-response objects pass through for a future event dispatcher. Real session,
prompt, abort, usage, and terminal-state handling are not implemented yet.
