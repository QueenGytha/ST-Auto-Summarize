#!/usr/bin/env node

/**
 * Batch scene tester - runs the current production prompt against all scenes
 * Usage: node test-all-scenes.js [--prompt <prompt-file>] [--scene <scene-id>]
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import defaultConfig from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ENDPOINT = 'http://localhost:8765/opus6-claude/chat/completions';
const STAGE1_DIR = resolve(__dirname, 'stage1');
const RESULTS_DIR = resolve(__dirname, 'results');

// Default prompt - the current production Stage 1 extraction prompt
const DEFAULT_SYSTEM = 'You are a data extraction system. Output ONLY valid JSON. Never generate roleplay content.';

// Load the production prompt template
async function loadProductionPrompt() {
  const promptPath = resolve(__dirname, '../default-prompts/scene-recap-stage1-extraction.js');
  const content = readFileSync(promptPath, 'utf-8');

  // Extract the template string from the export
  const match = content.match(/export const scene_recap_stage1_extraction_prompt = `([\s\S]*?)`;/);
  if (!match) {
    throw new Error('Could not parse production prompt');
  }

  return match[1];
}

function loadAllScenes() {
  const sceneFiles = readdirSync(STAGE1_DIR).filter(f => f.endsWith('.json'));
  return sceneFiles.map(file => {
    const content = readFileSync(resolve(STAGE1_DIR, file), 'utf-8');
    return JSON.parse(content);
  });
}

function loadScene(sceneId) {
  const scenePath = resolve(STAGE1_DIR, `${sceneId}.json`);
  if (!existsSync(scenePath)) {
    throw new Error(`Scene not found: ${sceneId}`);
  }
  const content = readFileSync(scenePath, 'utf-8');
  return JSON.parse(content);
}

function buildPromptForScene(promptTemplate, scene) {
  // Replace the {{scene_messages}} placeholder with actual scene content
  let prompt = promptTemplate.replace('{{scene_messages}}', scene.content);

  // Replace {{lorebook_entry_types_with_guidance}} with default entity types
  const defaultEntityTypes = `character: Named characters. Include Identity, State, Arc, Stance per target.
location: Places and settings.
item: Important objects.
faction: Groups and organizations.
lore: World history, mythology, events.
quest: Character goals and missions.`;

  prompt = prompt.replace(/\{\{lorebook_entry_types_with_guidance\}\}/g, defaultEntityTypes);

  return prompt;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(status) {
  return status === 429 || (status >= 500 && status < 600);
}

async function sendRequest(messages, config) {
  const payload = {
    messages,
    model: config.model,
    temperature: config.temperature,
    max_tokens: config.max_tokens,
    stream: false,
    presence_penalty: config.presence_penalty || 0,
    frequency_penalty: config.frequency_penalty || 0,
    top_p: config.top_p || 1,
    top_k: config.top_k || 0
  };

  let attempt = 0;
  let backoffMs = 1000;
  const maxBackoffMs = 60000;

  while (true) {
    attempt++;

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        return response.json();
      }

      const errorText = await response.text();

      if (isRetryableError(response.status)) {
        const retryAfter = response.headers.get('retry-after');
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : backoffMs;

        console.log(`  ⏳ ${response.status} error (attempt ${attempt}), retrying in ${Math.round(waitMs / 1000)}s...`);
        await sleep(waitMs);

        backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
        continue;
      }

      throw new Error(`HTTP ${response.status}: ${errorText}`);
    } catch (err) {
      if (err.message.startsWith('HTTP ')) {
        throw err;
      }

      console.log(`  ⏳ Network error (attempt ${attempt}): ${err.message}, retrying in ${Math.round(backoffMs / 1000)}s...`);
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
    }
  }
}

function parseResponse(result) {
  if (!result.choices || !result.choices[0]) {
    return { raw: JSON.stringify(result), parsed: null, error: 'No choices in response' };
  }

  let content = result.choices[0].message?.content || '';

  // Handle prefill continuation (content starts with '{' part)
  if (!content.startsWith('{')) {
    content = '{' + content;
  }

  // Extract JSON from markdown code blocks if present
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    content = jsonMatch[1];
  }

  // Try to parse
  try {
    const parsed = JSON.parse(content);
    return { raw: content, parsed, error: null };
  } catch (e) {
    return { raw: content, parsed: null, error: `JSON parse error: ${e.message}` };
  }
}

async function testScene(scene, promptTemplate, config) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${scene.id} - ${scene.name}`);
  console.log(`Messages: ${scene.messages}`);
  console.log(`${'='.repeat(60)}`);

  const userPrompt = buildPromptForScene(promptTemplate, scene);

  const messages = [
    { role: 'system', content: DEFAULT_SYSTEM },
    { role: 'user', content: userPrompt },
    { role: 'assistant', content: '{' }
  ];

  const startTime = Date.now();

  try {
    const result = await sendRequest(messages, config);
    const duration = (Date.now() - startTime) / 1000;

    const { raw, parsed, error } = parseResponse(result);

    console.log(`\nDuration: ${duration.toFixed(2)}s`);
    console.log(`Tokens: ${result.usage?.total_tokens || 'N/A'}`);

    if (error) {
      console.log(`\n⚠️ Parse Error: ${error}`);
      console.log(`\nRaw output:\n${raw}`);
    } else if (parsed) {
      console.log(`\n✅ Valid JSON output`);
      console.log(`Scene Name: ${parsed.sn}`);
      console.log(`Outcomes: ${parsed.outcomes?.length || 0}`);
      console.log(`Threads: ${parsed.threads?.length || 0}`);
      console.log(`Arc: ${parsed.arc?.length || 0}`);
      console.log(`Stance: ${parsed.stance?.length || 0}`);
      console.log(`Quotes: ${parsed.quotes?.length || 0}`);
      console.log(`State: ${parsed.state?.length || 0}`);
      console.log(`Identity: ${parsed.identity?.length || 0}`);
    }

    return {
      scene: scene.id,
      success: !error,
      duration,
      tokens: result.usage?.total_tokens,
      parsed,
      raw,
      error
    };
  } catch (err) {
    console.log(`\n❌ Request failed: ${err.message}`);
    return {
      scene: scene.id,
      success: false,
      error: err.message
    };
  }
}

function getNextRunNumber() {
  if (!existsSync(RESULTS_DIR)) {
    return 1;
  }

  const existing = readdirSync(RESULTS_DIR)
    .filter(f => f.startsWith('run-'))
    .map(f => parseInt(f.replace('run-', ''), 10))
    .filter(n => !isNaN(n));

  return existing.length > 0 ? Math.max(...existing) + 1 : 1;
}

function saveResults(results) {
  const runNumber = getNextRunNumber();
  const runDir = resolve(RESULTS_DIR, `run-${runNumber}`);
  mkdirSync(runDir, { recursive: true });

  // Save each scene result as a separate file
  for (const result of results) {
    const scenePath = resolve(runDir, `${result.scene}.json`);
    writeFileSync(scenePath, JSON.stringify(result, null, 2));
  }

  // Save summary
  const summary = {
    run: runNumber,
    timestamp: new Date().toISOString(),
    total: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    scenes: results.map(r => ({ id: r.scene, success: r.success, error: r.error || null }))
  };
  writeFileSync(resolve(runDir, '_summary.json'), JSON.stringify(summary, null, 2));

  console.log(`\nResults saved to: ${runDir}`);
}

function printSummary(results) {
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`Total scenes: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nFailed scenes:');
    failed.forEach(r => {
      console.log(`  - ${r.scene}: ${r.error}`);
    });
  }

  // Print extraction stats across all successful runs
  if (successful.length > 0) {
    const totals = {
      outcomes: 0, threads: 0, arc: 0, stance: 0, quotes: 0, state: 0, identity: 0
    };

    successful.forEach(r => {
      if (r.parsed) {
        totals.outcomes += r.parsed.outcomes?.length || 0;
        totals.threads += r.parsed.threads?.length || 0;
        totals.arc += r.parsed.arc?.length || 0;
        totals.stance += r.parsed.stance?.length || 0;
        totals.quotes += r.parsed.quotes?.length || 0;
        totals.state += r.parsed.state?.length || 0;
        totals.identity += r.parsed.identity?.length || 0;
      }
    });

    console.log('\nTotal extractions across all scenes:');
    console.log(`  Outcomes: ${totals.outcomes}`);
    console.log(`  Threads: ${totals.threads}`);
    console.log(`  Arc: ${totals.arc}`);
    console.log(`  Stance: ${totals.stance}`);
    console.log(`  Quotes: ${totals.quotes}`);
    console.log(`  State: ${totals.state}`);
    console.log(`  Identity: ${totals.identity}`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node test-all-scenes.js [options]

Options:
  --scene <id>        Test only a specific scene (e.g., scene-0-11)
  --temperature <n>   Override temperature (default: ${defaultConfig.temperature})
  --model <name>      Override model (default: ${defaultConfig.model})
  --list              List available scenes
  --help              Show this help

Examples:
  node test-all-scenes.js                    # Test all scenes
  node test-all-scenes.js --scene scene-0-11 # Test one scene
  node test-all-scenes.js --list             # List scenes
`);
    process.exit(0);
  }

  if (args.includes('--list')) {
    const scenes = loadAllScenes();
    console.log('Available scenes:');
    scenes.forEach(s => {
      console.log(`  ${s.id}: ${s.name} (messages ${s.messages})`);
    });
    process.exit(0);
  }

  // Parse overrides
  const config = { ...defaultConfig };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--temperature' && args[i + 1]) {
      config.temperature = parseFloat(args[i + 1]);
    } else if (args[i] === '--model' && args[i + 1]) {
      config.model = args[i + 1];
    }
  }

  console.log('Loading production prompt...');
  const promptTemplate = await loadProductionPrompt();

  // Get scenes to test
  let scenes;
  const sceneArg = args.indexOf('--scene');
  if (sceneArg !== -1 && args[sceneArg + 1]) {
    scenes = [loadScene(args[sceneArg + 1])];
  } else {
    scenes = loadAllScenes();
  }

  console.log(`\nConfig: model=${config.model}, temp=${config.temperature}`);
  console.log(`Testing ${scenes.length} scene(s)...`);

  const results = [];

  for (const scene of scenes) {
    const result = await testScene(scene, promptTemplate, config);
    results.push(result);
  }

  printSummary(results);
  saveResults(results);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
