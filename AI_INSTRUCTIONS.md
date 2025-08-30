# AI Development Instructions for SillyTavern Auto-Summarize Extension

## Overview

This document is the **single source of truth** for AI-driven development of the SillyTavern Auto-Summarize extension. All development must follow these instructions exactly.

## Core Principles

### 1. **Real Environment Testing Only**
- **NO MOCKS** - Never use mocks, stubs, or fake implementations
- **NO SIMULATED BEHAVIOR** - Test only against actual SillyTavern behavior
- **REAL DATA** - Use real messages, real memory, real settings
- **REAL UI** - Test actual UI interactions when needed

### 2. **AI Self-Correction Through Testing**
- Every feature must be tested in the real environment
- AI must detect and fix its own mistakes through test failures
- Iterate until all tests pass
- No human oversight required

### 3. **Standalone Feature Development**
- Each feature can be developed and tested independently
- Run all tests after feature completion to verify no regressions
- Stop on first failure and fix before proceeding

## Project Architecture

### File Structure
```
ST-Auto-Summarize/
├── index.js                    # Main entry point, barrel exports
├── manifest.json               # Extension manifest
├── README.md                   # User documentation
├── AI_INSTRUCTIONS.md          # This file - AI development guide
├── style.css                   # Extension styles
├── settings.html               # Settings UI template
│
├── Core Functionality
├── summarization.js            # Main summarization logic
├── memoryCore.js               # Memory storage and retrieval
├── summaryValidation.js        # Summary validation logic
├── combinedSummary.js          # Combined summary generation
├── sceneBreak.js               # Scene break handling
│
├── Settings & Configuration
├── settingsManager.js          # Settings management
├── settingsUI.js               # Settings UI logic
├── defaultSettings.js          # Default configuration
├── defaultPrompts.js           # Default prompt templates
├── profileManager.js           # Configuration profiles
├── profileUI.js                # Profile management UI
├── connectionProfiles.js       # API connection profiles
├── presetManager.js            # Completion preset management
│
├── UI & User Interface
├── buttonBindings.js           # Button event handlers
├── uiBindings.js               # UI element bindings
├── messageVisuals.js           # Message display logic
├── memoryEditInterface.js      # Memory editing interface
├── characterSelect.js          # Character selection logic
├── popout.js                   # Popout window management
├── progressBar.js              # Progress indicators
├── autoHide.js                 # Auto-hide functionality
├── sceneNavigator.js           # Scene navigation
│
├── Utilities & Helpers
├── utils.js                    # Core utility functions
├── promptUtils.js              # Prompt formatting utilities
├── messageData.js              # Message data handling
├── eventHandlers.js            # Event handling logic
├── slashCommands.js            # Slash command implementation
├── styleConstants.js           # CSS constants and themes
│
└── package.json                # Project configuration
```

### Key Files and Their Purposes

#### **index.js** - Main Entry Point
- Barrel exports for all modules
- Imports SillyTavern dependencies
- Exports extension functions for testing

#### **summarization.js** - Core Logic
- Main summarization functions
- LLM API integration
- Summary generation and validation
- Batch processing

#### **memoryCore.js** - Memory Management
- Short-term and long-term memory storage
- Memory inclusion logic
- Memory retrieval for prompt injection
- Memory cleanup and optimization

#### **settingsManager.js** - Configuration
- Settings storage and retrieval
- Profile management
- Settings validation
- Default value handling

#### **utils.js** - Core Utilities
- Logging functions (debug, error, toast)
- Token counting and management
- Data validation helpers
- Common utility functions

## Development Workflow

### 1. **Feature Development Process**

#### Step 1: Understand the Feature
```javascript
// Analyze what the feature needs to do
const featureRequirements = {
  name: "feature_name",
  description: "What the feature does",
  inputs: ["required inputs"],
  outputs: ["expected outputs"],
  dependencies: ["other files/modules"],
  tests: ["what needs to be tested"]
};
```

#### Step 2: Implement the Feature
```javascript
// Follow the established patterns
import { 
    get_settings, 
    getContext, 
    debug, 
    error, 
    toast 
} from './index.js';

// Use consistent error handling
try {
    // Feature implementation
    const result = await performFeature();
    debug("Feature completed successfully", { result });
    return result;
} catch (err) {
    error("Feature failed", err);
    toast("Feature failed", "error");
    return null;
}
```



## Coding Standards

### 1. **Import/Export Pattern**
```javascript
// Always use barrel exports from index.js
import { 
    get_settings, 
    set_settings, 
    getContext, 
    debug, 
    error, 
    toast,
    get_data,
    set_data
} from './index.js';

// Export functions consistently
export { 
    functionName,
    anotherFunction 
};
```

### 2. **Error Handling**
```javascript
// Always wrap risky operations
try {
    const result = await riskyOperation();
    debug("Operation successful", { result });
    return result;
} catch (err) {
    error("Operation failed", err);
    toast("Operation failed", "error");
    return null;
}
```

### 3. **Logging**
```javascript
// Use appropriate log levels
debug("Detailed operation info", { data });
log("General information");
error("Error with context", err);
toast("User notification", "info");
```

### 4. **Settings Management**
```javascript
// Always use settings functions
const value = get_settings('setting_name');
set_settings('setting_name', newValue);

// Validate settings
if (value === undefined) {
    return get_settings('default_setting_name');
}
```

### 5. **Memory Management**
```javascript
// Use consistent memory patterns
set_data(message, 'memory', memoryData);
const memory = get_data(message, 'memory');

// Update inclusion status
updateMemoryInclusion(message);
```

## SillyTavern Integration

### 1. **Context and State**
```javascript
// Get SillyTavern context
const ctx = getContext();
const messages = ctx.chat;
const characters = ctx.characters;
const characterId = ctx.characterId;
const chatId = ctx.chatId;
```

### 2. **Message Data Storage**
```javascript
// Store data on messages
set_data(message, 'memory', summaryData);
set_data(message, 'include', 'short');

// Retrieve data from messages
const memory = get_data(message, 'memory');
const include = get_data(message, 'include');
```

### 3. **UI Integration**
```javascript
// Add elements to message containers
function addMessageUI(messageElement, message) {
    const summaryElement = createSummaryElement(message);
    messageElement.appendChild(summaryElement);
}

// Create interactive buttons
function createMemoryButton(message) {
    const button = document.createElement('button');
    button.className = 'mes_memory_btn';
    button.innerHTML = '🧠';
    button.onclick = () => toggleMemory(message);
    return button;
}
```

### 4. **Event Handling**
```javascript
// Listen for SillyTavern events
eventSource.on(event_types.MESSAGE_SENT, onMessageSent);
eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
```



## Common Patterns

### 1. **Function Implementation**
```javascript
async function featureFunction(options) {
    const { input, context } = options;
    
    // Validate input
    if (!input) {
        debug("Invalid input for feature function");
        return null;
    }
    
    // Log operation start
    debug("Starting feature operation", { input });
    
    try {
        // Perform operation
        const result = await performOperation(input, context);
        
        // Log success
        debug("Feature operation completed", { result });
        
        return result;
    } catch (err) {
        // Log error
        error("Feature operation failed", err);
        toast("Operation failed", "error");
        return null;
    }
}
```

### 2. **Settings Integration**
```javascript
function getFeatureSetting(key, defaultValue) {
    const value = get_settings(key);
    return value !== undefined ? value : defaultValue;
}

function setFeatureSetting(key, value) {
    set_settings(key, value);
    debug("Setting updated", { key, value });
}
```

### 3. **Memory Operations**
```javascript
function storeMemory(message, summary) {
    const memoryData = {
        text: summary,
        timestamp: Date.now(),
        version: 1
    };
    
    set_data(message, 'memory', memoryData);
    updateMemoryInclusion(message);
    
    debug("Memory stored", { messageId: message.mes_uid });
}

function getMemoryForInjection() {
    const ctx = getContext();
    const limit = get_settings('short_term_limit') || 10;
    const recentMessages = ctx.chat.slice(-limit);
    
    return recentMessages
        .filter(msg => get_data(msg, 'include') === 'short')
        .map(msg => get_data(msg, 'memory')?.text)
        .filter(text => text)
        .join('\n\n');
}
```

## Troubleshooting

### 1. **Extension Not Working**
- Check browser console for errors
- Verify extension is loaded in SillyTavern
- Check settings are properly configured
- Ensure API keys are valid

### 2. **Memory Issues**
- Check token limits
- Verify memory inclusion logic
- Check for memory cleanup issues
- Review memory storage patterns

### 3. **Development Environment Issues**
- Check browser console for errors
- Verify extension is loaded in SillyTavern
- Check settings are properly configured

## Development Checklist

### Before Starting a Feature
- [ ] Understand the feature requirements
- [ ] Identify affected files
- [ ] Plan testing approach
- [ ] Check dependencies

### During Development
- [ ] Follow coding standards
- [ ] Implement proper error handling
- [ ] Add appropriate logging
- [ ] Test feature functionality

### After Feature Completion
- [ ] Verify UI integration works
- [ ] Check settings management
- [ ] Validate memory operations
- [ ] Test error scenarios

### Before Committing
- [ ] No console errors
- [ ] Code follows patterns
- [ ] Documentation updated
- [ ] Settings work correctly

## Remember

1. **REAL BEHAVIOR** - Test against actual SillyTavern
2. **ITERATE** - Keep testing until everything works
3. **STANDALONE** - Each feature should work independently
4. **COMPREHENSIVE** - Test all scenarios and edge cases

This document is the **complete guide** for AI-driven development. Follow it exactly for consistent, reliable results.
