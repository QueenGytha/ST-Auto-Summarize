# Lorebook Duplication - Correct Method

**Date:** 2025-01-13
**Status:** DEFINITIVE SPECIFICATION
**Purpose:** Document the CORRECT method for duplicating lorebook entries with registry integrity

---

## Critical Understanding: UIDs are Lorebook-Unique

**FACT:** UIDs in SillyTavern lorebooks are **lorebook-unique**, NOT globally unique.

**Implication:** When copying entries from one lorebook to another, UIDs can and SHOULD be preserved exactly as-is.

---

## Current Implementation is BROKEN

### What the Current Code Does (WRONG):

1. Skips `_registry_*` entries via `isInternalEntry()` filter
2. Creates NEW UIDs for every duplicated entry via `addLorebookEntry()`
3. Creates empty stub `_registry_*` entries
4. Makes **expensive, unreliable LLM call** to re-analyze every entry
5. Hopes the LLM correctly classifies type and generates synopsis

### Problems:

- **Data Loss:** Discards perfectly good registry metadata
- **Unreliable:** LLM can misclassify entries, get synopsis wrong, return malformed JSON, timeout
- **Expensive:** Costs API credits on every chat creation
- **Slow:** Waits for LLM response instead of instant copy
- **Fragile:** Any LLM error breaks the entire duplication process

---

## CORRECT Method: Copy UIDs Verbatim

### Principle:

**Copy entries WITH their original UIDs and ALL registry data verbatim.**

### Implementation:

```javascript
/**
 * Duplicate lorebook entries from source to destination
 * Preserves UIDs and registry data for perfect data integrity
 */
async function duplicateLorebookEntries(sourceLorebookName, destLorebookName) {
  const sourceData = await loadWorldInfo(sourceLorebookName);
  if (!sourceData || !sourceData.entries) {
    throw new Error(`Failed to load source lorebook: ${sourceLorebookName}`);
  }

  const destData = await loadWorldInfo(destLorebookName);
  if (!destData) {
    throw new Error(`Failed to load destination lorebook: ${destLorebookName}`);
  }

  if (!destData.entries) {
    destData.entries = {};
  }

  const existingComments = new Set(
    Object.values(destData.entries)
      .map(e => e?.comment)
      .filter(Boolean)
  );

  let copiedCount = 0;
  let skippedDuplicates = 0;

  // Copy ALL entries with ORIGINAL UIDs
  for (const [uid, entry] of Object.entries(sourceData.entries)) {
    if (!entry) continue;

    // Skip if entry with same comment already exists (prevent duplicates)
    if (entry.comment && existingComments.has(entry.comment)) {
      debug?.(`Skipping duplicate entry: ${entry.comment}`);
      skippedDuplicates++;
      continue;
    }

    // Deep clone to avoid shared references
    destData.entries[uid] = JSON.parse(JSON.stringify(entry));
    copiedCount++;

    if (entry.comment) {
      existingComments.add(entry.comment);
    }
  }

  // Save destination lorebook with all copied entries
  await saveWorldInfo(destLorebookName, destData, true);
  await invalidateLorebookCache(destLorebookName);

  log?.(`Copied ${copiedCount} entries from ${sourceLorebookName} to ${destLorebookName}`);
  if (skippedDuplicates > 0) {
    log?.(`Skipped ${skippedDuplicates} duplicate entries`);
  }

  // Verify registry integrity
  await verifyRegistryIntegrity(destLorebookName);

  // Reorder alphabetically if setting is enabled
  await reorderLorebookEntriesAlphabetically(destLorebookName);

  return { copiedCount, skippedDuplicates };
}
```

---

## Registry Integrity Verification (CODE-BASED)

### Purpose:

Verify that all UIDs in `_registry_*` entries actually exist in the lorebook.

### Implementation:

```javascript
/**
 * Verify registry entries reference valid UIDs
 * This is a CODE-BASED verification, NOT an LLM call
 */
async function verifyRegistryIntegrity(lorebookName) {
  const data = await loadWorldInfo(lorebookName);
  if (!data || !data.entries) {
    debug?.(`No entries in lorebook: ${lorebookName}`);
    return { valid: true, errors: [] };
  }

  const allEntries = Object.values(data.entries);
  const errors = [];

  // Get all valid entry UIDs (excluding registry entries themselves)
  const validUIDs = new Set();
  for (const entry of allEntries) {
    if (!entry || !entry.comment) continue;

    // Skip registry entries
    if (entry.comment.startsWith('_registry_')) continue;

    validUIDs.add(String(entry.uid));
  }

  // Check each registry entry
  for (const entry of allEntries) {
    if (!entry || !entry.comment) continue;
    if (!entry.comment.startsWith('_registry_')) continue;

    const registryType = entry.comment.replace('_registry_', '');

    try {
      // Parse registry content (JSON format)
      const registryData = JSON.parse(entry.content || '{}');

      // Registry content format: { "items": [{ "id": "12345", "name": "...", ... }] }
      const items = registryData.items || [];

      for (const item of items) {
        const itemUID = String(item.id || item.uid);

        if (!validUIDs.has(itemUID)) {
          errors.push({
            registryType,
            invalidUID: itemUID,
            itemName: item.name || item.comment || 'Unknown'
          });
        }
      }
    } catch (err) {
      errors.push({
        registryType,
        error: `Failed to parse registry content: ${err.message}`
      });
    }
  }

  if (errors.length > 0) {
    error?.(`Registry integrity check failed for ${lorebookName}:`, errors);
    return { valid: false, errors };
  }

  debug?.(`Registry integrity verified for ${lorebookName}`);
  return { valid: true, errors: [] };
}
```

---

## Comparison: Current vs Correct

### Current (BROKEN) Method:

```
Source Lorebook:
  - Entry "Bob" (UID: 12345)
  - _registry_character: { id: 12345, type: "character", synopsis: "A knight" }

Duplication Process:
  1. Skip _registry_character entry ❌
  2. Create NEW entry with NEW UID (67890) ❌
  3. Create empty _registry_character ❌
  4. Call LLM to re-analyze "Bob" ❌
  5. Hope LLM returns correct type/synopsis ❌

Destination Lorebook:
  - Entry "Bob" (UID: 67890) ← Different UID
  - _registry_character: { id: 67890, type: "??", synopsis: "??" } ← LLM guess
```

### CORRECT Method:

```
Source Lorebook:
  - Entry "Bob" (UID: 12345)
  - _registry_character: { id: 12345, type: "character", synopsis: "A knight" }

Duplication Process:
  1. Copy Entry "Bob" with UID 12345 ✅
  2. Copy _registry_character with data intact ✅
  3. Verify UID 12345 exists ✅
  4. Reorder alphabetically ✅

Destination Lorebook:
  - Entry "Bob" (UID: 12345) ← Same UID
  - _registry_character: { id: 12345, type: "character", synopsis: "A knight" } ← Exact copy
```

---

## Benefits of Correct Method:

1. **Perfect Data Integrity:** Registry data is preserved exactly
2. **Instant:** No LLM calls, just file copy
3. **Reliable:** No LLM misclassifications or errors
4. **Free:** No API costs
5. **Simple:** Straightforward copy operation
6. **Verifiable:** Code-based integrity check catches any issues

---

## Integration Points

### For Global/Character → Chat Duplication:

**Current Function:** `duplicateActiveLorebookEntries()` in lorebookManager.js
**Should Use:** `duplicateLorebookEntries()` as specified above
**Change:** Remove `isInternalEntry()` filter, preserve UIDs, copy ALL entries

### For Checkpoint Cloning:

**Function:** `cloneLorebook()` in checkpointManager.js (to be created)
**Should Use:** Same `duplicateLorebookEntries()` approach
**Difference:** Copy from chat lorebook to checkpoint lorebook

---

## Verification in Tests:

```javascript
test('Lorebook duplication preserves UIDs and registry data', async () => {
  // Create source lorebook with entries and registry
  const sourceData = {
    entries: {
      '12345': { uid: 12345, comment: 'character-Bob', content: 'A knight' },
      '12346': { uid: 12346, comment: '_registry_character', content: JSON.stringify({
        items: [{ id: '12345', name: 'character-Bob', type: 'character', synopsis: 'A knight' }]
      })}
    }
  };

  await saveWorldInfo('source', sourceData, true);
  await createNewWorldInfo('dest');

  // Duplicate
  await duplicateLorebookEntries('source', 'dest');

  // Verify
  const destData = await loadWorldInfo('dest');

  // Entry UID should be preserved
  expect(destData.entries['12345']).toBeDefined();
  expect(destData.entries['12345'].comment).toBe('character-Bob');

  // Registry should be copied verbatim
  expect(destData.entries['12346']).toBeDefined();
  const registry = JSON.parse(destData.entries['12346'].content);
  expect(registry.items[0].id).toBe('12345'); // Same UID
  expect(registry.items[0].type).toBe('character');
  expect(registry.items[0].synopsis).toBe('A knight');

  // Verify integrity
  const verification = await verifyRegistryIntegrity('dest');
  expect(verification.valid).toBe(true);
  expect(verification.errors).toHaveLength(0);
});
```

---

## Migration from Current Broken Code:

### Step 1: Fix `duplicateActiveLorebookEntries()`

Replace current implementation with correct UID-preserving copy.

### Step 2: Deprecate `enqueueBulkRegistryPopulation()`

No longer needed - registry data is copied, not regenerated.

### Step 3: Update Documentation

All checkpoint docs should reference this correct method.

### Step 4: Add Verification

Run `verifyRegistryIntegrity()` after every duplication to catch issues.

---

## Summary

**DO:**
- Copy entries with original UIDs
- Copy ALL entries including `_registry_*`
- Verify registry UIDs match actual entries (code-based)
- Reorder alphabetically at the end if setting enabled

**DON'T:**
- Generate new UIDs
- Skip registry entries
- Make LLM calls to regenerate metadata
- Assume LLM output is reliable

**Result:** Perfect data integrity, instant operation, zero cost, fully reliable.
