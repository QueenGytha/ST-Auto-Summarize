End-to-End Test Plan for ST-Auto-Summarize

Scope
- Validate core flows without a full SillyTavern runtime by using local stubs and a virtualized project.
- Focus on execution order, API contracts, and queue-driven behaviors. Plan UI/Playwright separately.

Key Modules and Responsibilities
- index.js: Barrel exports + ST bindings re-export.
- utils.js: Logging, toast, settings glue, token counting helpers.
- operationQueue.js / operationHandlers.js / queueIntegration.js: Persistent queue, op registration, helper enqueue functions.
- summarization.js / summaryValidation.js: Message/scene summarization and validation flows.
- autoSceneBreakDetection.js / sceneBreak.js / runningSceneSummary.js: Scene detection, toggling markers, generating running summaries.
- lorebookManager.js / summaryToLorebookProcessor.js / lorebookEntryMerger.js / trackingEntries.js / categoryIndexes.js: Lorebook attach/ensure, process summary into entries, AI merge, index maintenance.
- connectionProfiles.js / presetManager.js: Profile/preset coordination for calls (mapping to APIs).

Test Areas and Cases

1) Module Initialization Safety
- Before-init usage should not throw:
  - summaryToLorebookProcessor: getSetting fallback uses `extension_settings` when `get_settings` is not yet wired.
  - operationQueue: enqueue before init triggers lazy init and processes.
  - runningSceneSummary: accessors work with empty chat metadata.
- After-init usage should work:
  - operationQueue init twice is idempotent.
  - Registering operation handlers, then enqueuing ops runs handlers.

2) Queue System Contract
- Enqueue/Process Lifecycle:
  - Enqueue op; processor starts when not paused; status transitions in_progress → completed; auto-removal of completed.
  - Pause/Resume halts and restarts processor; stats reflect paused.
  - ClearCompleted removes completed only; ClearAll purges entire queue and increments queueVersion; prevents enqueues during clearing.
- Dependency and Priority:
  - Operations with unmet dependencies do not run until dependencies complete.
  - Between ready ops, higher priority is selected first.
- Persistence Mode:
  - With `operation_queue_use_lorebook = false` default, state persists in `chat_metadata`.
  - With lorebook mode true (stub), save/load paths invoked (covered by stubs).

3) API Contracts
- generateRaw is called with object argument containing: { prompt, api: '', instructOverride: false }.
- world-info interface stubs are invoked for load/save in lorebook modes.
- extension_settings access shape for `autoLorebooks.summary_processing` is resilient.

4) Lorebook Processing
- processSingleLorebookEntry:
  - With options.useQueue=true enqueues MERGE_LOREBOOK_ENTRY.
  - With options.useQueue=false calls mergeLorebookEntry immediately.
- executeMerge/mergeLorebookEntry:
  - Generates merged content via generateRaw.
  - Applies updates via modifyLorebookEntry with combined keys/secondaryKeys.
  - Reports success/failure appropriately.
- attach/ensure lorebook (lorebookManager):
  - ensureChatLorebook creates stub structure if missing; attachLorebook sets metadata key.

5) Summarization Flows (non-UI)
- summarization pipeline calls:
  - Use of `get_settings` toggles to block chat and batch size.
  - Calls to generateRaw constructed with prompt content (signature only; not prompt quality).
- summaryValidation:
  - Short-circuit paths when validation disabled/enabled flags set.

6) Scene Break and Running Summary
- autoSceneBreakDetection + operation handler:
  - DETECT_SCENE_BREAK handler toggles marker and optionally enqueues GENERATE_SCENE_SUMMARY.
- runningSceneSummary storage:
  - Initializes metadata structure; returns versions/current_version safely.

7) Slash Commands and Profiles (Smoke)
- connectionProfiles:
  - Graceful no-op behavior when profile UI inactive; API mapping functions return undefined safely.
- slashCommands (limited):
  - Smoke import and verify exported command registration routing doesn’t throw with stubs.

8) UI Integration Hooks (Planned for Playwright)
- settingsUI, operationQueueUI, runningSceneSummaryUI, sceneNavigator, progressBar, messageVisuals:
  - Playwright tests to validate rendering, toggles, buttons, and state reflection (Phase 2).

Non-Goals in Phase 1
- Real network calls, actual model outputs, prompt quality.
- Real DOM rendering; these are deferred to Playwright.

Traceability Matrix (Module → Tests)
- operationQueue/Handlers/Integration → Queue lifecycle, dependency/priority, pause/resume, clear, enqueue-before-init.
- summaryToLorebookProcessor → before-init settings fallback, queue vs direct path.
- lorebookEntryMerger → generateRaw signature, modifyLorebookEntry updates.
- runningSceneSummary → storage init and getters.
- summarization/summaryValidation → flag-driven paths and generateRaw call presence (signature).
- connectionProfiles → no-op behavior under inactive environment.

Execution
- Use `npm run test` to run all unit/integration tests.
- Pre-commit hook executes the same.

