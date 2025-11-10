# ST-Auto-Summarize ConnectionManagerRequestService Assessment

## Questions Addressed
- Does the existing connection-manager migration research accurately describe what the shipping code is doing today?
- Would adopting `ConnectionManagerRequestService` really let users keep generating chat messages on their current profile while this extension talks to a different profile in parallel?

## Current Implementation Snapshot (Code-Verified)

### Global connection profile switching still uses slash commands
`set_connection_profile()` calls `/profile <name>` through `ctx.executeSlashCommandsWithOptions`, shows a toast, and sleeps for `PROFILE_SWITCH_DELAY_MS` before returning (`connectionProfiles.js:94-109`). The constant is currently `100` ms, not `500` (`constants.js:17-24`), so the research doc overstates the wait time even though the global state switch still happens.

### Connection settings wrapper edits global SillyTavern state
`withConnectionSettings()` orchestrates profile/preset changes by calling `set_connection_profile()` and `set_preset()`, persists the caller’s previous settings inside `chat_metadata.autoRecap.savedConnectionSettings`, and restores everything afterward (`connectionSettingsManager.js:32-124`). Every recap/lorebook handler runs inside this wrapper (for example `sceneBreak.js:1083-1109`, `runningSceneRecap.js:303-357`, `recapValidation.js:30-79`, `lorebookEntryMerger.js:128-209`), so each operation temporarily changes the user’s global connection profile and preset.

### The queue blocks chat to avoid profile races
The queue flips `isChatBlocked` whenever there is pending work and forwards that state to the shared button interceptor (`operationQueue.js:68-147`). The interceptor then hides the native send/stop buttons and replaces them with a spinner (`index.js:33-83`). This guarantees the user cannot send a message until the queue finishes switching profiles back, which is why roleplay pauses today.

### Metadata injection assumes the `generateRaw` call path
All extension-initiated LLM calls go through `wrappedGenerateRaw()`, which derives an operation name from the stack trace, reads the optional `operationContext` suffix, injects `<ST_METADATA>` into prompts, and then delegates to the original `generateRaw` (`generateRawInterceptor.js:2-188`). User chat goes through SillyTavern’s prompt compositor which emits `CHAT_COMPLETION_PROMPT_READY` exactly once per turn (`public/scripts/openai.js:1530-1537`), and the extension’s event handler prepends its `chat-{index}` metadata there (`eventHandlers.js:304-360`).

## Fact-Check of Research Summary

| Claim from research summary | Code evidence | Assessment |
| --- | --- | --- |
| “Current approach = slash commands with a 500 ms delay and global state changes.” | Slash commands and UI toasts are still present in `connectionProfiles.js:94-109`, but `PROFILE_SWITCH_DELAY_MS` is `100` ms (`constants.js:17-24`). | Partially accurate: the description of global state mutation is correct, but the delay figure is outdated. |
| “ConnectionManagerRequestService.sendRequest() is request-scoped (no delay, no global switch, no UI flicker, concurrent operations possible).” | The service builds a one-off payload from the target profile and calls `ChatCompletionService`/`TextCompletionService` directly without touching global state (`public/scripts/extensions/shared.js:352-445`). Those helpers only merge preset data into the request object and never mutate SillyTavern settings (`public/scripts/custom-request.js:202-330`). | Accurate for SillyTavern’s core. The extension still needs to stop blocking the UI before users will see the concurrency benefit. |
| “Event system bypass: ConnectionManagerRequestService never emits `CHAT_COMPLETION_PROMPT_READY`.” | Only `openai.js:1530-1537` emits `CHAT_COMPLETION_PROMPT_READY`, and the request service simply calls `ChatCompletionService.processRequest()` without touching `eventSource` (`public/scripts/extensions/shared.js:352-445`). | Accurate: using the request service would completely skip the existing event handler path, so manual metadata injection is required. |
| “Stack trace incompatibility – cannot determine operation type once metadata is injected before the call.” | Operation detection currently lives inside `determineOperationType()` in `generateRawInterceptor.js:124-185`. Nothing prevents exporting that logic or instantiating a new stack trace right before calling `ConnectionManagerRequestService`. | Overstated: the helper is tied to `generateRaw` today, but the stack itself is still available. Refactoring the helper into a shared module would preserve the behaviour. |
| “`operationContext` pattern is incompatible; nine files must pass operation types explicitly.” | Callers already set/clear the suffix before invoking the LLM (`runningSceneRecap.js:322-334`, `sceneBreak.js:890-1109`, `autoSceneBreakDetection.js:498-500`, `recapToLorebookProcessor.js:616-2103`, `recapValidation.js:54-79`, `lorebookEntryMerger.js:128-209`). The suffix can be read by any wrapper via `getOperationSuffix()` (`operationContext.js:20-34`). | Inaccurate: as long as the new wrapper reads `getOperationSuffix()` immediately before sending, no call-site changes are required. |
| “Dual injection paths become harder because we must support interceptor + event + manual injection.” | We already maintain two paths today (interceptor for extension traffic plus the event handler for chat). Moving extension calls to the request service simply swaps the interceptor for a new wrapper; it does not introduce a *third* active path unless `generateRaw` continues to be used elsewhere. | Misleading framing: metadata work remains, but the path count does not inherently grow. |

## Can the user chat while the extension uses another profile?

### Engine support for concurrent profiles
`ConnectionManagerRequestService` builds an isolated request payload using the selected profile’s API type, model, preset, instruct preset, proxy, and max-token overrides, then posts it directly through `ChatCompletionService`/`TextCompletionService` (`public/scripts/extensions/shared.js:352-445`). Because it never edits `main_api`, presets, or UI state, SillyTavern can happily run a user request on one profile while a third-party extension calls another profile. The Timeline-Memory reference implementation already does this: it pulls the desired profile ID, derives a per-profile max-token limit, builds override payloads, and calls `ConnectionManagerRequestService.sendRequest()` without any global switches (`docs/research/timeline-memory/src/memories.js:724-778`, `docs/research/timeline-memory/src/memories.js:163-220`). That proves the platform supports the desired behaviour.

### Extension-level changes required to unlock that behaviour
1. **Replace slash-command switching.** Introduce a helper (e.g., `sendRecapWithProfile()`) that accepts the target profile/preset, derives `max_tokens`, and calls `ConnectionManagerRequestService` directly instead of `withConnectionSettings()`; this removes the need to persist `savedConnectionSettings` in `chat_metadata` (`connectionSettingsManager.js:32-124`).
2. **Move metadata injection out of `generateRawInterceptor`.** Extract `determineOperationType()` plus the string/array injection helpers into a shared module so the new helper can call `injectMetadata` and `injectMetadataIntoChatArray` immediately before `sendRequest()` (`generateRawInterceptor.js:24-76`, `metadataInjector.js:1-145`). Then read the current suffix via `getOperationSuffix()` to keep the existing `<ST_METADATA>` contract intact (`operationContext.js:20-34`).
3. **Keep the existing chat event handler for user messages.** User roleplay will continue to be tagged inside `eventHandlers.js:304-360` because SillyTavern still emits `CHAT_COMPLETION_PROMPT_READY` for UI-driven generations (`public/scripts/openai.js:1530-1537`). No changes are needed there.
4. **Let the queue stay sequential but stop blocking the user.** Once operations stop mutating global profiles, `setQueueChatBlocking()` and the send-button override in `index.js:33-83` can be retired, allowing the queue to process lorebook/recap tasks while the user continues chatting. The queue can remain sequential internally to protect shared lorebook state.
5. **Map configuration to Connection Manager profiles.** The extension currently stores slash-command profile names; the migration needs to look up the corresponding Connection Manager profile IDs and optional presets (Timeline-Memory’s `getMaxTokensForProfile()` demonstrates how to inspect `extension_settings.connectionManager.profiles`, `docs/research/timeline-memory/src/memories.js:163-220`).
6. **Plan the pilot:** add error handling, telemetry, and a feature flag so the new path can run alongside the legacy one for the recommended 15–20 hour pilot before fully removing `withConnectionSettings()`.

## Answers to the Original Questions
1. **Accuracy:** The research correctly identified the big picture (global slash-command switching, request-scoped benefits, and the missing event), but several technical details are stale or overstated—specifically the 500 ms delay figure, the claim that stack-trace-based operation detection is impossible, the assertion that `operationContext` must be refactored in nine files, and the idea that metadata paths necessarily multiply.
2. **Feasibility:** Yes, SillyTavern already supports simultaneous connections: other extensions use `ConnectionManagerRequestService` without touching the user’s profile. To make that true here, this extension must (a) stop issuing `/profile` commands, (b) migrate its metadata/operation-context plumbing into a wrapper around `sendRequest()`, (c) drop the queue-induced chat block, and (d) map its settings to Connection Manager profiles. Once those changes land, the user’s roleplay can continue on the main profile while recap/lorebook pipelines talk to a different LLM in parallel.

## Suggested Next Steps
1. Factor out a reusable `sendRequestWithMetadata(profileId, presetName, payloadOptions)` helper that wraps metadata injection + `ConnectionManagerRequestService`.
2. Feature-flag the helper inside one low-risk operation (e.g., recap validation) to gather pilot telemetry while leaving `withConnectionSettings()` as a fallback.
3. After validating, remove `withConnectionSettings()`, the chat-blocking UI hooks, and the `savedConnectionSettings` metadata, then roll the new path out across all queue handlers.

