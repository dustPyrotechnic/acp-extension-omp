# OMP ACP adapter

- Keep OMP RPC frames, events, session files, and extension messages behind the
  adapter boundary. Public consumers use only standard ACP and advertised Core
  capabilities.
- Launch OMP only with `--mode rpc --no-extensions` and one explicit packaged
  Lody extension. Never use native `omp acp`.
- Capabilities remain absent until a synthetic contract and the required real
  OMP probe both pass.
- Real contract probes are opt-in and fail closed when OMP or credentials are
  unavailable. Synthetic fixtures never count as real-runtime evidence.
- Bound raw OMP JSONL by UTF-8 bytes before `JSON.parse`. Do not include frame
  payloads in parser or negotiation errors.
- Fail closed unless the first non-empty OMP object is one valid, compatible
  `ready` frame. Strip unknown fields from the public ready result while
  allowing unknown business objects after negotiation.
- Correlate OMP responses by both a connection-local non-reused positive ID and
  the exact command. Unknown response fields stay internal until a
  command-specific parser maps them to a public ACP/Core contract.
- Use injected deterministic request timeouts. Mismatches, duplicates, orphans,
  late responses, EOF, and process exit must not resolve an unrelated request.
- Do not derive model usage from `get_session_stats`; usage requires its own
  verified completed-operation contract.
- Run `pnpm check`, `pnpm build`, and `pnpm smoke` before committing.
