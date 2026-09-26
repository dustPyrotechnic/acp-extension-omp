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
- Run `pnpm check`, `pnpm build`, and `pnpm smoke` before committing.
