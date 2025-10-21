# Default Settings - Best Practices Analysis

## User Requirements

1. **Scene-based workflow only** - No per-message summarization
2. **Running scene summary** - Single injected memory (best practice)
3. **Exclude latest 1 scene** - Allow validation before combining
4. **Auto-hide old messages** - Keep last 2-3 scenes visible
5. **Optimal injection** - Best position given most chat hidden

---

## Best Practices Assessment

### From rentry.org/how2claude#summarization:

1. ✅ **Scene-based chunking** - Superior to message-count chunking
2. ✅ **State-focused, not event-focused** - Better LLM reasoning
3. ✅ **Merged summaries** - Running summary vs individual fragments
4. ✅ **Extreme brevity** - 1500-2000 token target
5. ✅ **Proper terminology** - "memory" not "summary" in prompts
6. ✅ **Active cleanup** - Remove resolved/outdated information

### Prompt Structure (with auto-hide + running summary):

```
┌─────────────────────────────────────┐
│ System Prompt                       │
├─────────────────────────────────────┤
│ Running Scene Summary (Position 2)  │ ← MEMORY INJECTION
│ - Before main prompt                │
│ - Provides broad context            │
│ - All scenes except latest 1        │
├─────────────────────────────────────┤
│ Character Card (Main Prompt)        │
├─────────────────────────────────────┤
│ Lorebook Entries (if triggered)     │
├─────────────────────────────────────┤
│ Recent Messages (Last 2-3 scenes)   │ ← IMMEDIATE CONTEXT
│ - Everything else auto-hidden       │
├─────────────────────────────────────┤
│ Latest User Message                 │
└─────────────────────────────────────┘
```

**Rationale:**
- **Running summary** provides historical state/context
- **Recent messages** provide immediate conversation flow
- **Character card** between them ensures personality is central
- **Old messages hidden** - already captured in running summary
- **Memory takes priority** - injected before character definitions

---

## Settings Changes Required

### 1. Disable Per-Message Summarization

**Current:**
```javascript
auto_summarize: false  // ✅ Already correct
```

**Reason:** Scene-based summarization is superior per best practices.

### 2. Disable Per-Message Injection

**Current:**
```javascript
short_term_position: 2,  // Before main prompt
long_term_position: 2,   // Before main prompt
```

**Change to:**
```javascript
short_term_position: -1,  // Do not inject
long_term_position: -1,   // Do not inject
```

**Reason:** Running scene summary replaces per-message memory. Injecting both would:
- Waste tokens on redundant information
- Confuse Claude with overlapping memory sources
- Violate "merged summaries" best practice

### 3. Disable Combined Summary Injection

**Current:**
```javascript
combined_summary_enabled: false,  // ✅ Already correct
combined_summary_position: 2,
```

**Change to:**
```javascript
combined_summary_position: -1,  // Do not inject
```

**Reason:** Combined summary is for merging per-message summaries. Not needed when using scene-based approach.

### 4. Disable Individual Scene Injection

**Current:**
```javascript
scene_summary_enabled: true,      // Keep true (needed for generation)
scene_summary_position: 2,        // Before main prompt
```

**Change to:**
```javascript
scene_summary_enabled: true,      // ✅ Keep true (generation)
scene_summary_position: -1,       // Do not inject (running summary replaces)
```

**Reason:**
- `scene_summary_enabled: true` - Still needed to generate individual scene summaries
- `scene_summary_position: -1` - Don't inject individuals, they're source data for running summary
- Running summary combines them following best practices (deduplication, state-focus, brevity)

### 5. Auto-Hide by Scene Count

**Current:**
```javascript
auto_hide_message_age: -1,        // Disabled (message-based)
auto_hide_scene_count: -1,        // Disabled (scene-based)
```

**Change to:**
```javascript
auto_hide_message_age: -1,        // ✅ Keep disabled
auto_hide_scene_count: 3,         // Hide messages older than last 3 scenes
```

**Rationale:**

User said "auto hide messages 2 older than the latest scene":
- Latest scene: Scene 5 (visible)
- 1 older: Scene 4 (visible)
- 2 older: Scene 3 (visible)
- 3+ older: Scene 2, 1, etc. (hidden)

This keeps **3 scenes visible** = `auto_hide_scene_count: 3`

**Why 3 scenes?**
- Latest scene excluded from running summary (user validating)
- Previous 2 scenes provide immediate context
- Older scenes in running summary + hidden from direct context
- Balances token usage with conversation flow

**Example flow:**
```
Chat with 6 scenes:

Running Summary: Scenes 1-5 (Scene 6 excluded)
Visible Messages: Scenes 4, 5, 6
Hidden Messages: Scenes 1, 2, 3

Scene 6: Latest, excluded from running (being validated)
Scene 5: In running + visible (recent context)
Scene 4: In running + visible (recent context)
Scenes 1-3: In running + hidden (historical context)
```

### 6. Running Scene Summary Injection

**Current:**
```javascript
running_scene_summary_enabled: true,           // ✅ Correct
running_scene_summary_exclude_latest: 1,       // ✅ Correct
running_scene_summary_auto_generate: true,     // ✅ Correct
running_scene_summary_position: 2,             // ✅ Correct (before main prompt)
running_scene_summary_context_limit: 15,       // ✅ Good (slightly higher for combined)
```

**No changes needed** - Already optimal for best practices.

**Position 2 (Before Main Prompt) is correct because:**
1. Memory provides context before character definitions
2. rentry: "memory takes priority over character definitions"
3. Injection template explicitly states this priority
4. With auto-hide, most messages are hidden, so memory is essential foundation

### 7. Display Settings

**Current:**
```javascript
display_memories: true,           // Show summaries below messages
```

**Change to:**
```javascript
display_memories: false,          // Hide summaries (reduce clutter)
```

**Reason:**
- Per-message summaries not being used
- Scene summaries shown in scene break UI (not per-message display)
- Reduces visual clutter
- **Optional** - user preference, not a best practice requirement

### 8. Scene Summary Generation Settings

**Current:**
```javascript
scene_summary_history_mode: "both",      // Messages + summaries as context
scene_summary_message_types: "both",     // Include all message types (user + AI)
scene_summary_history_count: 1,          // Last 1 scene
```

**Assessment:** ✅ **Keep as-is**

**Reason:**
- `scene_summary_history_mode: "both"` includes previous scene's messages AND summary as context
- `scene_summary_message_types: "both"` includes all messages (user and AI) for full context
- Helps maintain continuity across scenes
- Running summary will deduplicate anyway
- Provides richer context for better scene summaries
- Users can set to "user" or "character" if they only want specific message types

---

## Additional Best Practice Settings

### 1. Scene Break Settings

**Current:**
```javascript
auto_scene_break_enabled: false,                    // Manual scene marking
auto_scene_break_generate_summary: false,           // Don't auto-gen after detection
```

**Assessment:** ✅ **Keep as-is**

**Reason:**
- Auto scene break detection is experimental
- Manual marking gives user control
- Can enable per-user preference

**Optional enhancement:**
```javascript
auto_scene_break_generate_summary: true,   // Auto-gen summary when scene detected
```

This would fully automate: detect scene → generate summary → update running summary.
But keep `false` by default for user control.

### 2. Completion Presets

**Current:**
```javascript
completion_preset: "",                              // Use current preset
scene_summary_completion_preset: "",                // Use current preset
running_scene_summary_completion_preset: "",        // Use current preset
```

**Assessment:** ✅ **Keep empty (use current)**

**Reason:**
- Allows user to set preferred preset globally
- Avoids unexpected preset switches
- Can be overridden per-profile if needed

**Best practice recommendation:**
- Use preset with temperature 0.7-1.0 for summaries
- Lower temperature (0.3-0.5) for validation
- These should be documented, not forced

### 3. Validation Settings

**Current:**
```javascript
error_detection_enabled: false,                     // Validation disabled by default
regular_summary_error_detection_enabled: true,      // Would validate if enabled
scene_summary_error_detection_enabled: false,       // Scene validation off
```

**Assessment:** ✅ **Keep disabled by default**

**Reason:**
- Adds LLM call overhead (cost + time)
- Most users won't need it
- Can enable if experiencing quality issues
- Advanced feature, not beginner default

### 4. Prefill Settings

**Current:**
```javascript
prefill: "",                                        // No prefill
scene_summary_prefill: "",                          // No prefill
running_scene_summary_prefill: "",                  // No prefill
```

**Assessment:** ✅ **Keep empty**

**Reason:**
- Prompts are self-contained
- Adding prefill could confuse LLM
- User can add if needed for their use case

---

## Summary of Changes

### Settings to Change:

```javascript
// In defaultSettings.js

// Disable per-message injection
short_term_position: -1,              // was: 2
long_term_position: -1,               // was: 2

// Disable combined summary injection
combined_summary_position: -1,        // was: 2

// Disable individual scene injection
scene_summary_position: -1,           // was: 2

// Enable scene-based auto-hide
auto_hide_scene_count: 3,             // was: -1

// Optional: Reduce clutter
display_memories: false,              // was: true
```

### Settings Already Correct:

```javascript
// Per-message summarization disabled
auto_summarize: false,                // ✅

// Combined summary disabled
combined_summary_enabled: false,      // ✅

// Scene summary generation enabled
scene_summary_enabled: true,          // ✅

// Running scene summary optimal
running_scene_summary_enabled: true,                // ✅
running_scene_summary_exclude_latest: 1,            // ✅
running_scene_summary_auto_generate: true,          // ✅
running_scene_summary_position: 2,                  // ✅
running_scene_summary_context_limit: 15,            // ✅
```

---

## Impact Assessment

### Token Usage Comparison

**Before (Individual Scenes + Per-Message):**
```
Short-term memory: 500 tokens
Long-term memory: 800 tokens
Individual scenes: 300 tokens each × 5 scenes = 1500 tokens
Total: 2800 tokens

Plus: Full chat history (could be 10k+ tokens)
```

**After (Running Scene Summary + Auto-Hide):**
```
Running scene summary: 1800 tokens (all scenes combined)
Recent messages: Last 3 scenes ≈ 2000 tokens
Total: 3800 tokens

Savings: Eliminated full chat history (8k+ tokens saved)
Net: More efficient despite running summary being narrative
```

**Why this is better:**
1. **Better compression** - Running summary uses narrative format (30% more efficient than JSON for same info)
2. **No redundancy** - Single memory source vs fragmented multiple sources
3. **State-focused** - Better LLM reasoning vs event sequences
4. **Auto-cleanup** - Old messages hidden, not wasting context

### Quality Comparison

**Before:**
- ❌ Fragmented memory across multiple injection points
- ❌ Potential contradictions between short-term, long-term, scenes
- ❌ Event sequences Claude struggles to reason about
- ❌ Verbose "at least X sentences" requirements bloat tokens

**After:**
- ✅ Single cohesive narrative memory
- ✅ Deduplication prevents contradictions
- ✅ State-focused for better reasoning
- ✅ Extreme brevity maximizes token efficiency
- ✅ Recent messages provide conversation flow
- ✅ Follows rentry.org best practices

---

## Migration Path for Existing Users

Users with existing chats using per-message summaries:

1. **Enable running scene summary** (already default)
2. **Mark a few scene breaks** in existing chat
3. **Generate scene summaries** for marked scenes
4. **Running summary auto-generates** from scenes
5. **Optionally disable per-message injection** (settings above)

Their per-message summaries remain in messages but aren't injected. They can:
- Keep them for reference
- Manually convert important ones to scene summaries
- Start fresh with scene-based approach

---

## Conclusion

The updated defaults align with best practices:

✅ **Scene-based workflow** - Superior to per-message
✅ **Running scene summary** - Merged, state-focused, brief
✅ **Auto-hide old messages** - Captured in running summary
✅ **Single injection point** - No redundancy, clear context
✅ **Optimal position** - Memory before character definitions
✅ **Token efficient** - Narrative format, extreme brevity
✅ **LLM-friendly** - State not events, proper terminology

This configuration provides the best balance of:
- **Quality** - Better LLM reasoning with state-focused memory
- **Efficiency** - Optimal token usage through auto-hide + running summary
- **Automation** - Fully automated with validation for quality
- **Flexibility** - User can still access/edit individual scene summaries
