# Stage 4 Implementation Instructions

## Overview

Stage 3 has been split into two stages:
- **Stage 3**: Filter recap (rc) against running_recap
- **Stage 4**: Filter setting_lore entries (sl) against active_setting_lore

## Current Stage 2 Output Format

```json
{
  "rc": "DEV: outcomes...\nPEND: threads...\nKNOWS: secrets...",
  "sl": [
    { "t": "character", "n": "Name", "c": "bullet content", "k": ["keywords"] },
    ...
  ]
}
```

## New Macros Needed

### `{{extracted_rc}}`
- **Source**: Stage 2 output `.rc` field
- **Type**: String
- **Used by**: Stage 3 prompt
- **Example value**: `"DEV: Rance arrived at Haven...\nPEND: Karsite threat...\nKNOWS: secret (who knows)"`

### `{{extracted_sl}}`
- **Source**: Stage 2 output `.sl` field
- **Type**: JSON array (stringify for prompt injection)
- **Used by**: Stage 4 prompt
- **Example value**: `[{"t": "character", "n": "Rance", "c": "• Arc: ...", "k": ["Rance"]}]`

## New Pipeline Flow

```
Stage 2 output
    │
    ├──► Stage 3 (RC filtering)
    │    Input:  {{extracted_rc}}, {{current_running_recap}}
    │    Output: {"rc": "filtered recap string"}
    │
    └──► Stage 4 (SL filtering)
         Input:  {{extracted_sl}}, {{active_setting_lore}}
         Output: {"sl": [filtered entries with UIDs]}
```

## Stage 3 Details

**Prompt file**: `scene-recap-stage3-filtering.js`
**Export**: `scene_recap_stage3_filtering_prompt`

**Input macros**:
- `{{extracted_rc}}` - rc string from Stage 2
- `{{current_running_recap}}` - existing running recap

**Output format**:
```json
{"rc": "DEV: ...\\nPEND: ...\\nKNOWS: ..."}
```
Or if nothing new: `{"rc": ""}`

## Stage 4 Details

**Prompt file**: `scene-recap-stage4-filter-sl.js`
**Export**: `scene_recap_stage4_filter_sl_prompt`

**Input macros**:
- `{{extracted_sl}}` - sl array from Stage 2 (JSON stringified)
- `{{active_setting_lore}}` - existing setting_lore entries

**Output format**:
```json
{"sl": [{"t": "type", "n": "Name", "c": "content", "k": ["keywords"], "u": "uid"}]}
```
Or if all filtered: `{"sl": []}`

## Execution Order

Stage 3 and Stage 4 can run **in parallel** since they operate on independent data:
- Stage 3: rc vs running_recap
- Stage 4: sl vs setting_lore

## Downstream Consumers

After Stage 3 + 4 complete:
- Stage 3 output (rc) → Running recap merge
- Stage 4 output (sl entries) → Individual lorebook entry merges

## Files to Update

1. Add Stage 4 to operation types/handlers
2. Create macro resolvers for `{{extracted_rc}}` and `{{extracted_sl}}`
3. Update pipeline to split Stage 2 output and route to Stage 3/4
4. Combine Stage 3 + 4 outputs for downstream processing
