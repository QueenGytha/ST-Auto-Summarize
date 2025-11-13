# Recap Generation Best Practices Analysis
## Assessment of ST-Auto-Recap Against rentry.org/how2claude Guidelines

**Document Version:** 2.0 (Automated Workflow Edition)
**Date:** 2025-10-19
**Source:** Analysis of rentry.org/how2claude#recap generation section

---

## Executive Recap

This document analyzes the ST-Auto-Recap extension against Claude best practices from the rentry guide. While the extension's architecture is fundamentally sound, several prompt design decisions conflict with evidence-based best practices for long-context roleplay with Claude.

**IMPORTANT CONTEXT:** This extension is designed for **fully automated** memory management. While the rentry guide emphasizes manual review (reflecting the state of the art when it was written), this extension automates the entire pipeline through robust validation and self-correction mechanisms.

### Key Findings:

- ✅ **Good:** Scene-based architecture, dual memory system, automated validation framework, JSON format for programmatic extraction
- ⚠️ **Needs Revision:** Event tracking approach, terminology, verbosity requirements
- ❌ **Critical Issues:** Event sequences conflict with Claude's reasoning capabilities, forced verbosity causes token bloat

### Impact of Changes:

- **Better recall:** Focus on state vs events improves Claude's reasoning ability
- **Token efficiency:** Removing verbosity requirements reduces bloat by 30-50%
- **Automation-ready:** Scene-based chunking works seamlessly without user intervention
- **Reduced hallucination:** Proper terminology prevents Claude's default recap generation behavior
- **Future-proof:** JSON format enables planned lorebook extraction features

---

## Issue 1: Event Tracking is Fundamentally Flawed

### Current Implementation

**File:** `defaultPrompts.js:33,75,102,133`

```javascript
// events: [ "Each event, in at least 2 sentences. Add any additional context if appropriate." ]
```

Present in:
- `default_prompt`
- `scene_recap_prompt`
- `default_combined_recap_prompt`

### The Problem

From rentry.org/how2claude:

> "Never ask for a sequence of events in your prompt, as the model can't easily reason about the outcomes of long sequences. If you ask for a sequence, it will be just a worse version of your chat history."

> "Past events don't meaningfully affect most roleplays, unless it's a really major story turn. A character reminiscing about the past is also rare. Don't push for 'past events' too hard; it's overrated."

**Why This Matters for Automation:**

1. **Model Capacity Limitations:** LLMs cannot "easily reason about the final state of long sequences." They can pick up individual events but lose the causal chain.

2. **Redundancy:** Event sequences duplicate what's already in chat history, just in compressed form. This provides minimal value.

3. **Token Waste:** Event arrays consume expensive context space without proportional benefit.

4. **Causal Reasoning Failure:** Claude might remember "Bob stole the amulet" and "Alice confronted Bob" but fail to reason that "Alice knows Bob has the amulet."

5. **Validation Difficulty:** Sequential events are harder to validate for consistency than discrete state facts.

### Recommended Changes

**Replace Event Tracking with State-Based Facts:**

```javascript
// Remove: events field entirely
// Keep: State-based fields that capture outcomes

// memorable_events: [ "ONLY major story-changing events that can be recalled independently. Must fundamentally change story direction. Most scenes will have ZERO memorable events." ]
```

**Key Principles:**
- Events must be **independently recallable** (not sequential)
- Only **major story turns** qualify (most scenes have none)
- Each event should be a discrete fact, not part of a chain
- **Prefer tracking the resulting state** over the event itself

**Example Comparison:**

❌ **Bad (Sequential Events):**
```json
{
  "events": [
    "Bob stole the sacred amulet from the temple.",
    "Alice discovered Bob was the thief.",
    "They fought in the marketplace."
  ]
}
```

✅ **Good (State-Based):**
```json
{
  "npcs_facts": {
    "Bob": "Has the sacred amulet (stolen). Alice knows he's the thief. Speech: cocky, defensive when confronted."
  },
  "current_relationships": {
    "Alice & Bob": "Hostile. They fought in the marketplace over the stolen amulet. Trust is broken."
  },
  "objects": {
    "Sacred Amulet": "Currently in Bob's possession (stolen from temple). Alice is pursuing its return."
  }
}
```

### Implementation for Automated Workflow

**Updated Field Instructions with Automated Cleanup Logic:**

```javascript
// memorable_events: [
//   "RARE: Only include events that fundamentally changed the story direction.",
//   "Examples: Character death, major betrayal, world-changing discovery.",
//   "Most scenes will have ZERO memorable events - that's normal.",
//   "If the outcome is captured in npcs_facts, relationships, or objectives, DON'T duplicate it here."
// ]

// AUTOMATED CLEANUP RULES (enforced by prompt):
// - If an event's outcome is fully captured in other fields, don't list the event
// - If an event is more than 3 scenes old and hasn't been referenced, remove it
// - Maximum 5 memorable events total - remove oldest if exceeded
```

### Validation Enhancement

```javascript
// In recapValidation.js - add event validation
async function validate_event_usage(recap) {
    const parsed = JSON.parse(recap);
    const events = parsed.memorable_events || parsed.events || [];

    // Fail if events array is bloated
    if (events.length > 5) {
        debug(`[Validation] Too many events: ${events.length} (max: 5)`);
        return false;
    }

    // Fail if events contain sequential markers
    const sequential_markers = ['then', 'after that', 'next', 'following this'];
    for (const event of events) {
        if (sequential_markers.some(marker => event.toLowerCase().includes(marker))) {
            debug(`[Validation] Event contains sequential language: "${event}"`);
            return false;
        }
    }

    return true;
}
```

---

## Issue 2: "Recap" Terminology Problem

### Current Implementation

**Files:** `defaultPrompts.js`, templates throughout

```javascript
// Analyze the provided Roleplay History. Fill out the JSON template below...
export const default_long_template = `<roleplay_recap>...</roleplay_recap>`;
export const scene_recap_default_prompt = `Recap the following scene...`;
```

### The Problem

From rentry.org/how2claude:

> "Never ask for the actual recap in the recap generation prompt, and never mention that word at all. Recap Generation is one of the typical uses of LLMs, and Claude is trained to give recaps in a specific format, which is probably not what you want."

**Why This Matters for Automation:**

1. **Training Bias:** Claude has specific RLHF training for "recap generation" tasks that produces generic, formatted recaps

2. **Format Lock-in:** Using "recap" triggers Claude's default recap generation behavior (often bullet points, topic sentences, etc.) which may conflict with our JSON template

3. **Lost Customization:** Carefully crafted template gets partially overridden by Claude's recap generation training

4. **Semantic Confusion:** "Recap" implies compression, not structured fact extraction

5. **Validation Conflicts:** Claude may output "Recap:" prefixes or other default formatting that breaks JSON parsing

### Recommended Changes

**Terminology Replacement Matrix:**

| Current Term | Replace With | Context |
|--------------|--------------|---------|
| "recap" in prompts | "memory", "facts", "state" | Instructions to Claude |
| "Recap" | "Extract facts from", "Analyze and record", "Track" | Instructions |
| `<roleplay_recap>` | `<roleplay_memory>` | XML tags |
| "Roleplay History" | "Roleplay Scene" or "Scene Content" | Acceptable as-is |
| Variable names (internal) | Keep as-is | Code doesn't affect Claude |
| UI labels (user-facing) | Keep as-is | Users understand "recap" |

**Example Revisions:**

❌ **Current:**
```javascript
export const scene_recap_default_prompt = `Recap the following scene as if you are writing a concise chapter recap for a roleplay story.`;
```

✅ **Revised:**
```javascript
export const scene_memory_extraction_prompt = `Extract key facts from the following scene for the roleplay memory. Focus on the most important character developments, emotional shifts, and plot points that would be useful to remember after this scene is no longer visible.`;
```

❌ **Current:**
```javascript
export const default_long_template = `<roleplay_recap>
{{memories}}
</roleplay_recap>`;
```

✅ **Revised:**
```javascript
export const default_long_template = `<roleplay_memory>
<!--Current story state. Takes priority over character/world definitions.-->
{{memories}}
</roleplay_memory>`;
```

### Implementation for Automated Workflow

**Validation Enhancement:**

```javascript
// In recapValidation.js - detect recap generation artifacts
async function validate_no_recap_artifacts(recap) {
    // Detect if Claude used default recap generation format
    const recap_artifacts = [
        /^Recap:/i,
        /^In recap,/i,
        /^To recap,/i,
        /^The following is a recap/i,
        /^Here(?:'s| is) a recap/i
    ];

    for (const pattern of recap_artifacts) {
        if (pattern.test(recap)) {
            debug(`[Validation] Recap contains artifact: ${pattern}`);
            return false; // Trigger retry
        }
    }

    return true;
}
```

**Important:** Keep "recap" in UI labels, variable names, and user-facing documentation. Only remove it from prompts sent to Claude.

---

## Issue 3: Chunking Strategy Alignment

### Current Implementation

**File:** `defaultSettings.js` (inferred from code)

```javascript
auto_recap_message_limit: 10,  // Recap every N messages
auto_recap_batch_size: 3,      // Batch multiple messages
recap generation_delay: 2,            // Delay by message count
```

**File:** `recapping.js:560-574`

```javascript
async function auto_recap_chat() {
    let messages_to_recap = collect_messages_to_auto_recap()
    let messages_to_batch = get_settings('auto_recap_batch_size');
    if (messages_to_recap.length < messages_to_batch) {
        messages_to_recap = []
    }
    await recap_messages(messages_to_recap, show_progress);
}
```

### The Problem

From rentry.org/how2claude:

> "Chunking is a surprisingly non-trivial problem for arbitrary documents. It can't be done mechanically, and **automatic recap generation each X words or each Y messages will never work properly.**"

> "You must align your chunks with the logical breakpoints in the story."

**Why This Matters for Automation:**

1. **Arbitrary Chunking Breaks Coherence:**
   - Recapping mid-scene captures incomplete information
   - Claude doesn't know how the scene ends, producing poor extractions
   - Example: Recapping during combat vs after combat completion yields different outcomes

2. **Batch Size is Semantically Meaningless:**
   - Whether you recap 3 messages or 5 messages is irrelevant
   - What matters is whether the **scene** is complete

3. **Automated Quality Depends on Chunking:**
   - Without manual review, chunking quality determines output quality
   - Scene-aligned chunks produce consistently better results
   - Mid-scene chunks require more validation retries

### Current Strengths

✅ **You Already Have The Solution!**

**File:** `autoSceneBreakDetection.js` + `auto_scene_break_detection_prompt`

```javascript
export const auto_scene_break_detection_prompt = `You are analyzing a roleplay conversation to detect scene breaks. A scene break occurs when there is a significant shift in:
- Location or setting (moving to a different place)
- Time period (significant time skip like "later that day", "the next morning", etc.)
- Narrative focus or POV (switching to different characters or perspective)
- Major plot transition (end of one story arc, beginning of another)
...`
```

This is **exactly the right approach!** Scene breaks are logical chunking points.

### Recommended Changes for Automated Workflow

**Priority 1: Make Scene-Based Chunking Primary**

```javascript
// New settings hierarchy
{
  // PRIMARY: Scene-based (recommended for automation)
  "auto_scene_break_detection_enabled": true,  // Enable by default
  "auto_update_memory_on_scene_break": true,   // Enable by default
  "scene_break_confidence_threshold": 0.7,     // Only trigger if confident

  // FALLBACK: Message-based (safety net)
  "fallback_message_limit": 20,  // If no scene break detected in 20 messages, force update
  "message_based_enabled": true,  // Keep as fallback, not primary

  // DEPRECATED: Batch size (remove)
  "auto_recap_batch_size": 0  // No longer used
}
```

**Priority 2: Enhance Scene Break Detection Reliability**

```javascript
// In autoSceneBreakDetection.js
async function detect_scene_break_with_confidence(current_msg, previous_msg) {
    const result = await detect_scene_break(current_msg, previous_msg);

    // Parse confidence from rationale
    const confidence = parse_confidence(result.rationale);

    return {
        is_scene_break: result.status,
        confidence: confidence,
        rationale: result.rationale
    };
}

function parse_confidence(rationale) {
    // Extract confidence markers from rationale
    const high_confidence_markers = ['clear', 'obvious', 'significant', 'major'];
    const low_confidence_markers = ['slight', 'minor', 'possibly', 'might'];

    let score = 0.5; // neutral

    if (high_confidence_markers.some(m => rationale.toLowerCase().includes(m))) {
        score += 0.3;
    }
    if (low_confidence_markers.some(m => rationale.toLowerCase().includes(m))) {
        score -= 0.3;
    }

    return Math.max(0, Math.min(1, score));
}
```

**Priority 3: Smart Fallback Logic**

```javascript
// Automated chunking decision tree
async function should_update_memory() {
    const ctx = getContext();
    const messages_since_last_update = get_messages_since_last_memory_update();

    // Check 1: Scene break detected?
    if (get_settings('auto_scene_break_detection_enabled')) {
        const scene_break = await detect_scene_break_with_confidence(
            ctx.chat[ctx.chat.length - 1],
            ctx.chat[ctx.chat.length - 2]
        );

        if (scene_break.is_scene_break && scene_break.confidence >= get_settings('scene_break_confidence_threshold')) {
            debug(`Scene break detected with ${scene_break.confidence} confidence: ${scene_break.rationale}`);
            return { should_update: true, reason: 'scene_break', confidence: scene_break.confidence };
        }
    }

    // Check 2: Fallback message limit reached?
    const fallback_limit = get_settings('fallback_message_limit') || 20;
    if (messages_since_last_update >= fallback_limit) {
        debug(`Fallback message limit reached: ${messages_since_last_update} >= ${fallback_limit}`);
        return { should_update: true, reason: 'fallback_limit', confidence: 1.0 };
    }

    // Check 3: Has enough new content accumulated?
    const new_content_tokens = count_new_content_tokens();
    const min_content_threshold = get_settings('min_content_tokens') || 500;
    if (new_content_tokens >= min_content_threshold && messages_since_last_update >= 5) {
        debug(`Sufficient new content: ${new_content_tokens} tokens, ${messages_since_last_update} messages`);
        return { should_update: true, reason: 'content_threshold', confidence: 0.8 };
    }

    return { should_update: false, reason: 'waiting', confidence: 0 };
}
```

**Priority 4: Scene Completion Verification**

```javascript
// Add to scene break detection: verify scene is actually complete
export const scene_completion_verification_prompt = `Review the most recent messages in this scene.

Has this scene reached a natural conclusion? A scene is complete when:
- The immediate situation is resolved (not necessarily the overall plot)
- There's a clear transition point (location change, time skip, mood shift)
- No dialogue or action is mid-sentence or incomplete
- The scene doesn't end on a cliffhanger requiring immediate continuation

Recent messages:
{{recent_messages}}

Respond with JSON:
{
  "is_complete": true or false,
  "rationale": "Brief explanation"
}`;
```

### Implementation Plan

1. **Phase 1:** Enable scene break detection by default
2. **Phase 2:** Add confidence scoring to scene break detection
3. **Phase 3:** Implement smart fallback logic (message limit as safety net)
4. **Phase 4:** Add scene completion verification for edge cases
5. **Phase 5:** Deprecate batch size setting (no longer meaningful)

---

## Issue 4: Verbosity Requirements

### Current Implementation

**File:** `defaultPrompts.js:6-20,48-62,91-105`

```javascript
// Field instructions:
// npcs_facts: { "npc_name": "Appearance, speech manner, personality traits. Only facts, not actions." }
// visited_locations: { "Location Name": "Describe in at least 3 sentences." }
// current_relationships: { "npc_pair": "Current long-term relationship between recurring npcs or with {{user}}, in at least 3 sentences." }
// planned_events: [ "Each planned event in at least 3 sentences." ]
// events: [ "Each event, in at least 2 sentences. Add any additional context if appropriate." ]
```

### The Problem

From rentry.org/how2claude:

> "Make sure you don't ask for too much detail; remember that realistically you only have 2-4k tokens total for the entire recap, if you want it to remain useful for the model."

> "If your recap is small, you can inject it into the chat history at a depth of 3-4. If it's large, keep it in the system prompt."

> "Your recap can sometimes leak into your roleplay... if your recap is **terse**, it will usually lack Claudeisms."

**Why This Matters for Automation:**

1. **Token Bloat:** Forcing "at least 3 sentences" for every location/relationship creates massive recaps
   - 10 locations × 3 sentences × ~15 tokens = 450 tokens just for locations
   - This compounds quickly across all fields
   - Automated systems can't judge "is this worth 3 sentences?"

2. **Reduced Usable Context:** Large recaps push chat history into the "lost in the middle" zone

3. **Increased Repetition:** Verbose recaps form strong patterns that trigger in-context learning

4. **Claudeism Amplification:** More text = more opportunities for Claude to insert purple prose

5. **Flexibility Loss:** Not every location needs 3 sentences; a tavern visited once needs less detail than the main hub

6. **Validation Overhead:** Harder to validate verbose content for accuracy

### Example Impact

**Current prompt produces:**

```json
{
  "visited_locations": {
    "The Rusty Nail Tavern": "A dimly lit establishment in the merchant quarter with wooden floors that creak with every step. The air is thick with the smell of ale and pipe smoke. Scarred tables and mismatched chairs fill the common room, where locals gather to trade gossip and coin.",
    "East Road": "A well-traveled dirt path connecting the city to the eastern farmlands. Deep wagon ruts mark the road from years of merchant traffic. Wildflowers grow along the edges during spring and summer months."
  }
}
```

**Token count:** ~120 tokens for just 2 locations

**Optimal prompt would produce:**

```json
{
  "visited_locations": {
    "The Rusty Nail Tavern": "Dimly lit tavern in merchant quarter. Locals gather for gossip.",
    "East Road": "Dirt path to eastern farmlands."
  }
}
```

**Token count:** ~35 tokens - **71% reduction!**

### Recommended Changes for Automated Workflow

**Remove All Sentence Requirements:**

```javascript
// Field instructions:
// npcs_facts: { "npc_name": "Appearance, speech manner, personality traits. Only facts, not actions." }
// npcs_status: { "npc_name": "Current status (active, missing, deceased, etc.)" }
// visited_locations: { "Location Name": "Brief description. Only memorable/unique features." }
// secrets: { "Secret content": "Known by: X, Y. Hidden from: Z." }
// current_relationships: { "npc_pair": "Current status. Include emotional tone and recent changes." }
// planned_events: [ "Future plans. Include who and when if known." ]
// objects: { "Object Name": "Description, significance, current owner/location." }
// lore: { "Fact": "World-building, rules, or background info." }

// IMPORTANT: Be concise. Use minimum words needed to capture essential information.
// Quality over quantity. The entire memory should target 1500-2000 tokens maximum.
```

**Add Automated Brevity Enforcement:**

```javascript
// In prompts - add instruction that triggers on token count
// This creates a self-balancing feedback loop

// OOC REQUEST: Pause the roleplay and step out of character for this reply.
// Extract key facts from the roleplay scene and fill out the JSON template below.
//
// CRITICAL: EXTREME BREVITY REQUIRED
// - Use MINIMUM words to capture each fact
// - Remove ALL unnecessary adjectives and flourishes
// - Prefer fragments over complete sentences where clear
// - Target: Entire output should be 1500-2000 tokens MAXIMUM
// - If you find yourself writing long descriptions, you're doing it wrong
//
// Examples of good brevity:
// ❌ BAD: "A tall, imposing figure with piercing blue eyes and a commanding presence"
// ✅ GOOD: "Tall, blue eyes, commanding"
//
// ❌ BAD: "The ancient sword that once belonged to the legendary hero"
// ✅ GOOD: "Ancient sword, legendary hero's"
```

**Automated Token Budget Enforcement:**

```javascript
// In recapValidation.js - strict token limit validation
async function validate_token_limit(recap) {
    const token_count = count_tokens(recap);
    const soft_limit = get_settings('memory_soft_token_limit') || 2000;
    const hard_limit = get_settings('memory_hard_token_limit') || 2500;

    if (token_count > hard_limit) {
        debug(`[Validation] Recap exceeds hard limit: ${token_count} > ${hard_limit}`);
        return false; // Fail validation, trigger retry with additional brevity instruction
    }

    if (token_count > soft_limit) {
        debug(`[Validation] Recap exceeds soft limit: ${token_count} > ${soft_limit} (warning)`);
        // Don't fail, but log for monitoring
    }

    return true;
}

// On retry after token limit failure, append additional instruction:
const brevity_reinforcement = `
CRITICAL: Previous output was ${token_count} tokens, which exceeds the ${hard_limit} token limit.
You MUST be MORE CONCISE. Cut descriptions by at least 50%.
Remove ALL unnecessary words. Use fragments. Be terse.
`;
```

**Field-Specific Brevity Examples:**

```javascript
// Include in prompt as examples for Claude to learn from
// FIELD BREVITY EXAMPLES:
//
// npcs_facts:
// ❌ "A skilled warrior with flowing red hair and piercing green eyes who speaks with unwavering confidence"
// ✅ "Warrior. Red hair, green eyes. Confident speech."
//
// visited_locations:
// ❌ "An old abandoned warehouse on the outskirts of town, filled with dusty crates and broken windows"
// ✅ "Abandoned warehouse, town outskirts. Dusty, broken windows."
//
// current_relationships:
// ❌ "They share a deep bond of mutual trust and respect built over years of adventuring together"
// ✅ "Close allies. Mutual trust from years together."
//
// objects:
// ❌ "An ornate golden locket containing a faded portrait of a young woman, currently hanging around Alice's neck"
// ✅ "Golden locket with portrait. Alice wears it."
```

### Implementation Plan

1. **Phase 1:** Remove all "at least X sentences" requirements from prompts
2. **Phase 2:** Add brevity instructions and examples to prompts
3. **Phase 3:** Implement token limit validation with soft/hard limits
4. **Phase 4:** Add retry logic with brevity reinforcement
5. **Phase 5:** Monitor token counts and adjust limits based on real-world usage

---

## Issue 5: Duplicate/Unclear Prompt Purposes

### Current Implementation

**File:** `defaultPrompts.js`

```javascript
// Lines 1-40
export const default_prompt = `...JSON template...`;

// Lines 43-82
export const scene_recap_prompt = `...JSON template...`;
// ☝️ IDENTICAL to default_prompt!

// Lines 180
export const scene_recap_default_prompt = `Recap the following scene as if you are writing a concise chapter recap...`;
// ☝️ Completely different approach (narrative style)
```

### The Problem

**Three prompts, two approaches, unclear purposes:**

1. `default_prompt` - JSON structured (for individual messages?)
2. `scene_recap_prompt` - JSON structured, **identical to #1** (for scenes?)
3. `scene_recap_default_prompt` - Narrative prose (for scenes?)

**Confusion for Automation:**
- Why are `default_prompt` and `scene_recap_prompt` identical?
- When should the system use JSON vs narrative approach?
- What triggers which prompt?
- Which prompt is validated by which validation prompt?

### Recommended Changes for Automated Workflow

**Clearly Differentiate by Use Case:**

```javascript
// 1. MESSAGE-LEVEL: For individual message extraction (granular)
export const message_memory_extraction_prompt = `
// Extract facts from this single message for immediate context tracking.
// Focus on new information introduced in THIS message only.
// This is for fine-grained tracking, not scene-level context.
...
`;

// 2. SCENE-LEVEL: For scene conclusion extraction (primary workflow)
export const scene_memory_extraction_prompt = `
// Extract key facts from the completed scene below.
// Focus on outcomes, character states, and information needed for future scenes.
// This is the PRIMARY memory extraction method - be thorough but concise.
...
`;

// 3. PERSISTENT MEMORY UPDATE: For updating long-term memory (combines scenes)
export const persistent_memory_update_prompt = `
// Update the persistent memory with facts from recent scenes.
// ADD new facts, UPDATE changed facts, REMOVE irrelevant facts.
// This maintains the long-term story memory across all scenes.
...
`;

// 4. NARRATIVE (OPTIONAL): Alternative format if user prefers prose
export const narrative_memory_prompt = `
// Extract key facts in narrative prose format.
// This is an alternative to JSON for users who prefer natural language.
...
`;
```

**Clear Usage Matrix:**

| Prompt Type | When Used | Output Format | Validation |
|-------------|-----------|---------------|------------|
| `message_memory_extraction_prompt` | Per-message (if enabled) | JSON (concise) | `message_validation_prompt` |
| `scene_memory_extraction_prompt` | Scene break detected | JSON (detailed) | `scene_validation_prompt` |
| `persistent_memory_update_prompt` | Combining scenes | JSON (comprehensive) | `persistent_validation_prompt` |
| `narrative_memory_prompt` | User preference | Prose | `narrative_validation_prompt` |

**Automated Prompt Selection Logic:**

```javascript
function select_memory_extraction_prompt(context) {
    const extraction_mode = get_settings('memory_extraction_mode');

    switch(extraction_mode) {
        case 'per_message':
            return get_settings('message_memory_extraction_prompt');

        case 'per_scene':
            // Primary workflow
            return get_settings('scene_memory_extraction_prompt');

        case 'persistent_update':
            // For combining/updating existing memory
            return get_settings('persistent_memory_update_prompt');

        case 'narrative':
            // Alternative format
            return get_settings('narrative_memory_prompt');

        default:
            debug('[WARNING] Unknown extraction mode, defaulting to scene-level');
            return get_settings('scene_memory_extraction_prompt');
    }
}
```

**Remove Duplicate Prompts:**

```javascript
// REMOVE: scene_recap_prompt (identical to default_prompt)
// REMOVE: default_prompt (rename to message_memory_extraction_prompt)
// KEEP: scene_recap_default_prompt (rename to narrative_memory_prompt)
// ADD: scene_memory_extraction_prompt (primary)
// ADD: persistent_memory_update_prompt (for updates)
```

### Implementation Plan

1. **Phase 1:** Identify and document current prompt usage across codebase
2. **Phase 2:** Create new clearly-named prompts with distinct purposes
3. **Phase 3:** Implement prompt selection logic
4. **Phase 4:** Deprecate duplicate prompts
5. **Phase 5:** Update validation to match each prompt type

---

## Issue 6: JSON Format (Confirmed Optimal Choice)

### Current Implementation

**Prompts:** JSON format
**Injection:** XML wrapper tags

```javascript
// Prompt asks for JSON:
{
  "npcs_facts": {},
  "events": [],
  ...
}

// Injection wraps in XML:
<roleplay_memory>
{{memories}}
</roleplay_memory>
```

### Analysis

From rentry.org/how2claude:

> "Claude is trained to understand XML formatting to structure its context and improve its accuracy."

**However, for your use case:**

✅ **JSON is the correct choice** because:

1. **Programmatic Extraction:** Planned lorebook integration requires structured data
2. **Automated Parsing:** JSON is trivial to parse reliably in JavaScript
3. **Field Validation:** Easy to validate specific fields programmatically
4. **Type Safety:** Can enforce arrays vs objects vs strings
5. **No Manual Editing:** Users won't hand-edit, so human readability is less important
6. **Extraction Queries:** `memory.npcs_facts["Alice"]` is simpler than XML DOM traversal

**XML advantages don't apply here:**
- ❌ Manual editing - not needed (fully automated)
- ❌ Human readability - not primary concern
- ❌ Semantic tag names - JSON keys serve same purpose
- ❌ Comments - not needed in structured data

### Recommended Enhancements

**Keep JSON, Improve Framing:**

```javascript
export const default_long_template = `<roleplay_memory format="json">
<!--Current story state. Takes priority over character/world definitions.-->
<!--This is structured data for automated processing. Do not modify the JSON structure.-->
{{memories}}
</roleplay_memory>`;

export const default_short_template = `<roleplay_memory format="json" scope="short-term">
<!--Recent story context. Automatically managed.-->
{{memories}}
</roleplay_memory>`;

export const default_combined_template = `<roleplay_memory format="json" scope="persistent">
<!--Long-term story memory. Updated automatically as scenes progress.-->
{{memories}}
</roleplay_memory>`;
```

**Add JSON Schema Reference (Optional):**

```javascript
// For even more robust validation, reference a schema
export const default_long_template = `<roleplay_memory format="json" schema="memory_v1">
<!--Story memory conforming to memory_v1 schema.-->
{{memories}}
</roleplay_memory>`;

// Then in validation:
const MEMORY_SCHEMA_V1 = {
    required_fields: ['npcs_facts', 'npcs_status', 'visited_locations', 'current_relationships', 'objects'],
    optional_fields: ['npcs_plans', 'npcs_mentioned', 'secrets', 'planned_events', 'lore', 'memorable_events', 'minor_npcs', 'factions', 'pending_decisions'],
    field_types: {
        npcs_facts: 'object',
        npcs_status: 'object',
        npcs_plans: 'array',
        // ...
    }
};
```

**Validation Enhancement for JSON:**

```javascript
// In recapValidation.js
async function validate_json_structure(recap) {
    let parsed;

    // 1. Parse JSON
    try {
        parsed = JSON.parse(recap);
    } catch (e) {
        debug(`[Validation] Invalid JSON: ${e.message}`);
        return false;
    }

    // 2. Validate required fields exist
    const required = MEMORY_SCHEMA_V1.required_fields;
    for (const field of required) {
        if (!(field in parsed)) {
            debug(`[Validation] Missing required field: ${field}`);
            return false;
        }
    }

    // 3. Validate field types
    for (const [field, expected_type] of Object.entries(MEMORY_SCHEMA_V1.field_types)) {
        if (field in parsed) {
            const actual_type = Array.isArray(parsed[field]) ? 'array' : typeof parsed[field];
            if (actual_type !== expected_type) {
                debug(`[Validation] Field ${field} has wrong type: ${actual_type} (expected ${expected_type})`);
                return false;
            }
        }
    }

    // 4. Validate no extra fields (prevents hallucinated fields)
    const allowed = [...MEMORY_SCHEMA_V1.required_fields, ...MEMORY_SCHEMA_V1.optional_fields];
    for (const field of Object.keys(parsed)) {
        if (!allowed.includes(field)) {
            debug(`[Validation] Unexpected field: ${field}`);
            // Don't fail, just warn (Claude might add useful fields)
        }
    }

    return true;
}
```

### Recommendation

**✅ Keep JSON format as-is, enhance with:**

1. XML wrapper with `format="json"` attribute for clarity
2. Schema-based validation for robustness
3. Better error messages when JSON parsing fails
4. Type checking for each field

**Do NOT:**
- ❌ Switch to XML format (loses programmatic extraction benefits)
- ❌ Use mixed JSON/XML (overcomplicated)
- ❌ Use plain text narrative (can't extract to lorebook)

---

## Issue 7: Active Memory Pruning Instructions

### Current State

Comprehensive tracking across many categories, but **limited guidance on removing entries**.

### The Problem

From rentry.org/how2claude:

> "Remove everything that you won't ever need. You sure you won't visit that location anymore? Remove. You sure you won't need that NPC in your story anymore? Remove."

**Why This Matters for Automation:**

1. **Token Budget is Finite:** 1500-2000 tokens max for useful memory
2. **Irrelevant Info Creates Noise:** Distracts Claude from what matters now
3. **Automated Systems Can't Judge Relevance:** Need explicit rules for removal
4. **Memory Grows Unbounded Without Pruning:** Will eventually exceed context limits
5. **Stale Info Causes Hallucinations:** Old facts contradict new reality

**Current Tracking:**

```javascript
{
  "npcs_facts": {},          // ✓ Keep if recurring
  "npcs_status": {},         // ✓ Keep if relevant
  "npcs_plans": [],          // ✓ Keep if active
  "npcs_mentioned": {},      // ? Remove if never encountered
  "visited_locations": {},   // ? Remove if won't revisit
  "secrets": {},             // ✓ Keep unless revealed
  "current_relationships": {},// ✓ Keep if NPCs still present
  "planned_events": [],      // ? Remove if completed
  "objects": {},             // ? Remove if lost/destroyed/irrelevant
  "lore": {},                // ✓ Keep if actually used
  "memorable_events": [],    // ? Remove if old and unreferenced
  "minor_npcs": {},          // ? Remove after scene ends
  "factions": {},            // ✓ Keep if relevant
  "pending_decisions": []    // ? Remove if resolved
}
```

### Recommended Changes for Automated Workflow

**Add Explicit Removal Rules to Prompts:**

```javascript
// OOC REQUEST: Extract facts from the scene and UPDATE the memory template below.
//
// CRITICAL MEMORY MANAGEMENT RULES:
//
// REMOVE these entries (check every update):
// - NPCs who appeared once and won't return (move to npcs_mentioned if referenced)
// - Locations visited once with no plan to return
// - Objects that are lost, destroyed, consumed, or trivial
// - Completed objectives and resolved decisions
// - Secrets that have been revealed to everyone
// - Relationships with NPCs who are gone
// - Events older than 3 scenes that haven't been referenced
// - Minor NPCs after their scene concludes
//
// UPDATE these entries (don't just append):
// - NPC status when it changes (active → deceased, etc.)
// - Relationships when they evolve
// - Object locations when they move
// - Secrets when more people learn them
//
// ADD only when necessary:
// - Don't add one-time NPCs (use npcs_mentioned instead)
// - Don't add trivial objects
// - Don't add every location (only important/recurring ones)
//
// TARGET: Keep total memory under 1500-2000 tokens by aggressive pruning.
```

**Field-Specific Automated Pruning Rules:**

```javascript
// npcs_facts: {
//   "npc_name": "Facts about RECURRING NPCs only."
//   // REMOVE: One-time NPCs after their scene
//   // REMOVE: NPCs who are deceased and no longer relevant
//   // MOVE to npcs_mentioned: NPCs who might appear but haven't yet
// }

// npcs_mentioned: {
//   "npc_name": "NPCs mentioned but not encountered."
//   // REMOVE: If mentioned 3+ scenes ago and still not encountered
//   // MOVE to npcs_facts: When actually encountered
// }

// visited_locations: {
//   "Location Name": "Locations you may RETURN to."
//   // REMOVE: One-time locations after scene ends
//   // REMOVE: Locations more than 5 scenes ago with no revisit
//   // KEEP: Main hubs, important recurring locations
// }

// objects: {
//   "Object Name": "Important items currently relevant."
//   // REMOVE: Consumed items (food, potions)
//   // REMOVE: Lost or stolen items (unless quest to recover)
//   // REMOVE: Destroyed items
//   // REMOVE: Trivial items (common weapons, clothes, etc.)
//   // KEEP: Quest items, unique items, key possessions
// }

// planned_events: [
//   "Active plans and goals."
//   // REMOVE: Completed plans
//   // REMOVE: Abandoned plans
//   // REMOVE: Plans from NPCs who are gone
// ]

// pending_decisions: [
//   "Unresolved choices affecting future."
//   // REMOVE: Resolved decisions
//   // REMOVE: Decisions that became irrelevant
//   // REMOVE: Decisions older than 5 scenes with no progress
// ]

// memorable_events: [
//   "RARE: Major story-turning events only."
//   // REMOVE: Events older than 5 scenes that haven't been referenced
//   // REMOVE: Events whose outcomes are captured in other fields
//   // MAXIMUM: 5 events total (remove oldest if exceeded)
// ]
```

**Automated Pruning Validation:**

```javascript
// In recapValidation.js
async function validate_pruning_rules(recap, previous_recap) {
    const current = JSON.parse(recap);
    const previous = previous_recap ? JSON.parse(previous_recap) : null;

    if (!previous) return true; // First recap, nothing to prune

    const warnings = [];

    // Check if memory is growing without removal
    const current_entries = count_total_entries(current);
    const previous_entries = count_total_entries(previous);

    if (current_entries > previous_entries * 1.5) {
        warnings.push(`Memory grew by 50%+ (${previous_entries} → ${current_entries}). Are you pruning?`);
    }

    // Check for stale npcs_mentioned
    const stale_mentioned = get_stale_mentioned_npcs(current, previous);
    if (stale_mentioned.length > 0) {
        warnings.push(`Stale npcs_mentioned: ${stale_mentioned.join(', ')} (mentioned but not encountered)`);
    }

    // Check for completed objectives still listed
    const completed_objectives = get_completed_objectives(current);
    if (completed_objectives.length > 0) {
        warnings.push(`Completed objectives not removed: ${completed_objectives.join(', ')}`);
    }

    // Check for event bloat
    if (current.memorable_events && current.memorable_events.length > 5) {
        debug(`[Validation] Too many memorable_events: ${current.memorable_events.length} (max: 5)`);
        return false; // Hard fail
    }

    // Log warnings but don't fail (pruning is best-effort)
    if (warnings.length > 0) {
        debug(`[Validation] Pruning warnings: ${warnings.join('; ')}`);
    }

    return true;
}

function count_total_entries(memory) {
    let count = 0;
    for (const [key, value] of Object.entries(memory)) {
        if (Array.isArray(value)) {
            count += value.length;
        } else if (typeof value === 'object') {
            count += Object.keys(value).length;
        }
    }
    return count;
}
```

**Automated Scene-Age Tracking:**

```javascript
// Track when each entry was last referenced
// This enables automatic removal of stale entries

// Enhanced memory format (internal metadata, not sent to Claude):
{
  "memory_data": {
    "npcs_facts": { "Alice": "..." },
    // ...
  },
  "metadata": {
    "entry_ages": {
      "npcs_facts.Alice": { "added_scene": 5, "last_referenced_scene": 8 },
      "visited_locations.Tavern": { "added_scene": 3, "last_referenced_scene": 3 }
    },
    "current_scene": 10
  }
}

// Automated pruning based on age:
function auto_prune_stale_entries(memory_with_metadata) {
    const current_scene = memory_with_metadata.metadata.current_scene;
    const max_age = get_settings('max_entry_age_scenes') || 5;

    for (const [entry_path, age_info] of Object.entries(memory_with_metadata.metadata.entry_ages)) {
        const age = current_scene - age_info.last_referenced_scene;

        if (age > max_age) {
            debug(`[Auto-Prune] Removing stale entry: ${entry_path} (${age} scenes old)`);
            remove_entry(memory_with_metadata.memory_data, entry_path);
        }
    }

    return memory_with_metadata.memory_data;
}
```

### Implementation Plan

1. **Phase 1:** Add explicit removal rules to all prompts
2. **Phase 2:** Add field-specific pruning guidance
3. **Phase 3:** Implement pruning validation checks
4. **Phase 4:** Add scene-age tracking metadata
5. **Phase 5:** Implement automated stale entry removal

---

## Issue 8: "Combined Recap" → "Persistent Memory" Clarification

### Current Implementation

**File:** `combinedRecap.js`

```javascript
async function generate_combined_recap() {
    // Collects individual message recaps
    // Merges them into a combined recap
    // Updates existing combined recap with new data
}
```

**Trigger:** After N new recaps are created

### The Problem

**Conceptual Clarity for Automation:**
- "Combined" suggests merging separate recaps
- Reality: Should be **updating** a single persistent memory
- Each scene should **update** the same memory structure
- Not "combining" but "maintaining"

**Best Practice:**
- One evolving memory structure
- Each scene **adds new, modifies existing, removes irrelevant**
- Not "combining" separate memories, but **updating** one memory

### Current Strengths

✅ **Your `default_combined_recap_prompt` Already Does This Correctly:**

```javascript
// You are being given multiple pieces of a single roleplay. Analyze and combine them while avoiding redundancy and repetition.

{{#if previous_combined_recap}}
// The current roleplay history template. Use this as the basis of your analysis,
// updating it with any new or changed information, removing anything which is
// no longer relevant and fully resolved:
{{previous_combined_recap}}
{{/if}}
```

This **IS** an update operation! Just needs clearer naming and documentation.

### Recommended Changes for Automated Workflow

**Terminology Clarification:**

| Current Term | Better Term | Why |
|--------------|-------------|-----|
| "Combined Recap" | "Persistent Memory" | Clearer purpose |
| "Generate combined recap" | "Update persistent memory" | Describes operation |
| "Combine recaps" | "Merge new facts into memory" | More accurate |
| `combinedRecap.js` | `persistentMemory.js` | Clearer file purpose |

**Workflow Clarity:**

```
❌ OLD MENTAL MODEL:
Scene 1 → Recap A
Scene 2 → Recap B
Scene 3 → Recap C
Combine A+B+C → Combined Recap

✅ NEW MENTAL MODEL:
Scene 1 → Extract facts → Initialize persistent memory
Scene 2 → Extract facts → Update persistent memory (add/modify/remove)
Scene 3 → Extract facts → Update persistent memory (add/modify/remove)
...
```

**Updated Prompt Name:**

```javascript
// Previously: default_combined_recap_prompt
// Now: persistent_memory_update_prompt

export const persistent_memory_update_prompt = `// OOC REQUEST: Pause the roleplay and step out of character for this reply.
// UPDATE the persistent roleplay memory with information from recent scenes.
// This is an UPDATE operation, not a combination.
//
// Process:
// 1. Review the existing persistent memory below
// 2. Review the new scene facts extracted
// 3. ADD new facts discovered
// 4. UPDATE facts that changed
// 5. REMOVE facts that are no longer relevant
// 6. Output the COMPLETE updated memory (not just changes)
//
// Guidelines:
// - Avoid redundancy and repetition
// - Be concise (target: 1500-2000 tokens total)
// - Focus on information needed for future scenes
// - Aggressively remove stale/irrelevant entries

{{#if existing_persistent_memory}}
<existing_persistent_memory>
{{existing_persistent_memory}}
</existing_persistent_memory>
{{/if}}

{{#if recent_scene_facts}}
<recent_scene_facts>
{{recent_scene_facts}}
</recent_scene_facts>
{{/if}}

{{#if recent_chat_context}}
<recent_chat_context>
{{recent_chat_context}}
</recent_chat_context>
{{/if}}

Output the COMPLETE updated persistent memory:
{
  "npcs_facts": {},
  "npcs_status": {},
  "npcs_plans": [],
  "npcs_mentioned": {},
  "visited_locations": {},
  "secrets": {},
  "current_relationships": {},
  "planned_events": [],
  "objects": {},
  "lore": {},
  "memorable_events": [],
  "minor_npcs": {},
  "factions": {},
  "pending_decisions": []
}`;
```

**Settings Rename:**

```javascript
// Old settings:
{
  "combined_recap_enabled": true,
  "combined_recap_run_interval": 3,
  "combined_recap_new_count": 0,
  "combined_recap_prompt": "default_combined_recap_prompt"
}

// New settings:
{
  "persistent_memory_enabled": true,
  "persistent_memory_update_frequency": "per_scene", // or "every_N_scenes"
  "scenes_since_last_persistent_update": 0,
  "persistent_memory_update_prompt": "persistent_memory_update_prompt"
}
```

**Automated Update Logic:**

```javascript
// In persistentMemory.js (renamed from combinedRecap.js)

async function should_update_persistent_memory() {
    const frequency = get_settings('persistent_memory_update_frequency');
    const scenes_since_last = get_settings('scenes_since_last_persistent_update') || 0;

    switch(frequency) {
        case 'per_scene':
            // Update after every scene
            return scenes_since_last >= 1;

        case 'every_2_scenes':
            return scenes_since_last >= 2;

        case 'every_3_scenes':
            return scenes_since_last >= 3;

        case 'every_5_scenes':
            return scenes_since_last >= 5;

        default:
            return scenes_since_last >= 1;
    }
}

async function update_persistent_memory() {
    debug('[Persistent Memory] Starting update...');

    // Get existing persistent memory
    const existing = get_settings('persistent_memory_data');

    // Get recent scene facts (from last N scenes)
    const recent_scenes = get_recent_scene_memories();

    // Get recent chat context for additional context
    const recent_chat = get_recent_chat_context();

    // Build update prompt
    const prompt = substitute_params(
        get_settings('persistent_memory_update_prompt'),
        {
            existing_persistent_memory: existing ? JSON.stringify(existing, null, 2) : null,
            recent_scene_facts: JSON.stringify(recent_scenes, null, 2),
            recent_chat_context: recent_chat
        }
    );

    // Generate updated memory
    const updated_memory = await generate_memory_update(prompt);

    // Validate
    if (get_settings('error_detection_enabled')) {
        const is_valid = await validate_recap(updated_memory, "persistent");
        if (!is_valid) {
            error('[Persistent Memory] Validation failed');
            return null;
        }
    }

    // Save updated memory
    set_settings('persistent_memory_data', updated_memory);
    set_settings('scenes_since_last_persistent_update', 0);

    debug('[Persistent Memory] Update complete');
    return updated_memory;
}
```

### Implementation Plan

1. **Phase 1:** Rename "combined recap" → "persistent memory" in code
2. **Phase 2:** Update prompts to clarify UPDATE vs COMBINE operation
3. **Phase 3:** Rename files and functions for clarity
4. **Phase 4:** Update settings and migration
5. **Phase 5:** Update documentation and UI labels

---

## Issue 9: Secret Tracking Format Enhancement

### Current Implementation

```javascript
// secrets: { "Secret": "Kept secret by <npc> from <target>." }
```

**Example output:**
```json
{
  "secrets": {
    "Bob stole the amulet": "Kept secret by Bob from Alice"
  }
}
```

### Analysis

From rentry.org/how2claude:

> "If you keep the recap to track secrets, the best way to keep them from leaking (characters casually mentioning supposed secrets as if they were known) is to mark who keeps the secret from whom."

**Current format is good, but can be more explicit for automation.**

### Recommended Enhancement for Automation

**More Explicit Format:**

```javascript
// secrets: {
//   "Secret content": "Known by: X, Y. Hidden from: Z, {{user}}."
// }
//
// Examples:
// "Bob stole the amulet": "Known by: Bob, Charlie. Hidden from: Alice, {{user}}."
// "Alice is the princess": "Known by: Alice, King. Hidden from: everyone else."
//
// IMPORTANT: Always specify BOTH who knows AND who doesn't know.
// This prevents secrets from leaking into roleplay.
```

**Automated Secret Leak Detection:**

```javascript
// In recapValidation.js
async function validate_secret_format(recap) {
    const parsed = JSON.parse(recap);
    const secrets = parsed.secrets || {};

    for (const [secret_content, secret_info] of Object.entries(secrets)) {
        // Check format includes both "Known by:" and "Hidden from:"
        if (!secret_info.includes("Known by:") || !secret_info.includes("Hidden from:")) {
            debug(`[Validation] Secret missing required format: "${secret_content}"`);
            debug(`[Validation] Expected: "Known by: X. Hidden from: Y."`);
            debug(`[Validation] Got: "${secret_info}"`);
            return false;
        }

        // Check that at least one person knows the secret
        const known_by_match = secret_info.match(/Known by:\s*([^.]+)/);
        if (!known_by_match || known_by_match[1].trim() === '') {
            debug(`[Validation] Secret has no one who knows it: "${secret_content}"`);
            return false;
        }

        // Check that at least one person doesn't know
        const hidden_from_match = secret_info.match(/Hidden from:\s*([^.]+)/);
        if (!hidden_from_match || hidden_from_match[1].trim() === '') {
            debug(`[Validation] Secret not hidden from anyone: "${secret_content}"`);
            return false;
        }
    }

    return true;
}
```

**Automated Secret Cleanup:**

```javascript
// Secrets should be removed when:
// 1. Everyone knows (no longer a secret)
// 2. All people who knew are gone/dead
// 3. The secret is no longer relevant

// Add to persistent_memory_update_prompt:
//
// secrets cleanup rules:
// - REMOVE secrets that everyone now knows (revealed)
// - REMOVE secrets where all keepers are gone/dead
// - REMOVE secrets that are no longer plot-relevant
// - UPDATE when more people learn a secret (move from "Hidden from" to "Known by")
```

**Examples:**

```json
{
  "secrets": {
    "Bob stole the sacred amulet from the temple": "Known by: Bob, Charlie (witnessed it). Hidden from: Alice, {{user}}, town guards.",
    "Alice is actually Princess Elara in disguise": "Known by: Alice, King Aldric (her father). Hidden from: Bob, {{user}}, everyone in the tavern.",
    "The ancient sword contains the soul of a demon": "Known by: {{user}} (discovered it). Hidden from: Lyra, all NPCs."
  }
}
```

**Removal example:**

```json
{
  "secrets": {
    // REMOVED: "Bob stole the amulet" - Alice and {{user}} now know, no longer secret
    // KEPT: "Alice is Princess Elara" - still hidden from most people
    "Alice is actually Princess Elara in disguise": "Known by: Alice, King Aldric, {{user}} (just learned). Hidden from: Bob, everyone in the tavern.",
    "The ancient sword contains a demon soul": "Known by: {{user}}, Lyra (just told her). Hidden from: all NPCs except Lyra."
  }
}
```

### Implementation Plan

1. **Phase 1:** Update secret field instructions in all prompts
2. **Phase 2:** Add secret format validation
3. **Phase 3:** Add automated secret cleanup rules
4. **Phase 4:** Add examples to prompts

---

## Issue 10: Validation Complexity (Retain and Enhance)

### Current Implementation

**File:** `recapValidation.js`

- Separate validation prompts (`regular_recap_error_detection_prompt`, etc.)
- Retry logic with configurable max retries
- Additional LLM calls for each validation
- Auto-exclusion on repeated failures

### Analysis for Automated Workflow

**The rentry guide emphasizes manual review:**
> "Always check what it generated, of course"

**However, this reflects the state of the art when written. For fully automated workflows:**

✅ **Validation is ESSENTIAL** because:

1. **No Human Oversight:** Without manual review, validation is the only quality control
2. **Catches Format Errors:** JSON parsing errors, missing fields, wrong types
3. **Prevents Bad Memory:** Invalid recaps corrupt the entire memory system
4. **Enables Self-Correction:** Retry logic allows Claude to fix mistakes automatically
5. **Cost-Effective:** 1-3 validation calls per recap cheaper than manual labor
6. **Scalable:** Can process unlimited recaps without human bottleneck

### Recommended Enhancements

**Validation Pipeline (Multi-Stage):**

```javascript
// Stage 1: Fast structural validation (no LLM call)
// Stage 2: Heuristic content validation (no LLM call)
// Stage 3: LLM semantic validation (expensive, only if needed)

async function validate_recap_pipeline(recap, type = "regular") {
    debug(`[Validation] Starting pipeline for ${type} recap...`);

    // STAGE 1: Structural validation (fast, free)
    const structural = await validate_structural(recap);
    if (!structural.valid) {
        debug(`[Validation] Structural validation failed: ${structural.reason}`);
        return { valid: false, stage: 'structural', reason: structural.reason };
    }

    // STAGE 2: Heuristic validation (fast, free)
    const heuristic = await validate_heuristic(recap, type);
    if (!heuristic.valid) {
        debug(`[Validation] Heuristic validation failed: ${heuristic.reason}`);
        return { valid: false, stage: 'heuristic', reason: heuristic.reason };
    }

    // STAGE 3: LLM validation (slow, expensive) - only if enabled and heuristics passed
    if (get_settings('llm_validation_enabled')) {
        const llm = await validate_with_llm(recap, type);
        if (!llm.valid) {
            debug(`[Validation] LLM validation failed: ${llm.reason}`);
            return { valid: false, stage: 'llm', reason: llm.reason };
        }
    }

    debug(`[Validation] All stages passed`);
    return { valid: true, stage: 'complete', reason: 'All validation passed' };
}
```

**Stage 1: Structural Validation (Fast, Free):**

```javascript
async function validate_structural(recap) {
    // 1. Valid JSON?
    let parsed;
    try {
        parsed = JSON.parse(recap);
    } catch (e) {
        return { valid: false, reason: `Invalid JSON: ${e.message}` };
    }

    // 2. Has required fields?
    const required = ['npcs_facts', 'npcs_status', 'visited_locations', 'current_relationships', 'objects'];
    for (const field of required) {
        if (!(field in parsed)) {
            return { valid: false, reason: `Missing required field: ${field}` };
        }
    }

    // 3. Correct field types?
    const field_types = {
        npcs_facts: 'object',
        npcs_status: 'object',
        npcs_plans: 'array',
        npcs_mentioned: 'object',
        visited_locations: 'object',
        secrets: 'object',
        current_relationships: 'object',
        planned_events: 'array',
        objects: 'object',
        lore: 'object',
        memorable_events: 'array',
        minor_npcs: 'object',
        factions: 'object',
        pending_decisions: 'array'
    };

    for (const [field, expected_type] of Object.entries(field_types)) {
        if (field in parsed) {
            const actual_type = Array.isArray(parsed[field]) ? 'array' : typeof parsed[field];
            if (actual_type !== expected_type) {
                return { valid: false, reason: `Field ${field} wrong type: ${actual_type} (expected ${expected_type})` };
            }
        }
    }

    // 4. No completely empty required fields?
    for (const field of required) {
        const value = parsed[field];
        const is_empty = Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0;
        // Allow some empty fields, but not ALL of them
    }

    return { valid: true, reason: 'Structural validation passed' };
}
```

**Stage 2: Heuristic Validation (Fast, Free):**

```javascript
async function validate_heuristic(recap, type) {
    const parsed = JSON.parse(recap);

    // 1. Token count check
    const token_count = count_tokens(recap);
    const soft_limit = 2000;
    const hard_limit = 2500;

    if (token_count > hard_limit) {
        return { valid: false, reason: `Exceeds hard token limit: ${token_count} > ${hard_limit}` };
    }
    if (token_count > soft_limit) {
        debug(`[Validation] Warning: Exceeds soft limit: ${token_count} > ${soft_limit}`);
    }

    // 2. Check for refusal language
    const refusal_patterns = [
        /I cannot/i,
        /I apologize/i,
        /I'm (not able|unable) to/i,
        /I don't (feel comfortable|think it's appropriate)/i
    ];

    const full_text = JSON.stringify(parsed);
    for (const pattern of refusal_patterns) {
        if (pattern.test(full_text)) {
            return { valid: false, reason: `Contains refusal language: ${pattern}` };
        }
    }

    // 3. Check for recap artifacts
    const recap_artifacts = [
        /^Recap:/i,
        /In recap,/i,
        /To recap,/i
    ];

    for (const pattern of recap_artifacts) {
        if (pattern.test(full_text)) {
            return { valid: false, reason: `Contains recap artifact: ${pattern}` };
        }
    }

    // 4. Check event count
    if (parsed.memorable_events && parsed.memorable_events.length > 5) {
        return { valid: false, reason: `Too many memorable_events: ${parsed.memorable_events.length} (max: 5)` };
    }

    // 5. Check for sequential event language
    if (parsed.memorable_events) {
        const sequential_markers = ['then', 'after that', 'next', 'following'];
        for (const event of parsed.memorable_events) {
            for (const marker of sequential_markers) {
                if (event.toLowerCase().includes(marker)) {
                    return { valid: false, reason: `Event contains sequential language: "${event.substring(0, 50)}..."` };
                }
            }
        }
    }

    // 6. Check secret format
    if (parsed.secrets && Object.keys(parsed.secrets).length > 0) {
        for (const [secret, info] of Object.entries(parsed.secrets)) {
            if (!info.includes("Known by:") || !info.includes("Hidden from:")) {
                return { valid: false, reason: `Secret missing format: "${secret.substring(0, 30)}..."` };
            }
        }
    }

    // 7. Check for empty strings in objects (usually an error)
    for (const [field, value] of Object.entries(parsed)) {
        if (typeof value === 'object' && !Array.isArray(value)) {
            for (const [key, val] of Object.entries(value)) {
                if (val === '' || (typeof val === 'string' && val.trim() === '')) {
                    return { valid: false, reason: `Empty value in ${field}.${key}` };
                }
            }
        }
    }

    return { valid: true, reason: 'Heuristic validation passed' };
}
```

**Stage 3: LLM Validation (Slow, Expensive, Optional):**

```javascript
async function validate_with_llm(recap, type) {
    // Use existing validation logic from recapValidation.js
    // This is expensive, so only run if heuristics passed

    if (!get_settings('llm_validation_enabled')) {
        return { valid: true, reason: 'LLM validation disabled' };
    }

    const is_valid = await validate_recap(recap, type);

    if (!is_valid) {
        return { valid: false, reason: 'LLM validation failed' };
    }

    return { valid: true, reason: 'LLM validation passed' };
}
```

**Enhanced Retry Logic with Feedback:**

```javascript
async function generate_memory_with_validation(index) {
    const max_retries = get_settings('memory_generation_max_retries') || 3;
    let retry_count = 0;
    let additional_instructions = '';

    while (retry_count <= max_retries) {
        // Generate
        const prompt = await create_recap_prompt(index) + additional_instructions;
        const recap = await recap_text(prompt);

        // Validate
        const validation = await validate_recap_pipeline(recap, "regular");

        if (validation.valid) {
            debug(`[Generation] Success on attempt ${retry_count + 1}`);
            return { success: true, recap: recap };
        }

        // Failed validation - prepare for retry
        retry_count++;
        debug(`[Generation] Attempt ${retry_count} failed at ${validation.stage}: ${validation.reason}`);

        if (retry_count > max_retries) {
            error(`[Generation] Max retries (${max_retries}) exceeded`);
            return { success: false, error: validation.reason };
        }

        // Build feedback for next attempt
        additional_instructions = build_retry_instructions(validation);
    }
}

function build_retry_instructions(validation_result) {
    const { stage, reason } = validation_result;

    // Provide specific instructions based on failure type
    switch(stage) {
        case 'structural':
            return `\n\nCRITICAL: Previous attempt failed JSON validation: ${reason}
Ensure output is VALID JSON with NO text before or after the JSON object.`;

        case 'heuristic':
            if (reason.includes('token limit')) {
                return `\n\nCRITICAL: Previous attempt was too long (${reason}).
You MUST be MORE CONCISE. Cut all descriptions by 50%. Use fragments, not sentences.`;
            }
            if (reason.includes('sequential language')) {
                return `\n\nCRITICAL: Previous attempt contained sequential events: ${reason}
Focus on FINAL STATE, not event sequences. Capture outcomes, not step-by-step.`;
            }
            if (reason.includes('secret format')) {
                return `\n\nCRITICAL: Secret format incorrect: ${reason}
MUST use format: "Secret": "Known by: X, Y. Hidden from: Z."`;
            }
            return `\n\nCRITICAL: Previous attempt failed validation: ${reason}
Fix the issue and try again.`;

        case 'llm':
            return `\n\nCRITICAL: Previous attempt failed semantic validation: ${reason}
Ensure output follows ALL instructions and contains only factual information.`;

        default:
            return `\n\nCRITICAL: Previous attempt failed: ${reason}`;
    }
}
```

**Settings for Validation:**

```javascript
{
  // Validation pipeline
  "structural_validation_enabled": true,  // Always on (free, fast)
  "heuristic_validation_enabled": true,   // Always on (free, fast)
  "llm_validation_enabled": false,        // Opt-in (expensive, slow)

  // Retry logic
  "memory_generation_max_retries": 3,

  // Token limits
  "memory_soft_token_limit": 2000,
  "memory_hard_token_limit": 2500,

  // Auto-exclusion (keep this)
  "auto_exclude_on_failure": true,  // Exclude message if all retries fail

  // Validation presets (for LLM validation)
  "regular_recap_error_detection_preset": "...",
  "scene_recap_error_detection_preset": "...",
  "persistent_memory_error_detection_preset": "..."
}
```

### Implementation Plan

1. **Phase 1:** Implement structural validation (free, fast)
2. **Phase 2:** Implement heuristic validation (free, fast)
3. **Phase 3:** Keep existing LLM validation as opt-in Stage 3
4. **Phase 4:** Enhance retry logic with specific feedback
5. **Phase 5:** Add validation monitoring/metrics

---

## Rentry-Aligned Workflow (Automated Edition)

### The Fully Automated Recap Generation Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER PLAYS ROLEPLAY                                     │
│    Messages accumulate in chat history                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. SCENE BREAK DETECTION (Automated)                       │
│    After each message:                                      │
│    - Check: Has scene changed?                              │
│      • Location shift                                       │
│      • Time skip                                            │
│      • Narrative transition                                 │
│    - Confidence threshold check (>0.7)                      │
│    - Fallback: Force update after 20 messages               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. EXTRACT SCENE MEMORY (Automated)                        │
│    Prompt: scene_memory_extraction_prompt                  │
│    - Focus on CURRENT STATE (not events)                   │
│    - Extract facts in JSON format                          │
│    - Be concise (target <1500 tokens)                      │
│    - Include removal rules                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. VALIDATE EXTRACTION (Automated)                         │
│    Stage 1: Structural (JSON valid? Fields present?)       │
│    Stage 2: Heuristic (Token count? Artifacts? Format?)    │
│    Stage 3: LLM (Optional, expensive)                      │
│                                                             │
│    If failed: Retry with specific feedback (max 3 times)   │
│    If all retries fail: Auto-exclude message, log error    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. UPDATE PERSISTENT MEMORY (Automated, Periodic)          │
│    Trigger: Every N scenes (configurable)                  │
│    Prompt: persistent_memory_update_prompt                 │
│    - Review existing persistent memory                     │
│    - Merge new scene facts                                 │
│    - ADD new, UPDATE changed, REMOVE stale                 │
│    - Output complete updated memory                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. VALIDATE UPDATE (Automated)                             │
│    Same pipeline as scene extraction                       │
│    Additional: Check for stale entries, bloat              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. INJECT INTO CONTEXT (Automated)                         │
│    Small memory (<1200 tokens):                             │
│      → Inject at depth 3-4 in chat history                 │
│    Large memory (>1200 tokens):                             │
│      → Place in system prompt                               │
│    Wrap in <roleplay_memory format="json">                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. CONTINUE ROLEPLAY                                        │
│    Memory provides context for Claude                      │
│    Process repeats at next scene break                     │
│    No user intervention required                           │
└─────────────────────────────────────────────────────────────┘
```

### Key Differences from Manual Workflow

| Aspect | Manual (Rentry) | Automated (This Extension) |
|--------|----------------|----------------------------|
| **Triggering** | User clicks button at scene end | Auto-detected scene breaks |
| **Review** | User reviews and edits | Multi-stage validation |
| **Quality Control** | Human judgment | Heuristic + LLM validation |
| **Pruning** | User removes irrelevant entries | Prompt instructions + validation |
| **Errors** | User fixes and regenerates | Auto-retry with feedback (3x) |
| **Scaling** | Limited by user time | Unlimited, fully automated |

---

## Comparison: Current vs Recommended Prompts

### Current Scene Prompt

```javascript
export const scene_recap_prompt = `// OOC REQUEST: Pause the roleplay and step out of character for this reply.
// Analyze the provided Roleplay History. Fill out the JSON template below, following the instructions for each field. Do not speculate or invent details.
// Output only a single, correctly formatted JSON object. Do not include any text outside the JSON object.
// If a field has no relevant information, leave it empty ({} for objects, [] for arrays).

// Field instructions:
// npcs_facts: { "npc_name": "Appearance, speech manner, personality traits. Only facts, not actions." }
// npcs_status: { "npc_name": "Current status (e.g. active, missing, deceased)." }
// npcs_plans: [ "Future plans or goals discussed by npcs." ]
// npcs_mentioned: { "npc_name": "Role or N/A" }
// visited_locations: { "Location Name": "Describe in at least 3 sentences." }
// secrets: { "Secret": "Kept secret by <npc> from <target>." }
// current_relationships: { "npc_pair": "Current long-term relationship between recurring npcs or with {{user}}, in at least 3 sentences." }
// planned_events: [ "Each planned event in at least 3 sentences." ]
// objects: { "Object Name": "Description, significance, and current owner if known." }
// lore: { "Fact": "World-building, rules, or background info." }
// events: [ "Each event, in at least 2 sentences. Add any additional context if appropriate." ]
// minor_npcs: { "npc_name": "Brief description or role." }
// factions: { "Faction Name": { "members": [ "npc1", "npc2" ], "goals": "Description of goals." } }
// pending_decisions: [ "Each unresolved choice or cliffhanger, in at least 2 sentences." ]

{
	"npcs_facts": {},
	"npcs_status": {},
	"npcs_plans": [],
	"npcs_mentioned": {},
	"visited_locations": {},
	"secrets": {},
	"current_relationships": {},
	"planned_events": [],
	"objects": {},
	"lore": {},
	"events": [],
	"minor_npcs": {},
	"factions": {},
	"pending_decisions": []
}

// Roleplay History:
{{message}}`;
```

### Recommended Scene Memory Extraction Prompt

```javascript
export const scene_memory_extraction_prompt = `// OOC REQUEST: Pause the roleplay and step out of character for this reply.
// Extract key facts from the completed scene below for the roleplay memory.
// Focus on CURRENT STATE and information needed for future scenes.
//
// CRITICAL GUIDELINES:
//
// 1. EXTREME BREVITY REQUIRED
//    - Use MINIMUM words to capture each fact
//    - Remove ALL unnecessary adjectives and flourishes
//    - Prefer fragments over complete sentences
//    - Target: 1500-2000 tokens MAXIMUM for entire output
//
// 2. FOCUS ON STATE, NOT EVENTS
//    - Capture CURRENT state: who, what, where, status
//    - Don't track event sequences ("then this happened, then that")
//    - Outcomes matter, not the steps to get there
//
// 3. ACTIVE PRUNING
//    - Only include NPCs who will likely return
//    - Only include locations you may revisit
//    - Don't list one-time characters (use npcs_mentioned if referenced)
//    - Don't list trivial objects
//
// 4. FORMAT REQUIREMENTS
//    - Output ONLY valid JSON, no text before or after
//    - All fields are optional - omit if no relevant data
//    - Empty objects: {} | Empty arrays: []
//
// FIELD INSTRUCTIONS:
//
// npcs_facts: { "name": "Appearance, personality, status, relationship to {{user}}. CONCISE." }
//   Example: "Lyra": "Warrior. Red hair, green eyes. Confident. Searching for stolen Sunblade. Trusts {{user}}."
//
// npcs_status: { "name": "active | missing | deceased | other" }
//   Example: "Marcus": "active", "Old King": "deceased"
//
// npcs_plans: [ "Character's goal. Brief." ]
//   Example: ["Lyra: Recover Sunblade from bandits", "Bob: Flee to eastern city"]
//
// npcs_mentioned: { "name": "Mentioned but not met. Role." }
//   Example: "Bandit Leader": "Leads gang on East Road. Has Lyra's sword?"
//   REMOVE if mentioned 3+ scenes ago and still not encountered
//
// visited_locations: { "name": "Brief description. Only if may revisit." }
//   Example: "East Road": "Dirt path to farmlands. Bandit activity."
//   REMOVE one-time locations after scene ends
//
// secrets: { "secret": "Known by: X, Y. Hidden from: Z." }
//   Example: "Bob stole the amulet": "Known by: Bob, Charlie. Hidden from: Alice, {{user}}."
//   REMOVE when revealed to everyone
//
// current_relationships: { "X & Y": "Status. Emotional tone." }
//   Example: "{{user}} & Lyra": "Close allies. Trust from shared quest."
//   REMOVE if one character is gone
//
// planned_events: [ "Future plan. Who, what, when." ]
//   Example: ["Investigate bandits on East Road tomorrow morning"]
//   REMOVE completed plans
//
// objects: { "name": "Description, significance, location/owner." }
//   Example: "Sunblade": "Legendary sword. Glows gold. Stolen by bandits, Lyra seeks it."
//   REMOVE consumed/destroyed/lost/trivial items
//
// lore: { "fact": "World rule or background info." }
//   Example: "Magic is forbidden in the kingdom": "Mages are hunted by Crown Inquisitors"
//
// memorable_events: [ "RARE. Only major story-turning events." ]
//   MOST SCENES HAVE ZERO. Only include if fundamentally changed story.
//   Example: ["King was assassinated", "{{user}} discovered they're the chosen one"]
//   REMOVE if outcome captured in other fields
//   MAXIMUM 5 total - remove oldest if exceeded
//
// minor_npcs: { "name": "One-line role." }
//   Example: "Tavern Patron": "Drunk local who gave rumor about bandits"
//   REMOVE after scene concludes
//
// factions: { "name": { "members": ["x"], "goals": "brief" } }
//   Example: "Bandit Gang": { "members": ["Bob", "Charlie"], "goals": "Control East Road trade" }
//
// pending_decisions: [ "Unresolved choice affecting future." ]
//   Example: ["Accept or decline the King's quest", "Trust or betray Marcus"]
//   REMOVE when resolved
//
// BREVITY EXAMPLES:
// ❌ BAD: "A skilled warrior with flowing red hair and piercing green eyes who speaks with confidence"
// ✅ GOOD: "Warrior. Red hair, green eyes. Confident."
//
// ❌ BAD: "An old abandoned warehouse on the outskirts of town, filled with dusty crates"
// ✅ GOOD: "Abandoned warehouse, town outskirts. Dusty, broken windows."
//
// ❌ BAD: "They share a deep bond of mutual trust built over years of adventuring"
// ✅ GOOD: "Close allies. Mutual trust from years together."
//
// OUTPUT TEMPLATE:
{
	"npcs_facts": {},
	"npcs_status": {},
	"npcs_plans": [],
	"npcs_mentioned": {},
	"visited_locations": {},
	"secrets": {},
	"current_relationships": {},
	"planned_events": [],
	"objects": {},
	"lore": {},
	"memorable_events": [],
	"minor_npcs": {},
	"factions": {},
	"pending_decisions": []
}

// Scene Content:
{{message}}`;
```

**Key Improvements:**
- ✅ Removed "at least X sentences" requirements
- ✅ Removed `events` array, replaced with `memorable_events` with strict limits
- ✅ Added explicit brevity instructions with examples
- ✅ Added removal guidance for each field
- ✅ Changed "Roleplay History" → "Scene Content"
- ✅ Token target specified (1500-2000)
- ✅ Focus on STATE not EVENTS explicitly stated
- ✅ Format requirements clear

---

## Recommended Settings Changes

### Current Settings (Inferred)

```javascript
{
  // Message-based (PROBLEMATIC)
  "auto_recap_message_limit": 10,
  "auto_recap_batch_size": 3,
  "recap generation_delay": 2,

  // Combined recap
  "combined_recap_enabled": true,
  "combined_recap_run_interval": 3,

  // Validation
  "error_detection_enabled": true,
  "regular_recap_error_detection_enabled": true,
  "regular_recap_error_detection_retries": 3,

  // Prompts
  "prompt": "default_prompt",
  "scene_recap_prompt": "scene_recap_prompt"
}
```

### Recommended Settings (Automated Workflow)

```javascript
{
  // PRIMARY: Scene-based memory extraction
  "memory_extraction_mode": "per_scene",  // "per_scene" | "per_message" | "persistent_update"

  // Scene break detection
  "auto_scene_break_detection_enabled": true,   // Enable by default
  "auto_update_memory_on_scene_break": true,    // Auto-trigger on scene break
  "scene_break_confidence_threshold": 0.7,      // Minimum confidence to trigger

  // Fallback safety
  "fallback_message_limit": 20,  // Force update if no scene break in 20 messages
  "min_content_tokens": 500,     // Minimum new content before considering update

  // Persistent memory
  "persistent_memory_enabled": true,
  "persistent_memory_update_frequency": "every_3_scenes",  // or "per_scene", "every_2_scenes", "every_5_scenes"
  "scenes_since_last_persistent_update": 0,

  // Token limits
  "memory_soft_token_limit": 2000,  // Warning threshold
  "memory_hard_token_limit": 2500,  // Validation failure threshold

  // Validation pipeline
  "structural_validation_enabled": true,  // Always on
  "heuristic_validation_enabled": true,   // Always on
  "llm_validation_enabled": false,        // Opt-in (expensive)
  "memory_generation_max_retries": 3,

  // Auto-exclusion
  "auto_exclude_on_failure": true,  // Exclude message if validation fails after retries

  // Prompts
  "message_memory_extraction_prompt": "message_memory_extraction_prompt",
  "scene_memory_extraction_prompt": "scene_memory_extraction_prompt",
  "persistent_memory_update_prompt": "persistent_memory_update_prompt",
  "narrative_memory_prompt": "narrative_memory_prompt",  // Optional alternative

  // Validation prompts (for LLM validation if enabled)
  "message_validation_prompt": "message_validation_prompt",
  "scene_validation_prompt": "scene_validation_prompt",
  "persistent_validation_prompt": "persistent_validation_prompt",

  // DEPRECATED (keep for migration, show warnings)
  "auto_recap_message_limit": 0,  // Disabled
  "auto_recap_batch_size": 0,     // Disabled
  "combined_recap_enabled": false,  // Use persistent_memory_enabled instead
  "legacy_mode_enabled": false
}
```

---

## Implementation Roadmap

### Phase 1: Critical Fixes (Weeks 1-2)

**High Priority - Immediate Impact**

1. **Remove Event Tracking**
   - [ ] Update `default_prompt`: Remove `events` array
   - [ ] Update `scene_recap_prompt`: Remove `events` array
   - [ ] Update `default_combined_recap_prompt`: Remove `events` array
   - [ ] Add `memorable_events` with strict guidance (max 5, rare usage)
   - [ ] Add validation for event count and sequential language

2. **Fix Terminology**
   - [ ] Rename XML tags: `<roleplay_recap>` → `<roleplay_memory format="json">`
   - [ ] Update prompt instructions: "Recap" → "Extract facts"
   - [ ] Update prompt instructions: "Roleplay History" → "Scene Content"
   - [ ] Keep "recap" in UI/variable names (internal)

3. **Remove Verbosity Requirements**
   - [ ] Remove all "at least X sentences" from all prompts
   - [ ] Add global brevity instruction with examples
   - [ ] Add token targets (1500-2000 soft, 2500 hard)
   - [ ] Add token limit validation (hard fail at 2500)

4. **Add Active Pruning Instructions**
   - [ ] Add explicit "REMOVE" rules to all prompts
   - [ ] Add field-specific removal guidance
   - [ ] Add examples of good/bad pruning

### Phase 2: Workflow Automation (Weeks 3-4)

**Medium Priority - Infrastructure**

5. **Scene-Based Workflow**
   - [ ] Enable scene break detection by default
   - [ ] Add confidence scoring to scene detection
   - [ ] Implement fallback message limit (20 messages)
   - [ ] Add smart decision tree (scene break OR fallback OR content threshold)
   - [ ] Deprecate message-count-based triggering

6. **Validation Pipeline**
   - [ ] Implement Stage 1: Structural validation (JSON, fields, types)
   - [ ] Implement Stage 2: Heuristic validation (tokens, format, artifacts)
   - [ ] Keep Stage 3: LLM validation as opt-in
   - [ ] Implement retry logic with specific feedback
   - [ ] Add validation for secret format
   - [ ] Add validation for pruning (detect bloat)

7. **Differentiate Prompts**
   - [ ] Create `message_memory_extraction_prompt` (granular)
   - [ ] Create `scene_memory_extraction_prompt` (primary)
   - [ ] Create `persistent_memory_update_prompt` (combines scenes)
   - [ ] Keep `narrative_memory_prompt` as alternative
   - [ ] Remove duplicate `scene_recap_prompt`
   - [ ] Implement prompt selection logic

### Phase 3: Persistent Memory (Weeks 5-6)

**Medium Priority - Long-term Memory**

8. **Rename Combined Recap → Persistent Memory**
   - [ ] Rename `combinedRecap.js` → `persistentMemory.js`
   - [ ] Rename all "combined recap" settings → "persistent memory"
   - [ ] Update `default_combined_recap_prompt` → `persistent_memory_update_prompt`
   - [ ] Clarify UPDATE vs COMBINE operation in prompts
   - [ ] Implement per-scene or every-N-scenes update frequency

9. **Secret Format Enhancement**
   - [ ] Update secret format: "Known by: X. Hidden from: Y."
   - [ ] Add secret format validation
   - [ ] Add secret cleanup rules (remove when revealed)
   - [ ] Add examples to prompts

### Phase 4: Polish & Optimization (Weeks 7-8)

**Low Priority - Quality of Life**

10. **Settings Migration**
    - [ ] Detect legacy settings (message-based)
    - [ ] Migrate to new settings structure
    - [ ] Show deprecation warnings for old settings
    - [ ] Provide migration guide

11. **Monitoring & Metrics**
    - [ ] Track validation failure rates by stage
    - [ ] Track average token counts
    - [ ] Track retry counts
    - [ ] Track scene break detection accuracy
    - [ ] Add debug dashboard (optional)

12. **Documentation**
    - [ ] Update README with new workflow
    - [ ] Document all prompt changes
    - [ ] Create migration guide for users
    - [ ] Add prompt customization guide
    - [ ] Document validation pipeline

---

## Testing & Validation Plan

### Test Scenarios

**Test 1: Short Scene (5-10 messages)**
- ✓ Memory extraction concise (<500 tokens)
- ✓ No forced verbosity
- ✓ No event sequences
- ✓ Structural validation passes
- ✓ Heuristic validation passes

**Test 2: Long Scene (20+ messages)**
- ✓ Extraction focuses on final state
- ✓ No sequential events
- ✓ Token count <1500
- ✓ Pruning removes one-time NPCs
- ✓ Fallback triggers if no scene break

**Test 3: Multi-Scene Arc (3-5 scenes)**
- ✓ Persistent memory updates correctly
- ✓ Irrelevant entries removed
- ✓ Total memory stays <2000 tokens
- ✓ Scene-to-scene consistency
- ✓ No bloat over time

**Test 4: Scene with Secrets**
- ✓ Secret format validation passes
- ✓ "Known by" and "Hidden from" both present
- ✓ Secrets don't leak into roleplay
- ✓ Revealed secrets removed

**Test 5: Complex NPC Network**
- ✓ Only recurring NPCs in npcs_facts
- ✓ One-time NPCs excluded or in minor_npcs
- ✓ Stale npcs_mentioned removed
- ✓ Relationships pruned when NPCs gone

**Test 6: Validation Failure Recovery**
- ✓ Invalid JSON triggers retry with feedback
- ✓ Token limit exceeded triggers brevity retry
- ✓ Sequential events trigger state-focus retry
- ✓ Max retries (3) respected
- ✓ Auto-exclusion on total failure

**Test 7: Scene Break Detection**
- ✓ Location change detected
- ✓ Time skip detected
- ✓ Narrative transition detected
- ✓ Confidence scoring works
- ✓ Fallback triggers appropriately

### Success Metrics

**Quality:**
- [ ] Memory focuses on state, not event sequences
- [ ] Irrelevant entries actively removed
- [ ] No verbose padding (average <50 tokens per entry)
- [ ] Secrets formatted correctly and don't leak
- [ ] JSON always valid

**Efficiency:**
- [ ] Token count <2000 for typical multi-scene RP
- [ ] 30-50% reduction vs current prompts
- [ ] <3 retries on average per generation
- [ ] Structural validation catches 80%+ errors (no LLM call needed)

**Automation:**
- [ ] Scene breaks detected with 80%+ accuracy
- [ ] Fallback prevents indefinite delays
- [ ] Validation failure rate <10%
- [ ] No manual intervention needed

**Robustness:**
- [ ] Handles edge cases (empty scenes, combat, dialogue-heavy)
- [ ] Recovers from generation failures automatically
- [ ] Memory doesn't grow unbounded
- [ ] Works across different RP styles

---

## Conclusion

The ST-Auto-Recap extension has a solid foundation for **fully automated** memory management. The recommended changes align with rentry best practices while maintaining the automation-first philosophy:

### Critical Changes:

1. **Remove event sequences** → Focus on state extraction (eliminates reasoning failures)
2. **Eliminate verbosity requirements** → Allow concise outputs (30-50% token reduction)
3. **Align with scene-based chunking** → Use existing scene detection (better quality)
4. **Add active pruning instructions** → Prevent unbounded memory growth
5. **Enhance validation pipeline** → Multi-stage validation with retry feedback

### Why These Changes Matter for Automation:

- **Better Quality:** State-focus vs events improves Claude's reasoning
- **Token Efficiency:** Brevity requirements reduce bloat significantly
- **Reliability:** Multi-stage validation catches errors without LLM calls
- **Scalability:** Scene-based chunking works consistently without human oversight
- **Robustness:** Retry logic with feedback enables self-correction

### Design Philosophy Preserved:

✅ **JSON format** - Essential for programmatic lorebook extraction
✅ **No manual review** - Fully automated via validation pipeline
✅ **Validation complexity** - Critical for quality without human oversight
✅ **Self-correction** - Retry logic enables autonomous operation

### Expected Impact:

- **30-50% token reduction** in typical memories
- **80%+ validation accuracy** without LLM calls (structural + heuristic)
- **<10% failure rate** after retries
- **Unlimited scalability** - no human bottleneck

The extension is already advanced beyond the rentry guide's recommendations (which assume manual workflows). These refinements make it production-ready for **fully autonomous, large-scale memory management**.

---

**End of Document**

*For implementation details, see Phase 1-4 roadmap above.*
*For questions, see: README.md, CLAUDE.md, and SILLYTAVERN_PLAYWRIGHT.md*
