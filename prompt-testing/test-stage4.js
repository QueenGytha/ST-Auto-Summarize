#!/usr/bin/env node

/**
 * Stage 4 tester - filters entities against a cumulative mock lorebook
 * Usage: node test-stage4.js [--stage2-run <n>] [--stage3-run <n>] [--scene <scene-id>]
 *
 * Stage 4 is CUMULATIVE - as each scene's entities pass through filtering,
 * they get added to a mock lorebook that subsequent scenes filter against.
 * This simulates real usage where entities accumulate over a conversation.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import defaultConfig from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ENDPOINT = 'http://localhost:8765/opus6-claude/chat/completions';
const STAGE2_RESULTS_DIR = resolve(__dirname, 'results-stage2');
const STAGE3_RESULTS_DIR = resolve(__dirname, 'results-stage3');
const STAGE4_RESULTS_DIR = resolve(__dirname, 'results-stage4');

// Load the stage4 prompt template
async function loadStage4Prompt() {
  const promptPath = resolve(__dirname, '../default-prompts/scene-recap-stage4-filter-sl.js');
  const content = readFileSync(promptPath, 'utf-8');

  const match = content.match(/export const scene_recap_stage4_filter_sl_prompt = `([\s\S]*?)`;/);
  if (!match) {
    throw new Error('Could not parse stage4 prompt');
  }

  return match[1];
}

function loadStage2Results(runNumber) {
  const runDir = resolve(STAGE2_RESULTS_DIR, `run-${runNumber}`);
  if (!existsSync(runDir)) {
    throw new Error(`Stage2 run ${runNumber} not found in ${STAGE2_RESULTS_DIR}`);
  }

  const files = readdirSync(runDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  const results = files.map(file => {
    const content = readFileSync(resolve(runDir, file), 'utf-8');
    return JSON.parse(content);
  });

  // Sort by scene number
  return results.sort((a, b) => {
    const aNum = parseInt(a.scene.match(/scene-(\d+)/)?.[1] || '0', 10);
    const bNum = parseInt(b.scene.match(/scene-(\d+)/)?.[1] || '0', 10);
    return aNum - bNum;
  });
}

function loadStage3Results(runNumber) {
  const runDir = resolve(STAGE3_RESULTS_DIR, `run-${runNumber}`);
  if (!existsSync(runDir)) {
    console.log(`Stage3 run ${runNumber} not found - will use empty event entities`);
    return null;
  }

  const files = readdirSync(runDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  const results = {};

  for (const file of files) {
    const content = readFileSync(resolve(runDir, file), 'utf-8');
    const parsed = JSON.parse(content);
    results[parsed.scene] = parsed;
  }

  return results;
}

function getLatestRunNumber(dir) {
  if (!existsSync(dir)) {
    return null;
  }

  const existing = readdirSync(dir)
    .filter(f => f.startsWith('run-'))
    .map(f => parseInt(f.replace('run-', ''), 10))
    .filter(n => !isNaN(n));

  return existing.length > 0 ? Math.max(...existing) : null;
}

// Convert stage4 output entity to lorebook entry format for mock lorebook
function entityToLorebookEntry(entity, uid) {
  return {
    comment: entity.n,
    uid: String(uid),
    key: entity.k || [entity.n],
    content: entity.c,
    world: '',
    position: '',
    order: ''
  };
}

// Build {{active_setting_lore}} format from mock lorebook
function buildActiveSettingLore(mockLorebook) {
  if (mockLorebook.length === 0) {
    return '(empty - no existing entries)';
  }

  const instructions = `INSTRUCTIONS: The following <setting_lore> entries contain context that is active for this scene. Only include information from these entries that is new or has changed in the scene. If the scene rehashes something already captured in these entries, omit it to avoid duplication.\n\n`;

  const formattedEntries = mockLorebook.map(e => {
    const keys = (e.key || []).join('|');
    return `<setting_lore name="${e.comment}" uid="${e.uid}" world="${e.world}" position="${e.position}" order="${e.order}" keys="${keys}">\n${e.content}\n</setting_lore>`;
  }).join('\n\n');

  return instructions + formattedEntries;
}

// Build {{extracted_sl}} from combined stage2 + stage3 entities
function buildExtractedSl(stage2Entities, stage3Entities) {
  const combined = [...(stage2Entities || []), ...(stage3Entities || [])];
  return JSON.stringify(combined, null, 2);
}

function buildPrompt(promptTemplate, extractedSl, activeSettingLore, userName) {
  let prompt = promptTemplate;
  prompt = prompt.replace('{{extracted_sl}}', extractedSl);
  prompt = prompt.replace('{{active_setting_lore}}', activeSettingLore);

  // Replace {{user}} with user name from stage2 results
  if (userName) {
    prompt = prompt.replace(/\{\{user\}\}/g, userName);
  }

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
        headers: { 'Content-Type': 'application/json' },
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
      if (err.message.startsWith('HTTP ')) throw err;
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

  if (!content.startsWith('{')) {
    content = '{' + content;
  }

  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    content = jsonMatch[1];
  }

  try {
    const parsed = JSON.parse(content);
    return { raw: content, parsed, error: null };
  } catch (e) {
    return { raw: content, parsed: null, error: `JSON parse error: ${e.message}` };
  }
}

async function testScene(stage2Result, stage3Result, promptTemplate, mockLorebook, config) {
  const sceneId = stage2Result.scene;
  const userName = stage2Result.userName;

  // Get entities from stage2 and stage3
  const stage2Entities = stage2Result.parsed?.entities || [];
  const stage3Entities = stage3Result?.entities || [];
  const inputEntities = [...stage2Entities, ...stage3Entities];

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing Stage 4: ${sceneId}`);
  if (userName) {
    console.log(`User character: ${userName}`);
  }
  console.log(`Input entities: ${inputEntities.length} (${stage2Entities.length} from stage2, ${stage3Entities.length} from stage3)`);
  console.log(`Mock lorebook: ${mockLorebook.length} existing entries`);
  console.log(`${'='.repeat(60)}`);

  if (inputEntities.length === 0) {
    console.log(`\n⚠️ Skipping - no entities to filter`);
    return {
      scene: sceneId,
      success: true,
      skipped: true,
      input_entities: 0,
      output_entities: 0,
      filtered_out: 0,
      new_to_lorebook: [],
      error: null
    };
  }

  const extractedSl = buildExtractedSl(stage2Entities, stage3Entities);
  const activeSettingLore = buildActiveSettingLore(mockLorebook);
  const userPrompt = buildPrompt(promptTemplate, extractedSl, activeSettingLore, userName);

  const messages = [
    { role: 'user', content: userPrompt },
    { role: 'assistant', content: 'Understood. Filtering entities against existing lore. Output JSON only:\n{' }
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
      console.log(`\nRaw output:\n${raw.substring(0, 500)}...`);
      return {
        scene: sceneId,
        success: false,
        duration,
        tokens: result.usage?.total_tokens,
        error,
        raw,
        input_entities: inputEntities.length,
        output_entities: 0,
        filtered_out: inputEntities.length,
        new_to_lorebook: []
      };
    }

    const outputEntities = parsed.entities || [];
    const filteredOut = inputEntities.length - outputEntities.length;

    console.log(`\n✅ Valid JSON output`);
    console.log(`Output entities: ${outputEntities.length}`);
    console.log(`Filtered out: ${filteredOut}`);

    if (outputEntities.length > 0) {
      console.log(`\nEntities passing filter:`);
      outputEntities.forEach(e => {
        const hasUid = e.u ? ` (UID: ${e.u})` : ' (NEW)';
        console.log(`  - ${e.n} [${e.t}]${hasUid}`);
      });
    }

    // Track which entities have UIDs (existing) vs new
    const newEntities = outputEntities.filter(e => !e.u);
    const updatedEntities = outputEntities.filter(e => e.u);

    if (newEntities.length > 0) {
      console.log(`\nNew entities (will be added to lorebook): ${newEntities.length}`);
    }
    if (updatedEntities.length > 0) {
      console.log(`Updated entities (matched existing): ${updatedEntities.length}`);
    }

    return {
      scene: sceneId,
      success: true,
      duration,
      tokens: result.usage?.total_tokens,
      input_entities: inputEntities.length,
      output_entities: outputEntities.length,
      filtered_out: filteredOut,
      new_entities: newEntities.length,
      updated_entities: updatedEntities.length,
      parsed,
      raw,
      new_to_lorebook: outputEntities, // All passing entities go to lorebook
      error: null
    };
  } catch (err) {
    console.log(`\n❌ Request failed: ${err.message}`);
    return {
      scene: sceneId,
      success: false,
      error: err.message,
      input_entities: inputEntities.length,
      output_entities: 0,
      filtered_out: inputEntities.length,
      new_to_lorebook: []
    };
  }
}

function getNextStage4RunNumber() {
  if (!existsSync(STAGE4_RESULTS_DIR)) {
    return 1;
  }

  const existing = readdirSync(STAGE4_RESULTS_DIR)
    .filter(f => f.startsWith('run-'))
    .map(f => parseInt(f.replace('run-', ''), 10))
    .filter(n => !isNaN(n));

  return existing.length > 0 ? Math.max(...existing) + 1 : 1;
}

function saveResults(results, stage2RunNumber, stage3RunNumber, finalLorebook) {
  const runNumber = getNextStage4RunNumber();
  const runDir = resolve(STAGE4_RESULTS_DIR, `run-${runNumber}`);
  mkdirSync(runDir, { recursive: true });

  for (const result of results) {
    const scenePath = resolve(runDir, `${result.scene}.json`);
    writeFileSync(scenePath, JSON.stringify(result, null, 2));
  }

  // Save final lorebook state
  writeFileSync(
    resolve(runDir, '_lorebook.json'),
    JSON.stringify(finalLorebook, null, 2)
  );

  // Save summary
  const summary = {
    run: runNumber,
    stage2_run: stage2RunNumber,
    stage3_run: stage3RunNumber,
    timestamp: new Date().toISOString(),
    total: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    final_lorebook_entries: finalLorebook.length,
    total_input_entities: results.reduce((sum, r) => sum + (r.input_entities || 0), 0),
    total_output_entities: results.reduce((sum, r) => sum + (r.output_entities || 0), 0),
    total_filtered_out: results.reduce((sum, r) => sum + (r.filtered_out || 0), 0),
    scenes: results.map(r => ({
      id: r.scene,
      success: r.success,
      input_entities: r.input_entities,
      output_entities: r.output_entities,
      filtered_out: r.filtered_out,
      error: r.error || null
    }))
  };
  writeFileSync(resolve(runDir, '_summary.json'), JSON.stringify(summary, null, 2));

  console.log(`\nResults saved to: ${runDir}`);
}

function printSummary(results, finalLorebook) {
  console.log('\n' + '='.repeat(60));
  console.log('STAGE 4 SUMMARY (CUMULATIVE FILTERING)');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`Total scenes: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nFailed scenes:');
    failed.forEach(r => console.log(`  - ${r.scene}: ${r.error}`));
  }

  // Filtering stats
  const totalInput = results.reduce((sum, r) => sum + (r.input_entities || 0), 0);
  const totalOutput = results.reduce((sum, r) => sum + (r.output_entities || 0), 0);
  const totalFiltered = totalInput - totalOutput;

  console.log(`\nFiltering statistics:`);
  console.log(`  Total input entities: ${totalInput}`);
  console.log(`  Passed filter: ${totalOutput}`);
  console.log(`  Filtered as duplicates: ${totalFiltered}`);
  console.log(`  Filter rate: ${totalInput > 0 ? ((totalFiltered / totalInput) * 100).toFixed(1) : 0}%`);

  // Per-scene breakdown
  console.log(`\nPer-scene breakdown:`);
  results.forEach(r => {
    if (r.success && !r.skipped) {
      console.log(`  ${r.scene}: ${r.input_entities} → ${r.output_entities} (filtered ${r.filtered_out})`);
    } else if (r.skipped) {
      console.log(`  ${r.scene}: skipped (no entities)`);
    }
  });

  // Final lorebook
  console.log(`\nFinal mock lorebook: ${finalLorebook.length} entries`);
  if (finalLorebook.length > 0) {
    console.log('\nLorebook entries:');
    finalLorebook.forEach(e => {
      console.log(`  [${e.uid}] ${e.comment}: ${e.content.substring(0, 60)}...`);
    });
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node test-stage4.js [options]

Options:
  --stage2-run <n>    Use stage2 results from run N (default: latest)
  --stage3-run <n>    Use stage3 results from run N (default: latest)
  --scene <id>        Stop after specific scene (still processes all before it)
  --temperature <n>   Override temperature
  --model <name>      Override model
  --help              Show this help

Note: Stage 4 is CUMULATIVE - scenes are processed in order, each building
on the mock lorebook from previous scenes. This simulates real deduplication.

Examples:
  node test-stage4.js                        # Process all scenes
  node test-stage4.js --stage2-run 1         # Use specific stage2 run
  node test-stage4.js --scene scene-24-59    # Stop after scene-24-59
`);
    process.exit(0);
  }

  const config = { ...defaultConfig };
  let stage2RunNumber = null;
  let stage3RunNumber = null;
  let stopAfterScene = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--stage2-run' && args[i + 1]) {
      stage2RunNumber = parseInt(args[i + 1], 10);
    } else if (args[i] === '--stage3-run' && args[i + 1]) {
      stage3RunNumber = parseInt(args[i + 1], 10);
    } else if (args[i] === '--scene' && args[i + 1]) {
      stopAfterScene = args[i + 1];
    } else if (args[i] === '--temperature' && args[i + 1]) {
      config.temperature = parseFloat(args[i + 1]);
    } else if (args[i] === '--model' && args[i + 1]) {
      config.model = args[i + 1];
    }
  }

  if (!stage2RunNumber) {
    stage2RunNumber = getLatestRunNumber(STAGE2_RESULTS_DIR);
    if (!stage2RunNumber) {
      throw new Error('No stage2 results found');
    }
  }

  if (!stage3RunNumber) {
    stage3RunNumber = getLatestRunNumber(STAGE3_RESULTS_DIR);
  }

  console.log(`Loading stage4 prompt...`);
  const promptTemplate = await loadStage4Prompt();

  console.log(`Loading stage2 results from run-${stage2RunNumber}...`);
  const stage2Results = loadStage2Results(stage2RunNumber);

  console.log(`Loading stage3 results from run-${stage3RunNumber || 'N/A'}...`);
  const stage3Results = stage3RunNumber ? loadStage3Results(stage3RunNumber) : {};

  console.log(`\nConfig: model=${config.model}, temp=${config.temperature}`);
  console.log(`Processing ${stage2Results.length} scene(s) CUMULATIVELY...`);

  const results = [];
  let mockLorebook = []; // Starts empty, accumulates as we process scenes
  let nextUid = 1;

  for (const stage2Result of stage2Results) {
    const stage3Result = stage3Results?.[stage2Result.scene];

    const result = await testScene(
      stage2Result,
      stage3Result,
      promptTemplate,
      mockLorebook,
      config
    );
    results.push(result);

    // Add passing entities to mock lorebook for next scene
    if (result.success && result.new_to_lorebook) {
      for (const entity of result.new_to_lorebook) {
        // Check if entity already exists by name (for updates)
        const existingIdx = mockLorebook.findIndex(e => e.comment === entity.n);

        if (existingIdx >= 0 && entity.u) {
          // Update existing entry
          mockLorebook[existingIdx].content += '\n\n' + entity.c;
          mockLorebook[existingIdx].key = [...new Set([...mockLorebook[existingIdx].key, ...(entity.k || [])])];
        } else {
          // Add new entry
          mockLorebook.push(entityToLorebookEntry(entity, nextUid++));
        }
      }
    }

    // Stop early if requested
    if (stopAfterScene && stage2Result.scene === stopAfterScene) {
      console.log(`\nStopping after ${stopAfterScene} as requested`);
      break;
    }
  }

  printSummary(results, mockLorebook);
  saveResults(results, stage2RunNumber, stage3RunNumber, mockLorebook);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
