#!/usr/bin/env node

/**
 * Stage 3 tester - runs Stage 3 filtering + Running Recap merge cumulatively
 * Usage: node test-stage3.js [--stage2-run <n>] [--scene <scene-id>]
 *
 * For each scene:
 *   1. Stage 3 FILTER: Filter stage2.recap against current running recap
 *   2. MERGE: Merge filtered content into running recap
 *
 * This is CUMULATIVE - each scene builds on the previous running recap.
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

// Load both prompts: Stage 3 filtering and Running Recap merge
function loadPrompts() {
  // Stage 3 filtering prompt
  const filterPath = resolve(__dirname, '../default-prompts/scene-recap-stage3-filtering.js');
  const filterContent = readFileSync(filterPath, 'utf-8');
  const filterMatch = filterContent.match(/export const scene_recap_stage3_filtering_prompt = `([\s\S]*?)`;/);
  if (!filterMatch) {
    throw new Error('Could not parse stage3 filtering prompt');
  }

  // Running Recap merge prompt
  const mergePath = resolve(__dirname, '../default-prompts/running-scene-recap.js');
  const mergeContent = readFileSync(mergePath, 'utf-8');
  const mergeMatch = mergeContent.match(/export const running_scene_recap_prompt = `([\s\S]*?)`;/);
  if (!mergeMatch) {
    throw new Error('Could not parse running-scene-recap prompt');
  }

  return {
    filter: filterMatch[1],
    merge: mergeMatch[1]
  };
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

  // Sort by scene number for cumulative processing
  return results.sort((a, b) => {
    const aNum = parseInt(a.scene.match(/scene-(\d+)/)?.[1] || '0', 10);
    const bNum = parseInt(b.scene.match(/scene-(\d+)/)?.[1] || '0', 10);
    return aNum - bNum;
  });
}

function getLatestStage2RunNumber() {
  if (!existsSync(STAGE2_RESULTS_DIR)) {
    throw new Error('No stage2 results found');
  }

  const existing = readdirSync(STAGE2_RESULTS_DIR)
    .filter(f => f.startsWith('run-'))
    .map(f => parseInt(f.replace('run-', ''), 10))
    .filter(n => !isNaN(n));

  if (existing.length === 0) {
    throw new Error('No stage2 runs found');
  }

  return Math.max(...existing);
}

// Build Stage 3 filter prompt
function buildFilterPrompt(promptTemplate, stage2Recap, currentRunningRecap, userName) {
  let prompt = promptTemplate;
  prompt = prompt.replace('{{stage2_recap}}', JSON.stringify(stage2Recap, null, 2));
  prompt = prompt.replace('{{current_running_recap}}', currentRunningRecap || '(empty - first scene)');
  prompt = prompt.replace(/\{\{user\}\}/g, userName || 'User');
  return prompt;
}

// Build Running Recap merge prompt
function buildMergePrompt(promptTemplate, filteredRecap, currentRunningRecap) {
  let prompt = promptTemplate;
  prompt = prompt.replace('{{filtered_recap}}', JSON.stringify(filteredRecap, null, 2));
  prompt = prompt.replace('{{current_running_recap}}', currentRunningRecap || '(empty - first scene)');
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

// Format running recap object for display/prompt
function formatRunningRecap(recap) {
  if (!recap || ((!recap.developments || recap.developments.length === 0) &&
                 (!recap.open || recap.open.length === 0) &&
                 (!recap.state || recap.state.length === 0))) {
    return '(empty - first scene)';
  }
  return JSON.stringify(recap, null, 2);
}

async function testScene(stage2Result, prompts, currentRunningRecap, config) {
  const sceneId = stage2Result.scene;
  const userName = stage2Result.userName || 'User';

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing Stage 3: ${sceneId}`);
  console.log(`User: ${userName}`);
  console.log(`Current running recap: ${currentRunningRecap ? 'has content' : 'empty'}`);
  console.log(`${'='.repeat(60)}`);

  if (!stage2Result.parsed?.recap) {
    console.log(`\n⚠️ Skipping - Stage 2 has no recap`);
    return {
      scene: sceneId,
      success: false,
      error: 'Stage 2 result has no recap',
      recap: currentRunningRecap,
      entities: []
    };
  }

  const runningRecapStr = formatRunningRecap(currentRunningRecap);

  // Step 1: Stage 3 FILTERING
  console.log(`\n--- Step 1: FILTER ---`);
  const filterPrompt = buildFilterPrompt(prompts.filter, stage2Result.parsed.recap, runningRecapStr, userName);

  const filterMessages = [
    { role: 'user', content: filterPrompt },
    { role: 'assistant', content: 'Filtering new recap against running recap. Output JSON only:\n{' }
  ];

  const filterStart = Date.now();
  let filterResult;

  try {
    filterResult = await sendRequest(filterMessages, config);
  } catch (err) {
    console.log(`\n❌ Filter request failed: ${err.message}`);
    return {
      scene: sceneId,
      success: false,
      error: `Filter: ${err.message}`,
      recap: currentRunningRecap,
      entities: []
    };
  }

  const filterDuration = (Date.now() - filterStart) / 1000;
  const filterParsed = parseResponse(filterResult);

  console.log(`  Duration: ${filterDuration.toFixed(2)}s, Tokens: ${filterResult.usage?.total_tokens || 'N/A'}`);

  if (filterParsed.error) {
    console.log(`  ⚠️ Parse Error: ${filterParsed.error}`);
    console.log(`  Raw: ${filterParsed.raw.substring(0, 300)}...`);
    return {
      scene: sceneId,
      success: false,
      error: `Filter parse: ${filterParsed.error}`,
      raw_filter: filterParsed.raw,
      recap: currentRunningRecap,
      entities: []
    };
  }

  const filtered = filterParsed.parsed;
  console.log(`  ✅ Filtered: dev=${filtered.developments?.length || 0}, open=${filtered.open?.length || 0}, state=${filtered.state?.length || 0}, resolved=${filtered.resolved?.length || 0}`);

  // Step 2: MERGE into running recap
  console.log(`\n--- Step 2: MERGE ---`);
  const mergePrompt = buildMergePrompt(prompts.merge, filtered, runningRecapStr);

  const mergeMessages = [
    { role: 'user', content: mergePrompt },
    { role: 'assistant', content: 'Merging filtered content into running recap. Output JSON only:\n{' }
  ];

  const mergeStart = Date.now();
  let mergeResult;

  try {
    mergeResult = await sendRequest(mergeMessages, config);
  } catch (err) {
    console.log(`\n❌ Merge request failed: ${err.message}`);
    return {
      scene: sceneId,
      success: false,
      error: `Merge: ${err.message}`,
      filtered,
      recap: currentRunningRecap,
      entities: []
    };
  }

  const mergeDuration = (Date.now() - mergeStart) / 1000;
  const mergeParsed = parseResponse(mergeResult);

  console.log(`  Duration: ${mergeDuration.toFixed(2)}s, Tokens: ${mergeResult.usage?.total_tokens || 'N/A'}`);

  if (mergeParsed.error) {
    console.log(`  ⚠️ Parse Error: ${mergeParsed.error}`);
    console.log(`  Raw: ${mergeParsed.raw.substring(0, 300)}...`);
    return {
      scene: sceneId,
      success: false,
      error: `Merge parse: ${mergeParsed.error}`,
      filtered,
      raw_merge: mergeParsed.raw,
      recap: currentRunningRecap,
      entities: []
    };
  }

  const mergedRecap = mergeParsed.parsed.recap || {};
  const eventEntities = mergeParsed.parsed.entities || [];

  console.log(`  ✅ Merged: dev=${mergedRecap.developments?.length || 0}, open=${mergedRecap.open?.length || 0}, state=${mergedRecap.state?.length || 0}`);
  console.log(`  Event entities: ${eventEntities.length}`);

  if (eventEntities.length > 0) {
    console.log(`\nResolved events:`);
    eventEntities.forEach(e => {
      const content = Array.isArray(e.content) ? e.content.join('; ') : e.content;
      console.log(`  - ${e.name}: ${content?.substring(0, 60)}...`);
    });
  }

  // Preview the merged recap
  console.log(`\n--- Merged Recap Preview ---`);
  if (mergedRecap.developments?.length > 0) {
    console.log(`Developments (${mergedRecap.developments.length}):`);
    mergedRecap.developments.slice(0, 3).forEach(d => console.log(`  ${d}`));
    if (mergedRecap.developments.length > 3) console.log(`  ... +${mergedRecap.developments.length - 3} more`);
  }
  if (mergedRecap.open?.length > 0) {
    console.log(`Open (${mergedRecap.open.length}):`);
    mergedRecap.open.slice(0, 2).forEach(o => console.log(`  ${o}`));
  }
  if (mergedRecap.state?.length > 0) {
    console.log(`State (${mergedRecap.state.length}):`);
    mergedRecap.state.slice(0, 2).forEach(s => console.log(`  ${s}`));
  }

  const totalDuration = filterDuration + mergeDuration;
  const totalTokens = (filterResult.usage?.total_tokens || 0) + (mergeResult.usage?.total_tokens || 0);

  return {
    scene: sceneId,
    success: true,
    duration: totalDuration,
    tokens: totalTokens,
    filter_duration: filterDuration,
    filter_tokens: filterResult.usage?.total_tokens,
    merge_duration: mergeDuration,
    merge_tokens: mergeResult.usage?.total_tokens,
    filtered,
    merged: mergeParsed.parsed,
    recap: mergedRecap,
    entities: eventEntities,
    error: null
  };
}

function getNextStage3RunNumber() {
  if (!existsSync(STAGE3_RESULTS_DIR)) {
    return 1;
  }

  const existing = readdirSync(STAGE3_RESULTS_DIR)
    .filter(f => f.startsWith('run-'))
    .map(f => parseInt(f.replace('run-', ''), 10))
    .filter(n => !isNaN(n));

  return existing.length > 0 ? Math.max(...existing) + 1 : 1;
}

function saveResults(results, stage2RunNumber) {
  const runNumber = getNextStage3RunNumber();
  const runDir = resolve(STAGE3_RESULTS_DIR, `run-${runNumber}`);
  mkdirSync(runDir, { recursive: true });

  for (const result of results) {
    const scenePath = resolve(runDir, `${result.scene}.json`);
    writeFileSync(scenePath, JSON.stringify(result, null, 2));
  }

  // Collect all entities across all scenes
  const allEntities = results.flatMap(r => r.entities || []);

  // Save summary with final recap and all entities
  const lastResult = results[results.length - 1];
  const finalRecap = lastResult?.recap || {};
  const summary = {
    run: runNumber,
    stage2_run: stage2RunNumber,
    timestamp: new Date().toISOString(),
    total: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    final_recap: finalRecap,
    final_recap_counts: {
      developments: finalRecap.developments?.length || 0,
      open: finalRecap.open?.length || 0,
      state: finalRecap.state?.length || 0
    },
    total_event_entities: allEntities.length,
    all_entities: allEntities,
    scenes: results.map(r => ({
      id: r.scene,
      success: r.success,
      filter_duration: r.filter_duration,
      merge_duration: r.merge_duration,
      recap_counts: {
        developments: r.recap?.developments?.length || 0,
        open: r.recap?.open?.length || 0,
        state: r.recap?.state?.length || 0
      },
      entities_count: r.entities?.length || 0,
      error: r.error || null
    }))
  };
  writeFileSync(resolve(runDir, '_summary.json'), JSON.stringify(summary, null, 2));

  console.log(`\nResults saved to: ${runDir}`);
}

function printSummary(results) {
  console.log('\n' + '='.repeat(60));
  console.log('STAGE 3 SUMMARY (CUMULATIVE RECAP)');
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

  // Show recap growth and entities
  if (successful.length > 0) {
    console.log('\nRecap growth per scene:');
    results.forEach(r => {
      if (r.success) {
        const recap = r.recap || {};
        const devCount = recap.developments?.length || 0;
        const openCount = recap.open?.length || 0;
        const stateCount = recap.state?.length || 0;
        const entityInfo = r.entities?.length ? ` (+${r.entities.length} events)` : '';
        console.log(`  ${r.scene}: dev=${devCount}, open=${openCount}, state=${stateCount}${entityInfo}`);
      }
    });

    // Show all resolved event entities
    const allEntities = results.flatMap(r => r.entities || []);
    if (allEntities.length > 0) {
      console.log(`\nResolved event entities (${allEntities.length} total):`);
      allEntities.forEach(e => {
        const content = Array.isArray(e.content) ? e.content.join('; ') : e.content;
        console.log(`  - ${e.name} [${(e.keywords || []).join(', ')}]: ${content}`);
      });
    }

    const lastResult = results[results.length - 1];
    const finalRecap = lastResult.recap || {};
    console.log(`\nFinal recap:`);
    console.log('-'.repeat(40));
    if (finalRecap.developments?.length > 0) {
      console.log(`Developments (${finalRecap.developments.length}):`);
      finalRecap.developments.forEach(d => console.log(`  ${d}`));
    }
    if (finalRecap.open?.length > 0) {
      console.log(`Open threads (${finalRecap.open.length}):`);
      finalRecap.open.forEach(o => console.log(`  ${o}`));
    }
    if (finalRecap.state?.length > 0) {
      console.log(`State (${finalRecap.state.length}):`);
      finalRecap.state.forEach(s => console.log(`  ${s}`));
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node test-stage3.js [options]

Options:
  --stage2-run <n>    Use stage2 results from run N (default: latest)
  --scene <id>        Stop after specific scene (still processes all before it)
  --temperature <n>   Override temperature
  --model <name>      Override model
  --help              Show this help

Note: Stage 3 is CUMULATIVE - scenes are processed in order, each building
on the previous recap. Use --scene to stop early, but all prior scenes
will still be processed.

Examples:
  node test-stage3.js                        # Process all scenes
  node test-stage3.js --stage2-run 1         # Use specific stage2 run
  node test-stage3.js --scene scene-24-59    # Stop after scene-24-59
`);
    process.exit(0);
  }

  const config = { ...defaultConfig };
  let stage2RunNumber = null;
  let stopAfterScene = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--stage2-run' && args[i + 1]) {
      stage2RunNumber = parseInt(args[i + 1], 10);
    } else if (args[i] === '--scene' && args[i + 1]) {
      stopAfterScene = args[i + 1];
    } else if (args[i] === '--temperature' && args[i + 1]) {
      config.temperature = parseFloat(args[i + 1]);
    } else if (args[i] === '--model' && args[i + 1]) {
      config.model = args[i + 1];
    }
  }

  if (!stage2RunNumber) {
    stage2RunNumber = getLatestStage2RunNumber();
  }

  console.log(`Loading prompts (Stage 3 filter + Running Recap merge)...`);
  const prompts = loadPrompts();

  console.log(`Loading stage2 results from run-${stage2RunNumber}...`);
  let stage2Results = loadStage2Results(stage2RunNumber);

  console.log(`\nConfig: model=${config.model}, temp=${config.temperature}`);
  console.log(`Processing ${stage2Results.length} scene(s) CUMULATIVELY from stage2 run-${stage2RunNumber}...`);

  const results = [];
  let currentRunningRecap = null; // Start empty (object, not string)

  for (const stage2Result of stage2Results) {
    const result = await testScene(stage2Result, prompts, currentRunningRecap, config);
    results.push(result);

    // Update cumulative recap for next iteration
    if (result.success && result.recap) {
      currentRunningRecap = result.recap;
    }

    // Stop early if requested
    if (stopAfterScene && stage2Result.scene === stopAfterScene) {
      console.log(`\nStopping after ${stopAfterScene} as requested`);
      break;
    }
  }

  printSummary(results);
  saveResults(results, stage2RunNumber);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
