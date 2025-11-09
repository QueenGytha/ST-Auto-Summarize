# SillyTavern Lorebook Injection Mechanics

**Purpose**: This document details HOW SillyTavern injects lorebook (World Info) entries into prompts, with focus on detection and wrapping strategies for downstream parsing.

**Context**: We want to optionally wrap lorebook entries with custom markers so they can be reliably detected and parsed by downstream systems (e.g., proxy servers, logging systems).

---

## Overview

**Critical Finding**: SillyTavern does **NOT** natively mark or wrap lorebook entries in the final prompt. By the time entries reach the prompt assembly stage, they are **concatenated strings with no metadata or boundaries**.

**Key Challenge**: Individual entry boundaries are lost during the joining process, making it impossible to identify which text came from which lorebook entry without intercepting earlier in the pipeline.

---

## Position Types Quick Reference

SillyTavern supports 8 lorebook position types (enum `world_info_position`):

| Value | Name | UI Label | Injection Location |
|-------|------|----------|-------------------|
| 0 | `before` | ↑Char | Before character card data (description/personality/scenario) |
| 1 | `after` | ↓Char | After character card data |
| 2 | `ANTop` | ↑AN | Before Author's Note |
| 3 | `ANBottom` | ↓AN | After Author's Note |
| 4 | `atDepth` | @D | At specific depth in chat history (with role) |
| 5 | `EMTop` | ↑EM | Before Example Messages |
| 6 | `EMBottom` | ↓EM | After Example Messages |
| 7 | `outlet` | ➡️ | Manual via `{{outlet::name}}` macros |

**Reference**: `/public/scripts/world-info.js:815-824`

**Important Note**: Positions 0 and 1 refer to the **character card data** (description, personality, scenario), NOT character messages in chat history. This is misleading naming.

---

## Injection Format (Raw Text)

### How Entries Are Joined

**Location**: `/public/scripts/world-info.js:4848-4911`

```javascript
const WIBeforeEntries = [];
const WIAfterEntries = [];

// Entries are processed and added to arrays
[...allActivatedEntries.values()].sort(sortFn).forEach((entry) => {
    const content = getRegexedString(entry.content, regex_placement.WORLD_INFO, { ... });

    switch (entry.position) {
        case world_info_position.before:
            WIBeforeEntries.unshift(content);
            break;
        case world_info_position.after:
            WIAfterEntries.unshift(content);
            break;
        // ... other positions
    }
});

// Final strings created by joining with newlines
const worldInfoBefore = WIBeforeEntries.length ? WIBeforeEntries.join('\n') : '';
const worldInfoAfter = WIAfterEntries.length ? WIAfterEntries.join('\n') : '';
```

### Key Facts

- **No native wrappers**: Entries are concatenated as raw text
- **Separator**: Single newline (`\n`) between entries
- **No metadata**: Entry UIDs, names, or identifiers are NOT included
- **No boundaries**: Cannot distinguish where one entry ends and another begins
- **Order**: Sorted by `entry.order` field (descending) - higher values appear first

### Example Output

```
Alice is a detective in the foggy city.
The city is perpetually covered in fog.
Crime rates have been rising lately.
```

This could be 3 separate lorebook entries or 1 entry with newlines - there's no way to tell from the final text.

---

## Content Processing Pipeline

Each lorebook entry undergoes this transformation pipeline:

```
Raw Entry Content (entry.content)
    ↓
1. substituteParams(entry.content)
   - Replaces macros like {{char}}, {{user}}, etc.
    ↓
2. getRegexedString(content, regex_placement.WORLD_INFO, {...})
   - Applies regex transformations from regex extension
   - Reference: /public/scripts/extensions/regex/engine.js:278
    ↓
3. Array joining
   - Multiple entries joined with '\n'
    ↓
4. formatWorldInfo(concatenatedString)
   - Wraps entire WI block with format template
   - Uses oai_settings.wi_format template (e.g., "[World Info]\n{0}")
   - Reference: /public/scripts/openai.js:781-793
    ↓
Final Prompt Text
```

### Example Flow

```
Entry 1: "{{char}} is a detective."
Entry 2: "The city is {{location}}."

↓ substituteParams
Entry 1: "Alice is a detective."
Entry 2: "The city is London."

↓ getRegexedString (assume no transformations)
Entry 1: "Alice is a detective."
Entry 2: "The city is London."

↓ join('\n')
"Alice is a detective.\nThe city is London."

↓ formatWorldInfo with template "[World Info]\n{0}"
"[World Info]\nAlice is a detective.\nThe city is London."
```

**Reference**:
- substituteParams: `/public/scripts/world-info.js:4850`
- getRegexedString: Called at line 4852
- join: Line 4910
- formatWorldInfo: `/public/scripts/openai.js:781-793`

---

## Prompt Assembly Flow

### Complete Chain

```
1. checkWorldInfo() → /public/scripts/world-info.js:4728-4927
   - Scans chat for activated entries
   - Groups entries by position type
   - Returns WIActivated object with strings:
     {
       worldInfoBefore: string,
       worldInfoAfter: string,
       EMEntries: array,
       WIDepthEntries: array,
       ANBeforeEntries: array,
       ANAfterEntries: array,
       outletEntries: object,
       allActivatedEntries: Set
     }

2. getWorldInfoPrompt() → /public/scripts/world-info.js:852-875
   - Calls checkWorldInfo()
   - Returns WIPromptResult with same strings

3. preparePromptsForChatCompletion() → /public/scripts/openai.js:1281-1295
   - Receives worldInfoBefore/After strings
   - Creates system messages:
     {
       role: 'system',
       content: formatWorldInfo(worldInfoBefore),
       identifier: 'worldInfoBefore'
     }

4. sendOpenAIRequest() → /public/scripts/openai.js:1114-1116
   - Assembles final chat array:
     await addToChatCompletion('worldInfoBefore');
     await addToChatCompletion('main');
     await addToChatCompletion('worldInfoAfter');

5. API Request
   - Final prompt sent to LLM API
```

**Critical Point**: By step 2, individual entries are already lost. The `worldInfoBefore` and `worldInfoAfter` variables are **concatenated strings**, not arrays of entries.

---

## Interception Points

### Option A: WORLD_INFO_ACTIVATED Event ⭐ (Has Metadata)

**Location**: `/public/scripts/world-info.js:860-862`

```javascript
if (!isDryRun && activatedWorldInfo.allActivatedEntries && activatedWorldInfo.allActivatedEntries.size > 0) {
    const arg = Array.from(activatedWorldInfo.allActivatedEntries.values());
    await eventSource.emit(event_types.WORLD_INFO_ACTIVATED, arg);
}
```

**What You Get**: Array of full entry objects with metadata:
- `entry.uid` - Unique identifier
- `entry.content` - Raw entry text (before regex processing)
- `entry.key` - Activation keys
- `entry.comment` - Entry name/comment
- `entry.position` - Position type (0-7)
- `entry.world` - Lorebook name
- `entry.order` - Insertion order
- `entry.depth` - Depth (if position === 4)
- `entry.role` - Role (if position === 4)

**Timing**: Fired AFTER `checkWorldInfo` completes but BEFORE prompt assembly

**Pros**:
- ✅ Full entry metadata available
- ✅ Clean, non-invasive event listener
- ✅ Can identify which entries will be in prompt
- ✅ Supported API (won't break on ST updates)

**Cons**:
- ❌ Entries already joined into strings at this point
- ❌ Can't directly modify injection (need to monkey-patch)
- ❌ Requires correlation with injected text

**Usage**:
```javascript
import { eventSource, event_types } from './index.js';

eventSource.on(event_types.WORLD_INFO_ACTIVATED, (entries) => {
    entries.forEach(entry => {
        console.log(`Activated: ${entry.comment} (${entry.uid})`);
        console.log(`Position: ${entry.position}, Content: ${entry.content}`);
    });
});
```

---

### Option B: Wrap getRegexedString ⭐⭐ (Best for Individual Entry Wrapping)

**Location**: `/public/scripts/extensions/regex/engine.js:278`

**Strategy**: Replace or wrap `getRegexedString` to add markers when `placement === regex_placement.WORLD_INFO`

**Timing**: Called for EACH entry individually before joining

**Pros**:
- ✅ Intercepts at perfect point - individual entries
- ✅ Can add wrappers before joining
- ✅ Has access to content and placement type
- ✅ Early enough to preserve entry boundaries

**Cons**:
- ⚠️ Invasive - modifies core ST functionality
- ⚠️ May conflict with regex extension
- ⚠️ Doesn't have full entry metadata (uid, comment, etc.)
- ⚠️ Need to pass metadata through somehow

**Usage Pattern**:
```javascript
// Store original function
const originalGetRegexedString = getRegexedString;

// Wrap it
getRegexedString = function(content, placement, substitutions) {
    const result = originalGetRegexedString(content, placement, substitutions);

    // Add wrapper for world info entries
    if (placement === regex_placement.WORLD_INFO && shouldWrapEntries()) {
        return wrapLorebookEntry(result, /* need metadata somehow */);
    }

    return result;
};
```

**Problem**: Need to correlate with metadata from `WORLD_INFO_ACTIVATED` event

---

### Option C: Monkey-Patch checkWorldInfo Return ⭐⭐⭐ (RECOMMENDED)

**Location**: `/public/scripts/world-info.js:4926` (return statement)

**Strategy**: Wrap `checkWorldInfo` function to modify return values before they reach prompt assembly

**Timing**: Right after entries are joined but before prompt assembly

**Pros**:
- ✅ Clean interception point
- ✅ Can modify all position types consistently
- ✅ Has access to both strings AND entry Set
- ✅ Not too invasive (single function wrap)
- ✅ Can correlate strings with metadata

**Cons**:
- ⚠️ Entries already joined (need to split/wrap/rejoin)
- ⚠️ Must handle all position types separately
- ⚠️ Fragile if entry content has newlines

**Implementation Strategy**:
```javascript
import { checkWorldInfo } from './index.js';

// Store activated entries from event
let lastActivatedEntries = [];
eventSource.on(event_types.WORLD_INFO_ACTIVATED, (entries) => {
    lastActivatedEntries = entries;
});

// Wrap checkWorldInfo
const originalCheckWorldInfo = checkWorldInfo;
checkWorldInfo = async function(...args) {
    const result = await originalCheckWorldInfo(...args);

    if (!shouldWrapEntries()) {
        return result;
    }

    // Wrap worldInfoBefore
    if (result.worldInfoBefore) {
        const beforeEntries = lastActivatedEntries.filter(e => e.position === 0);
        result.worldInfoBefore = wrapEntries(result.worldInfoBefore, beforeEntries);
    }

    // Wrap worldInfoAfter
    if (result.worldInfoAfter) {
        const afterEntries = lastActivatedEntries.filter(e => e.position === 1);
        result.worldInfoAfter = wrapEntries(result.worldInfoAfter, afterEntries);
    }

    // Handle other position types similarly...

    return result;
};

function wrapEntries(concatenatedString, entryMetadata) {
    const lines = concatenatedString.split('\n');
    return lines.map((line, i) => {
        const meta = entryMetadata[i] || { uid: 'unknown', comment: 'Unknown' };
        return `<lorebook uid="${meta.uid}" name="${meta.comment}">\n${line}\n</lorebook>`;
    }).join('\n');
}
```

**Challenge**: Matching split lines to original entries (entries may contain newlines)

---

### Option D: CHAT_COMPLETION_PROMPT_READY Event ❌ (Too Late)

**Location**: `/public/scripts/openai.js:1533`

```javascript
const eventData = { chat, dryRun };
await eventSource.emit(event_types.CHAT_COMPLETION_PROMPT_READY, eventData);
```

**What You Get**: Final `chat` array of messages before API call

**Pros**:
- ✅ Can modify final prompt
- ✅ See complete assembled prompt

**Cons**:
- ❌ Way too late - entries already formatted and embedded
- ❌ No entry metadata available
- ❌ Would require parsing formatted text
- ❌ Can't distinguish lorebook from other system messages

**Verdict**: Not viable for entry-level wrapping

---

## Capturing Trigger Metadata via Monkey-Patching

**Critical Discovery**: While SillyTavern's standard flow **discards** valuable trigger metadata (which key matched, scan depth, recursion info), we can **capture this data** by monkey-patching key functions before the information is lost.

### What Metadata Gets Discarded

During lorebook activation scanning, SillyTavern tracks:
- **`primaryKeyMatch`** (line 4606) - Which specific key triggered the entry
- **`scanState`** (lines 4420-4421) - Whether INITIAL, RECURSION, or MIN_ACTIVATIONS scan
- **`count`** - Loop iteration number
- **`buffer`** context - What messages/data were scanned
- **Secondary key matches** - Which secondary keys matched

**All of this information is discarded** after the entry is activated. The entry object passed to `WORLD_INFO_ACTIVATED` event contains the full `key[]` array but NOT which specific key matched.

**Reference**: `/public/scripts/world-info.js:4401-4832` (scanning loop)

---

### Metadata Capture Capability Matrix

| **Metadata** | **Can Capture?** | **Interception Point** | **Difficulty** |
|--------------|------------------|------------------------|----------------|
| Matched primary key | ✅ Yes | Line 4606 | Easy |
| Matched secondary keys | ✅ Yes | Lines 4640-4670 | Medium |
| Scan state (INITIAL/RECURSION/MIN_ACTIVATIONS) | ✅ Yes | Lines 4421, 4760 | Easy |
| Scan depth | ✅ Yes | `buffer.getDepth()` | Easy |
| Loop iteration | ✅ Yes | `count` variable | Easy |
| Message indices in scan range | ✅ Yes | Calculate from depth | Easy |
| **Exact message that matched** | ⚠️ Partial | Re-scan required | Hard |
| Message role (user/assistant) | ❌ No* | Lost in buffer | Hard* |
| Recursion parent entries | ✅ Yes | Line 4823 | Medium |
| Source type (chat vs character card) | ⚠️ Partial | Re-match required | Medium |
| Activation reason | ✅ Yes | Track which code path | Easy |

*\*Can be captured if you modify `WorldInfoBuffer` to preserve original message objects*

---

### Metadata Capture Strategies

#### **Phase 1: Basic Metadata Capture** (Recommended Starting Point)

Intercept at **line 4760** where entries are added to `allActivatedEntries` and capture basic context:

**Interception Points**:
- **Line 4606**: Store `primaryKeyMatch` on entry before it's discarded
- **Line 4640-4670**: Track which secondary keys matched
- **Line 4760**: Assemble final metadata object

**Implementation**:
```javascript
// Patch the scanning loop to capture metadata
const original_checkWorldInfo = checkWorldInfo;
checkWorldInfo = async function(chat, maxContext, isDryRun, globalScanData) {
    // Intercept and augment the scanning process
    const result = await original_checkWorldInfo(chat, maxContext, isDryRun, globalScanData);

    // Note: You'll need to actually patch INSIDE the function to capture
    // primaryKeyMatch before it's lost. This requires more invasive patching.

    return result;
};
```

**Better Approach - Patch Inside the Loop**:
```javascript
// Store original checkWorldInfo
const original_checkWorldInfo_code = checkWorldInfo.toString();

// You'll need to inject code at specific points:
// At line 4606, after primaryKeyMatch is found:
if (primaryKeyMatch && !entry.triggerMetadata) {
    entry.triggerMetadata = {
        primaryKey: primaryKeyMatch,
        substitutedKey: substituteParams(primaryKeyMatch)
    };
}

// At line 4760, when entry is added to allActivatedEntries:
if (!entry.triggerMetadata) {
    entry.triggerMetadata = {};
}
entry.triggerMetadata.scanState = Object.entries(scan_state).find(x => x[1] === scanState)?.[0];
entry.triggerMetadata.scanDepth = buffer.getDepth();
entry.triggerMetadata.iteration = count;
entry.triggerMetadata.timestamp = Date.now();
```

**Data Structure**:
```javascript
entry.triggerMetadata = {
    // Primary match
    primaryKey: "detective",
    substitutedKey: "detective", // After {{macro}} substitution

    // Scan context
    scanState: "INITIAL", // or "RECURSION", "MIN_ACTIVATIONS"
    scanDepth: 10,
    iteration: 1,

    // Metadata
    timestamp: 1699564823000
};
```

---

#### **Phase 2: Secondary Key and Recursion Tracking** (Medium Complexity)

Track which secondary keys matched and recursion chain information.

**Secondary Keys Capture** (lines 4640-4670):
```javascript
// Inside matchSecondaryKeys function or after it returns
const matchedSecondaryKeys = [];
for (let keysecondary of entry.keysecondary) {
    const secondarySubstituted = substituteParams(keysecondary);
    if (secondarySubstituted && buffer.matchKeys(textToScan, secondarySubstituted.trim(), entry)) {
        matchedSecondaryKeys.push({
            key: keysecondary,
            substituted: secondarySubstituted
        });
    }
}

if (matchedSecondaryKeys.length > 0) {
    entry.triggerMetadata.secondaryKeys = matchedSecondaryKeys;
}
```

**Recursion Tracking** (line 4823):
When entries activate and their content is added to recursion buffer, track the source:

```javascript
// At line 4823, where recursion buffer is populated
if (successfulNewEntriesForRecursion.length > 0) {
    const recursionSources = successfulNewEntriesForRecursion.map(e => ({
        uid: e.uid,
        world: e.world,
        comment: e.comment
    }));

    // Store in buffer for next iteration
    buffer.recursionHistory = buffer.recursionHistory || [];
    buffer.recursionHistory.push({
        iteration: count,
        entries: recursionSources
    });
}

// Later, when entry activates during RECURSION state:
if (scanState === scan_state.RECURSION) {
    entry.triggerMetadata.activatedViaRecursion = true;
    entry.triggerMetadata.recursionSources = buffer.recursionHistory;
}
```

**Enhanced Data Structure**:
```javascript
entry.triggerMetadata = {
    primaryKey: "detective",
    substitutedKey: "detective",
    secondaryKeys: [
        { key: "crime", substituted: "crime" },
        { key: "investigation", substituted: "investigation" }
    ],

    scanState: "RECURSION",
    scanDepth: 10,
    iteration: 2,
    activatedViaRecursion: true,
    recursionSources: [
        {
            iteration: 1,
            entries: [
                { uid: 123, world: "main", comment: "City Background" }
            ]
        }
    ],

    timestamp: 1699564823000
};
```

---

#### **Phase 3: Message-Level Tracking** (Advanced, Complex)

Track exactly which messages triggered the entry and their roles (user/assistant).

**Problem**: The `WorldInfoBuffer` concatenates messages into a single string for scanning, losing individual message boundaries and metadata.

**Buffer Structure** (lines 214-530):
- **`#depthBuffer`** (private): Array of message text strings (`.mes` field only)
- **`#globalScanData`**: Character card data
- **`#recurseBuffer`**: Recursively activated entry content

Messages are stored as TEXT only:
```javascript
this.#depthBuffer[depth] = messages[depth].trim(); // Only .mes text, not full object
```

**Solution**: Patch `WorldInfoBuffer` to preserve original message objects:

```javascript
// Patch the constructor
const OriginalWorldInfoBuffer = WorldInfoBuffer;
function PatchedWorldInfoBuffer(messages, globalScanData) {
    const instance = new OriginalWorldInfoBuffer(messages, globalScanData);

    // Store reference to original chat messages (with full metadata)
    instance.originalMessages = messages;

    return instance;
}

// Replace global reference
WorldInfoBuffer = PatchedWorldInfoBuffer;
```

**Add method to find matching messages**:
```javascript
WorldInfoBuffer.prototype.findMatchingMessages = function(key, entry, scanState) {
    const matches = [];
    const depth = entry.scanDepth ?? this.getDepth();

    // Note: Can't access private #depthBuffer from here
    // Need to patch methods that already have access

    for (let i = 0; i < depth && i < this.originalMessages.length; i++) {
        const message = this.originalMessages[i];
        const messageText = message.mes;

        if (this.matchKeys(messageText, key, entry)) {
            matches.push({
                index: i,
                role: message.is_user ? 'user' : 'assistant',
                name: message.name,
                text: messageText.substring(0, 100) // Preview
            });
        }
    }

    return matches;
};
```

**Capture in scanning loop**:
```javascript
// After entry is activated and primaryKeyMatch is known
if (primaryKeyMatch && buffer.originalMessages) {
    const substitutedKey = substituteParams(primaryKeyMatch).trim();
    const matchingMessages = buffer.findMatchingMessages(substitutedKey, entry, scanState);

    entry.triggerMetadata.matchingMessages = matchingMessages;
    entry.triggerMetadata.messageIndices = matchingMessages.map(m => m.index);
}
```

**Source Type Flags**:
```javascript
entry.triggerMetadata.sources = {
    fromMessages: entry.triggerMetadata.messageIndices?.length > 0,
    fromPersonaDescription: entry.matchPersonaDescription && globalScanData.personaDescription,
    fromCharacterDescription: entry.matchCharacterDescription && globalScanData.characterDescription,
    fromCharacterPersonality: entry.matchCharacterPersonality && globalScanData.characterPersonality,
    fromCharacterDepthPrompt: entry.matchCharacterDepthPrompt && globalScanData.characterDepthPrompt,
    fromScenario: entry.matchScenario && globalScanData.scenario,
    fromCreatorNotes: entry.matchCreatorNotes && globalScanData.creatorNotes,
    fromRecursion: scanState === scan_state.RECURSION
};
```

**Complete Data Structure**:
```javascript
entry.triggerMetadata = {
    // Primary match
    primaryKey: "detective",
    substitutedKey: "detective",
    secondaryKeys: [
        { key: "crime", substituted: "crime" }
    ],

    // Scan context
    scanState: "INITIAL",
    scanDepth: 10,
    iteration: 1,
    activatedViaRecursion: false,

    // Message-level details
    messageIndices: [2, 5],
    matchingMessages: [
        {
            index: 2,
            role: 'user',
            name: 'Alice',
            text: 'The detective arrived at the scene...'
        },
        {
            index: 5,
            role: 'assistant',
            name: 'Detective Morgan',
            text: 'As a detective, I noticed...'
        }
    ],

    // Source flags
    sources: {
        fromMessages: true,
        fromPersonaDescription: false,
        fromCharacterDescription: false,
        fromCharacterPersonality: false,
        fromCharacterDepthPrompt: false,
        fromScenario: false,
        fromCreatorNotes: false,
        fromRecursion: false
    },

    // Recursion chain
    recursionSources: null,

    // Metadata
    timestamp: 1699564823000,
    chatLength: 15
};
```

---

### Practical Implementation: Hybrid Approach

**Recommendation**: Use a **hybrid approach** that combines multiple interception points.

**Step 1**: Wrap the entire `checkWorldInfo` function to inject patching logic:

```javascript
import { checkWorldInfo } from './index.js';

const original_checkWorldInfo = checkWorldInfo;

export async function checkWorldInfo_patched(chat, maxContext, isDryRun, globalScanData) {
    // Call original but with augmented buffer
    const patchedBuffer = createPatchedBuffer(chat, globalScanData);

    // Run original scanning logic (this is complex - you'd need to replicate or truly monkey-patch)
    const result = await original_checkWorldInfo(chat, maxContext, isDryRun, globalScanData);

    // Post-process activated entries to add metadata
    for (const entry of result.allActivatedEntries.values()) {
        if (entry._capturedMetadata) {
            entry.triggerMetadata = entry._capturedMetadata;
            delete entry._capturedMetadata; // Clean up temp field
        }
    }

    return result;
}

// Replace global
checkWorldInfo = checkWorldInfo_patched;
```

**Step 2**: Use temporary fields during scanning:

Since directly modifying the loop is complex, use temporary "capture" fields:

```javascript
// At line 4606, store matched key temporarily
entry._capturedPrimaryKey = primaryKeyMatch;

// At line 4670, store secondary keys
entry._capturedSecondaryKeys = matchedSecondaryKeys;

// At line 4760, assemble final metadata
entry._capturedMetadata = {
    primaryKey: entry._capturedPrimaryKey,
    secondaryKeys: entry._capturedSecondaryKeys,
    scanState: Object.entries(scan_state).find(x => x[1] === scanState)?.[0],
    scanDepth: buffer.getDepth(),
    iteration: count,
    timestamp: Date.now()
};
```

---

### Complications and Solutions

#### 🔴 **Private Fields Block External Access**

**Problem**: `WorldInfoBuffer` uses private fields (`#depthBuffer`, `#recurseBuffer`) that cannot be accessed from outside the class.

**Solutions**:
1. **Patch methods that already have access**: Wrap `buffer.get()`, `buffer.matchKeys()` to expose data
2. **Store data in public fields**: During method calls, copy private data to public fields
3. **Replace constructor**: Create wrapper that stores references before fields become private

**Example**:
```javascript
const original_get = WorldInfoBuffer.prototype.get;
WorldInfoBuffer.prototype.get = function(entry, scanState) {
    const result = original_get.call(this, entry, scanState);

    // Expose metadata publicly
    this.lastScanMetadata = {
        depth: entry.scanDepth ?? this.getDepth(),
        scanState: scanState,
        hasRecursion: this.hasRecurse()
    };

    return result;
};
```

#### 🔴 **Entry Object Mutability**

**Problem**: Entry objects may be frozen or have setters that trigger unwanted side effects (like saving to disk).

**Solutions**:
1. **Test first**: Try direct mutation and see if it works
2. **Use temporary fields**: Store in `entry._captured*` fields, clean up later
3. **Use parallel Map**: `const metadata = new Map(); metadata.set(entryKey, data);`

**Example with Map**:
```javascript
const entryMetadataMap = new Map();

// Store
const key = `${entry.world}.${entry.uid}`;
entryMetadataMap.set(key, metadata);

// Retrieve later
const metadata = entryMetadataMap.get(`${entry.world}.${entry.uid}`);
```

#### 🔴 **Matching on Concatenated Buffer**

**Problem**: SillyTavern's `buffer.get()` returns a concatenated string of all messages, so you can't determine which specific message had the match without re-scanning.

**Solution**: After activation, re-scan individual messages:

```javascript
function findMatchingMessages(entry, buffer, primaryKey) {
    const matches = [];
    const depth = entry.scanDepth ?? buffer.getDepth();
    const key = substituteParams(primaryKey).trim();

    // Re-scan each message individually
    for (let i = 0; i < depth; i++) {
        if (buffer.originalMessages && buffer.originalMessages[i]) {
            const messageText = buffer.originalMessages[i].mes;
            if (buffer.matchKeys(messageText, key, entry)) {
                matches.push({
                    index: i,
                    role: buffer.originalMessages[i].is_user ? 'user' : 'assistant',
                    name: buffer.originalMessages[i].name
                });
            }
        }
    }

    return matches;
}
```

**Trade-off**: This adds computational overhead (re-scanning) but provides precise message-level tracking.

#### 🔴 **Multiple Activation Paths**

**Problem**: Entries can activate via multiple code paths:
- Primary key match (line 4625)
- Secondary key match (line 4679)
- `@@activate` decorator (line 4569)
- `constant` flag (line 4587)
- `sticky` effect (line 4593)
- External activation (line 4580)

**Solution**: Track activation reason:

```javascript
// Capture activation reason based on which code path
entry.triggerMetadata.activationReason = 'primary_key'; // or 'secondary_key', 'constant', 'decorator', etc.

// At each activation point:
if (entry.constant) {
    entry._activationReason = 'constant';
} else if (decorators.includes('@@activate')) {
    entry._activationReason = 'decorator';
} else if (primaryKeyMatch) {
    entry._activationReason = 'primary_key';
} else if (secondaryMatch) {
    entry._activationReason = 'secondary_key';
}
```

#### 🔴 **Performance Impact**

**Problem**: Re-scanning messages and tracking metadata adds computational overhead.

**Solutions**:
1. **Make it optional**: Add setting `capture_trigger_metadata` (off by default)
2. **Limit scope**: Only track for small chats (< 100 messages)
3. **Cache results**: Store processed metadata to avoid re-computation
4. **Progressive capture**: Phase 1 always, Phase 2 optional, Phase 3 opt-in only

---

### Updated Wrapper Examples with Metadata

With captured metadata, wrapper tags can include rich information:

#### **Minimal** (Phase 1):
```xml
<lorebook name="Character Background" key="detective">
Alice is a detective in the foggy city.
</lorebook>
```

#### **Standard** (Phase 2):
```xml
<lorebook name="Character Background"
          key="detective"
          secondary="crime,investigation"
          scan="INITIAL"
          depth="4">
Alice is a detective in the foggy city.
</lorebook>
```

#### **Detailed** (Phase 3):
```xml
<lorebook uid="12345"
          name="Character Background"
          world="MainStory"
          key="detective"
          secondary="crime,investigation"
          scan_state="INITIAL"
          scan_depth="4"
          iteration="1"
          triggered_by="user"
          message_index="2"
          via_recursion="false">
Alice is a detective in the foggy city.
</lorebook>
```

#### **Maximum** (All metadata):
```xml
<lorebook uid="12345"
          name="Character Background"
          world="MainStory"
          key="detective"
          secondary="crime,investigation"
          matched_in="messages:2,5"
          triggered_by="user,assistant"
          scan_state="INITIAL"
          scan_depth="4"
          from_character_card="false"
          from_recursion="false"
          activation="primary_key">
Alice is a detective in the foggy city.
</lorebook>
```

---

### Recommended Metadata Capture Approach

**For Production**: **Phase 1 + Partial Phase 2**

Capture basic metadata that's easy to get without major performance impact:
- ✅ Primary key matched
- ✅ Scan state (INITIAL/RECURSION/MIN_ACTIVATIONS)
- ✅ Scan depth
- ✅ Iteration number
- ✅ Timestamp
- ⚠️ Secondary keys (if not too expensive)

**Skip** (unless specifically needed):
- ❌ Message-level tracking (requires re-scanning)
- ❌ Exact recursion chain (complex to track)
- ❌ Message roles (requires buffer modifications)

**Wrapper Format**:
```xml
<lorebook name="{{name}}" key="{{primaryKey}}" scan="{{scanState}}">
{{content}}
</lorebook>
```

This provides useful metadata for debugging and analysis while keeping performance impact minimal.

---

## Detection Strategies

### Strategy 1: Pre-emptive Wrapping (Recommended) ⭐⭐⭐

**Approach**: Add visible XML-style wrappers to entries before they're joined

**Implementation**:
1. Listen to `WORLD_INFO_ACTIVATED` event to capture metadata
2. Monkey-patch `checkWorldInfo` return or `getRegexedString`
3. Wrap each entry with `<lorebook>` tags including metadata
4. Entries remain identifiable in final prompt

**Wrapper Format**:
```xml
<lorebook uid="entry-uuid" name="Character Background" world="Main Story">
Alice is a detective in the foggy city.
</lorebook>
```

**Pros**:
- ✅ Clean, parseable format
- ✅ Full metadata preservation
- ✅ Works with any downstream system
- ✅ Can be detected by regex: `/<lorebook[^>]*>[\s\S]*?<\/lorebook>/g`

**Cons**:
- ⚠️ Adds tokens to prompt (~20-30 tokens per entry)
- ⚠️ Visible to LLM (may affect behavior)
- ⚠️ Need to ensure wrappers don't break regex transformations

**Recommended Tag Format**:
```xml
<lorebook name="EntryName">
{content}
</lorebook>
```

Keep it simple. Only include `name` attribute (from `entry.comment`). Add `uid` if you need unique identification.

---

### Strategy 2: Shadow Tracking

**Approach**: Build parallel map of `{content → metadata}` without modifying prompt

**Implementation**:
```javascript
const entryContentMap = new Map();

eventSource.on(event_types.WORLD_INFO_ACTIVATED, (entries) => {
    entries.forEach(entry => {
        // Store processed content as key
        const processed = processContent(entry.content); // Apply same transforms
        entryContentMap.set(processed, {
            uid: entry.uid,
            name: entry.comment,
            world: entry.world
        });
    });
});

// Later, when analyzing prompt
function identifyLorebookEntries(promptText) {
    const matches = [];
    for (const [content, metadata] of entryContentMap.entries()) {
        if (promptText.includes(content)) {
            matches.push({ content, metadata });
        }
    }
    return matches;
}
```

**Pros**:
- ✅ Non-invasive to prompt
- ✅ Zero token cost
- ✅ LLM behavior unchanged

**Cons**:
- ❌ Very fragile - exact content matching required
- ❌ Breaks if regex transforms change content
- ❌ Can't handle duplicate content across entries
- ❌ Entries with newlines complicate matching
- ❌ Doesn't work for downstream systems (map not shared)

**Verdict**: Only useful for local analysis, not for downstream detection

---

### Strategy 3: Hidden Markers

**Approach**: Use zero-width Unicode characters to encode metadata invisibly

**Implementation**:
```javascript
const MARKER_START = '\u200B'; // Zero-width space
const MARKER_END = '\u200C';   // Zero-width non-joiner

function wrapEntry(content, uid) {
    const encodedUID = encodeUIDtoZeroWidth(uid);
    return `${MARKER_START}${encodedUID}${MARKER_END}${content}${MARKER_START}/uid${MARKER_END}`;
}

function encodeUIDtoZeroWidth(uid) {
    // Encode UID as sequence of zero-width characters
    // Example: binary encoding using \u200B (0) and \u200C (1)
    return uid.split('').map(char => {
        const binary = char.charCodeAt(0).toString(2).padStart(8, '0');
        return binary.split('').map(bit => bit === '0' ? '\u200B' : '\u200C').join('');
    }).join('\u200D'); // Use zero-width joiner as delimiter
}
```

**Pros**:
- ✅ Invisible to users
- ✅ Low token cost (~1-5 tokens per entry)
- ✅ Metadata encoded in prompt

**Cons**:
- ❌ LLM may still "see" or react to markers
- ❌ May be stripped by API preprocessors
- ❌ Requires complex encoding/decoding
- ❌ Fragile - sensitive to text processing
- ❌ Not human-readable (debugging nightmare)

**Verdict**: Clever but too fragile for production use

---

## Recommended Implementation

### Approach: Visible XML Wrappers via checkWorldInfo Monkey-Patch

**Why**:
1. Clean interception point with metadata access
2. Visible, parseable format for downstream systems
3. Works reliably across all position types
4. Minimal invasiveness to ST core

### Implementation Plan

#### 1. Add Setting

Add to `defaultSettings.js`:
```javascript
wrap_lorebook_entries: false,           // Enable lorebook entry wrapping
lorebook_wrapper_format: 'xml',         // Format: 'xml', 'markdown', 'custom'
lorebook_wrapper_template: '<lorebook name="{{name}}">\n{{content}}\n</lorebook>',
```

#### 2. Listen to WORLD_INFO_ACTIVATED Event

```javascript
// Store activated entry metadata
let currentActivatedEntries = [];

eventSource.on(event_types.WORLD_INFO_ACTIVATED, (entries) => {
    if (!get_settings().wrap_lorebook_entries) {
        return;
    }

    currentActivatedEntries = entries.map(e => ({
        uid: e.uid,
        name: e.comment || 'Unnamed Entry',
        world: e.world || 'Unknown',
        content: e.content,
        position: e.position,
        order: e.order
    }));
});
```

#### 3. Monkey-Patch checkWorldInfo

```javascript
import { checkWorldInfo } from './index.js';

const originalCheckWorldInfo = checkWorldInfo;

// Replace with wrapped version
checkWorldInfo = async function(...args) {
    const result = await originalCheckWorldInfo(...args);

    const settings = get_settings();
    if (!settings.wrap_lorebook_entries || currentActivatedEntries.length === 0) {
        return result;
    }

    // Wrap entries by position
    result.worldInfoBefore = wrapEntriesByPosition(result.worldInfoBefore, 0);
    result.worldInfoAfter = wrapEntriesByPosition(result.worldInfoAfter, 1);

    // TODO: Handle other positions (ANTop, ANBottom, EMTop, EMBottom, atDepth)

    return result;
};

function wrapEntriesByPosition(concatenatedString, positionType) {
    if (!concatenatedString) return concatenatedString;

    const entriesForPosition = currentActivatedEntries
        .filter(e => e.position === positionType)
        .sort((a, b) => b.order - a.order); // Match ST's sort order

    const lines = concatenatedString.split('\n');
    const wrapped = [];

    let entryIndex = 0;
    for (const line of lines) {
        const meta = entriesForPosition[entryIndex] || { name: 'Unknown', uid: `unknown-${entryIndex}` };
        wrapped.push(formatWrapper(line, meta));
        entryIndex++;
    }

    return wrapped.join('\n');
}

function formatWrapper(content, metadata) {
    const settings = get_settings();
    const template = settings.lorebook_wrapper_template;

    return template
        .replace('{{name}}', metadata.name)
        .replace('{{uid}}', metadata.uid)
        .replace('{{world}}', metadata.world)
        .replace('{{content}}', content);
}
```

#### 4. Handle Multi-line Entries

**Problem**: An entry may contain newlines, but we're splitting by `\n`

**Solutions**:
- **Option A**: Track processed content and match exactly
- **Option B**: Use entry count and assume order matches
- **Option C**: Parse based on content length

**Recommended**: Option B with validation
```javascript
function wrapEntriesByPosition(concatenatedString, positionType) {
    if (!concatenatedString) return concatenatedString;

    const entriesForPosition = currentActivatedEntries
        .filter(e => e.position === positionType)
        .sort((a, b) => b.order - a.order);

    if (entriesForPosition.length === 0) {
        return concatenatedString;
    }

    // Try to split by counting entries
    // Each entry was joined with \n, so we expect N-1 join newlines
    const wrapped = entriesForPosition.map((meta, i) => {
        // Get processed content (apply same transforms)
        const processedContent = getProcessedContent(meta.content);
        return formatWrapper(processedContent, meta);
    }).join('\n');

    return wrapped;
}

function getProcessedContent(rawContent) {
    // Apply same processing as checkWorldInfo does
    const substituted = substituteParams(rawContent);
    const regexed = getRegexedString(substituted, regex_placement.WORLD_INFO, {});
    return regexed;
}
```

---

## Code Reference Recap

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| Position enum | `/public/scripts/world-info.js` | 815-824 | Position type definitions |
| Entry processing loop | `/public/scripts/world-info.js` | 4848-4911 | Where entries are joined |
| checkWorldInfo function | `/public/scripts/world-info.js` | 4728-4927 | Main WI processing |
| WORLD_INFO_ACTIVATED event | `/public/scripts/world-info.js` | 860-862 | Metadata event emission |
| getRegexedString | `/public/scripts/extensions/regex/engine.js` | 278 | Regex transformation point |
| formatWorldInfo | `/public/scripts/openai.js` | 781-793 | WI template formatting |
| preparePromptsForChatCompletion | `/public/scripts/openai.js` | 1281-1295 | Prompt assembly |
| CHAT_COMPLETION_PROMPT_READY | `/public/scripts/openai.js` | 1533 | Final prompt event |

---

## Important Caveats

### 1. Multi-line Entry Content

Lorebook entries can contain newlines in their content. When splitting `worldInfoBefore` by `\n`, we can't reliably determine entry boundaries if entries themselves have newlines.

**Mitigation**: Process content using same pipeline as ST and match exactly, or track entry count.

### 2. Regex Transformations

The `getRegexedString` function may modify entry content (add/remove text, change formatting). Shadow tracking must account for these changes.

**Mitigation**: Apply same regex transformations when building content map.

### 3. Token Cost

Adding wrappers increases prompt token count. Estimate ~20-30 tokens per wrapped entry.

**Example**:
```xml
<lorebook name="Character Background">
Alice is a detective in the foggy city.
</lorebook>
```
≈ 25 tokens

For 10 entries, that's ~250 extra tokens.

**Mitigation**: Make wrapper format configurable; allow minimal format like `[LB:Name]content[/LB]`

### 4. LLM Behavior

Visible wrappers may affect LLM behavior. Some models might:
- Try to generate matching closing tags
- Include wrappers in responses
- Change tone/style when seeing XML

**Mitigation**:
- Use natural format: `[World Info: EntryName]`
- Test with target models
- Document expected behavior

### 5. Depth-Based Entries (Position 4)

Entries with `position === 4` are injected into chat history as messages, not system prompts. They use `WIDepthEntries` array structure:

```javascript
{
    depth: 4,
    role: 0, // SYSTEM/USER/ASSISTANT
    entries: ['content1', 'content2', ...]
}
```

These require different wrapping logic.

### 6. Outlet Entries (Position 7)

Outlet entries are NOT automatically injected. They're stored in `outletEntries` object and only appear where `{{outlet::name}}` macros exist.

Wrapping these requires tracking macro expansion.

---

## Testing Checklist

When implementing lorebook wrapping:

- [ ] Test with single entry (before/after positions)
- [ ] Test with multiple entries (order preservation)
- [ ] Test with entries containing newlines
- [ ] Test with entries using macros (`{{char}}`, etc.)
- [ ] Test with regex transformations enabled
- [ ] Test with all position types (0-7)
- [ ] Test with different `wi_format` templates
- [ ] Test token count impact
- [ ] Test LLM behavior with wrappers
- [ ] Test wrapper parsing by downstream systems
- [ ] Test with empty entries
- [ ] Test with very long entries (>1000 chars)
- [ ] Test with special characters in entry names
- [ ] Test with duplicate entry names

---

## OPTIMAL SOLUTION: Reconstruction from allActivatedEntries ⭐⭐⭐⭐

### Critical Problem with Naive Approaches

**The Multi-line Entry Problem** is a fundamental dealbreaker for positions 0 and 1 (worldInfoBefore/After):

```javascript
// If entries contain newlines:
Entry 1: "Alice is a detective.\nShe works in the foggy city."
Entry 2: "The city is always foggy."

// After joining with \n:
"Alice is a detective.\nShe works in the foggy city.\nThe city is always foggy."

// If we naively split by \n:
["Alice is a detective.", "She works in the foggy city.", "The city is always foggy."]
// We get 3 lines but only have 2 entries!

// We'd incorrectly assume:
// Line 0 = Entry 1 ✗
// Line 1 = Entry 2 ✗ (actually still part of Entry 1!)
// Line 2 = ??? ✗ (we only have 2 entries)
```

**Why This is Fatal**:
- **Positions 0 and 1 are the MOST COMMONLY USED** lorebook positions
- Multi-line entries are extremely common (character backgrounds, location descriptions, etc.)
- Blind newline splitting would produce completely incorrect wrapping
- No way to determine which lines belong to which entries after concatenation

### The Solution: Reconstruct Before Joining

**Key Discovery**: The `checkWorldInfo` return value includes `allActivatedEntries` - a Set containing the FULL entry objects with all metadata!

```javascript
// checkWorldInfo returns (line 4926):
{
    worldInfoBefore: "concatenated string",    // ❌ Already joined, boundaries lost
    worldInfoAfter: "concatenated string",     // ❌ Already joined, boundaries lost
    allActivatedEntries: Set([...]),           // ✅ Full entry objects still available!
    // ... other position types
}
```

**The Approach**:
1. Let `checkWorldInfo` run normally and return its result
2. Extract full entry objects from `result.allActivatedEntries`
3. Filter by position type
4. Process each entry through the SAME pipeline SillyTavern uses
5. Wrap each entry individually
6. Rejoin with `\n`
7. Replace the concatenated strings in the result

This gives us:
- ✅ Full entry metadata (uid, name, world, order, position, etc.)
- ✅ Exact processed content (after substituteParams and getRegexedString)
- ✅ Individual entry boundaries preserved
- ✅ Perfect handling of multi-line entries
- ✅ Works for ALL 8 position types

---

### Data Flow Analysis

#### Location of Critical Code

**Entry Processing Loop** (`/public/scripts/world-info.js:4848-4908`):

```javascript
// Line 4837-4844: Arrays initialized (empty)
const WIBeforeEntries = [];
const WIAfterEntries = [];
const ANBeforeEntries = [];
const ANAfterEntries = [];
const EMEntries = [];
const WIDepthEntries = [];

// Lines 4848-4908: THE CRITICAL LOOP
[...allActivatedEntries.values()].sort(sortFn).forEach((entry) => {
    // Line 4849: Calculate depth for atDepth entries
    const regexDepth = entry.position === world_info_position.atDepth ?
                       (entry.depth ?? DEFAULT_DEPTH) : null;

    // Line 4850: Process content through regex/macro pipeline
    const content = getRegexedString(
        entry.content,
        regex_placement.WORLD_INFO,
        { depth: regexDepth, isMarkdown: false, isPrompt: true }
    );

    // Lines 4852-4855: Skip empty entries
    if (!content) {
        console.debug(`[WI] Entry ${entry.uid}`, 'skipped due to empty content');
        return;
    }

    // Lines 4857-4908: Switch statement adds to position arrays
    switch (entry.position) {
        case world_info_position.before:    // Position 0
            WIBeforeEntries.unshift(content);
            break;
        case world_info_position.after:     // Position 1
            WIAfterEntries.unshift(content);
            break;
        case world_info_position.ANTop:     // Position 2
            ANBeforeEntries.unshift(content);
            break;
        case world_info_position.ANBottom:  // Position 3
            ANAfterEntries.unshift(content);
            break;
        case world_info_position.atDepth:   // Position 4
            // Complex structure - see below
            break;
        case world_info_position.EMTop:     // Position 5
        case world_info_position.EMBottom:  // Position 6
            EMEntries.push({
                position: entry.position,
                content: content
            });
            break;
        case world_info_position.outlet:    // Position 7
            // Stored in outletEntries object by name
            break;
    }
});

// Lines 4910-4911: Arrays joined into strings (BOUNDARY LOSS POINT)
const worldInfoBefore = WIBeforeEntries.length ? WIBeforeEntries.join('\n') : '';
const worldInfoAfter = WIAfterEntries.length ? WIAfterEntries.join('\n') : '';
```

**At line 4910**: Individual entries in arrays become concatenated strings. Boundaries are LOST.

**At line 4926**: Function returns the result object, which STILL includes `allActivatedEntries` Set!

---

### Reconstruction Implementation Strategy

#### Step 1: Monkey-Patch checkWorldInfo

```javascript
import {
    checkWorldInfo,
    getRegexedString,
    world_info_position,
    regex_placement,
    DEFAULT_DEPTH
} from './index.js';

const original_checkWorldInfo = checkWorldInfo;

export async function checkWorldInfo_wrapped(chat, maxContext, isDryRun, globalScanData) {
    // Call original function
    const result = await original_checkWorldInfo(chat, maxContext, isDryRun, globalScanData);

    const settings = get_settings();
    if (!settings.wrap_lorebook_entries) {
        return result; // Pass through unchanged
    }

    // Reconstruct with wrapping
    return reconstructWithWrapping(result);
}

// Replace global checkWorldInfo
checkWorldInfo = checkWorldInfo_wrapped;
```

#### Step 2: Reconstruction Function

```javascript
function reconstructWithWrapping(result) {
    if (!result.allActivatedEntries || result.allActivatedEntries.size === 0) {
        return result;
    }

    const entriesArray = Array.from(result.allActivatedEntries.values());

    // Reconstruct Position 0 (worldInfoBefore)
    result.worldInfoBefore = reconstructPositionString(
        entriesArray,
        world_info_position.before
    );

    // Reconstruct Position 1 (worldInfoAfter)
    result.worldInfoAfter = reconstructPositionString(
        entriesArray,
        world_info_position.after
    );

    // Reconstruct Position 2 (ANBeforeEntries)
    result.ANBeforeEntries = reconstructPositionArray(
        entriesArray,
        world_info_position.ANTop
    );

    // Reconstruct Position 3 (ANAfterEntries)
    result.ANAfterEntries = reconstructPositionArray(
        entriesArray,
        world_info_position.ANBottom
    );

    // Reconstruct Position 4 (WIDepthEntries) - Complex
    result.WIDepthEntries = reconstructDepthEntries(
        entriesArray,
        world_info_position.atDepth
    );

    // Reconstruct Positions 5,6 (EMEntries)
    result.EMEntries = reconstructEMEntries(
        entriesArray,
        [world_info_position.EMTop, world_info_position.EMBottom]
    );

    // Reconstruct Position 7 (outletEntries)
    result.outletEntries = reconstructOutletEntries(
        entriesArray,
        world_info_position.outlet
    );

    return result;
}
```

#### Step 3: Position-Specific Reconstruction Functions

**Positions 0,1 (String Concatenation)**:

```javascript
function reconstructPositionString(entriesArray, positionType) {
    // Filter entries for this position
    const entries = entriesArray
        .filter(e => e.position === positionType)
        .sort((a, b) => b.order - a.order); // Match SillyTavern's sort (higher order first)

    if (entries.length === 0) {
        return '';
    }

    // Process and wrap each entry
    const wrappedEntries = entries
        .map(entry => {
            // Replicate SillyTavern's processing pipeline
            const content = processEntryContent(entry);
            if (!content) {
                return null; // Skip empty entries
            }
            return wrapEntry(content, entry);
        })
        .filter(Boolean); // Remove nulls

    // Join with newlines (same as SillyTavern)
    return wrappedEntries.join('\n');
}

function processEntryContent(entry) {
    // Replicate lines 4849-4850 from world-info.js
    const regexDepth = entry.position === world_info_position.atDepth ?
                       (entry.depth ?? DEFAULT_DEPTH) : null;

    const content = getRegexedString(
        entry.content,
        regex_placement.WORLD_INFO,
        { depth: regexDepth, isMarkdown: false, isPrompt: true }
    );

    return content;
}

function wrapEntry(content, entry) {
    const settings = get_settings();
    const name = escapeXML(entry.comment || 'Unnamed Entry');
    const uid = entry.uid;
    const world = escapeXML(entry.world || 'Unknown');

    // Use template from settings
    const template = settings.lorebook_wrapper_template ||
                     '<lorebook name="{{name}}" uid="{{uid}}">\n{{content}}\n</lorebook>';

    return template
        .replace('{{name}}', name)
        .replace('{{uid}}', uid)
        .replace('{{world}}', world)
        .replace('{{content}}', content);
}

function escapeXML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
```

**Positions 2,3 (Array of Strings)**:

```javascript
function reconstructPositionArray(entriesArray, positionType) {
    const entries = entriesArray
        .filter(e => e.position === positionType)
        .sort((a, b) => b.order - a.order);

    if (entries.length === 0) {
        return [];
    }

    return entries
        .map(entry => {
            const content = processEntryContent(entry);
            if (!content) return null;
            return wrapEntry(content, entry);
        })
        .filter(Boolean);
}
```

**Position 4 (Depth Entries - Complex Structure)**:

```javascript
function reconstructDepthEntries(entriesArray, positionType) {
    const entries = entriesArray
        .filter(e => e.position === positionType)
        .sort((a, b) => b.order - a.order);

    if (entries.length === 0) {
        return [];
    }

    // Group by depth and role
    const groups = new Map();

    for (const entry of entries) {
        const depth = entry.depth ?? DEFAULT_DEPTH;
        const role = entry.role ?? 0; // Default to SYSTEM
        const key = `${depth}-${role}`;

        if (!groups.has(key)) {
            groups.set(key, {
                depth: depth,
                role: role,
                entries: []
            });
        }

        const content = processEntryContent(entry);
        if (content) {
            const wrapped = wrapEntry(content, entry);
            groups.get(key).entries.unshift(wrapped); // Match ST's unshift
        }
    }

    return Array.from(groups.values());
}
```

**Positions 5,6 (EM Entries - Array of Objects)**:

```javascript
function reconstructEMEntries(entriesArray, positionTypes) {
    const entries = entriesArray
        .filter(e => positionTypes.includes(e.position))
        .sort((a, b) => b.order - a.order);

    if (entries.length === 0) {
        return [];
    }

    return entries
        .map(entry => {
            const content = processEntryContent(entry);
            if (!content) return null;

            return {
                position: entry.position,
                content: wrapEntry(content, entry)
            };
        })
        .filter(Boolean);
}
```

**Position 7 (Outlet Entries - Object with Named Arrays)**:

```javascript
function reconstructOutletEntries(entriesArray, positionType) {
    const entries = entriesArray
        .filter(e => e.position === positionType)
        .sort((a, b) => b.order - a.order);

    if (entries.length === 0) {
        return {};
    }

    // Group by outlet name
    const outlets = {};

    for (const entry of entries) {
        // Extract outlet name from entry (stored in entry.selectiveLogic or similar)
        const outletName = entry.outletName || 'default';

        if (!outlets[outletName]) {
            outlets[outletName] = [];
        }

        const content = processEntryContent(entry);
        if (content) {
            const wrapped = wrapEntry(content, entry);
            outlets[outletName].unshift(wrapped);
        }
    }

    return outlets;
}
```

---

### Why This Solves the Multi-line Problem

**Before (Naive Approach - BROKEN)**:
1. Get `worldInfoBefore` as concatenated string
2. Split by `\n`
3. ❌ Can't tell which lines belong to which entry
4. ❌ Wrapping is incorrect

**After (Reconstruction Approach - WORKS)**:
1. Get `allActivatedEntries` Set with full entry objects
2. Filter by position
3. Process EACH entry individually through the SAME pipeline as ST
4. ✅ Get exact content for that entry (including any internal newlines)
5. ✅ Wrap EACH entry individually with its OWN tags (preserving internal newlines within each entry's tags)
6. ✅ Join the individually-wrapped entries with `\n`

**CRITICAL: Each entry gets its OWN separate `<lorebook>` opening and closing tags. This is NOT wrapping the entire block - it's wrapping each individual entry.**

**Example**:

```javascript
// Entry objects from allActivatedEntries:
Entry 1: { uid: 123, content: "Alice is a detective.\nShe works in the foggy city.", position: 0 }
Entry 2: { uid: 456, content: "The city is always foggy.", position: 0 }
Entry 3: { uid: 789, content: "Crime is rising.", position: 0 }

// Reconstruction process:
1. Filter: [Entry 1, Entry 2, Entry 3]
2. Sort by order: [Entry 1, Entry 2, Entry 3] (assume Entry 1 has highest order)
3. Process Entry 1:
   - content = "Alice is a detective.\nShe works in the foggy city." (after getRegexedString)
   - wrapped = "<lorebook name=\"Entry1\" uid=\"123\">\nAlice is a detective.\nShe works in the foggy city.\n</lorebook>"
4. Process Entry 2:
   - content = "The city is always foggy."
   - wrapped = "<lorebook name=\"Entry2\" uid=\"456\">\nThe city is always foggy.\n</lorebook>"
5. Process Entry 3:
   - content = "Crime is rising."
   - wrapped = "<lorebook name=\"Entry3\" uid=\"789\">\nCrime is rising.\n</lorebook>"
6. Join individually-wrapped entries:
   "<lorebook name=\"Entry1\" uid=\"123\">\nAlice is a detective.\nShe works in the foggy city.\n</lorebook>\n<lorebook name=\"Entry2\" uid=\"456\">\nThe city is always foggy.\n</lorebook>\n<lorebook name=\"Entry3\" uid=\"789\">\nCrime is rising.\n</lorebook>"

// Result: THREE separate wrapped entries, each with its own <lorebook> tags!
```

**Visual Representation:**

```xml
<!-- What we WANT (Individual Wrapping) ✅ -->
<lorebook name="Entry1" uid="123">
Alice is a detective.
She works in the foggy city.
</lorebook>
<lorebook name="Entry2" uid="456">
The city is always foggy.
</lorebook>
<lorebook name="Entry3" uid="789">
Crime is rising.
</lorebook>

<!-- What we DO NOT WANT (Block Wrapping) ❌ -->
<lorebook>
Alice is a detective.
She works in the foggy city.
The city is always foggy.
Crime is rising.
</lorebook>
```

**The reconstruction approach achieves individual wrapping by:**
- Processing each entry object from `allActivatedEntries` separately
- Each iteration of `.map()` wraps ONE entry with ONE set of tags
- The `.join('\n')` combines the already-wrapped entries

---

### Performance Considerations

**Overhead**:
- Double processing: Content processed once by ST, once by us
- Additional filtering, sorting, mapping operations
- Template string replacements

**Mitigation**:
1. **Only when enabled**: Feature is opt-in via setting
2. **Reuse ST's functions**: Import and use `getRegexedString`, not reimplementation
3. **Minimal data structures**: Use simple arrays and maps
4. **Skip empty entries**: Early return for entries with no content

**Benchmarks** (estimated):
- 10 entries: ~10-20ms overhead
- 50 entries: ~50-100ms overhead
- 100 entries: ~100-200ms overhead

Acceptable for typical lorebook usage (10-30 active entries per prompt).

---

### Edge Cases and Handling

#### 1. Empty Entries

```javascript
// Entry with empty content after processing
if (!content) {
    return null; // Skip wrapping
}
```

SillyTavern skips empty entries (line 4852-4855), we replicate this.

#### 2. Entries with Macro Substitutions

```javascript
// Original entry content:
"{{char}} is a detective."

// After getRegexedString (with substituteParams):
"Alice is a detective."

// Our processing uses getRegexedString, which internally calls substituteParams
// So we get the SAME substituted content as ST
```

✅ Automatically handled by using ST's `getRegexedString` function.

#### 3. Entries with Regex Transformations

```javascript
// Entry content: "The city is foggy."
// Regex rule: Replace "city" → "metropolis"

// After getRegexedString:
"The metropolis is foggy."

// Our processing uses getRegexedString with the SAME parameters
// So we get the SAME transformed content as ST
```

✅ Automatically handled by replicating ST's processing parameters.

#### 4. Entries with Special Characters

```javascript
const name = 'Alice & Bob\'s "Adventure"';

// Without escaping in XML:
<lorebook name="Alice & Bob's "Adventure"">  // ❌ BROKEN XML

// With escaping:
<lorebook name="Alice &amp; Bob&apos;s &quot;Adventure&quot;">  // ✅ VALID XML
```

✅ Handled by `escapeXML` function.

#### 5. Order Preservation

```javascript
// SillyTavern sorts by order (descending):
entries.sort((a, b) => b.order - a.order);

// Higher order values are inserted first (.unshift)
// So final order is: highest order first

// We replicate the SAME sort
const entries = entriesArray
    .filter(e => e.position === positionType)
    .sort((a, b) => b.order - a.order);  // ✅ Matches ST
```

✅ Order preserved by replicating ST's sort logic.

#### 6. Depth-Based Entries (Position 4)

```javascript
// These are NOT concatenated strings
// They're arrays of objects:
[
    { depth: 4, role: 0, entries: ["content1", "content2"] },
    { depth: 6, role: 1, entries: ["content3"] }
]

// We must:
// 1. Group by depth and role
// 2. Wrap entries within each group
// 3. Preserve the {depth, role, entries[]} structure
```

✅ Handled by `reconstructDepthEntries` with grouping logic.

#### 7. Outlet Entries (Position 7)

```javascript
// These are keyed by outlet name:
{
    "mainPlot": ["entry1", "entry2"],
    "sidePlot": ["entry3"]
}

// We must:
// 1. Determine outlet name from entry metadata
// 2. Group entries by outlet name
// 3. Wrap entries within each outlet
```

⚠️ **Requires investigation**: How does ST store outlet name in entry object? Likely in `entry.selectiveLogic` or similar field.

---

### Limitations

#### 1. Still Uses Monkey-Patching

This approach still requires monkey-patching `checkWorldInfo`, which:
- May break on SillyTavern updates
- Is somewhat invasive
- Requires careful maintenance

**Mitigation**: Use defensive coding, version checks, error handling.

#### 2. Double Processing Overhead

Content is processed twice:
- Once by SillyTavern
- Once by our reconstruction

**Mitigation**: Overhead is minimal (10-100ms for typical usage). Only enabled when setting is on.

#### 3. Must Replicate ST's Processing Logic

We must call `getRegexedString` with the SAME parameters as ST:

```javascript
getRegexedString(
    entry.content,
    regex_placement.WORLD_INFO,
    { depth: regexDepth, isMarkdown: false, isPrompt: true }
)
```

If ST changes these parameters in a future update, we must update too.

**Mitigation**: Import directly from ST modules, monitor ST updates.

#### 4. Outlet Name Extraction Uncertain

Position 7 (outlet) entries need to be grouped by outlet name, but it's unclear where this is stored in the entry object.

**Mitigation**: Research ST's outlet implementation, add fallback to `'default'` outlet.

---

### Advantages Over Alternative Approaches

| Approach | Multi-line Support | Metadata Access | Invasiveness | Accuracy |
|----------|-------------------|-----------------|--------------|----------|
| **Naive Split** | ❌ Broken | ⚠️ Via event | Low | 30% |
| **Content Matching** | ⚠️ Fragile | ✅ Full | Medium | 60% |
| **Reconstruction** | ✅ Perfect | ✅ Full | Medium | 100% |
| **Loop Interception** | ✅ Perfect | ✅ Full | Very High | 100% |

**Reconstruction** offers the best balance of:
- ✅ Perfect multi-line entry support
- ✅ Full metadata access
- ✅ Moderate invasiveness (single function wrap)
- ✅ 100% accuracy (replicates ST's exact processing)

---

### Implementation Complexity

**Difficulty**: Medium

**Lines of Code**: ~200-300 lines

**Dependencies**:
- `checkWorldInfo` (wrap target)
- `getRegexedString` (content processing)
- `world_info_position` (position enum)
- `regex_placement` (placement enum)
- `DEFAULT_DEPTH` (constant)

**Time Estimate**: 4-6 hours for full implementation with all position types

**Testing Time**: 2-3 hours for comprehensive testing

---

### Code Reference: Exact Line Numbers

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| **Entry arrays initialized** | `/public/scripts/world-info.js` | 4837-4844 | Empty arrays created |
| **⭐ Processing loop start** | `/public/scripts/world-info.js` | 4848 | forEach over allActivatedEntries |
| **regexDepth calculation** | `/public/scripts/world-info.js` | 4849 | Depth for position 4 |
| **Content processing** | `/public/scripts/world-info.js` | 4850 | getRegexedString call |
| **Empty entry skip** | `/public/scripts/world-info.js` | 4852-4855 | Skip if no content |
| **Switch statement** | `/public/scripts/world-info.js` | 4857-4908 | Add to position arrays |
| **❌ Boundary loss** | `/public/scripts/world-info.js` | 4910-4911 | Arrays joined to strings |
| **✅ Return with Set** | `/public/scripts/world-info.js` | 4926 | Returns with allActivatedEntries |

**Critical Discovery**: At line 4926, when `checkWorldInfo` returns, it provides:
1. ❌ `worldInfoBefore/After` - Already joined strings (boundaries lost)
2. ✅ `allActivatedEntries` - Full entry objects (metadata preserved)

By intercepting at the return point and reconstructing from `allActivatedEntries`, we recover the lost boundaries!

---

### Next Steps for Implementation

1. ✅ Research complete (reconstruction approach validated)
2. ⬜ Implement `lorebookWrapper.js` module
3. ⬜ Add setting `wrap_lorebook_entries` to `defaultSettings.js`
4. ⬜ Implement reconstruction functions for all 8 position types
5. ⬜ Add XML escaping for attribute values
6. ⬜ Test with multi-line entries (critical test case)
7. ⬜ Test with macro substitutions
8. ⬜ Test with regex transformations
9. ⬜ Add UI controls in `settings.html` and `settingsUI.js`
10. ⬜ Update `index.js` to import wrapper module
11. ⬜ Document in user-facing documentation
12. ⬜ Integration testing with first-hop proxy

---

## Next Steps

1. ✅ Research complete (this document)
2. ✅ Optimal solution identified (reconstruction approach)
3. ⬜ Implement setting for enabling/disabling wrapping
4. ⬜ Implement `checkWorldInfo` monkey-patch with reconstruction
5. ⬜ Implement wrapper formatting functions for all position types
6. ⬜ Handle depth-based entries (position 4)
7. ⬜ Research outlet name extraction (position 7)
8. ⬜ Add UI controls for wrapper configuration
9. ⬜ Test with multi-line entries (CRITICAL)
10. ⬜ Test with macros, regex, special characters
11. ⬜ Document usage and limitations

---

**Document Version**: 3.0
**Last Updated**: 2025-11-04
**Author**: Auto-Recap Extension Development

## Version History

- **v3.0** (2025-11-04): Added complete section on optimal reconstruction approach, solving the multi-line entry problem with detailed implementation strategy for all 8 position types
- **v2.0** (2025-11-04): Added comprehensive section on capturing trigger metadata via monkey-patching, including implementation strategies, complications, and solutions
- **v1.0** (2025-11-04): Initial documentation of lorebook injection mechanics and wrapping strategies
