# Ruxt Penpot Design System — Durable Export

This directory is the durable, git-committed copy of the Ruxt design system
that lives in the local Penpot instance. If the Penpot database or volumes
are ever lost, the design system can be restored from here.

## Source of truth

- The Penpot library file `Ruxt Design System` is the design source of truth.
- `design/tokens.json` is the token source of truth; the Penpot library
  mirrors it. On any conflict, `design/tokens.json` wins and the library
  is re-synced from it.
- `tokens/ruxt-tokens.json` in this directory is a byte-for-byte copy of
  `design/tokens.json` (verified with `cmp` at scaffold time), kept here so
  the export is self-contained.

## Penpot IDs (local instance)

- Penpot URL: http://localhost:9001
- Team ID: c23d3f1a-a1d9-8133-8008-e5d4873ebe1f
- Project: Ruxt — f1a04e90-1a2d-80ed-8008-e6f65bd0ec15
- File: Ruxt Design System — f1a04e90-1a2d-80ed-8008-e6f65bdbd6f3
- File URL: http://localhost:9001/#/workspace/f1a04e90-1a2d-80ed-8008-e6f65bd0ec15/f1a04e90-1a2d-80ed-8008-e6f65bdbd6f3
- IDs are also recorded in penpot-client-lab `notes/ruxt-ds-ids.txt`.
  These are local-instance IDs only; a re-import into a fresh instance
  will create new IDs.

## Contents

- `ruxt-design-system.penpot` — full Penpot export of the library file
  (added in Phase B, after the library is built and verified non-empty).
- `tokens/ruxt-tokens.json` — byte copy of `design/tokens.json`.
- `reimport.sh` — re-import script (see below).
- `png/` — PNG exports, one per component group and one per screen page
  (added in Phase B).

## Re-import

Prerequisites: local Penpot running at http://localhost:9001, and the
credentials file present at
`/Users/handlerone/Downloads/ruxt-lab/tmp/penpot/.credentials`.
The script reads credentials at runtime from that file only; they are
never hardcoded, printed, or committed.

```sh
./design/penpot/reimport.sh
# optional overrides:
PENPOT_PROJECT_NAME='Ruxt DS Import Test' ./design/penpot/reimport.sh
PENPOT_FILE=/path/to/other.penpot ./design/penpot/reimport.sh
```

The script logs in via `POST /api/rpc/command/login-with-password`
(`auth-token` cookie), resolves the target project (`Ruxt` by default,
using the recorded project ID when the name is `Ruxt`, otherwise creating
the project in the default team if missing), then imports
`ruxt-design-system.penpot` via the multipart `import-binfile` RPC.
Re-running imports a fresh copy of the file into the project
(idempotent-ish: it restores the design system, it does not merge).
Any non-2xx response fails the script loudly with the status and a
truncated response body.

## Verification

Phase B (done 2026-11-06, after ds-library LAB-DONE):

- `ruxt-design-system.penpot` — 1,136,369 bytes, 899 zip entries,
  `testzip` clean, `manifest.json` present.
- Library counts at export: 93 colors (3 themes x 31), 10 typographies,
  24 library components covering all 16 component types, 12 pages.
- `png/` — 30 PNGs (16 component groups + 11 pages + 3 Latte variants),
  all valid PNGs; screen pages 1440x900.
- penpot-client-lab `poc/ruxt-ds/` — 34 assets (31 PNGs incl.
  `library-open.png`, + 3 GIFs), every asset labelled REAL CAPTURE or
  ASSEMBLED-from-real-captures in that folder's `README.md`; the repo
  PNGs and poc copies are byte-identical (cmp-verified on a sample set).

## Re-import smoke test

Pending Phase B: result, test project name, and cleanup of the test
project will be recorded here. Not yet run — do not treat as passed.

## Rules

Sample data only. No credentials, tokens, or secrets in any file here.
