# Flow Type Audit - SillyTavern API Coverage

**Generated:** 2025-10-21
**Purpose:** Document what SillyTavern APIs we use and which are typed vs missing

## Summary

- **Total Imports**: 35+
- **Typed**: ~10 (29%)
- **Missing**: ~25 (71%)

## Imports We Use (from index.js)

### ✅ TYPED - From script.js (13/18)

```javascript
// Located in flow-typed/sillytavern.js.flow
✓ animation_duration         // var animation_duration: number
✓ scrollChatToBottom         // function scrollChatToBottom(): void
✓ extension_prompt_roles     // var extension_prompt_roles: {...}
✓ extension_prompt_types     // var extension_prompt_types: {...}
✓ setSendButtonState         // function setSendButtonState(value: boolean): void
✓ saveSettingsDebounced      // function saveSettingsDebounced(): void
✓ generateRaw                // function generateRaw(options: {...}): Promise<string>
✓ getMaxContextSize          // function getMaxContextSize(overrideResponseLength?: number | null): number
✓ streamingProcessor         // var streamingProcessor: any
✓ amount_gen                 // var amount_gen: number
✓ system_message_types       // var system_message_types: {...}
✓ CONNECT_API_MAP            // var CONNECT_API_MAP: { [key: string]: any, ... }
✓ main_api                   // var main_api: string
✓ chat_metadata              // var chat_metadata: { [key: string]: any, ... }
✓ getCurrentChatId           // function getCurrentChatId(): string | void
✓ characters                 // var characters: any[]
✓ this_chid                  // var this_chid: number | void
✓ name2                      // var name2: string
```

### ❌ MISSING - From script.js (1/18)

```javascript
✗ saveMetadata               // MISSING - Used in lorebookManager.js, summaryToLorebookProcessor.js
```

### ❌ MISSING - From extensions.js (2/3)

```javascript
✓ getContext                 // function getContext(): STContext (TYPED)
✗ getApiUrl                  // MISSING - Used for API calls
✗ extension_settings         // MISSING - Global settings object (but declared in globals.js.flow as `declare var`)
```

**NOTE:** `extension_settings` is declared in `globals.js.flow` as:
```javascript
declare var extension_settings: any;
```

But it's NOT exported from a module - it's a global variable.

### ❌ MISSING - From utils.js (0/7)

```javascript
✗ getStringHash              // MISSING
✗ debounce                   // MISSING
✗ copyText                   // MISSING
✗ trimToEndSentence          // MISSING
✗ download                   // MISSING
✗ parseJsonFile              // MISSING
✗ waitUntilCondition         // MISSING
```

### ❌ MISSING - From power-user.js (0/3)

```javascript
✗ loadMovingUIState          // MISSING
✗ renderStoryString          // MISSING
✗ power_user                 // MISSING
```

### ❌ MISSING - From group-chats.js (0/3)

```javascript
✗ is_group_generating        // MISSING
✗ selected_group             // MISSING
✗ openGroupId                // MISSING
```

### ❌ MISSING - From Other Modules (0/8)

```javascript
// instruct-mode.js
✗ formatInstructModeChat     // MISSING

// preset-manager.js
✗ getPresetManager           // MISSING

// RossAscends-mods.js
✗ dragElement                // MISSING

// constants.js
✗ debounce_timeout           // MISSING

// macros.js
✗ MacrosParser               // MISSING

// slash-commands/SlashCommandCommonEnumsProvider.js
✗ commonEnumProviders        // MISSING

// regex extension
// These are from another extension, not SillyTavern core
getRegexScripts              // Not typed (external extension)
runRegexScript               // Not typed (external extension)
```

## Global Variables (from globals.js.flow)

```javascript
// These are declared as global vars, not module exports
declare var $: any;
declare var document: any;
declare var window: any;
declare var console: any;
declare function structuredClone(value: any): any;
declare var eventSource: any;
declare var event_types: any;
declare var extension_settings: any;  // ✓ DECLARED (as global)
declare var characters: any;
declare var this_chid: any;
declare var chat_metadata: any;
declare var saveSettingsDebounced: any;
declare var substituteParams: any;
declare var renderExtensionTemplateAsync: any;
declare var callGenericPopup: any;
declare var POPUP_TYPE: any;
declare var Popup: any;
declare var chat: any;
declare var toastr: any;
declare var globalThis: any;
```

## Type Definitions

### ✅ Custom Types We Created

```javascript
// flow-typed/globals.js.flow
STMessage                    // SillyTavern message structure
GetData                      // Function type for get_data
SetData                      // Function type for set_data
GetMessageDiv                // Function type for get_message_div
SaveChatDebounced            // Function type for saveChatDebounced

// flow-typed/sillytavern.js.flow
STContext                    // Full SillyTavern context (925 lines)
```

## Priority for Adding Missing Types

### High Priority (Used Frequently)

1. **saveMetadata** - Used in lorebook management
2. **getApiUrl** - Used for API calls
3. **power_user** - Settings object used throughout
4. **is_group_generating** - Check if group chat is generating

### Medium Priority (Utility Functions)

5. **getStringHash** - Utility for hashing
6. **debounce** - Utility for debouncing
7. **waitUntilCondition** - Async utility
8. **trimToEndSentence** - Text processing

### Low Priority (Less Frequently Used)

9. **loadMovingUIState** - UI state management
10. **renderStoryString** - Template rendering
11. **formatInstructModeChat** - Instruct mode formatting
12. **dragElement** - UI drag functionality
13. **getPresetManager** - Preset management
14. **MacrosParser** - Macro parsing
15. **commonEnumProviders** - Slash command enums
16. **copyText** - Clipboard utility
17. **download** - Download utility
18. **parseJsonFile** - File parsing utility

## Recommendation

**DO NOT** add all missing types at once. This would repeat the same mistake that broke Flow types before.

**INSTEAD:**

1. Work on ONE file at a time during remediation
2. When you encounter a missing type, add ONLY that type
3. Verify the type signature by reading SillyTavern source code
4. Run `npm run flow-check` after adding each type
5. Document what each type does with JSDoc comments

## Notes

- Many imports have `$FlowFixMe[cannot-resolve-module]` suppressions in index.js
- This is because Flow can't find the module (it's outside our extension directory)
- The suppressions are CORRECT - we're importing from parent directories
- The issue is that we don't have type definitions for those imports yet
- Some `any` types are legitimate (jQuery, DOM, dynamic settings values)
