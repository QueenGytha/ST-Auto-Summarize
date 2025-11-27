#!/usr/bin/env node

/**
 * Stage 3 tester - runs stage3 prompt to build running recap cumulatively
 * Usage: node test-stage3.js [--stage2-run <n>] [--scene <scene-id>]
 *
 * Stage 3 is CUMULATIVE - each scene's plot merges into the running recap,
 * which becomes input for the next scene.
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

// Load the stage3 prompt template
async function loadStage3Prompt() {
  const promptPath = resolve(__dirname, '../default-prompts/running-scene-recap.js');
  const content = readFileSync(promptPath, 'utf-8');

  const match = content.match(/export const running_scene_recap_prompt = `([\s\S]*?)`;/);
  if (!match) {
    throw new Error('Could not parse stage3 prompt');
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

function buildPrompt(promptTemplate, currentRunningRecap, newScenePlot) {
  let prompt = promptTemplate;
  prompt = prompt.replace('{{current_running_recap}}', currentRunningRecap || '(empty - first scene)');
  prompt = prompt.replace('{{scene_recaps}}', newScenePlot);
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

async function testScene(stage2Result, promptTemplate, currentRunningRecap, config) {
  const sceneId = stage2Result.scene;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing Stage 3: ${sceneId}`);
  console.log(`Current recap length: ${currentRunningRecap?.length || 0} chars`);
  console.log(`New plot length: ${stage2Result.parsed?.plot?.length || 0} chars`);
  console.log(`${'='.repeat(60)}`);

  if (!stage2Result.parsed?.plot) {
    console.log(`\n⚠️ Skipping - Stage 2 has no plot`);
    return {
      scene: sceneId,
      success: false,
      error: 'Stage 2 result has no plot',
      recap: currentRunningRecap,
      entities: []
    };
  }

  const userPrompt = buildPrompt(promptTemplate, currentRunningRecap, stage2Result.parsed.plot);

  const messages = [
    { role: 'user', content: userPrompt },
    { role: 'assistant', content: 'Understood. Merging new scene into running recap. Output JSON only:\n{' }
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
        recap: currentRunningRecap,
        entities: []
      };
    }

    const newRecap = parsed.recap || '';
    const entities = parsed.entities || [];

    console.log(`\n✅ Valid JSON output`);
    console.log(`New recap length: ${newRecap.length} chars`);
    console.log(`Event entities: ${entities.length}`);

    if (entities.length > 0) {
      console.log(`\nResolved events:`);
      entities.forEach(e => console.log(`  - ${e.n}: ${e.c?.substring(0, 60)}...`));
    }

    console.log(`\nRecap preview:`);
    console.log(newRecap.substring(0, 300) + (newRecap.length > 300 ? '...' : ''));

    return {
      scene: sceneId,
      success: true,
      duration,
      tokens: result.usage?.total_tokens,
      input_recap_length: currentRunningRecap?.length || 0,
      input_plot_length: stage2Result.parsed.plot.length,
      output_recap_length: newRecap.length,
      parsed,
      raw,
      recap: newRecap,
      entities,
      error: null
    };
  } catch (err) {
    console.log(`\n❌ Request failed: ${err.message}`);
    return {
      scene: sceneId,
      success: false,
      error: err.message,
      recap: currentRunningRecap,
      entities: []
    };
  }
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
  const summary = {
    run: runNumber,
    stage2_run: stage2RunNumber,
    timestamp: new Date().toISOString(),
    total: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    final_recap: lastResult?.recap || '',
    final_recap_length: lastResult?.recap?.length || 0,
    total_event_entities: allEntities.length,
    all_entities: allEntities,
    scenes: results.map(r => ({
      id: r.scene,
      success: r.success,
      input_recap_length: r.input_recap_length,
      output_recap_length: r.output_recap_length,
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
    console.log('\nRecap growth:');
    results.forEach(r => {
      if (r.success) {
        const entityInfo = r.entities?.length ? ` (+${r.entities.length} events)` : '';
        console.log(`  ${r.scene}: ${r.input_recap_length || 0} → ${r.output_recap_length} chars${entityInfo}`);
      }
    });

    // Show all resolved event entities
    const allEntities = results.flatMap(r => r.entities || []);
    if (allEntities.length > 0) {
      console.log(`\nResolved event entities (${allEntities.length} total):`);
      allEntities.forEach(e => {
        console.log(`  - ${e.n} [${(e.k || []).join(', ')}]: ${e.c}`);
      });
    }

    const lastResult = results[results.length - 1];
    console.log(`\nFinal recap (${lastResult.recap?.length || 0} chars):`);
    console.log('-'.repeat(40));
    console.log(lastResult.recap || '(empty)');
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

  console.log(`Loading stage3 prompt...`);
  const promptTemplate = await loadStage3Prompt();

  console.log(`Loading stage2 results from run-${stage2RunNumber}...`);
  let stage2Results = loadStage2Results(stage2RunNumber);

  console.log(`\nConfig: model=${config.model}, temp=${config.temperature}`);
  console.log(`Processing ${stage2Results.length} scene(s) CUMULATIVELY from stage2 run-${stage2RunNumber}...`);

  const results = [];
  let currentRunningRecap = ''; // Start empty

  for (const stage2Result of stage2Results) {
    const result = await testScene(stage2Result, promptTemplate, currentRunningRecap, config);
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
