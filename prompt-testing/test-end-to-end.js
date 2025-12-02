#!/usr/bin/env node

/**
 * End-to-end pipeline test
 * Tests: Stage 1 → Stage 2 → Stage 3 → Running Recap Merge → Stage 4
 *
 * Usage: node test-end-to-end.js --scene <scene-id>
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import defaultConfig from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ENDPOINT = 'http://localhost:8765/opus6-claude/chat/completions';
const STAGE1_DIR = resolve(__dirname, 'stage1');
const RESULTS_DIR = resolve(__dirname, 'results-e2e');

// Load prompts
function loadPrompt(filename, exportName) {
  const path = resolve(__dirname, '../default-prompts', filename);
  const content = readFileSync(path, 'utf-8');
  const regex = new RegExp(`export const ${exportName} = \`([\\s\\S]*?)\`;`);
  const match = content.match(regex);
  if (!match) throw new Error(`Could not parse ${exportName} from ${filename}`);
  return match[1];
}

const PROMPTS = {
  stage1: () => loadPrompt('scene-recap-stage1-extraction.js', 'scene_recap_stage1_extraction_prompt'),
  stage2: () => loadPrompt('scene-recap-stage2-organize.js', 'scene_recap_stage2_organize_prompt'),
  stage3: () => loadPrompt('scene-recap-stage3-filtering.js', 'scene_recap_stage3_filtering_prompt'),
  runningRecap: () => loadPrompt('running-scene-recap.js', 'running_scene_recap_prompt'),
  stage4: () => loadPrompt('scene-recap-stage4-filter-sl.js', 'scene_recap_stage4_filter_sl_prompt')
};

// Default entity types for macro expansion
const DEFAULT_ENTITY_TYPES = `recap: (NOT FOR ENTITIES) Always-visible context: outcomes (what happened), threads (unresolved), state (volatile/changing status). Volatile info like current locations, pending meetings, resource counts goes HERE not in entities.
character: Named characters. Items: identity/role, per-target relationships (specific dynamics not labels), quotes with context (who said to whom, why it matters), stable conditions. Volatile state goes in recap.
location: Places and settings. Items: what it is, history/significance, stable conditions. Volatile state goes in recap.
item: Important objects. Items: what it is, abilities/properties, current ownership, significance.
faction: Groups and organizations. Items: what they are, goals, stances toward others, internal dynamics.
lore: World rules, magic systems, cultural facts. Items: the rule/system/fact, how it works, why it matters.
event: Past events worth referencing. Items: what happened, who was involved, consequences. Keep minimal.
document: Written content. Items: full text VERBATIM in quotes, author, recipient, purpose.
rule: OOC constraints, TTRPG systems, meta-rules. Items: the rule, when it applies.`;

function loadSceneFile(sceneId) {
  const path = resolve(STAGE1_DIR, `${sceneId}.json`);
  if (!existsSync(path)) throw new Error(`Scene file not found: ${path}`);
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendRequest(prompt, config, prefill = '') {
  const messages = [
    { role: 'user', content: prompt },
    { role: 'assistant', content: prefill + '{' }
  ];

  const payload = {
    messages,
    model: config.model,
    temperature: config.temperature,
    max_tokens: config.max_tokens,
    stream: false
  };

  let attempt = 0;
  let backoffMs = 1000;

  while (true) {
    attempt++;
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        let content = result.choices?.[0]?.message?.content || '';

        // Handle markdown code blocks
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          content = jsonMatch[1].trim();
        }

        // Add opening brace if needed (due to prefill)
        if (!content.startsWith('{')) content = '{' + content;

        // Try to parse JSON
        try {
          const parsed = JSON.parse(content);
          return {
            success: true,
            parsed,
            raw: content,
            tokens: result.usage?.total_tokens
          };
        } catch (e) {
          // Log raw content for debugging
          console.log(`  Raw content preview: ${content.substring(0, 200)}...`);
          return { success: false, error: `JSON parse: ${e.message}`, raw: content };
        }
      }

      if (response.status === 429 || response.status >= 500) {
        console.log(`  ⏳ ${response.status} error, retrying...`);
        await sleep(backoffMs);
        backoffMs = Math.min(backoffMs * 2, 60000);
        continue;
      }

      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (attempt > 3) throw err;
      console.log(`  ⏳ Error: ${err.message}, retrying...`);
      await sleep(backoffMs);
      backoffMs *= 2;
    }
  }
}

async function runStage1(sceneData, config) {
  console.log('\n--- STAGE 1: Extract ---');

  let prompt = PROMPTS.stage1();
  // Scene content is in the 'content' field, not 'messages'
  prompt = prompt.replace('{{scene_messages}}', sceneData.content);

  const start = Date.now();
  const result = await sendRequest(prompt, config);
  const duration = (Date.now() - start) / 1000;

  console.log(`  Duration: ${duration.toFixed(1)}s, Tokens: ${result.tokens}`);

  if (!result.success) {
    console.log(`  ❌ Failed: ${result.error}`);
    return null;
  }

  console.log(`  ✅ Extracted ${result.parsed.extracted?.length || 0} items`);
  return result.parsed;
}

async function runStage2(stage1Output, userName, config) {
  console.log('\n--- STAGE 2: Organize ---');

  let prompt = PROMPTS.stage2();
  prompt = prompt.replace('{{extracted_data}}', JSON.stringify(stage1Output, null, 2));
  prompt = prompt.replace(/\{\{user\}\}/g, userName);
  prompt = prompt.replace(/\{\{lorebook_entry_types_with_guidance\}\}/g, DEFAULT_ENTITY_TYPES);

  const start = Date.now();
  const result = await sendRequest(prompt, config);
  const duration = (Date.now() - start) / 1000;

  console.log(`  Duration: ${duration.toFixed(1)}s, Tokens: ${result.tokens}`);

  if (!result.success) {
    console.log(`  ❌ Failed: ${result.error}`);
    return null;
  }

  const recap = result.parsed.recap || {};
  const entities = result.parsed.entities || [];
  console.log(`  ✅ Recap: outcomes=${recap.outcomes?.length || 0}c, threads=${recap.threads?.length || 0}c, state=${recap.state?.length || 0}c`);
  console.log(`  ✅ Entities: ${entities.length}`);

  return result.parsed;
}

async function runStage3(stage2Recap, runningRecap, userName, config) {
  console.log('\n--- STAGE 3: Filter Recap ---');

  let prompt = PROMPTS.stage3();
  prompt = prompt.replace('{{stage2_recap}}', JSON.stringify(stage2Recap, null, 2));
  prompt = prompt.replace('{{current_running_recap}}', runningRecap || '(empty - first scene)');
  prompt = prompt.replace(/\{\{user\}\}/g, userName);

  const start = Date.now();
  const result = await sendRequest(prompt, config);
  const duration = (Date.now() - start) / 1000;

  console.log(`  Duration: ${duration.toFixed(1)}s, Tokens: ${result.tokens}`);

  if (!result.success) {
    console.log(`  ❌ Failed: ${result.error}`);
    return null;
  }

  const p = result.parsed;
  console.log(`  ✅ Developments: ${p.developments?.length || 0}, Open: ${p.open?.length || 0}, State: ${p.state?.length || 0}, Resolved: ${p.resolved?.length || 0}`);

  return result.parsed;
}

async function runRunningRecapMerge(stage3Output, runningRecap, config) {
  console.log('\n--- RUNNING RECAP MERGE ---');

  let prompt = PROMPTS.runningRecap();
  prompt = prompt.replace('{{filtered_recap}}', JSON.stringify(stage3Output, null, 2));
  prompt = prompt.replace('{{current_running_recap}}', runningRecap || '(empty - first scene)');

  const start = Date.now();
  const result = await sendRequest(prompt, config);
  const duration = (Date.now() - start) / 1000;

  console.log(`  Duration: ${duration.toFixed(1)}s, Tokens: ${result.tokens}`);

  if (!result.success) {
    console.log(`  ❌ Failed: ${result.error}`);
    return null;
  }

  const recap = result.parsed.recap || {};
  const events = result.parsed.entities || [];
  console.log(`  ✅ Merged recap: dev=${recap.developments?.length || 0}, open=${recap.open?.length || 0}, state=${recap.state?.length || 0}`);
  console.log(`  ✅ Event entities: ${events.length}`);

  return result.parsed;
}

async function runStage4(entities, existingLore, userName, config) {
  console.log('\n--- STAGE 4: Filter Entities ---');

  let prompt = PROMPTS.stage4();
  prompt = prompt.replace('{{extracted_sl}}', JSON.stringify(entities, null, 2));
  prompt = prompt.replace('{{active_setting_lore}}', existingLore || '(no existing entries)');
  prompt = prompt.replace(/\{\{user\}\}/g, userName);

  const start = Date.now();
  const result = await sendRequest(prompt, config);
  const duration = (Date.now() - start) / 1000;

  console.log(`  Duration: ${duration.toFixed(1)}s, Tokens: ${result.tokens}`);

  if (!result.success) {
    console.log(`  ❌ Failed: ${result.error}`);
    return null;
  }

  console.log(`  ✅ Filtered entities: ${result.parsed.entities?.length || 0}`);

  return result.parsed;
}

function getNextRunNumber() {
  if (!existsSync(RESULTS_DIR)) return 1;
  const runs = readdirSync(RESULTS_DIR)
    .filter(f => f.startsWith('run-'))
    .map(f => parseInt(f.replace('run-', ''), 10))
    .filter(n => !isNaN(n));
  return runs.length > 0 ? Math.max(...runs) + 1 : 1;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`
Usage: node test-end-to-end.js --scene <scene-id>

Options:
  --scene <id>     Scene file to test (e.g., baronial-0-18)
  --help           Show this help

Tests the full pipeline: Stage1 → Stage2 → Stage3 → RunningRecap → Stage4
`);
    process.exit(0);
  }

  const config = { ...defaultConfig };
  let sceneId = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--scene' && args[i + 1]) {
      sceneId = args[i + 1];
    }
  }

  if (!sceneId) {
    console.error('Error: --scene required');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`END-TO-END TEST: ${sceneId}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Config: model=${config.model}, temp=${config.temperature}`);

  // Load scene
  const sceneData = loadSceneFile(sceneId);
  const userName = sceneData.userName || 'User';
  console.log(`User character: ${userName}`);

  // Run pipeline
  const stage1 = await runStage1(sceneData, config);
  if (!stage1) process.exit(1);

  const stage2 = await runStage2(stage1, userName, config);
  if (!stage2) process.exit(1);

  const stage3 = await runStage3(stage2.recap, '', userName, config);
  if (!stage3) process.exit(1);

  const merged = await runRunningRecapMerge(stage3, '', config);
  if (!merged) process.exit(1);

  const stage4 = await runStage4(stage2.entities, '', userName, config);
  if (!stage4) process.exit(1);

  // Save results
  const runNumber = getNextRunNumber();
  const runDir = resolve(RESULTS_DIR, `run-${runNumber}`);
  mkdirSync(runDir, { recursive: true });

  const results = {
    scene: sceneId,
    userName,
    timestamp: new Date().toISOString(),
    stage1,
    stage2,
    stage3,
    merged_recap: merged,
    stage4_entities: stage4
  };

  writeFileSync(resolve(runDir, `${sceneId}.json`), JSON.stringify(results, null, 2));

  console.log(`\n${'='.repeat(60)}`);
  console.log('FINAL OUTPUT');
  console.log('='.repeat(60));

  console.log('\n--- RUNNING RECAP ---');
  console.log(JSON.stringify(merged.recap, null, 2));

  console.log('\n--- ENTITIES (filtered) ---');
  stage4.entities?.forEach(e => {
    console.log(`\n[${e.type}] ${e.name}`);
    console.log(`  Keywords: ${e.keywords?.join(', ')}`);
    console.log(`  Content: ${e.content?.length || 0} items`);
  });

  console.log(`\n\nResults saved to: ${runDir}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
