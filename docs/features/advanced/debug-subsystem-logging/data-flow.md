# Debug Subsystem Logging - Data Flow

## Overview

This document traces the complete flow of log messages from creation through console output.

## Flow 1: Simple Log Message

Code: log(SUBSYSTEM.QUEUE, 'Operation started')

Flow:
- Developer calls log()
- Arguments: '[Queue]', 'Operation started'
- log() function executes: console.log('[AutoRecap]', '[Queue]', 'Operation started')
- Browser console receives formatted string
- Output: [AutoRecap] [Queue] Operation started
- User can filter with '[Queue]' to find related logs

## Flow 2: Debug Message with Multiple Arguments

Code: debug(SUBSYSTEM.SCENE, 'Scene break with', 1250, 'tokens')

Flow:
- Developer calls debug()
- Arguments: '[Scene]', 'Scene break with', 1250, 'tokens'
- debug() function: console.log('[AutoRecap]', '[DEBUG]', '[Scene]', ...args)
- All arguments passed to console for inspection
- Output: [AutoRecap] [DEBUG] [Scene] Scene break with 1250 tokens
- Filter '[DEBUG]' shows only debug logs, '-[DEBUG]' hides them

## Flow 3: Error Message with Toast

Code: error(SUBSYSTEM.QUEUE, 'Operation timeout')

Flow:
- Developer calls error()
- First arg is subsystem: '[Queue]'
- Second arg is message: 'Operation timeout'
- error() function executes TWO operations:
  1. console.error('[AutoRecap]', '[ERROR]', '[Queue]', 'Operation timeout')
  2. toastr.error('Operation timeout', 'AutoRecap')
- Console shows: [AutoRecap] [ERROR] [Queue] Operation timeout (red text)
- Toast notification appears in UI (red popup, auto-dismisses in 5 seconds)
- Both appear simultaneously to user

## Flow 4: Subsystem Filtering

User Flow:
1. DevTools console has 500+ messages from all subsystems
2. User types '[Queue]' in filter box
3. Console engine checks each message for '[Queue]' substring
4. Messages containing '[Queue]' remain visible (50 messages)
5. All other messages hidden (450 messages)
6. User can scroll through queue-only logs
7. User can clear filter to see all logs again

Filter Examples:
- [Queue] = only queue logs
- [DEBUG] = only debug logs
- -[DEBUG] = everything except debug logs
- [Queue] [DEBUG] = queue debug logs only

## Flow 5: Multi-File Trace

Timeline:
T=0ms: operationQueue.js logs
  debug(SUBSYSTEM.QUEUE, 'Enqueuing operation: op_5000')
  Output: [AutoRecap] [DEBUG] [Queue] Enqueuing operation: op_5000

T=5ms: autoSceneBreakDetection.js logs
  debug(SUBSYSTEM.SCENE, 'Scanning messages for scene break')
  Output: [AutoRecap] [DEBUG] [Scene] Scanning messages for scene break

T=30ms: operationHandlers.js logs error
  error(SUBSYSTEM.QUEUE, 'Scene detection timed out')
  Console Output: [AutoRecap] [ERROR] [Queue] Scene detection timed out
  Toast Output: "Scene detection timed out"

If user filters [Queue]:
  Visible:
    [AutoRecap] [DEBUG] [Queue] Enqueuing operation: op_5000
    [AutoRecap] [ERROR] [Queue] Scene detection timed out
  Hidden:
    [AutoRecap] [DEBUG] [Scene] Scanning messages for scene break

## Example 1: QUEUE Initialization

Code Flow:
  log(SUBSYSTEM.QUEUE, 'Initializing operation queue system')
  log(SUBSYSTEM.QUEUE, 'Loading queue from storage')
  await loadQueue()
  log(SUBSYSTEM.QUEUE, 'Queue entry exists with UID q_abc123')
  log(SUBSYSTEM.QUEUE, 'Operation queue system initialized')

Console Output Timeline:
T=0ms:    [AutoRecap] [Queue] Initializing operation queue system
T=0ms:    [AutoRecap] [Queue] Loading queue from storage
T=50ms:   [AutoRecap] [Queue] Queue entry exists with UID q_abc123
T=50ms:   [AutoRecap] [Queue] Operation queue system initialized

## Example 2: SCENE Detection with Conditional Logging

Code:
  debug(SUBSYSTEM.SCENE, 'Scanning for visible scene breaks')
  if (visibleBreak) {
    debug(SUBSYSTEM.SCENE, 'Found visible scene break at index', 5)
  } else {
    debug(SUBSYSTEM.SCENE, 'No visible breaks - scan from beginning')
  }
  const tokenCount = 1250
  if (tokenCount > maxAllowed) {
    debug(SUBSYSTEM.SCENE, 'Token count', tokenCount, '> limit', maxAllowed)
  }

Console Output (conditional path):
[AutoRecap] [DEBUG] [Scene] Scanning for visible scene breaks
[AutoRecap] [DEBUG] [Scene] No visible breaks - scan from beginning
[AutoRecap] [DEBUG] [Scene] Token count 1250 > limit 1000

## Example 3: LOREBOOK with Error Handling

Code:
  try {
    debug(SUBSYSTEM.LOREBOOK, 'Starting merge for entry:', name)
    const result = await callAIForMerge(name)
    if (!result) {
      error(SUBSYSTEM.LOREBOOK, 'Merge returned empty for:', name)
      return null
    }
    debug(SUBSYSTEM.LOREBOOK, 'Merge completed for:', name)
    return result
  } catch (err) {
    error(SUBSYSTEM.LOREBOOK, 'Merge failed:', err.message)
    throw err
  }

Success Path Console Output:
[AutoRecap] [DEBUG] [Lorebook] Starting merge for entry: Character_History
[AutoRecap] [DEBUG] [Lorebook] Merge completed for: Character_History

Error Path Console Output:
[AutoRecap] [DEBUG] [Lorebook] Starting merge for entry: Character_History
[AutoRecap] [ERROR] [Lorebook] Merge returned empty for: Character_History
(Plus toast notification)

## Example 4: Multi-Subsystem Interaction

Complete operation involving 5 subsystems:

T=0ms:   [EVENT] MESSAGE_SENT fired
T=5ms:   [MEMORY] Updating inclusion flags
T=10ms:  [QUEUE] Enqueuing SCENE_RECAP
T=15ms:  [SCENE] Scanning messages
T=100ms: [SCENE] Found break at index 15
T=200ms: [RUNNING] Appending to recap
T=500ms: [LOREBOOK] Loaded 12 entries
T=600ms: [QUEUE] Operation completed

Full Console (chronological):
[AutoRecap] [DEBUG] [Event] MESSAGE_SENT fired
[AutoRecap] [DEBUG] [Memory] Updating inclusion flags
[AutoRecap] [DEBUG] [Queue] Enqueuing SCENE_RECAP
[AutoRecap] [DEBUG] [Scene] Scanning messages
[AutoRecap] [DEBUG] [Scene] Found break at index 15
[AutoRecap] [DEBUG] [Running] Appending to recap
[AutoRecap] [DEBUG] [Lorebook] Loaded 12 entries
[AutoRecap] [Queue] Operation completed

Filtered Views:
- [Queue] only: Shows enqueue + completion
- [Scene] only: Shows all scene steps
- [Running] only: Shows running recap updates
- [Queue] [Running]: Shows queue + running updates
- -[DEBUG]: Shows only log() calls (no debug)

## Example 5: Error Propagation

Timeout Scenario:

[QUEUE] Enqueuing: DETECT_SCENE_BREAK
[SCENE] Scanning for visible breaks
(10 seconds pass)
[ERROR] [QUEUE] Operation timed out: DETECT_SCENE_BREAK
  Toast: "Operation timed out: DETECT_SCENE_BREAK"
[ERROR] [QUEUE] Trying fallback method
  Toast: "Trying fallback method"

JSON Parse Failure:

[CORE] [JSON Repair] Attempting to parse JSON
(Parse fails, repair attempts fail)
[ERROR] [CORE] All repair attempts failed
  Toast: "All repair attempts failed"
[ERROR] [QUEUE] Scene recap generation failed - JSON unrecoverable
  Toast: "Scene recap generation failed - JSON unrecoverable"

## Filtering Strategy Matrix

| Filter Input | Shows | Hides | Use Case |
|--------------|-------|-------|----------|
| (empty) | All logs | None | Full trace |
| [Queue] | Queue only | Others | Debug queue |
| [DEBUG] | Debug only | Others | Verbose trace |
| -[DEBUG] | All non-debug | Debug | Summary view |
| [Queue] [DEBUG] | Queue debug | Others | Queue detail |
| [Lorebook] -[ERROR] | Lorebook non-errors | Errors + others | Success trace |
| [ERROR] | Errors only | Others | Failures only |

---

Last Updated: 2025-11-15
Feature #174
