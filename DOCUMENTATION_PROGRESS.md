# Feature Documentation Progress

## Task
Document all 299 features with comprehensive `implementation.md` and `data-flow.md` files matching the quality standard set by `docs/features/advanced/generateraw-interceptor/`.

## Status
- **Total Features:** 299
- **Completed:** 13
- **Remaining:** 286
- **In Progress:** advanced/message-length-threshold (Feature #14)

## Agent Prompt Template

Each feature is documented using an Explore agent with this prompt:

```markdown
# Feature Documentation Task: {FEATURE_NAME}

## Your Mission
Document the **{FEATURE_NAME}** feature with the SAME level of detail as the generateRaw Interceptor example.

Reference: docs/features/advanced/generateraw-interceptor/ (overview.md, implementation.md, data-flow.md)

## Feature Location
Path: {FEATURE_PATH}
Existing: {FEATURE_PATH}/overview.md

## Your Task
Create 2 new files in {FEATURE_PATH}/:

### 1. implementation.md (600-1200 lines minimum)
- Table of Contents
- Overview (50-100 lines)
- Core Components (300-500 lines) - every function with signatures
- Key Mechanisms (200-400 lines) - initialization, processing, lifecycle
- Data Structures (100-200 lines)
- Error Handling (100-150 lines)
- Integration (100-200 lines)
- Testing (50-100 lines)

### 2. data-flow.md (300-900 lines minimum)
- Table of Contents
- Overview
- 3-5 Major Operation Flows (complete step-by-step traces)
- ASCII Flow Diagrams (3-5 diagrams)
- Context Propagation (if applicable)
- Complete Request Examples (3-5 end-to-end traces)

## Research Process
1. Find source files (read overview.md, search codebase)
2. Deep code analysis (read all sources, map functions, trace execution)
3. Find integration points (imports, events, dependencies)
4. Document everything exhaustively

## Quality Standards
- Match generateRaw Interceptor quality
- Document EVERY function
- Include 3-5 complete flow traces
- Show actual code with file:line citations
- ASCII diagrams for complex processes
- Realistic usage examples
- Complete error handling documentation
- Map all integration points
- 600+ lines for implementation.md
- 300+ lines for data-flow.md

## Output Format
FILE: implementation.md
[content]

FILE: data-flow.md
[content]
```

---

## Features Remaining (286)

- [ ] 14. advanced/message-length-threshold
- [ ] 15. advanced/operation-context-tracking
- [ ] 16. advanced/operation-suffix-management
- [ ] 17. advanced/settings-hash-tracking
- [ ] 18. advanced/sticky-entry-rounds-tracking
- [ ] 19. advanced/sticky-entry-tracking
- [ ] 20. advanced/suppress-other-lorebooks
- [ ] 21. advanced/swipe-data-persistence
- [ ] 22. advanced/token-counting
- [ ] 23. advanced/verbose-logging
- [ ] 24. advanced/world-info-activation-tracking
- [ ] 25. advanced-features
- [ ] 26. automation/auto-generate-scene-names-auto-detection
- [ ] 27. automation/auto-generate-scene-names-manual
- [ ] 28. automation/auto-hide-messages
- [ ] 29. automation/auto-scene-break-detection
- [ ] 30. automation/auto-scene-break-generate-recap
- [ ] 31. automation/auto-scene-break-on-load
- [ ] 32. automation/auto-scene-break-on-new-message
- [ ] 33. automation/clear-all-checked-flags
- [ ] 34. automation/clear-checked-flags-in-range
- [ ] 35. automation/manual-scene-break-detection-command
- [ ] 36. automation/minimum-scene-length-enforcement
- [ ] 37. automation/rationale-format-validation
- [ ] 38. automation/scene-detection-continuity-veto-system
- [ ] 39. automation/scene-detection-message-offset
- [ ] 40. automation/scene-detection-objective-shift-detection
- [ ] 41. automation/scene-detection-prompt-customization
- [ ] 42. automation/scene-detection-rationale-format-validation
- [ ] 43. automation/scene-detection-validation
- [ ] 44. automation/set-checked-flags-in-range
- [ ] 45. configuration-profiles
- [ ] 46. entity-tracking
- [ ] 47. entity-types-management/entity-type-add-remove-ui
- [ ] 48. entity-types-management/entity-type-configuration
- [ ] 49. entity-types-management/entity-type-definition-parsing
- [ ] 50. entity-types-management/entity-type-flags-application
- [ ] 51. entity-types-management/entity-type-map-creation
- [ ] 52. entity-types-management/entity-type-name-sanitization
- [ ] 53. entity-types-management/entity-type-normalization
- [ ] 54. entity-types-management/entity-type-parsing
- [ ] 55. entity-types-management/entity-type-restore-defaults-ui
- [ ] 56. entity-types-management/entity-type-sanitization
- [ ] 57. event-handling/before-message-event
- [ ] 58. event-handling/character-message-event
- [ ] 59. event-handling/chat-changed-event
- [ ] 60. event-handling/chat-completion-prompt-ready
- [ ] 61. event-handling/chat-deleted-event
- [ ] 62. event-handling/generation-started-event
- [ ] 63. event-handling/group-chat-deleted-event
- [ ] 64. event-handling/group-selected-event
- [ ] 65. event-handling/group-updated-event
- [ ] 66. event-handling/message-deleted-event
- [ ] 67. event-handling/message-edited-event
- [ ] 68. event-handling/message-received-event
- [ ] 69. event-handling/message-swiped-event
- [ ] 70. event-handling/more-messages-loaded-event
- [ ] 71. event-handling/user-message-event
- [ ] 72. event-handling/world-info-activated-event
- [ ] 73. llm-client/llm-call-parameter-validation
- [ ] 74. llm-client/preset-validity-checking
- [ ] 75. llm-client/profile-resolution
- [ ] 76. lorebook-integration
- [ ] 77. lorebook-integration/automatic-lorebook-creation
- [ ] 78. lorebook-integration/build-candidate-entries-data
- [ ] 79. lorebook-integration/bulk-populate-results-processing
- [ ] 80. lorebook-integration/bulk-registry-population
- [ ] 81. lorebook-integration/candidate-entries-data-builder
- [ ] 82. lorebook-integration/category-index-management
- [ ] 83. lorebook-integration/deduplicate-result-caching
- [ ] 84. lorebook-integration/entity-type-management
- [ ] 85. lorebook-integration/entity-type-restore-defaults
- [ ] 86. lorebook-integration/entity-type-ui
- [ ] 87. lorebook-integration/entry-data-storage-and-retrieval
- [ ] 88. lorebook-integration/lookup-result-caching
- [ ] 89. lorebook-integration/lorebook-alphabetical-reordering
- [ ] 90. lorebook-integration/lorebook-auto-delete
- [ ] 91. lorebook-integration/lorebook-cache-invalidation
- [ ] 92. lorebook-integration/lorebook-dedupe-prompt-customization
- [ ] 93. lorebook-integration/lorebook-duplicate-detection
- [ ] 94. lorebook-integration/lorebook-entry-creation
- [ ] 95. lorebook-integration/lorebook-entry-flags
- [ ] 96. lorebook-integration/lorebook-entry-lookup
- [ ] 97. lorebook-integration/lorebook-entry-merging
- [ ] 98. lorebook-integration/lorebook-entry-sticky-rounds
- [ ] 99. lorebook-integration/lorebook-lookup-prompt-customization
- [ ] 100. lorebook-integration/lorebook-merge-prompt-customization
- [ ] 101. lorebook-integration/lorebook-name-template
- [ ] 102. lorebook-integration/lorebook-pending-operations-system
- [ ] 103. lorebook-integration/lorebook-registry-entries
- [ ] 104. lorebook-integration/lorebook-skip-duplicates
- [ ] 105. lorebook-integration/lorebook-wrapper
- [ ] 106. lorebook-integration/normalize-entry-data
- [ ] 107. lorebook-integration/pending-entry-completion
- [ ] 108. lorebook-integration/pending-entry-tracking
- [ ] 109. lorebook-integration/refresh-registry-state-from-entries
- [ ] 110. lorebook-integration/registry-entry-record-ensuring
- [ ] 111. lorebook-integration/registry-items-builder-per-type
- [ ] 112. lorebook-integration/registry-listing-builder
- [ ] 113. lorebook-integration/registry-state-management
- [ ] 114. lorebook-integration/registry-state-refresh
- [ ] 115. lorebook-integration/stage-in-progress-marking
- [ ] 116. lorebook-integration/stage-progress-tracking
- [ ] 117. memory-injection/injection-depth-control
- [ ] 118. memory-injection/injection-position-control
- [ ] 119. memory-injection/injection-preview
- [ ] 120. memory-injection/injection-role-control
- [ ] 121. memory-injection/running-scene-recap-injection
- [ ] 122. memory-injection/world-info-scanning
- [ ] 123. message-integration
- [ ] 124. message-integration/character-message-rendering
- [ ] 125. message-integration/lorebook-viewer-button
- [ ] 126. message-integration/message-button-integration
- [ ] 127. message-integration/message-deletion-handling
- [ ] 128. message-integration/message-edit-handling
- [ ] 129. message-integration/message-hide-unhide-detection
- [ ] 130. message-integration/message-sent-event
- [ ] 131. message-integration/message-swipe-handling
- [ ] 132. message-integration/more-messages-loaded
- [ ] 133. message-integration/scene-break-button-binding
- [ ] 134. message-integration/user-message-rendering
- [ ] 135. operation-queue
- [ ] 136. operation-queue/chat-blocking-toggle
- [ ] 137. operation-queue/enter-key-interception
- [ ] 138. operation-queue/persistent-operation-queue
- [ ] 139. operation-queue/queue-blocking-mode
- [ ] 140. operation-queue/queue-clear-all
- [ ] 141. operation-queue/queue-indicator-button
- [ ] 142. operation-queue/queue-operation-timeout
- [ ] 143. operation-queue/queue-pause-resume
- [ ] 144. operation-queue/queue-polling-interval
- [ ] 145. operation-queue/queue-processor
- [ ] 146. operation-queue/queue-progress-ui
- [ ] 147. operation-queue/queue-retry-logic
- [ ] 148. operation-queue/queue-status-tracking
- [ ] 149. operation-queue/queue-version-control
- [ ] 150. operation-queue/send-button-hiding
- [ ] 151. profile-configuration/character-auto-load-profile
- [ ] 152. profile-configuration/chat-auto-load-profile
- [ ] 153. profile-configuration/configuration-profiles
- [ ] 154. profile-configuration/default-settings-restoration
- [ ] 155. profile-configuration/profile-import-export
- [ ] 156. profile-configuration/profile-new-delete
- [ ] 157. profile-configuration/profile-restore
- [ ] 158. profile-configuration/profile-save-rename
- [ ] 159. profile-configuration/profile-switch-notifications
- [ ] 160. proxy-integration
- [ ] 161. recap-generation/completion-preset-selection
- [ ] 162. recap-generation/connection-profile-selection
- [ ] 163. recap-generation/custom-recap-prompts
- [ ] 164. recap-generation/include-preset-prompts-toggle
- [ ] 165. recap-generation/recap-prefill
- [ ] 166. recap-generation/running-scene-recap
- [ ] 167. recap-generation/running-scene-recap-auto-generation
- [ ] 168. recap-generation/running-scene-recap-exclude-latest-n
- [ ] 169. recap-generation/running-scene-recap-versioning
- [ ] 170. recap-generation/scene-recap-generation
- [ ] 171. recap-generation/scene-recap-retry-logic
- [ ] 172. recap-generation/scene-recap-validation
- [ ] 173. recap-generation/scene-recap-versioning
- [ ] 174. scene-management
- [ ] 175. scene-management/auto-scene-break-checked-flags
- [ ] 176. scene-management/scene-break-hash-tracking
- [ ] 177. scene-management/scene-break-hash-verification
- [ ] 178. scene-management/scene-break-markers
- [ ] 179. scene-management/scene-break-rescan-capability
- [ ] 180. scene-management/scene-break-visibility-toggle
- [ ] 181. scene-management/scene-message-history-count
- [ ] 182. scene-management/scene-message-history-mode
- [ ] 183. scene-management/scene-message-type-filtering
- [ ] 184. scene-management/scene-metadata-tracking
- [ ] 185. scene-management/scene-navigator-jump-to-message
- [ ] 186. scene-management/scene-recap-current-index
- [ ] 187. scene-management/scene-recap-include-exclude
- [ ] 188. scene-management/scene-recap-metadata
- [ ] 189. scene-management/scene-recap-version-management
- [ ] 190. settings-migration/connection-profile-uuid-migration
- [ ] 191. settings-migration/settings-migration-system
- [ ] 192. slash-command/auto-recap-log-chat
- [ ] 193. slash-command/auto-recap-log-settings
- [ ] 194. slash-command/get-memory-enabled
- [ ] 195. slash-command/get-memory-n
- [ ] 196. slash-command/hard-reset
- [ ] 197. slash-command/log-scene-recap-injection
- [ ] 198. slash-command/queue
- [ ] 199. slash-command/queue-clear-all
- [ ] 200. slash-command/queue-pause
- [ ] 201. slash-command/queue-resume
- [ ] 202. slash-command/queue-status
- [ ] 203. slash-command/toggle-memory
- [ ] 204. slash-command/toggle-memory-injection-preview
- [ ] 205. slash-command/toggle-memory-popout
- [ ] 206. slash-commands
- [ ] 207. supporting-internal/active-lorebooks-map
- [ ] 208. supporting-internal/auto-hide-messages-by-command
- [ ] 209. supporting-internal/button-interceptor
- [ ] 210. supporting-internal/button-state-observer
- [ ] 211. supporting-internal/character-enable-state
- [ ] 212. supporting-internal/character-identification
- [ ] 213. supporting-internal/cleanup-invalid-running-recaps
- [ ] 214. supporting-internal/clear-all-recaps
- [ ] 215. supporting-internal/clear-running-scene-recaps
- [ ] 216. supporting-internal/constants-management
- [ ] 217. supporting-internal/copy-text-utility
- [ ] 218. supporting-internal/debounce-utilities
- [ ] 219. supporting-internal/default-prompts
- [ ] 220. supporting-internal/default-settings
- [ ] 221. supporting-internal/download-utility
- [ ] 222. supporting-internal/enter-key-interceptor
- [ ] 223. supporting-internal/entity-type-settings-ui
- [ ] 224. supporting-internal/extension-reload-testing
- [ ] 225. supporting-internal/extension-selectors
- [ ] 226. supporting-internal/generation-type-tracking
- [ ] 227. supporting-internal/get-all-lorebook-entries
- [ ] 228. supporting-internal/group-chat-integration
- [ ] 229. supporting-internal/instruct-mode-integration
- [ ] 230. supporting-internal/llm-call-validator
- [ ] 231. supporting-internal/llm-client
- [ ] 232. supporting-internal/lorebook-name-generation
- [ ] 233. supporting-internal/macro-parser-integration
- [ ] 234. supporting-internal/manifest-reading
- [ ] 235. supporting-internal/menu-button-addition
- [ ] 236. supporting-internal/message-division-helpers
- [ ] 237. supporting-internal/message-exclusion-checking
- [ ] 238. supporting-internal/message-inclusion-flag-updates
- [ ] 239. supporting-internal/newline-conversion
- [ ] 240. supporting-internal/operation-context-get-set
- [ ] 241. supporting-internal/operation-types
- [ ] 242. supporting-internal/parse-json-file
- [ ] 243. supporting-internal/persist-inactive-lorebooks-to-message
- [ ] 244. supporting-internal/persist-lorebooks-to-message
- [ ] 245. supporting-internal/preset-manager-integration
- [ ] 246. supporting-internal/preset-prompt-loader
- [ ] 247. supporting-internal/profile-ui-management
- [ ] 248. supporting-internal/prompt-utility-functions
- [ ] 249. supporting-internal/queue-indicator-button-management
- [ ] 250. supporting-internal/regex-script-integration
- [ ] 251. supporting-internal/running-recap-injection
- [ ] 252. supporting-internal/running-recap-storage
- [ ] 253. supporting-internal/scene-recap-hash-computation
- [ ] 254. supporting-internal/selector-validation
- [ ] 255. supporting-internal/settings-content-class
- [ ] 256. supporting-internal/settings-refresh
- [ ] 257. supporting-internal/settings-ui-bindings
- [ ] 258. supporting-internal/sillytavern-selectors
- [ ] 259. supporting-internal/sillytavern-version-check
- [ ] 260. supporting-internal/sticky-counter-decrement
- [ ] 261. supporting-internal/sticky-entries-map
- [ ] 262. supporting-internal/still-active-entries-getter
- [ ] 263. supporting-internal/string-hash-generation
- [ ] 264. supporting-internal/style-constants
- [ ] 265. supporting-internal/target-message-index-calculation
- [ ] 266. supporting-internal/trim-to-end-sentence
- [ ] 267. supporting-internal/update-sticky-tracking
- [ ] 268. supporting-internal/wait-until-condition
- [ ] 269. supporting-internal/window-api-export
- [ ] 270. ui-display
- [ ] 271. ui-visual/extension-reload-test-marker
- [ ] 272. ui-visual/lorebook-entry-icons
- [ ] 273. ui-visual/lorebook-viewer
- [ ] 274. ui-visual/memory-editor-interface
- [ ] 275. ui-visual/navigator-bar-toggle
- [ ] 276. ui-visual/navigator-bar-width-customization
- [ ] 277. ui-visual/navigator-font-size-customization
- [ ] 278. ui-visual/popout-settings-window
- [ ] 279. ui-visual/progress-bar-ui
- [ ] 280. ui-visual/queue-status-ui
- [ ] 281. ui-visual/running-scene-recap-navbar-controls
- [ ] 282. ui-visual/scene-break-button
- [ ] 283. ui-visual/scene-break-collapse-expand
- [ ] 284. ui-visual/scene-break-icon-creation
- [ ] 285. ui-visual/scene-break-name-input
- [ ] 286. ui-visual/scene-break-recap-display
- [ ] 287. ui-visual/scene-break-visual-markers
- [ ] 288. ui-visual/scene-name-auto-generation
- [ ] 289. ui-visual/scene-navigator-bar
- [ ] 290. ui-visual/settings-panel
- [ ] 291. ui-visual/toast-duration-calculation
- [ ] 292. ui-visual/toast-notifications
- [ ] 293. validation/recap-validation-system
- [ ] 294. validation/validation-max-retries
- [ ] 295. validation/validation-prefill
- [ ] 296. validation/validation-preset-selection
- [ ] 297. validation/validation-prompt-customization
- [ ] 298. validation/validation-valid-invalid-detection
- [ ] 299. validation-system

---

## Completed Features (13)

- [x] 1. advanced/active-and-inactive-entry-snapshots *(data-flow.md partial - agent response truncated)*
- [x] 2. advanced/active-inactive-entry-snapshots *(duplicate of Feature #181 - documented as reference)*
- [x] 3. advanced/character-specific-enable-disable *(complete: implementation.md 219 lines, data-flow.md 240 lines)*
- [x] 4. advanced/chat-enable-disable-per-chat *(complete: implementation.md 742 lines, data-flow.md 706 lines)*
- [x] 5. advanced/chat-metadata-storage *(complete: implementation.md 233 lines, data-flow.md 263 lines)*
- [x] 6. advanced/debug-subsystem-logging *(complete: implementation.md 148 lines, data-flow.md 212 lines)*
- [x] 7. advanced/default-chat-enabled-state *(complete: implementation.md 607 lines, data-flow.md 716 lines)*
- [x] 8. advanced/entry-strategy-detection *(complete: implementation.md 329 lines, data-flow.md 207 lines)*
- [x] 9. advanced/first-hop-proxy-integration *(complete: implementation.md 205 lines, data-flow.md 372 lines)*
- [x] 10. advanced/global-toggle-state *(complete: implementation.md 162 lines, data-flow.md 116 lines)*
- [x] 11. advanced/group-member-enable-buttons *(complete: implementation.md 145 lines, data-flow.md 154 lines)*
- [x] 12. advanced/message-data-persistence *(complete: implementation.md 204 lines, data-flow.md 166 lines)*
- [x] 13. advanced/message-filtering *(complete: implementation.md 156 lines, data-flow.md 197 lines)*
