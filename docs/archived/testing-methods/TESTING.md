Testing Overview

Goals
- Quick wins without adding dependencies: smoke imports, queue-before-init, API signature.
- Keep tests hermetic within this extension folder (no SillyTavern checkout required).

How It Works
- Virtual project: tests build a copy of the JS files under `tests/virtual/` and rewrite any SillyTavern imports to local stubs.
- Stubs: `tests/virtual/stubs/externals.js` provides no-op replacements for SillyTavern globals/APIs (`generateRaw`, `getContext`, `extension_settings`, etc.).
- Index stub: `tests/virtual/index.js` provides logging, settings, and re-exports of common externals used by modules that import from `./index.js`.
- Runner: `node tests/run-tests.js` discovers and runs a few initial suites without Jest.

Included Tests
- Smoke import of representative modules (ensures modules load with stubs).
- Queue operations before initialization (verifies enqueue + auto-init doesn’t throw and executes with a registered handler).
- `generateRaw` contract (verifies object-based signature via `executeMerge` in `lorebookEntryMerger.js`).

Run Locally
- `npm run test`

Pre-commit Hook
- A Git hook at `.git/hooks/pre-commit` runs the tests on commit. If Node is missing, the hook skips tests.

Extending Tests
- Add cases under `tests/integration/` or `tests/unit/` and register them in `tests/run-tests.js` (or extend the simple test registration API).
- To cover more modules, ensure any new upward `../../../` imports are rewritten to the externals stub in the virtualizer map (see `EXTERNAL_IMPORT_PATTERNS`).

Caveats
- No DOM or Playwright yet (Phase 2). This harness avoids network and external installs.
- Modules that rely on runtime browser globals (`toastr`, `$`) are safe as long as code paths aren’t executed during import; add stubs or guard code if needed.

