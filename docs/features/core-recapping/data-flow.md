# Core Recapping System - Data Flow

## Overview

This document traces the complete execution flow of the core recapping system from trigger to completion. The system uses **scene-based recapping** as its primary mechanism, where groups of related messages (scenes) are summarized as narrative units.

## Entry Points

### Entry Point 1: Manual Scene Recap via Generate Button

**Trigger**: User clicks "Generate" button in scene break UI

**File**: `sceneBreak.js:493-496`

**Flow**:

1. **User clicks Generate button** in scene break div
   ```javascript
   // File: sceneBreak.js:493
   $sceneBreak.find(selectorsExtension.sceneBreak.generateRecap).off('click').on('click', async function (e) {
     e.stopPropagation();
     await handleGenerateRecapButtonClick(index, chat, message, $sceneBreak, get_message_div, get_data, set_data, saveChatDebounced);
   });
   ```

2. **handleGenerateRecapButtonClick() called** (`sceneBreak.js:218-234`)
   ```javascript
   async function handleGenerateRecapButtonClick(index, chat, message, $sceneBreak, ...) {
     log(SUBSYSTEM.SCENE, "Generate button clicked for scene at index", index);
     await generateSceneRecap({ index, get_message_div, getContext, get_data, set_data, saveChatDebounced, skipQueue: false });
   }
   ```
   - Sets `skipQueue: false` → operation will be queued

3. **generateSceneRecap() called** (`sceneBreak.js:700-900`)
   - Checks `skipQueue` parameter
   - Since `skipQueue = false`, queues operation instead of executing directly

4. **tryQueueSceneRecap() called** (`sceneBreak.js:620-635`)
   ```javascript
   async function tryQueueSceneRecap(index) {
     debug(SUBSYSTEM.SCENE, `[Queue] Queueing scene recap generation for index ${index}`);
     const { queueGenerateSceneRecap } = await import('./queueIntegration.js');
     const operationId = await queueGenerateSceneRecap(index);
     if (operationId) {
       toast(`Queued scene recap generation for message ${index}`, 'info');
       return true;
     }
     return false;
   }
   ```

5. **queueGenerateSceneRecap() called** (`queueIntegration.js:~50`)
   ```javascript
   export async function queueGenerateSceneRecap(index, options = {}) {
     return await enqueueOperation(
       OperationType.GENERATE_SCENE_RECAP,
       { index },
       {
         priority: options.priority || 20,
         queueVersion: options.queueVersion,
         metadata: {
           scene_index: index,
           triggered_by: options.triggeredBy || 'manual'
         }
       }
     );
   }
   ```

6. **enqueueOperation() called** (`operationQueue.js:~200`)
   - Creates operation object with UUID
   - Adds to queue array
   - Persists queue to lorebook entry
   - Triggers `processQueue()` (debounced)

7. **Queue processing begins** (see Phase 2 below)

### Entry Point 2: Auto Scene Break Detection

**Trigger**: Character message rendered, auto-detection finds scene break

**File**: `eventHandlers.js:153-165`

**Flow**:

1. **CHARACTER_MESSAGE_RENDERED event fires** (`eventHandlers.js:374`)
   ```javascript
   eventSource.makeLast(event_types.CHARACTER_MESSAGE_RENDERED, (id) => on_chat_event('char_message', id));
   ```

2. **handleCharMessage() called** (`eventHandlers.js:168-175`)
   ```javascript
   async function handleCharMessage(index) {
     if (!chat_enabled()) return;
     const context = getContext();
     if (!context.groupId && context.characterId === undefined) return;
     if (streamingProcessor && !streamingProcessor.isFinished) return;
     await handleCharMessageNew(index);
   }
   ```

3. **handleCharMessageNew() called** (`eventHandlers.js:153-166`)
   ```javascript
   async function handleCharMessageNew(index) {
     log(SUBSYSTEM.EVENT, "Triggering auto scene break detection for character message at index", index);
     const offset = Number(get_settings('auto_scene_break_message_offset')) || 0;
     if (offset >= 1 && lastMessageReceivedReason === 'swipe') {
       debug('[Scene] Skipping auto scene break detection on swipe due to offset >= 1');
       lastMessageReceivedReason = null;
       return;
     }
     lastMessageReceivedReason = null;
     await processNewMessageForSceneBreak(index);
   }
   ```

4. **processNewMessageForSceneBreak() called** (`autoSceneBreakDetection.js`)
   - Checks if auto-detection enabled
   - Finds unchecked message range
   - Queues `DETECT_SCENE_BREAK` operation

5. **DETECT_SCENE_BREAK operation executed** (`operationHandlers.js:243-354`)
   - Calls `detectSceneBreak()` to analyze messages
   - Makes LLM call to determine if scene break exists
   - If scene break found: places marker via `toggleSceneBreak()`
   - Marks checked messages to avoid re-detection

6. **If scene break detected and auto_scene_break_generate_recap enabled** (`operationHandlers.js:336-351`)
   ```javascript
   if (get_settings('auto_scene_break_generate_recap')) {
     debug(SUBSYSTEM.QUEUE, `Enqueueing GENERATE_SCENE_RECAP for message ${sceneBreakAt}`);
     const recapOpId = await enqueueOperation(
       OperationType.GENERATE_SCENE_RECAP,
       { index: sceneBreakAt },
       {
         priority: 20,
         queueVersion: operation.queueVersion,
         metadata: {
           scene_index: sceneBreakAt,
           triggered_by: 'auto_scene_break_detection'
         }
       }
     );
   }
   ```

7. **Queue processing begins** (see Phase 2 below)

### Entry Point 3: Manual Scene Break Placement

**Trigger**: User clicks scene break button on message

**File**: `sceneBreak.js:88-92`

**Flow**:

1. **User clicks scene break button** (clapperboard icon)
   ```javascript
   $(`div${selectorsSillyTavern.chat.container}`).on("click", `.${SCENE_BREAK_BUTTON_CLASS}`, function () {
     const message_block = $(this).closest(selectorsSillyTavern.message.block);
     const message_id = Number(message_block.attr("mesid"));
     toggleSceneBreak(message_id, get_message_div, getContext, set_data, get_data, saveChatDebounced);
   });
   ```

2. **toggleSceneBreak() called** (`sceneBreak.js:97-152`)
   - Checks if scene break already exists
   - If not, creates scene break marker
   - Sets `scene_break = true` and `scene_break_visible = true`
   - Calls `renderAllSceneBreaks()` to update UI
   - Saves chat

3. **renderSceneBreak() called** (`sceneBreak.js:~300-600`)
   - Initializes recap versions (empty initially)
   - Builds scene break HTML with Generate button
   - Inserts into DOM above message

**Note**: Manual scene break placement does NOT automatically generate recap. User must click Generate button (Entry Point 1).

## Detailed Execution Flow

### Phase 1: Operation Enqueueing

```
User Action (Button Click / Auto-Detection)
  ↓
queueGenerateSceneRecap(index) [queueIntegration.js:~50]
  ↓
enqueueOperation(OperationType.GENERATE_SCENE_RECAP, {index}, {...}) [operationQueue.js:~200]
  ↓
Create operation object:
  {
    id: "uuid-v4-generated",
    type: "GENERATE_SCENE_RECAP",
    status: "pending",
    priority: 20,
    params: { index: 42 },
    metadata: { scene_index: 42, triggered_by: "manual" },
    createdAt: Date.now()
  }
  ↓
Push to queue array
  ↓
saveQueueState() [operationQueue.js:~300]
  ↓
Persist queue to lorebook entry "Auto-Recap Operations Queue"
  {
    comment: "Auto-Recap Operations Queue",
    content: JSON.stringify(queueState),
    disabled: true,  // Not injected into prompts
    constant: true
  }
  ↓
processQueue() [debounced, operationQueue.js:~400]
```

**Key Points**:
- Queue persisted immediately after enqueue (survives page reload)
- `processQueue()` is debounced (100ms) to batch multiple enqueues
- Priority 20 is high (scene recaps execute early)

### Phase 2: Operation Execution

```
processQueue() starts [operationQueue.js:~400]
  ↓
Check if already processing (prevent concurrent execution)
  ↓
Sort operations by priority (descending)
  ↓
Get next pending operation (highest priority)
  ↓
Mark operation as 'in_progress'
  ↓
Save queue state
  ↓
Retrieve handler for operation type
  handler = operationHandlers[operation.type]
  ↓
Execute handler with operation object
  result = await handler(operation)
```

**Step-by-step**:

1. **Queue processor starts** (`operationQueue.js:~400`)
   ```javascript
   async function processQueue() {
     if (isProcessing) return;
     isProcessing = true;
     while (queue.some(op => op.status === 'pending')) {
       const sortedQueue = queue.filter(op => op.status === 'pending').sort((a, b) => b.priority - a.priority);
       const operation = sortedQueue[0];
       operation.status = 'in_progress';
       await saveQueueState();
       const handler = operationHandlers[operation.type];
       try {
         const result = await handler(operation);
         operation.status = 'completed';
         operation.result = result;
       } catch (err) {
         operation.status = 'failed';
         operation.error = err.message;
       }
       await saveQueueState();
     }
     isProcessing = false;
   }
   ```

2. **GENERATE_SCENE_RECAP handler called** (`operationHandlers.js:357-398`)
   ```javascript
   registerOperationHandler(OperationType.GENERATE_SCENE_RECAP, async (operation) => {
     const { index } = operation.params;
     const signal = getAbortSignal(operation);
     debug(SUBSYSTEM.QUEUE, `Executing GENERATE_SCENE_RECAP for index ${index}`);
     toast(`Generating scene recap for message ${index}...`, 'info');

     // Set loading state in recap box
     const $msgDiv = get_message_div(index);
     const $recapBox = $msgDiv.find(selectorsExtension.sceneBreak.recapBox);
     if ($recapBox.length) {
       $recapBox.val("Generating scene recap...");
     }

     const result = await generateSceneRecap({
       index,
       get_message_div,
       getContext,
       get_data,
       set_data,
       saveChatDebounced,
       skipQueue: true, // Execute directly (already in queue)
       signal
     });

     throwIfAborted(signal, 'GENERATE_SCENE_RECAP', 'LLM call');
     toast(`✓ Scene recap generated for message ${index}`, 'success');

     // Queue running recap if enabled
     if (get_settings('running_scene_recap_auto_generate')) {
       await queueCombineSceneWithRunning(index, {
         dependencies: result.lorebookOpIds,
         queueVersion: operation.queueVersion
       });
     }

     return { recap: result.recap };
   });
   ```

3. **generateSceneRecap() called with skipQueue=true** (`sceneBreak.js:700-900`)
   - Now executes directly (no re-queueing)

### Phase 3: Scene Content Collection

```
generateSceneRecap({index, ..., skipQueue: true}) [sceneBreak.js:~700]
  ↓
Check skipQueue parameter (true → execute directly)
  ↓
Get context and chat
  const ctx = getContext();
  const chat = ctx.chat;
  const message = chat[index];
  ↓
findSceneBoundaries(chat, index, get_data) [sceneBreak.js:263-286]
  ↓
Walk backwards from index to find previous scene break (or chat start)
  for (let i = index - 1; i >= 0; i--) {
    if (get_data(chat[i], 'scene_break') && visible) {
      startIdx = i + 1;
      break;
    }
  }
  ↓
Return { startIdx, sceneMessages: [startIdx...index] }
  ↓
collectSceneObjects(startIdx, index, chat) [sceneBreak.js:637-659]
  ↓
Filter messages by message type setting
  const messageTypes = get_settings('scene_recap_message_types'); // 'user'|'character'|'both'
  ↓
Build scene objects array
  for (let i = startIdx; i <= endIdx; i++) {
    const msg = chat[i];
    if (msg.mes && msg.mes.trim() !== "") {
      const includeMessage = messageTypes === "both" ||
        (messageTypes === "user" && msg.is_user) ||
        (messageTypes === "character" && !msg.is_user);
      if (includeMessage) {
        sceneObjects.push({
          type: "message",
          index: i,
          name: msg.name,
          is_user: msg.is_user,
          text: msg.mes
        });
      }
    }
  }
  ↓
Return sceneObjects array
```

**Example Scene Objects**:
```javascript
[
  { type: "message", index: 35, name: "Alice", is_user: false, text: "I'll help you find it." },
  { type: "message", index: 36, name: "User", is_user: true, text: "Thanks! Where should we start?" },
  { type: "message", index: 37, name: "Alice", is_user: false, text: "The old library seems promising." }
]
```

### Phase 4: Active Lorebook Retrieval (Optional)

```
getActiveLorebooksAtPosition(index, ctx, get_data) [sceneBreak.js:724-830]
  ↓
Check if scene_recap_include_active_setting_lore enabled
  const includeActiveLorebooks = get_settings('scene_recap_include_active_setting_lore');
  if (!includeActiveLorebooks) return { entries: [], metadata: {} };
  ↓
Find scene boundaries (same as Phase 3)
  ↓
Extract scene messages only
  const sceneMessages = [];
  for (let i = startIdx; i <= endIdx; i++) {
    if (chat[i]) sceneMessages.push(chat[i].mes);
  }
  ↓
Build globalScanData with character context
  const globalScanData = {
    characterDescription: ctx.description || '',
    characterPersonality: ctx.personality || '',
    personaDescription: ctx.userPersonality || '',
    scenario: ctx.scenario || ''
  };
  ↓
Get chat lorebook name
  const chatLorebookName = getAttachedLorebook();
  ↓
Clear worldInfoCache to ensure fresh entries
  const { worldInfoCache } = await import('../../../world-info.js');
  worldInfoCache.delete(chatLorebookName);
  ↓
Call SillyTavern's checkWorldInfo()
  const { checkWorldInfo } = await import('../../../world-info.js');
  const wiResult = await checkWorldInfo(sceneMessages, 999999, true, globalScanData);
  ↓
Extract activated entries
  const entries = Array.from(wiResult.allActivatedEntries);
  ↓
Filter entries:
  1. Remove registry entries (comment starts with '_registry_')
  2. Remove entries with tag 'auto_lorebooks_registry'
  3. Remove queue entry ('Auto-Recap Operations Queue')
  4. If suppress_other_lorebooks enabled, keep only chat lorebook entries
  ↓
Enhance entries with strategy metadata
  const enhancedEntries = filteredEntries.map(entry => ({
    comment: entry.comment || '(unnamed)',
    uid: entry.uid,
    world: entry.world,
    key: entry.key || [],
    position: entry.position,
    depth: entry.depth,
    order: entry.order,
    role: entry.role,
    constant: entry.constant || false,
    vectorized: entry.vectorized || false,
    sticky: entry.sticky || 0,
    strategy: entry.constant ? 'constant' : (entry.vectorized ? 'vectorized' : 'normal'),
    content: entry.content || ''
  }));
  ↓
Return { entries, metadata }
```

**Example Enhanced Entries**:
```javascript
[
  {
    comment: "Alice",
    uid: "12345",
    world: "z-AutoLB-MyChat",
    key: ["alice"],
    position: 0,
    depth: 4,
    order: 100,
    role: 0,
    constant: false,
    vectorized: false,
    sticky: 0,
    strategy: "normal",
    content: "- Identity: Character — Alice\n- Attributes: Skilled investigator..."
  }
]
```

### Phase 5: Prompt Preparation

```
prepareScenePrompt(sceneObjects, ctx, endIdx, get_data) [sceneBreak.js:861-920]
  ↓
Load prompt template from settings
  const promptTemplate = get_settings('scene_recap_prompt');
  ↓
Load prefill from settings
  const prefill = get_settings('scene_recap_prefill') || "";
  ↓
Get configured entity types
  const typeDefinitions = getConfiguredEntityTypeDefinitions();
  const lorebookTypesMacro = formatEntityTypeListForPrompt(typeDefinitions);
  ↓
Get active lorebook entries (Phase 4)
  const { entries: activeEntries, metadata } = await getActiveLorebooksAtPosition(endIdx, ctx, get_data);
  ↓
Format active lorebook entries
  const activeSettingLoreText = formatSettingLoreForPrompt(activeEntries);
  // Returns: "INSTRUCTIONS: ...\n\n<setting_lore name=\"Alice\" uid=\"12345\" ...>...</setting_lore>"
  ↓
Format scene messages with speaker labels
  const formattedMessages = sceneObjects.map((obj) => {
    const role = obj.is_user ? 'USER' : 'CHARACTER';
    return `[${role}: ${obj.name}]\n${obj.text}`;
  }).join('\n\n');
  ↓
Apply macro substitution
  let prompt = promptTemplate;
  if (ctx.substituteParamsExtended) {
    prompt = ctx.substituteParamsExtended(prompt, {
      scene_messages: formattedMessages,
      prefill: prefill,
      lorebook_entry_types: lorebookTypesMacro,
      active_setting_lore: activeSettingLoreText
    });
  }
  ↓
Return { prompt, prefill }
```

**Example Final Prompt** (abbreviated):
```
You are a structured data extraction system analyzing roleplay transcripts.

Required format:
{
  "scene_name": "Brief title",
  "recap": "## Current Situation\n...",
  "atmosphere": "...",
  "emotional_beats": "...",
  "setting_lore": [...]
}

INSTRUCTIONS: The following <setting_lore> entries contain context that is active for this scene...

<setting_lore name="Alice" uid="12345" world="z-AutoLB-MyChat" ...>
- Identity: Character — Alice
- Attributes: Skilled investigator...
</setting_lore>

Scene Content:
[CHARACTER: Alice]
I'll help you find it.

[USER: User]
Thanks! Where should we start?

[CHARACTER: Alice]
The old library seems promising.
```

### Phase 6: LLM API Call

```
sendLLMRequest(profileId, prompt, operationType, options) [llmClient.js:10-231]
  ↓
Check for test override
  if (globalThis.__TEST_RECAP_TEXT_RESPONSE) return override;
  ↓
Retrieve connection profile
  const profile = ctx.extensionSettings.connectionManager.profiles.find(p => p.id === profileId);
  if (!profile) throw new Error(`Connection Manager profile not found: ${profileId}`);
  ↓
Load generation parameters from preset
  const preset = get_settings('scene_recap_completion_preset');
  const presetManager = getPresetManager('openai');
  const presetData = presetManager.getCompletionPresetByName(preset);
  ↓
Extract generation params
  generationParams = {
    temperature: presetData.temperature,
    top_p: presetData.top_p,
    min_p: presetData.min_p,
    presence_penalty: presetData.presence_penalty,
    frequency_penalty: presetData.frequency_penalty,
    repetition_penalty: presetData.repetition_penalty,
    top_k: presetData.top_k
  };
  ↓
Get max_tokens from preset
  const presetMaxTokens = presetData.genamt || presetData.openai_max_tokens;
  if (!presetMaxTokens) throw new Error('Preset has no valid max_tokens');
  ↓
Validate token count
  const tokenSize = count_tokens(prompt);
  const presetMaxContext = presetData.max_context || presetData.openai_max_context;
  const availableContextForPrompt = presetMaxContext - presetMaxTokens;
  if (tokenSize > availableContextForPrompt) {
    throw new Error(`Prompt ${tokenSize} tokens exceeds available context ${availableContextForPrompt}`);
  }
  ↓
Build messages array
  if (options.includePreset) {
    const presetMessages = await loadPresetPrompts(preset);
    messages = [...presetMessages, { role: 'user', content: prompt }];
  } else {
    messages = [{ role: 'user', content: prompt }];
  }
  ↓
Add prefill as assistant message
  if (prefill) {
    messages.push({ role: 'assistant', content: prefill });
  }
  ↓
Inject metadata
  const suffix = getOperationSuffix();
  const fullOperation = suffix ? `${operationType}${suffix}` : operationType;
  injectMetadataIntoChatArray(messages, { operation: fullOperation });
  ↓
Call ConnectionManager
  const result = await ctx.ConnectionManagerRequestService.sendRequest(
    profileId,
    messages,
    presetMaxTokens,
    {
      stream: options.stream ?? false,
      signal: options.signal ?? null,
      extractData: true,
      includePreset: Boolean(options.preset),
      includeInstruct: false
    },
    generationParams
  );
  ↓
Normalize response format
  if (result && typeof result === 'object' && 'content' in result) {
    finalResult = result.content || '';
  }
  ↓
Trim to sentence boundary
  if (ctx.powerUserSettings.trim_sentences) {
    finalResult = trimToEndSentence(finalResult);
  }
  ↓
Return finalResult (string)
```

**Example LLM Response** (raw):
```json
{
  "scene_name": "Library Investigation",
  "recap": "## Current Situation\n- Alice and User are at the entrance to the old library\n- They are searching for a mysterious artifact\n\n## Key Developments\n- [decision] Alice agreed to help User find the artifact\n- [plan] Decided to start search at the old library\n\n## Tone & Style\n- Genre: mystery adventure; investigative narrative\n- Collaborative partnership forming between characters\n\n## Pending Threads\n- Search the old library for clues\n- Identify what the artifact actually is",
  "atmosphere": "Late afternoon; dusty atmosphere; sense of anticipation",
  "emotional_beats": "Alice: determined confidence in her investigative skills; User: hopeful gratitude for Alice's help",
  "setting_lore": [
    {
      "type": "location",
      "name": "Old Library",
      "content": "- Identity: Location — Old Library\n- Synopsis: Abandoned library, potential location for mysterious artifact\n- Attributes: Dusty; filled with old books; multiple floors\n- State: Entrance accessible; interior unexplored",
      "keywords": ["old library", "library"],
      "secondaryKeys": []
    }
  ]
}
```

### Phase 7: Response Parsing & Storage

```
Back in generateSceneRecap() [sceneBreak.js:~800-900]
  ↓
Parse JSON response
  const result = JSON.parse(llmResponse);
  ↓
Extract fields
  const sceneName = result.scene_name || '';
  const recapText = result.recap || '';
  const atmosphere = result.atmosphere || '';
  const emotionalBeats = result.emotional_beats || '';
  const settingLore = result.setting_lore || [];
  ↓
Store recap in message metadata
  const versions = getSceneRecapVersions(message, get_data);
  versions.push(recapText);
  setSceneRecapVersions(message, set_data, versions);
  ↓
Set current version index
  const newIndex = versions.length - 1;
  setCurrentSceneRecapIndex(message, set_data, newIndex);
  ↓
Set active recap
  set_data(message, SCENE_RECAP_MEMORY_KEY, recapText);
  set_data(message, SCENE_BREAK_RECAP_KEY, recapText); // Legacy
  ↓
Compute and store hash
  const hash = computeRecapHash(recapText);
  set_data(message, SCENE_RECAP_HASH_KEY, hash);
  ↓
Store metadata
  set_data(message, SCENE_RECAP_METADATA_KEY, {
    lorebookEntryCount: settingLore.length,
    generatedAt: Date.now(),
    atmosphere: atmosphere,
    emotionalBeats: emotionalBeats
  });
  ↓
Save chat
  saveChatDebounced();
  ↓
Process setting_lore entities
  const lorebookOpIds = [];
  for (const entity of settingLore) {
    const opId = await queueProcessLorebookEntry(entity, {
      queueVersion: operation.queueVersion
    });
    lorebookOpIds.push(opId);
  }
  ↓
Return { recap: recapText, lorebookOpIds }
```

**Stored Message Metadata**:
```javascript
message.extra = {
  scene_break: true,
  scene_break_visible: true,
  scene_break_collapsed: false,
  scene_recap_memory: "## Current Situation\n- Alice and User are at...",
  scene_recap_versions: [
    "## Current Situation\n- Alice and User are at..."
  ],
  scene_recap_current_index: 0,
  scene_recap_hash: "abc123def456",
  scene_recap_metadata: {
    lorebookEntryCount: 1,
    generatedAt: 1700000000000,
    atmosphere: "Late afternoon; dusty atmosphere...",
    emotionalBeats: "Alice: determined confidence..."
  }
};
```

### Phase 8: Lorebook Processing (Conditional)

```
queueProcessLorebookEntry(entity, options) [queueIntegration.js:~100]
  ↓
Extract entity data
  const { type, name, content, keywords, secondaryKeys, uid } = entity;
  ↓
Build entryData object
  const entryData = {
    comment: name,
    type: type,
    content: content,
    keys: keywords,
    secondaryKeys: secondaryKeys || []
  };
  ↓
Generate unique entryId
  const entryId = `entity-${Date.now()}-${Math.random()}`;
  ↓
Store in pending operations map
  setEntryData(entryId, entryData);
  ↓
Enqueue LOREBOOK_ENTRY_LOOKUP operation
  const opId = await enqueueOperation(
    OperationType.LOREBOOK_ENTRY_LOOKUP,
    {
      entryId: entryId,
      entryData: entryData,
      registryListing: registryListing,
      typeList: typeList
    },
    {
      priority: 12,
      queueVersion: options.queueVersion,
      metadata: { entry_comment: name }
    }
  );
  ↓
Return operation ID
```

**Lorebook Pipeline**:
1. `LOREBOOK_ENTRY_LOOKUP` - Checks if entity matches existing lorebook entries
2. `RESOLVE_LOREBOOK_ENTRY` (conditional) - Gets full context for uncertain matches
3. `CREATE_LOREBOOK_ENTRY` - Creates new or merges with existing entry
4. `UPDATE_LOREBOOK_REGISTRY` - Updates registry entry content

See `recapToLorebookProcessor.js` and lorebook integration docs for details.

### Phase 9: UI Update

```
Back in GENERATE_SCENE_RECAP handler [operationHandlers.js:~380]
  ↓
Check if operation was cancelled
  throwIfAborted(signal, 'GENERATE_SCENE_RECAP', 'LLM call');
  ↓
Show success toast
  toast(`✓ Scene recap generated for message ${index}`, 'success');
  ↓
Queue running recap if enabled
  if (get_settings('running_scene_recap_auto_generate')) {
    await queueCombineSceneWithRunning(index, {
      dependencies: result.lorebookOpIds,
      queueVersion: operation.queueVersion
    });
  }
  ↓
renderSceneBreak() called [sceneBreak.js:~300-600]
  ↓
Read recap versions
  const versions = getSceneRecapVersions(message, get_data);
  const currentIdx = getCurrentSceneRecapIndex(message, get_data);
  ↓
Build scene break HTML
  const sceneBreakHtml = `
    <div class="auto_recap_scene_break_div">
      <textarea class="scene-recap-box">${recapText}</textarea>
      <span class="scene-version-indicator">v${currentIdx + 1}/${versions.length}</span>
      ...buttons...
    </div>
  `;
  ↓
Insert into DOM
  $sceneBreak = $(sceneBreakHtml);
  $messageDiv.before($sceneBreak);
  ↓
Bind event handlers (change, blur, click, etc.)
```

## Data Transformations

### Input Data

**Scene Objects Array**:
```javascript
[
  {
    type: "message",
    index: 35,
    name: "Alice",
    is_user: false,
    text: "I'll help you find it."
  },
  {
    type: "message",
    index: 36,
    name: "User",
    is_user: true,
    text: "Thanks! Where should we start?"
  }
]
```

**Active Lorebook Entries**:
```javascript
[
  {
    comment: "Alice",
    uid: "12345",
    world: "z-AutoLB-MyChat",
    key: ["alice"],
    content: "- Identity: Character — Alice\n- Attributes: Skilled investigator...",
    strategy: "normal"
  }
]
```

### Intermediate Data

**Formatted Prompt**:
```
You are a structured data extraction system...

INSTRUCTIONS: The following <setting_lore> entries contain context...

<setting_lore name="Alice" uid="12345" ...>
- Identity: Character — Alice
...
</setting_lore>

Scene Content:
[CHARACTER: Alice]
I'll help you find it.

[USER: User]
Thanks! Where should we start?
```

**LLM Messages Array**:
```javascript
[
  { role: 'user', content: '...' },
  { role: 'assistant', content: '' } // prefill if present
]
```

### Output Data

**LLM JSON Response**:
```javascript
{
  "scene_name": "Library Investigation",
  "recap": "## Current Situation\n- Alice and User are at the old library...",
  "atmosphere": "Late afternoon; dusty atmosphere...",
  "emotional_beats": "Alice: determined confidence...",
  "setting_lore": [
    {
      "type": "location",
      "name": "Old Library",
      "content": "- Identity: Location — Old Library\n...",
      "keywords": ["old library", "library"],
      "secondaryKeys": []
    }
  ]
}
```

**Stored Message Metadata**:
```javascript
message.extra = {
  scene_recap_memory: "## Current Situation\n- Alice and User are at...",
  scene_recap_versions: ["## Current Situation\n- Alice and User are at..."],
  scene_recap_current_index: 0,
  scene_recap_hash: "abc123def456",
  scene_recap_metadata: {
    lorebookEntryCount: 1,
    generatedAt: 1700000000000,
    atmosphere: "Late afternoon; dusty atmosphere...",
    emotionalBeats: "Alice: determined confidence..."
  }
};
```

## Error Handling Flow

### LLM Call Failure

```
sendLLMRequest() throws error
  ↓
Caught in GENERATE_SCENE_RECAP handler
  ↓
Operation status set to 'failed'
  operation.status = 'failed';
  operation.error = err.message;
  ↓
Queue state saved
  await saveQueueState();
  ↓
Error toast shown
  toast('Failed to generate scene recap', 'error');
  ↓
Queue continues to next operation
```

### Invalid JSON Response

```
JSON.parse(llmResponse) throws SyntaxError
  ↓
Caught in generateSceneRecap()
  ↓
Error logged
  error(SUBSYSTEM.SCENE, 'Failed to parse scene recap JSON:', err);
  ↓
Thrown to handler
  throw new Error('Invalid JSON response from LLM');
  ↓
Operation marked as failed (same as above)
```

### Operation Cancelled (AbortSignal)

```
throwIfAborted(signal, 'GENERATE_SCENE_RECAP', 'LLM call')
  ↓
Check signal.aborted
  if (signal.aborted) throw new Error('Operation cancelled');
  ↓
Caught in handler
  ↓
Operation status set to 'cancelled'
  operation.status = 'cancelled';
  ↓
No error toast (expected cancellation)
  ↓
Queue moves to next operation
```

### Connection Profile Not Found

```
sendLLMRequest() checks profile
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) throw new Error('Connection Manager profile not found');
  ↓
Thrown immediately (no LLM call attempted)
  ↓
Caught in handler
  ↓
Operation failed
  toast('Connection profile not found', 'error');
```

## Alternative Flows

### Scene Has Single Message

**Scenario**: Scene break placed on first message or immediately after another scene break.

**Flow**:
1. `findSceneBoundaries()` returns `startIdx = endIdx = index`
2. `collectSceneObjects()` returns array with 1 message
3. LLM called with single message prompt
4. Recap generated normally (no error)

### Active Lorebook Setting Disabled

**Scenario**: `scene_recap_include_active_setting_lore = false`

**Flow**:
1. `getActiveLorebooksAtPosition()` returns immediately: `{ entries: [], metadata: {} }`
2. `formatSettingLoreForPrompt()` returns empty string
3. Prompt contains no lorebook context
4. LLM generates recap without entity context
5. `setting_lore` array may still contain entities (LLM can invent from scene content)

### No Lorebook Entries Extracted

**Scenario**: LLM returns `setting_lore: []` (no entities found)

**Flow**:
1. `settingLore.length === 0`
2. No lorebook operations queued
3. `lorebookOpIds = []`
4. Running recap queued with empty dependencies (executes immediately)

### Running Recap Disabled

**Scenario**: `running_scene_recap_auto_generate = false`

**Flow**:
1. Scene recap completes successfully
2. Handler checks setting: `if (get_settings('running_scene_recap_auto_generate'))`
3. Condition false → no running recap queued
4. Operation completes without follow-up

## Timing & Performance

**Average Execution Time**:
- Operation enqueueing: ~50ms (includes lorebook persistence)
- Scene content collection: ~10ms (5-20 messages)
- Active lorebook retrieval: ~200ms (ST's checkWorldInfo + filtering)
- Prompt preparation: ~50ms (macro substitution, formatting)
- LLM API call: **5-30 seconds** (varies by model, scene length, API latency)
- Response parsing & storage: ~50ms
- UI rendering: ~100ms

**Total**: ~6-31 seconds (dominated by LLM call)

**Blocking vs Non-Blocking**:
- Operation enqueueing: Non-blocking (immediate return)
- Queue processing: Blocking (sequential execution)
- LLM API call: Blocking (awaits response)
- UI updates: Non-blocking (debounced, async)

**Queue Position Impact**:
- High priority (20): Executes early, minimal wait
- Low priority (<10): May wait for other operations
- Dependencies: Waits for dependent operations to complete first

## State Changes

### Before Generation

**Message State**:
```javascript
message.extra = {
  scene_break: true,
  scene_break_visible: true,
  scene_break_collapsed: true,
  scene_recap_versions: [], // Empty
  scene_recap_current_index: 0
};
```

**Queue State**:
```javascript
queue = [
  // ... other operations ...
];
```

**UI State**:
- Scene break div visible
- Recap textarea empty
- Generate button enabled
- Version indicator: "v0/0"

### During Generation

**Operation State**:
```javascript
operation = {
  id: "uuid",
  type: "GENERATE_SCENE_RECAP",
  status: "in_progress",
  params: { index: 42 },
  ...
};
```

**UI State**:
- Recap textarea: "Generating scene recap..."
- Generate button disabled (implicit)
- Loading toast visible

**Queue Blocking** (if enabled):
- ST send button hidden
- Custom queue indicator shown
- Enter key intercepted

### After Generation

**Message State**:
```javascript
message.extra = {
  scene_break: true,
  scene_break_visible: true,
  scene_break_collapsed: false, // Expanded to show recap
  scene_recap_memory: "## Current Situation\n...",
  scene_recap_versions: ["## Current Situation\n..."],
  scene_recap_current_index: 0,
  scene_recap_hash: "abc123def456",
  scene_recap_metadata: {
    lorebookEntryCount: 1,
    generatedAt: 1700000000000,
    atmosphere: "...",
    emotionalBeats: "..."
  }
};
```

**Operation State**:
```javascript
operation = {
  id: "uuid",
  type: "GENERATE_SCENE_RECAP",
  status: "completed",
  params: { index: 42 },
  result: { recap: "..." },
  completedAt: 1700000000000
};
```

**UI State**:
- Recap textarea: Contains full recap text
- Generate button enabled
- Version indicator: "v1/1"
- Success toast: "✓ Scene recap generated for message 42"

**Follow-up Operations Queued**:
- `LOREBOOK_ENTRY_LOOKUP` (for each setting_lore entity)
- `COMBINE_SCENE_WITH_RUNNING` (if enabled)
