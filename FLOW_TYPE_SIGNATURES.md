# Flow Type Signatures - SillyTavern API Reference

**Generated:** 2025-10-21
**Source:** SillyTavern local installation analysis
**Purpose:** Complete function signatures for all SillyTavern imports used in ST-Auto-Summarize

---

## From script.js

### ✅ ALREADY TYPED

All these are already in `flow-typed/sillytavern.js.flow`:
- `animation_duration: number`
- `scrollChatToBottom(): void`
- `extension_prompt_roles: {...}`
- `extension_prompt_types: {...}`
- `setSendButtonState(value: boolean): void`
- `saveSettingsDebounced(): void`
- `generateRaw(options: {...}): Promise<string>`
- `getMaxContextSize(overrideResponseLength?: number | null): number`
- `streamingProcessor: any`
- `amount_gen: number`
- `system_message_types: {...}`
- `CONNECT_API_MAP: { [key: string]: any, ... }`
- `main_api: string`
- `chat_metadata: { [key: string]: any, ... }`
- `getCurrentChatId(): string | void`
- `characters: any[]`
- `this_chid: number | void`
- `name2: string`

### ❌ MISSING - Needs Adding

**saveMetadata**
```javascript
// Location: script.js:8019
export async function saveMetadata(): Promise<void>
```

**What it does:**
- If in a group chat, calls `editGroup(selected_group, true, false)`
- Otherwise, calls `saveChatConditional()`
- Saves chat or group metadata to disk
- Returns Promise that resolves when save completes

**Type Definition:**
```flow
declare export function saveMetadata(): Promise<void>;
```

---

## From extensions.js

### ✅ ALREADY TYPED

- `getContext(): STContext` (already in flow-typed/sillytavern.js.flow)

### ❌ MISSING - Needs Adding

**getApiUrl**
```javascript
// Location: extensions.js:47
const getApiUrl = () => extension_settings.apiUrl;

// Exported at line 14-17:
export {
    getContext,
    getApiUrl,
};
```

**What it does:**
- Returns the Extras API URL from extension settings
- Simple getter function

**Type Definition:**
```flow
declare export function getApiUrl(): string;
```

**extension_settings**
```javascript
// Location: extensions.js:152
export const extension_settings = {
    apiUrl: defaultUrl,
    apiKey: '',
    autoConnect: false,
    notifyUpdates: false,
    disabledExtensions: [],
    expressionOverrides: [],
    memory: {},
    note: {
        default: '',
        chara: [],
        wiAddition: [],
    },
    caption: { refine_mode: false },
    expressions: { ... },
    connectionManager: { ... },
    dice: {},
    regex: [],
    regex_presets: [],
    character_allowed_regex: [],
    preset_allowed_regex: {},
    tts: {},
    sd: { ... },
    // ... many more settings
};
```

**What it is:**
- Global extension settings object
- Dynamically structured - properties added by extensions
- Used for storing all extension configuration

**Type Definition:**
```flow
// NOTE: Already declared in globals.js.flow as:
declare var extension_settings: any;

// But should also be exported from extensions.js module:
declare export var extension_settings: {
    apiUrl: string,
    apiKey: string,
    autoConnect: boolean,
    notifyUpdates: boolean,
    disabledExtensions: Array<string>,
    expressionOverrides: Array<any>,
    memory: { [key: string]: any, ... },
    note: {
        default: string,
        chara: Array<any>,
        wiAddition: Array<any>,
        ...
    },
    // Most properties are dynamically added by extensions
    [key: string]: any,
    ...
};
```

---

## From utils.js

### ❌ ALL MISSING - All Need Adding

**getStringHash**
```javascript
// Location: utils.js:465
export function getStringHash(str, seed = 0): number
```

**What it does:**
- Hash function for strings
- Returns 32-bit integer hash
- Used for generating stable IDs from strings

**Type Definition:**
```flow
declare export function getStringHash(str: string, seed?: number): number;
```

---

**debounce**
```javascript
// Location: utils.js:517
/**
 * Creates a debounced function that delays invoking func until after wait
 * milliseconds have elapsed since the last time the debounced function was invoked.
 * @param {function} func The function to debounce.
 * @param {debounce_timeout|number} [timeout=debounce_timeout.standard] The timeout.
 * @returns {function} The debounced function.
 */
export function debounce(func, timeout = debounce_timeout.standard)
```

**Type Definition:**
```flow
declare export function debounce<F: Function>(
    func: F,
    timeout?: number
): (...args: any[]) => void;
```

---

**copyText**
```javascript
// Location: utils.js:489
export function copyText(text): void
```

**What it does:**
- Copies text to clipboard
- Uses navigator.clipboard API

**Type Definition:**
```flow
declare export function copyText(text: string): void;
```

---

**trimToEndSentence**
```javascript
// Location: utils.js:816
export function trimToEndSentence(input): string
```

**What it does:**
- Trims text to end at a complete sentence
- Finds last sentence-ending punctuation
- Returns trimmed string

**Type Definition:**
```flow
declare export function trimToEndSentence(input: string): string;
```

---

**download**
```javascript
// Location: utils.js:362
export function download(content, fileName, contentType): void
```

**What it does:**
- Triggers browser download of content
- Creates blob and temporary download link
- Auto-clicks link to start download

**Type Definition:**
```flow
declare export function download(
    content: string | Blob,
    fileName: string,
    contentType: string
): void;
```

---

**parseJsonFile**
```javascript
// Location: utils.js:450
export async function parseJsonFile(file): Promise<any>
```

**What it does:**
- Reads a File object and parses as JSON
- Returns parsed JSON data

**Type Definition:**
```flow
declare export function parseJsonFile(file: File): Promise<any>;
```

---

**waitUntilCondition**
```javascript
// Location: utils.js:1656
export async function waitUntilCondition(
    condition,
    timeout = 1000,
    interval = 100,
    options = {}
): Promise<void>
```

**What it does:**
- Polls a condition function until it returns true
- Throws error if timeout reached
- Resolves when condition becomes true

**Type Definition:**
```flow
declare export function waitUntilCondition(
    condition: () => boolean,
    timeout?: number,
    interval?: number,
    options?: Object
): Promise<void>;
```

---

## From power-user.js

### ❌ ALL MISSING - All Need Adding

**loadMovingUIState**
```javascript
// Location: power-user.js:1765
export function loadMovingUIState(): void
```

**What it does:**
- Loads saved positions of moveable UI elements
- Restores draggable element positions from localStorage

**Type Definition:**
```flow
declare export function loadMovingUIState(): void;
```

---

**renderStoryString**
```javascript
// Location: power-user.js:2164
export function renderStoryString(
    params,
    { customStoryString = null, customInstructSettings = null, customContextSettings = null } = {}
): string
```

**What it does:**
- Renders a template string with macros/variables
- Substitutes parameters into story string template
- Returns rendered string

**Type Definition:**
```flow
declare export function renderStoryString(
    params: any,
    options?: {
        customStoryString?: string | null,
        customInstructSettings?: any | null,
        customContextSettings?: any | null,
        ...
    }
): string;
```

---

**power_user**
```javascript
// Location: power-user.js:119
export const power_user = {
    // Massive object with 100+ settings
    // Dynamic structure, properties added/modified
};
```

**What it is:**
- Global power user settings object
- Contains UI preferences, advanced settings
- Dynamic structure that grows with features

**Type Definition:**
```flow
// This is a complex dynamic object
declare export var power_user: {
    [key: string]: any,
    ...
};
```

---

## From group-chats.js

### ❌ ALL MISSING - All Need Adding

**is_group_generating**
```javascript
// Location: group-chats.js:107
// Exported at: group-chats.js:88-105
let is_group_generating = false; // Group generation flag
```

**What it is:**
- Boolean flag indicating if group chat is generating
- Set to true during group generation
- Similar to is_send_press but for groups

**Type Definition:**
```flow
declare export var is_group_generating: boolean;
```

---

**selected_group**
```javascript
// Location: group-chats.js:111
// Exported at: group-chats.js:88-105
let selected_group = null;
```

**What it is:**
- Currently selected group ID
- null if no group selected
- String ID of active group

**Type Definition:**
```flow
declare export var selected_group: string | null;
```

---

**openGroupId**
```javascript
// Location: group-chats.js:114
// Exported at: group-chats.js:88-105
let openGroupId = null;
```

**What it is:**
- ID of currently open group chat
- null if no group chat open
- String ID of open group

**Type Definition:**
```flow
declare export var openGroupId: string | null;
```

---

**groups**
```javascript
// Location: group-chats.js:110
// Exported at: group-chats.js:88-105
let groups = [];
```

**What it is:**
- Array of all loaded group objects
- Each object contains group metadata
- Empty array if no groups loaded

**Type Definition:**
```flow
declare export var groups: Array<any>;
```

---

## From Other Modules

### ❌ ALL MISSING - All Need Adding

**formatInstructModeChat** (instruct-mode.js)
```javascript
// Location: instruct-mode.js:387
export function formatInstructModeChat(
    name, mes, isUser, isNarrator, forceAvatar, name1, name2,
    forceOutputSequence, customInstruct = null
): string
```

**Type Definition:**
```flow
declare module "../../../instruct-mode.js" {
    declare export function formatInstructModeChat(
        name: string,
        mes: string,
        isUser: boolean,
        isNarrator: boolean,
        forceAvatar: any,
        name1: string,
        name2: string,
        forceOutputSequence: any,
        customInstruct?: any | null
    ): string;
}
```

---

**getPresetManager** (preset-manager.js)
```javascript
// Location: preset-manager.js:83
export function getPresetManager(apiId = ''): PresetManager
```

**Type Definition:**
```flow
declare module "../../../preset-manager.js" {
    declare export function getPresetManager(apiId?: string): any;
}
```

---

**dragElement** (RossAscends-mods.js)
```javascript
// Location: RossAscends-mods.js:479
export function dragElement($elmnt): void
```

**What it does:**
- Makes a jQuery element draggable
- Adds drag handlers to element

**Type Definition:**
```flow
declare module "../../../RossAscends-mods.js" {
    declare export function dragElement($elmnt: any): void;
}
```

---

**debounce_timeout** (constants.js)
```javascript
// Location: constants.js:5
export const debounce_timeout = {
    standard: 300,
    relaxed: 1000,
    extended: 2000
};
```

**Type Definition:**
```flow
declare module "../../../constants.js" {
    declare export var debounce_timeout: {
        standard: number,
        relaxed: number,
        extended: number,
        ...
    };
}
```

---

**MacrosParser** (macros.js)
```javascript
// Location: macros.js:36
export class MacrosParser {
    // Complex class with many methods
}
```

**Type Definition:**
```flow
declare module "../../../macros.js" {
    declare export class MacrosParser {
        // Type as any for now - too complex to fully type
        constructor(): void;
        [key: string]: any;
    }
}
```

---

**commonEnumProviders** (slash-commands/SlashCommandCommonEnumsProvider.js)
```javascript
// Location: SlashCommandCommonEnumsProvider.js:125
export const commonEnumProviders = {
    // Object with enum provider functions
};
```

**Type Definition:**
```flow
declare module "../../../slash-commands/SlashCommandCommonEnumsProvider.js" {
    declare export var commonEnumProviders: {
        [key: string]: any,
        ...
    };
}
```

---

## Summary

**Total APIs documented:** 25
**Already typed:** 18 (in flow-typed/sillytavern.js.flow)
**Need to add:** 7 main + many utility functions

### Priority for Adding

**High Priority (Add First):**
1. `saveMetadata` - Used frequently in lorebook management
2. `getApiUrl` - Used for API calls
3. `power_user` - Settings object used throughout
4. `is_group_generating` - Group chat state
5. `selected_group` - Current group

**Medium Priority:**
6. All utils.js functions (debounce, waitUntilCondition, etc.)
7. `renderStoryString`, `loadMovingUIState`

**Low Priority (Can defer):**
8. Other module functions (formatInstructModeChat, dragElement, etc.)

---

## How to Add These Types

**CRITICAL: Follow the remediation process from FLOW_TYPE_REMEDIATION_PLAN.md**

1. Add ONE function at a time
2. Add to appropriate declare module section in flow-typed/sillytavern.js.flow
3. Run `npm run flow-check` after EACH addition
4. Fix any errors before continuing
5. Test the actual code to verify types are correct

**DO NOT** add all types at once in bulk!
