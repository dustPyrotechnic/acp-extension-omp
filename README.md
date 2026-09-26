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
