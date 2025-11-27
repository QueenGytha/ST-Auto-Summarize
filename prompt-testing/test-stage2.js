#!/usr/bin/env node

/**
 * Stage 2 tester - runs stage2 prompt against stage1 results
 * Usage: node test-stage2.js [--run <run-number>] [--scene <scene-id>]
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import defaultConfig from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ENDPOINT = 'http://localhost:8765/opus6-claude/chat/completions';
const RESULTS_DIR = resolve(__dirname, 'results');
const STAGE2_RESULTS_DIR = resolve(__dirname, 'results-stage2');

// Load the stage2 prompt template
async function loadStage2Prompt() {
  const promptPath = resolve(__dirname, '../default-prompts/scene-recap-stage2-organize.js');
  const content = readFileSync(promptPath, 'utf-8');

  // Extract the template string from the export
  const match = content.match(/export const scene_recap_stage2_organize_prompt = `([\s\S]*?)`;/);
  if (!match) {
    throw new Error('Could not parse stage2 prompt');
  }

  return match[1];
}

function loadStage1Results(runNumber) {
  const runDir = resolve(RESULTS_DIR, `run-${runNumber}`);
  if (!existsSync(runDir)) {
    throw new Error(`Run ${runNumber} not found in ${RESULTS_DIR}`);
  }

  const files = readdirSync(runDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  return files.map(file => {
    const content = readFileSync(resolve(runDir, file), 'utf-8');
    return JSON.parse(content);
  });
}

function getLatestRunNumber() {
  if (!existsSync(RESULTS_DIR)) {
    throw new Error('No stage1 results found');
  }

  const existing = readdirSync(RESULTS_DIR)
    .filter(f => f.startsWith('run-'))
    .map(f => parseInt(f.replace('run-', ''), 10))
    .filter(n => !isNaN(n));

  if (existing.length === 0) {
    throw new Error('No stage1 runs found');
  }

  return Math.max(...existing);
}

function buildPromptForScene(promptTemplate, stage1Result) {
  // Replace {{extracted_data}} with the stage1 parsed output
  const extractedData = JSON.stringify(stage1Result.parsed, null, 2);
  return promptTemplate.replace('{{extracted_data}}', extractedData);
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

async function testScene(stage1Result, promptTemplate, config) {
  const sceneId = stage1Result.scene;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing Stage 2: ${sceneId}`);
  console.log(`Stage 1 had: ${stage1Result.parsed?.entities?.length || 0} entities`);
  console.log(`${'='.repeat(60)}`);

  if (!stage1Result.parsed) {
    console.log(`\n⚠️ Skipping - Stage 1 failed to parse`);
    return {
      scene: sceneId,
      success: false,
      error: 'Stage 1 result not parsed'
    };
  }

  const userPrompt = buildPromptForScene(promptTemplate, stage1Result);

  const messages = [
    { role: 'user', content: userPrompt },
    { role: 'assistant', content: 'Understood. I will filter the extraction and add keywords. Output JSON only:\n{' }
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
    } else if (parsed) {
      console.log(`\n✅ Valid JSON output`);
      console.log(`Scene Name: ${parsed.sn}`);
      console.log(`Plot length: ${parsed.plot?.length || 0} chars`);
      console.log(`Entities: ${parsed.entities?.length || 0}`);

      // Show keywords for each entity
      if (parsed.entities) {
        console.log(`\nKeywords generated:`);
        parsed.entities.forEach(e => {
          console.log(`  ${e.n}: [${(e.k || []).join(', ')}]`);
        });
      }
    }

    return {
      scene: sceneId,
      success: !error,
      duration,
      tokens: result.usage?.total_tokens,
      stage1_entities: stage1Result.parsed?.entities?.length || 0,
      stage2_entities: parsed?.entities?.length || 0,
      parsed,
      raw,
      error
    };
  } catch (err) {
    console.log(`\n❌ Request failed: ${err.message}`);
    return {
      scene: sceneId,
      success: false,
      error: err.message
    };
  }
}

function getNextStage2RunNumber() {
  if (!existsSync(STAGE2_RESULTS_DIR)) {
    return 1;
  }

  const existing = readdirSync(STAGE2_RESULTS_DIR)
    .filter(f => f.startsWith('run-'))
    .map(f => parseInt(f.replace('run-', ''), 10))
    .filter(n => !isNaN(n));

  return existing.length > 0 ? Math.max(...existing) + 1 : 1;
}

function saveResults(results, stage1RunNumber) {
  const runNumber = getNextStage2RunNumber();
  const runDir = resolve(STAGE2_RESULTS_DIR, `run-${runNumber}`);
  mkdirSync(runDir, { recursive: true });

  // Save each scene result
  for (const result of results) {
    const scenePath = resolve(runDir, `${result.scene}.json`);
    writeFileSync(scenePath, JSON.stringify(result, null, 2));
  }

  // Save summary
  const summary = {
    run: runNumber,
    stage1_run: stage1RunNumber,
    timestamp: new Date().toISOString(),
    total: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    scenes: results.map(r => ({
      id: r.scene,
      success: r.success,
      stage1_entities: r.stage1_entities,
      stage2_entities: r.stage2_entities,
      error: r.error || null
    }))
  };
  writeFileSync(resolve(runDir, '_summary.json'), JSON.stringify(summary, null, 2));

  console.log(`\nResults saved to: ${runDir}`);
}

function printSummary(results) {
  console.log('\n' + '='.repeat(60));
  console.log('STAGE 2 SUMMARY');
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

  // Entity filtering stats
  if (successful.length > 0) {
    let totalStage1 = 0;
    let totalStage2 = 0;

    successful.forEach(r => {
      totalStage1 += r.stage1_entities || 0;
      totalStage2 += r.stage2_entities || 0;
    });

    console.log(`\nEntity filtering:`);
    console.log(`  Stage 1 total: ${totalStage1}`);
    console.log(`  Stage 2 total: ${totalStage2}`);
    console.log(`  Filtered out: ${totalStage1 - totalStage2}`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node test-stage2.js [options]

Options:
  --run <n>           Use stage1 results from run N (default: latest)
  --scene <id>        Test only a specific scene
  --temperature <n>   Override temperature
  --model <name>      Override model
  --help              Show this help

Examples:
  node test-stage2.js                      # Use latest stage1 run
  node test-stage2.js --run 12             # Use specific stage1 run
  node test-stage2.js --scene scene-0-11   # Test one scene
`);
    process.exit(0);
  }

  // Parse args
  const config = { ...defaultConfig };
  let stage1RunNumber = null;
  let sceneFilter = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--run' && args[i + 1]) {
      stage1RunNumber = parseInt(args[i + 1], 10);
    } else if (args[i] === '--scene' && args[i + 1]) {
      sceneFilter = args[i + 1];
    } else if (args[i] === '--temperature' && args[i + 1]) {
      config.temperature = parseFloat(args[i + 1]);
    } else if (args[i] === '--model' && args[i + 1]) {
      config.model = args[i + 1];
    }
  }

  if (!stage1RunNumber) {
    stage1RunNumber = getLatestRunNumber();
  }

  console.log(`Loading stage2 prompt...`);
  const promptTemplate = await loadStage2Prompt();

  console.log(`Loading stage1 results from run-${stage1RunNumber}...`);
  let stage1Results = loadStage1Results(stage1RunNumber);

  if (sceneFilter) {
    stage1Results = stage1Results.filter(r => r.scene === sceneFilter);
    if (stage1Results.length === 0) {
      throw new Error(`Scene ${sceneFilter} not found in run-${stage1RunNumber}`);
    }
  }

  console.log(`\nConfig: model=${config.model}, temp=${config.temperature}`);
  console.log(`Testing ${stage1Results.length} scene(s) from stage1 run-${stage1RunNumber}...`);

  const results = [];

  for (const stage1Result of stage1Results) {
    const result = await testScene(stage1Result, promptTemplate, config);
    results.push(result);
  }

  printSummary(results);
  saveResults(results, stage1RunNumber);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
