# Analysis of Actual Chat Files vs Documentation

**Date**: 2025-11-20
**Files Examined**: `Lyra Heartstrings` chat directory
**Purpose**: Verify documentation accuracy against real chat files

---

## File Structure

### Main Chat: `Lyra Heartstrings - 2023-11-3 @23h 45m 12s 272ms.jsonl`
- **Lines**: 19 total = 1 metadata + 18 messages (messages 0-17)
- **File size**: 88,573 bytes

### Checkpoint: `checkpoint-name - 2025-11-20@23h01m42s.jsonl`
- **Lines**: 15 total = 1 metadata + 14 messages (messages 0-13)
- **File size**: 80,881 bytes
- **Created from**: Message index 14 of main chat
- **Trim point**: Includes messages [0, 13] inclusive

### Branch: `Branch #14 - 2025-11-20@23h04m53s.jsonl`
- **Lines**: 15 total = 1 metadata + 14 messages (messages 0-13)
- **File size**: 75,490 bytes
- **Created from**: Message index 14 of main chat (filename uses 1-indexed message number)
- **Trim point**: Includes messages [0, 13] inclusive

**Note**: Both checkpoint and branch have same message count, created from same point (message 14).

---

## Metadata Findings

### ✅ MATCHES DOCS: `main_chat` Field

**Checkpoint metadata**:
```json
"main_chat":"Lyra Heartstrings - 2023-11-3 @23h 45m 12s 272ms"
```

**Branch metadata**:
```json
"main_chat":"Lyra Heartstrings - 2023-11-3 @23h 45m 12s 272ms"
```

**Result**: Both checkpoint and branch correctly reference parent chat filename.

---

### ⚠️ MAJOR DISCREPANCY: Running Scene Recap NOT Copied

**Main chat** `chat_metadata.auto_recap_running_scene_recaps`:
```json
{
  "chat_id": "Lyra Heartstrings - 2023-11-3 @23h 45m 12s 272ms",
  "current_version": 0,
  "versions": [{
    "version": 0,
    "timestamp": 1763632598087,
    "content": "# Running Narrative\n\n## Key Developments\n- [capture] Lyra kidnapped Anon from park using unicorn magic despite protests\n- [travel] Lyra magically transported Anon to her home where Bon Bon was\n- [combat] Anon briefly escaped magical restraint; caught by Bon Bon\n- Bon Bon and Lyra forced Anon into sexual acts despite verbal protests\n- Bon Bon left to gather more mares for their 'experiment'\n\n## Tone & Style\n- Genre: explicit; non-consensual\n- Narrative voice: third-person present\n- Prose: descriptive w/ sexual content\n\n## Pending Threads\n- Additional mares may be brought to participate in 'experiment'",
    "scene_count": 1,
    "excluded_count": 1,
    "prev_scene_index": 0,
    "new_scene_index": 14
  }]
}
```

**Checkpoint** `chat_metadata.auto_recap_running_scene_recaps`:
```json
{
  "chat_id": "checkpoint-name - 2025-11-20@23h01m42s",
  "current_version": 0,
  "versions": []  // EMPTY ARRAY!
}
```

**Branch** `chat_metadata.auto_recap_running_scene_recaps`:
```json
{
  "chat_id": "Branch #14 - 2025-11-20@23h04m53s",
  "current_version": 0,
  "versions": []  // EMPTY ARRAY!
}
```

**Critical Finding**:
- Running scene recap structure is initialized with new `chat_id`
- But `versions` array is **EMPTY** - NOT copied from parent!
- This means checkpoint/branch starts with NO running scene recap

**Implications**:
- Extension likely initializes empty running scene recap on branch/checkpoint creation
- User would need to regenerate running scene recap in branch/checkpoint
- This is actually BETTER than copying - prevents the "divergence" problem documented
- But contradicts assumption that metadata is "shallow copied"

---

### ✅ MATCHES DOCS: Checkpoint Link in Main Chat

**Message index 14** (line 16) in main chat has:
```json
{
  "name": "Anon",
  "is_user": true,
  "mes": "so you're going to have all these mares fuck me?...",
  "extra": {
    "bookmark_link": "checkpoint-name - 2025-11-20@23h01m42s",
    "auto_recap_memory": { /* ... */ }
  }
}
```

**Result**: Checkpoint link correctly stored in `message.extra.bookmark_link`.

---

### ❌ MAJOR DISCREPANCY: Branch Reference NOT Found

**Expected** (from SillyTavern code `bookmarks.js:183-189`):
```javascript
lastMes.extra['branches'].push(name);
```

Message 14 should have:
```json
"extra": {
  "branches": ["Branch #14 - 2025-11-20@23h04m53s"]
}
```

**Actual**: No `branches` field found anywhere in main chat file!

**Search Results**:
- Searched entire main chat file for `"branches"`
- Searched entire main chat file for `Branch #14 - 2025-11-20@23h04m53s`
- No matches found

**Possible Explanations**:
1. **Extension interference**: ST-Auto-Recap extension may have modified or overwritten the message `extra` field
2. **Save timing**: Branch reference added to message, but main chat not saved yet
3. **Different code path**: Actual SillyTavern code may differ from examined code
4. **Version difference**: User's SillyTavern version may handle branches differently
5. **Feature changed**: Branch tracking may have been removed or changed in recent ST versions

**Impact on Documentation**:
- Cannot confirm branch reference storage from actual files
- May need to note this as "intended behavior" vs "observed behavior"
- Users may not be able to see list of branches from message in practice

---

## Lorebook Integration

### Lorebook Reference

All three files reference the same lorebook:
```json
"world_info": "z-AutoLB-Lyra Heartstrings - 2023-11-3 @23h 45m 12s 272ms"
```

**Result**: Lorebook is referenced by name, not duplicated per file.

### Auto-Lorebooks Registry

All three files have identical `auto_lorebooks` structure with registry containing:
- UID 7: character-Lyra Heartstrings
- UID 8: character-Bon Bon
- UID 9: location-Park
- UID 10: location-Lyra and Bon Bon's Home
- UID 11: lore-Equestria Society

**Result**: Registry appears to be copied/shared across files.

### Operation Queue in Message Extra

**Message index 14** in main chat shows:
```json
"inactiveLorebookEntries": [
  /* ... registry entries ... */
  {
    "comment": "__operation_queue",
    "uid": 1763632438061,
    "content": "{\n  \"queue\": [\n    {\n      \"id\": \"op_1763632702906_1eddtmv8r\",\n      \"type\": \"generate_scene_recap\",\n      \"params\": {\"index\": 14},\n      \"status\": \"in_progress\",\n      ...\n    }\n  ],\n  \"current_operation_id\": \"op_1763632702906_1eddtmv8r\",\n  \"paused\": false,\n  \"version\": 1\n}"
  }
]
```

**Location**: Operation queue is stored in MESSAGE `extra.inactiveLorebookEntries[]`, not in chat metadata!

**Need to verify**: Does checkpoint/branch message 14 have this same operation queue entry?

---

## Message-Level Data

### Scene Recap Memory

**Message index 14** in main chat has:
```json
"auto_recap_memory": {
  "scene_break": true,
  "scene_break_visible": true,
  "scene_recap_versions": ["", "{...}", "{...}"],
  "scene_recap_current_index": 2,
  "scene_recap_memory": "{\"scene_name\":\"Park Abduction by Lyra and Bon Bon\",...}",
  "scene_recap_hash": "rm4ymq",
  "auto_scene_break_checked": true,
  "scene_break_recap": "{...}",
  "scene_recap_metadata": {...}
}
```

**Need to verify**: Check if checkpoint/branch have same scene recap data in their messages.

---

## Summary of Discrepancies

| Finding | Matches Docs | Notes |
|---------|--------------|-------|
| `main_chat` field in checkpoint/branch | ✅ YES | Correctly references parent |
| Checkpoint link in main chat message | ✅ YES | Stored in `message.extra.bookmark_link` |
| Branch reference in main chat message | ❌ NO | `branches` array NOT found |
| Running scene recap copied to branch | ❌ NO | Initialized empty, not copied |
| Lorebook reference | ✅ YES | Same lorebook name in all files |
| Operation queue location | ⚠️ DIFFERENT | Stored in MESSAGE extra, not just lorebook |
| File naming conventions | ✅ YES | Matches documented format |
| Chat trimming | ✅ YES | Both checkpoint/branch have messages [0,13] |

---

## Updated Documentation Needed

### Section 5.2: Metadata Handling - No Synchronization

**Current docs say**:
> At save time: Metadata structure is cloned via JSON serialization

**Should add**:
> EXCEPTION: `auto_recap_running_scene_recaps` is initialized with empty `versions` array in checkpoint/branch, not copied from parent. This prevents immediate divergence of running scene recaps.

### Section 2.3: Message-Level Branch Tracking

**Current docs say**:
> Branches stored in `message.extra.branches[]` array

**Should add**:
> NOTE: In practice, branch references may not be saved to the main chat file. Checkpoint links (`bookmark_link`) are reliably stored, but `branches` array may be missing.

### Section 6.3: Lorebook Entry for Operation Queue

**Should add**:
> IMPORTANT: Operation queue is also stored in MESSAGE `extra.inactiveLorebookEntries[]`, not only in chat-level lorebook. This means the operation queue may exist at the message level as well.

---

## Questions for Further Investigation

1. **Branch reference storage**: Why is `branches` array missing? Is this a timing issue, version difference, or feature change?

2. **Operation queue location**: Is the queue stored in both chat metadata AND message extra? Which one is authoritative?

3. **Running scene recap initialization**: Does the extension code explicitly initialize empty versions array, or is this ST default behavior?

4. **Message data copying**: Do checkpoint/branch messages have identical `auto_recap_memory` data as parent messages?

5. **Lorebook entry UIDs**: Are lorebook entry UIDs duplicated across files, or shared? (Need to check actual lorebook file)

---

**Next Steps**: Update main documentation with findings and discrepancies noted above.
