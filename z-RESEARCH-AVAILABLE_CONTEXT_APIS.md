# Research: SillyTavern APIs for Available Context

**Date:** 2025-11-17
**Issue:** Extension calculates tokens using `preset.max_context` but SillyTavern throws `TokenBudgetExceededError` because mandatory prompts consume additional context that the extension doesn't account for.

---

## Problem Analysis

### Current Flow
1. Extension calculates tokens for recap prompt (e.g., 50,968 tokens)
2. Extension checks against `preset.max_context` (e.g., 200,000 tokens)
3. Extension thinks it fits ✓
4. Extension calls `generateRaw()` → SillyTavern's `openai.js`
5. SillyTavern adds mandatory prompts (character card, persona, system prompts, jailbreak, etc.)
6. **Total exceeds context** → `TokenBudgetExceededError` thrown
7. Error displayed: "Mandatory prompts exceed the context size" (`openai.js:1504-1506`)

### Root Cause
**Extension's `calculateAvailableContext()`** (`autoSceneBreakDetection.js:319-344`) only gets `preset.max_context`, but doesn't account for mandatory prompts' token consumption.

---

## SillyTavern Token Budget System

### ChatCompletion Class (`openai.js:3243`)

The `ChatCompletion` class manages token budgets:

```javascript
class ChatCompletion {
  constructor() {
    this.tokenBudget = 0;  // Available tokens for prompts
    this.messages = new MessageCollection('root');
  }

  setTokenBudget(context, response) {
    // Called at openai.js:1481
    this.tokenBudget = context - response;
    // e.g., 200000 - 4000 = 196000 tokens available
  }

  canAfford(message) {
    // openai.js:3412
    return 0 <= this.tokenBudget - message.getTokens();
  }

  canAffordAll(messages) {
    // openai.js:3421
    const total = messages.reduce((total, msg) => total + msg.getTokens(), 0);
    return 0 <= this.tokenBudget - total;
  }

  checkTokenBudget(message, identifier) {
    // openai.js:3526 - Throws error if can't afford
    if (!this.canAfford(message)) {
      throw new TokenBudgetExceededError(identifier);
    }
  }

  add(collection, position = null) {
    // openai.js:3327
    this.checkTokenBudget(collection, collection.identifier);
    this.messages.collection.push(collection);
    this.decreaseTokenBudgetBy(collection.getTokens());
  }

  insert(message, identifier, position = 'end') {
    // openai.js:3371
    this.checkTokenBudget(message, message.identifier);
    // ... insert logic
    this.decreaseTokenBudgetBy(message.getTokens());
  }
}
```

**Key insight:** `tokenBudget` property tracks **remaining** available tokens. It starts at `max_context - max_tokens` and decreases as prompts are added.

### populateChatCompletion Function (`openai.js:1087`)

This function adds mandatory prompts in order:

```javascript
async function populateChatCompletion(prompts, chatCompletion, { ... }) {
  chatCompletion.reserveBudget(3);  // Reserve for reply priming

  // Character and world information (MANDATORY)
  await addToChatCompletion('worldInfoBefore');
  await addToChatCompletion('main');              // Character card
  await addToChatCompletion('worldInfoAfter');
  await addToChatCompletion('charDescription');
  await addToChatCompletion('charPersonality');
  await addToChatCompletion('scenario');
  await addToChatCompletion('personaDescription'); // User persona

  // Control prompts (MANDATORY)
  const controlPrompts = new MessageCollection('controlPrompts');
  // ... impersonate, quietPrompt
  chatCompletion.reserveBudget(controlPrompts);

  // System prompts (MANDATORY)
  const systemPrompts = ['nsfw', 'jailbreak'];
  for (const identifier of systemPrompts) {
    await addToChatCompletion(identifier);
  }

  // Optional prompts (may be disabled)
  // - enhanceDefinitions, bias, summary, authorsNote
  // - vectorsMemory, vectorsDataBank, smartContext
  // - extension prompts

  // Tool data (if enabled)
  if (ToolManager.canPerformToolCalls(type)) {
    const toolTokens = await tokenHandler.countAsync(toolMessage);
    chatCompletion.reserveBudget(toolTokens);
  }

  // Chat history (fills remaining budget)
  await populateChatHistory(messages, prompts, chatCompletion, type, cyclePrompt);

  // Dialogue examples (if pinned, or fills remaining budget)
  await populateDialogueExamples(prompts, chatCompletion, messageExamples);

  // Control prompts added last
  if (controlPrompts.collection.length) chatCompletion.add(controlPrompts);
}
```

**Each `add()` or `insert()` call triggers `checkTokenBudget()`** which throws `TokenBudgetExceededError` if budget exceeded.

---

## Available APIs for Extensions

### 1. Exported from `openai.js`

```javascript
// openai.js:551 - PromptManager instance (can be null!)
export let promptManager = null;

// Other exports
export let openai_settings;
export let proxies;
export let selected_proxy;
export class ChatCompletion { ... }
export async function prepareOpenAIMessages({ ... }, dryRun) { ... }
```

**Extension can import:**
```javascript
import { promptManager } from '../../../openai.js';
```

### 2. PromptManager Properties & Methods

From `PromptManager.js`:

```javascript
class PromptManager {
  constructor() {
    this.tokenHandler = null;  // TokenHandler instance
    this.tokenUsage = 0;        // Total tokens used by all prompts
  }

  getTokenHandler() {
    // PromptManager.js:949
    return this.tokenHandler;
  }

  setChatCompletion(chatCompletion) {
    // PromptManager.js:1579 - Called AFTER populateChatCompletion
    const messages = chatCompletion.getMessages();
    this.setMessages(messages);
    this.populateTokenCounts(messages);
    this.overriddenPrompts = chatCompletion.getOverriddenPrompts();
  }

  populateTokenCounts(messages) {
    // PromptManager.js:1592
    this.tokenHandler.resetCounts();
    const counts = this.tokenHandler.getCounts();
    messages.getCollection().forEach(message => {
      counts[message.identifier] = message.getTokens();
    });

    this.tokenUsage = this.tokenHandler.getTotal();
    // ^^^ This is the total tokens used by ALL prompts
  }
}
```

**BUT:** `chatCompletion` object itself is NOT exposed by PromptManager! Only the messages and token counts.

### 3. Available Events

From `openai.js:1533`:

```javascript
const eventData = { chat, dryRun };
await eventSource.emit(event_types.CHAT_COMPLETION_PROMPT_READY, eventData);
```

**Extension already listens to this event** (`eventHandlers.js`), but:
- `chat` is the flattened message array (NOT the ChatCompletion object)
- No access to `chatCompletion.tokenBudget` property

### 4. Exported from `script.js`

From `script.js` (imported by extension's `index.js:15`):

```javascript
export let max_context;  // Global max context
export let amount_gen;   // Max response tokens
```

**But these don't account for mandatory prompts either!**

---

## Potential Solutions

### Option 1: Access ChatCompletion via PromptManager ❌

**Problem:** PromptManager doesn't expose the `chatCompletion` object, only derived data (`tokenUsage`, `messages`).

**Why it won't work:**
- `promptManager.tokenUsage` is the **total tokens used**, not **remaining budget**
- We need `chatCompletion.tokenBudget` (remaining available tokens)
- That property is private to `prepareOpenAIMessages()`

### Option 2: Perform Dry Run with SillyTavern ✅ **MOST PROMISING**

**Mechanism:**
```javascript
import { prepareOpenAIMessages } from '../../../openai.js';

// Call SillyTavern's prompt builder in dry-run mode
const [chat, tokenCounts] = await prepareOpenAIMessages({
  name2: getCurrentCharacterName(),
  charDescription: getCharDescription(),
  // ... all required params
  messages: [],  // Empty chat history
  messageExamples: []
}, true);  // dryRun = true

// tokenCounts contains token breakdown by identifier
const mandatoryTokens = Object.entries(tokenCounts).reduce((sum, [id, tokens]) => {
  if (isMandatoryPrompt(id)) return sum + tokens;
  return sum;
}, 0);

const availableForRecap = max_context - max_tokens - mandatoryTokens;
```

**Pros:**
- Uses SillyTavern's actual prompt building logic
- Accounts for ALL mandatory prompts (char card, persona, jailbreak, etc.)
- Accounts for optional prompts that are enabled
- Accurate token counting using ST's tokenizer

**Cons:**
- Requires gathering all parameters that `prepareOpenAIMessages` needs
- May need to mock/stub some parameters
- Performance overhead (re-tokenizing prompts)

**Implementation notes:**
- See `openai.js:1456` for full parameter list
- `dryRun = true` prevents actual generation
- Returns `[chat, tokenCounts]` where `tokenCounts` is an object like:
  ```javascript
  {
    'main': 1250,
    'charDescription': 450,
    'charPersonality': 320,
    'scenario': 180,
    'personaDescription': 220,
    'nsfw': 50,
    'jailbreak': 380,
    'worldInfoBefore': 0,
    'worldInfoAfter': 0,
    // ... etc
  }
  ```

### Option 3: Listen to CHAT_COMPLETION_PROMPT_READY Event ❌

**Problem:** Event doesn't expose `chatCompletion` object or remaining budget.

**Available data:**
```javascript
{
  chat: [...messages],  // Flattened array
  dryRun: boolean
}
```

**Why it won't work:**
- No access to `chatCompletion.tokenBudget`
- Would need to manually sum up all message tokens (redundant work)
- Event fires AFTER prompts are built (too late to adjust)

### Option 4: Apply Safety Margin ⚠️ **SIMPLE FALLBACK**

**Mechanism:**
```javascript
async function calculateAvailableContext(preset) {
  const presetMaxContext = presetData.max_context || presetData.openai_max_context;

  // Apply conservative safety margin for mandatory prompts
  const SAFETY_MARGIN = 0.30;  // 30% reduction
  const safeMaxContext = Math.floor(presetMaxContext * (1 - SAFETY_MARGIN));

  return safeMaxContext;
}
```

**Pros:**
- Simple to implement
- No dependencies on SillyTavern internals
- Works immediately

**Cons:**
- Arbitrary/conservative margin may be too restrictive
- Doesn't adapt to actual mandatory prompt size
- Different characters/personas have different mandatory prompt sizes
- May reject valid requests or allow invalid ones

**Better margin calculation:**
```javascript
// Estimate mandatory tokens based on character card size
const charCardEstimate = count_tokens(JSON.stringify({
  description: character.description,
  personality: character.personality,
  scenario: character.scenario,
  // ... etc
}));

const personaEstimate = count_tokens(user_persona);
const systemPromptsEstimate = 500;  // Rough estimate for nsfw + jailbreak

const estimatedMandatory = charCardEstimate + personaEstimate + systemPromptsEstimate;
const availableForRecap = presetMaxContext - max_tokens - estimatedMandatory;
```

**Still imprecise** because:
- Doesn't account for formatting overhead (role/content JSON structure)
- Doesn't account for optional prompts that may be enabled
- Doesn't account for tokenizer correction factor (1.35x in your extension)

### Option 5: Catch Error and Retry with Smaller Range ✅ **ALREADY IMPLEMENTED**

**Current implementation:**
```javascript
// autoSceneBreakDetection.js:718
const apiResult = await trySendRequest({ ... });

if (apiResult.success) {
  return { response, tokenBreakdown, ... };
}

// API rejected request (context exceeded)
debug('API rejected request (context exceeded), continuing reduction from ${currentEndIndex}');
reductionPhase = 'coarse';
```

**Problem:**
- Extension's `isContextLengthError()` checks for error keywords
- BUT `TokenBudgetExceededError` is thrown BEFORE the API call
- Error happens in `populateChatCompletion()`, not from API
- Error message: "Mandatory prompts exceed the context size"
- Extension may not catch this specific error properly

**Verification needed:**
- Does `isContextLengthError()` catch `TokenBudgetExceededError`?
- Does ST's `generateRaw()` propagate the error to extensions?

---

## Recommended Approach

### Phase 1: Verify Error Propagation (PoC #1)
**Test if extension can catch `TokenBudgetExceededError`:**

```javascript
// Add to autoSceneBreakDetection.js isContextLengthError()
function isContextLengthError(err) {
  const errorMessage = (err?.message || String(err)).toLowerCase();
  const errorCause = (err?.cause?.message || '').toLowerCase();

  // Check for TokenBudgetExceededError
  if (err?.name === 'TokenBudgetExceeded') {
    return true;
  }

  // Check for "mandatory prompts exceed" message
  if (errorMessage.includes('mandatory prompts')) {
    return true;
  }

  // ... existing checks
}
```

**Test:**
1. Trigger scene break detection with very large message range
2. Verify extension catches the error and reduces range
3. Confirm it eventually succeeds or fails gracefully

### Phase 2: Implement Dry Run API (PoC #2)
**If error catching works, add dry-run to estimate mandatory tokens:**

```javascript
async function calculateAvailableContextWithMandatory(preset) {
  try {
    // Import SillyTavern's prepareOpenAIMessages
    const { prepareOpenAIMessages } = await import('../../../openai.js');
    const { getCharacter } = await import('./utils.js');

    const character = getCharacter();

    // Perform dry run with empty chat to measure mandatory prompts
    const [chat, tokenCounts] = await prepareOpenAIMessages({
      name2: character?.name || 'Assistant',
      charDescription: character?.description || '',
      charPersonality: character?.personality || '',
      scenario: character?.scenario || '',
      // ... fill in all required params
      messages: [],  // Empty - we only want mandatory prompts
      messageExamples: []
    }, true);  // dryRun = true

    // Sum up all tokens from mandatory prompts
    const totalMandatoryTokens = Object.values(tokenCounts).reduce((sum, tokens) => sum + tokens, 0);

    const presetMaxContext = getPresetMaxContext(preset);
    const maxResponseTokens = getMaxResponseTokens();

    return presetMaxContext - maxResponseTokens - totalMandatoryTokens;
  } catch (err) {
    debug('Failed to calculate available context with dry run:', err);
    // Fallback to current behavior
    return await calculateAvailableContext(preset);
  }
}
```

**Challenges:**
- Need to gather all parameters for `prepareOpenAIMessages`
- Some params may not be accessible from extension context
- Need to handle case where `prepareOpenAIMessages` is not available (older ST versions)

### Phase 3: Cache Results
**Optimization - cache dry-run results per character:**

```javascript
const mandatoryTokenCache = new Map();

function getCacheKey(characterId, presetName) {
  return `${characterId}:${presetName}`;
}

async function getCachedMandatoryTokens(characterId, presetName) {
  const key = getCacheKey(characterId, presetName);

  if (mandatoryTokenCache.has(key)) {
    return mandatoryTokenCache.get(key);
  }

  // Perform dry run
  const [chat, tokenCounts] = await prepareOpenAIMessages({ ... }, true);
  const totalMandatory = Object.values(tokenCounts).reduce((sum, t) => sum + t, 0);

  mandatoryTokenCache.set(key, totalMandatory);
  return totalMandatory;
}

// Clear cache on character/preset change
eventSource.on(event_types.CHARACTER_SELECTED, () => mandatoryTokenCache.clear());
eventSource.on(event_types.CHAT_CHANGED, () => mandatoryTokenCache.clear());
```

---

## Next Steps

1. **PoC #1:** Test error propagation
   - Add debug logging to `isContextLengthError()`
   - Trigger the error with oversized message range
   - Verify extension catches and retries

2. **PoC #2:** Test dry-run API access
   - Import `prepareOpenAIMessages` from openai.js
   - Call with minimal required params + `dryRun = true`
   - Inspect returned `tokenCounts` object
   - Calculate mandatory token total

3. **Decision point:**
   - If PoC #1 works → Current retry logic may be sufficient (with improved error detection)
   - If PoC #2 works → Implement proactive calculation using dry run
   - Fallback → Apply safety margin (Option 4)

---

## Files Referenced

- `SillyTavern/public/scripts/openai.js` - ChatCompletion, prepareOpenAIMessages, populateChatCompletion
- `SillyTavern/public/scripts/PromptManager.js` - PromptManager class
- `ST-Auto-Summarize/autoSceneBreakDetection.js` - calculateAvailableContext, isContextLengthError, trySendRequest
- `ST-Auto-Summarize/tokenBreakdown.js` - applyCorrectionFactor
