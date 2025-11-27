# Prompt Testing Suite

Test infrastructure for iterating on extraction prompts.

## Directory Structure

```
prompt-testing/
├── stage1/           # Stage 1 extraction test data
│   ├── scene-0-11.json    # Lisle destruction + Choosing
│   ├── scene-12-23.json   # Journey to Haven
│   ├── scene-24-59.json   # Memory recovery + Circle meeting
│   ├── scene-72-82.json   # Dawn consultation
│   └── scene-83-113.json  # Morning cottage intimacy
├── prompts/          # Custom test prompts (legacy format)
├── results/          # Test run outputs (gitignored)
├── config.js         # Default LLM config
├── test-prompt.js    # Single prompt tester
└── test-all-scenes.js # Batch scene tester
```

## Quick Start

### List available scenes
```bash
node test-all-scenes.js --list
```

### Test all scenes with production prompt
```bash
node test-all-scenes.js
```

### Test a single scene
```bash
node test-all-scenes.js --scene scene-0-11
```

### Override model/temperature
```bash
node test-all-scenes.js --temperature 0.3 --model claude-sonnet-4-5-20250929
```

## Scene File Format

Each scene file contains:
```json
{
  "id": "scene-0-11",
  "name": "Lisle Destruction and Choosing",
  "messages": "0-11",
  "description": "Short description",
  "content": "[USER: Name]\\nMessage content...\\n[CHARACTER: Name]\\n..."
}
```

## Adding New Scenes

1. Extract scene content from log files (between `<SCENE>` and `</SCENE>` tags)
2. Create JSON file in `stage1/` with the format above
3. Run tests to verify

## Results

Test results are saved to `results/test-run-<timestamp>.json` with:
- Per-scene success/failure
- Parsed JSON output
- Token usage
- Duration

## Workflow

1. Run tests against current production prompt
2. Review output for issues (over-extraction, attribution errors, etc.)
3. Modify prompt in `default-prompts/scene-recap-stage1-extraction.js`
4. Re-run tests to verify improvement
5. Repeat until satisfied
