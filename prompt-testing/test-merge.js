#!/usr/bin/env node

/**
 * Lorebook merge tester - tests merging new entity content into existing entries
 * Usage: node test-merge.js [--stage4-run <n>] [--entity <name>]
 *
 * Simulates how lorebook entries evolve over time as new scene information
 * is merged in. Processes entities cumulatively - each scene's update to an
 * entity becomes the "existing content" for the next scene.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import defaultConfig from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ENDPOINT = 'http://localhost:8765/opus6-claude/chat/completions';
const STAGE4_RESULTS_DIR = resolve(__dirname, 'results-stage4');
const MERGE_RESULTS_DIR = resolve(__dirname, 'results-merge');

// Load the merge prompt template
async function loadMergePrompt() {
  const promptPath = resolve(__dirname, '../default-prompts/lorebook-recap-merge.js');
  const content = readFileSync(promptPath, 'utf-8');

  const match = content.match(/export const auto_lorebook_recap_merge_prompt = `([\s\S]*?)`;/);
  if (!match) {
    throw new Error('Could not parse merge prompt');
  }

  return match[1];
}

function loadStage4Lorebook(runNumber) {
  const lorebookPath = resolve(STAGE4_RESULTS_DIR, `run-${runNumber}`, '_lorebook.json');
  if (!existsSync(lorebookPath)) {
    throw new Error(`Stage4 run ${runNumber} lorebook not found`);
  }

  return JSON.parse(readFileSync(lorebookPath, 'utf-8'));
}

function loadStage4Results(runNumber) {
  const runDir = resolve(STAGE4_RESULTS_DIR, `run-${runNumber}`);
  if (!existsSync(runDir)) {
    throw new Error(`Stage4 run ${runNumber} not found`);
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

function buildPrompt(promptTemplate, entryName, existingContent, newContent, userName) {
  let prompt = promptTemplate;
  prompt = prompt.replace('{{entry_name}}', entryName);
  prompt = prompt.replace('{{existing_content}}', existingContent || '(empty - new entry)');
  prompt = prompt.replace('{{new_content}}', newContent);

  // Replace {{user}} with user name
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

// Extract userName from stage4 results (first non-null)
function extractUserName(stage4Results) {
  for (const result of stage4Results) {
    if (result.userName) {
      return result.userName;
    }
  }
  return null;
}

// Build timeline of entity updates from stage4 results
function buildEntityTimeline(stage4Results) {
  const timeline = {}; // entityName -> [{scene, content, type}]

  for (const sceneResult of stage4Results) {
    if (!sceneResult.success || !sceneResult.parsed?.entities) continue;

    for (const entity of sceneResult.parsed.entities) {
      const name = entity.n;
      if (!timeline[name]) {
        timeline[name] = [];
      }
      timeline[name].push({
        scene: sceneResult.scene,
        content: entity.c,
        type: entity.t,
        keywords: entity.k || []
      });
    }
  }

  return timeline;
}

async function testEntityMerges(entityName, updates, promptTemplate, config, userName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing merge evolution: ${entityName}`);
  if (userName && entityName === userName) {
    console.log(`(USER CHARACTER - should be sparse)`);
  }
  console.log(`Updates across ${updates.length} scene(s)`);
  console.log(`${'='.repeat(60)}`);

  const mergeResults = [];
  let currentContent = ''; // Start empty

  for (let i = 0; i < updates.length; i++) {
    const update = updates[i];
    const isFirst = i === 0;

    console.log(`\n--- Scene ${i + 1}/${updates.length}: ${update.scene} ---`);
    console.log(`Existing content: ${currentContent.length} chars`);
    console.log(`New content: ${update.content.length} chars`);

    if (isFirst) {
      // First appearance - no merge needed, just use content directly
      console.log(`First appearance - storing directly (no merge)`);
      currentContent = update.content;
      mergeResults.push({
        scene: update.scene,
        action: 'initial',
        existing_length: 0,
        new_length: update.content.length,
        merged_length: currentContent.length,
        content: currentContent
      });
      continue;
    }

    // Build and send merge prompt
    const userPrompt = buildPrompt(promptTemplate, entityName, currentContent, update.content, userName);

    const messages = [
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: 'Understood. Merging content while preserving what matters. Output JSON only:\n{' }
    ];

    const startTime = Date.now();

    try {
      const result = await sendRequest(messages, config);
      const duration = (Date.now() - startTime) / 1000;

      const { raw, parsed, error } = parseResponse(result);

      console.log(`Duration: ${duration.toFixed(2)}s, Tokens: ${result.usage?.total_tokens || 'N/A'}`);

      if (error) {
        console.log(`⚠️ Parse Error: ${error}`);
        mergeResults.push({
          scene: update.scene,
          action: 'error',
          error,
          raw
        });
        continue;
      }

      const mergedContent = parsed.mergedContent || '';
      const canonicalName = parsed.canonicalName;

      console.log(`✅ Merged: ${currentContent.length} + ${update.content.length} → ${mergedContent.length} chars`);
      if (canonicalName) {
        console.log(`Canonical name: ${canonicalName}`);
      }

      // Show content delta
      const delta = mergedContent.length - currentContent.length;
      const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
      console.log(`Content delta: ${deltaStr} chars`);

      mergeResults.push({
        scene: update.scene,
        action: 'merge',
        duration,
        tokens: result.usage?.total_tokens,
        existing_length: currentContent.length,
        new_length: update.content.length,
        merged_length: mergedContent.length,
        delta,
        canonicalName,
        content: mergedContent,
        raw
      });

      // Update current content for next iteration
      currentContent = mergedContent;

    } catch (err) {
      console.log(`❌ Request failed: ${err.message}`);
      mergeResults.push({
        scene: update.scene,
        action: 'error',
        error: err.message
      });
    }
  }

  return {
    entityName,
    type: updates[0]?.type,
    keywords: updates[updates.length - 1]?.keywords || [],
    totalScenes: updates.length,
    mergeResults,
    finalContent: currentContent
  };
}

function getNextMergeRunNumber() {
  if (!existsSync(MERGE_RESULTS_DIR)) {
    return 1;
  }

  const existing = readdirSync(MERGE_RESULTS_DIR)
    .filter(f => f.startsWith('run-'))
    .map(f => parseInt(f.replace('run-', ''), 10))
    .filter(n => !isNaN(n));

  return existing.length > 0 ? Math.max(...existing) + 1 : 1;
}

function saveResults(results, stage4RunNumber) {
  const runNumber = getNextMergeRunNumber();
  const runDir = resolve(MERGE_RESULTS_DIR, `run-${runNumber}`);
  mkdirSync(runDir, { recursive: true });

  // Save each entity's evolution
  for (const result of results) {
    const safeName = result.entityName.replace(/[^a-zA-Z0-9]/g, '_');
    const entityPath = resolve(runDir, `${safeName}.json`);
    writeFileSync(entityPath, JSON.stringify(result, null, 2));
  }

  // Save summary
  const summary = {
    run: runNumber,
    stage4_run: stage4RunNumber,
    timestamp: new Date().toISOString(),
    entities_tested: results.length,
    total_merges: results.reduce((sum, r) => sum + r.mergeResults.filter(m => m.action === 'merge').length, 0),
    entities: results.map(r => ({
      name: r.entityName,
      type: r.type,
      scenes: r.totalScenes,
      merges: r.mergeResults.filter(m => m.action === 'merge').length,
      final_length: r.finalContent?.length || 0
    }))
  };
  writeFileSync(resolve(runDir, '_summary.json'), JSON.stringify(summary, null, 2));

  console.log(`\nResults saved to: ${runDir}`);
}

function printSummary(results) {
  console.log('\n' + '='.repeat(60));
  console.log('MERGE TEST SUMMARY');
  console.log('='.repeat(60));

  console.log(`Entities tested: ${results.length}`);

  const totalMerges = results.reduce((sum, r) =>
    sum + r.mergeResults.filter(m => m.action === 'merge').length, 0);
  console.log(`Total merges performed: ${totalMerges}`);

  console.log('\nPer-entity summary:');
  for (const result of results) {
    const merges = result.mergeResults.filter(m => m.action === 'merge');
    const errors = result.mergeResults.filter(m => m.action === 'error');

    console.log(`\n  ${result.entityName} [${result.type}]:`);
    console.log(`    Appearances: ${result.totalScenes}`);
    console.log(`    Merges: ${merges.length}, Errors: ${errors.length}`);

    if (merges.length > 0) {
      const avgDelta = merges.reduce((sum, m) => sum + (m.delta || 0), 0) / merges.length;
      console.log(`    Avg content delta: ${avgDelta >= 0 ? '+' : ''}${avgDelta.toFixed(0)} chars`);
    }

    console.log(`    Final content: ${result.finalContent?.length || 0} chars`);

    // Show content evolution
    console.log(`    Evolution:`);
    for (const mr of result.mergeResults) {
      if (mr.action === 'initial') {
        console.log(`      ${mr.scene}: [initial] ${mr.content?.length || 0} chars`);
      } else if (mr.action === 'merge') {
        const delta = mr.delta >= 0 ? `+${mr.delta}` : mr.delta;
        console.log(`      ${mr.scene}: ${mr.existing_length} + ${mr.new_length} → ${mr.merged_length} (${delta})`);
      } else {
        console.log(`      ${mr.scene}: [error] ${mr.error}`);
      }
    }
  }

  // Show final content for each entity
  console.log('\n' + '='.repeat(60));
  console.log('FINAL ENTITY CONTENTS');
  console.log('='.repeat(60));

  for (const result of results) {
    console.log(`\n--- ${result.entityName} [${result.type}] ---`);
    console.log(result.finalContent || '(empty)');
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node test-merge.js [options]

Options:
  --stage4-run <n>    Use stage4 results from run N (default: latest)
  --entity <name>     Test only a specific entity
  --temperature <n>   Override temperature
  --model <name>      Override model
  --help              Show this help

Tests how lorebook entries evolve as new content is merged in across scenes.
Each entity that appears multiple times gets its merge history tracked.

Examples:
  node test-merge.js                        # Test all multi-scene entities
  node test-merge.js --entity Rance         # Test specific entity
  node test-merge.js --stage4-run 2         # Use specific stage4 run
`);
    process.exit(0);
  }

  const config = { ...defaultConfig };
  let stage4RunNumber = null;
  let entityFilter = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--stage4-run' && args[i + 1]) {
      stage4RunNumber = parseInt(args[i + 1], 10);
    } else if (args[i] === '--entity' && args[i + 1]) {
      entityFilter = args[i + 1];
    } else if (args[i] === '--temperature' && args[i + 1]) {
      config.temperature = parseFloat(args[i + 1]);
    } else if (args[i] === '--model' && args[i + 1]) {
      config.model = args[i + 1];
    }
  }

  if (!stage4RunNumber) {
    stage4RunNumber = getLatestRunNumber(STAGE4_RESULTS_DIR);
    if (!stage4RunNumber) {
      throw new Error('No stage4 results found');
    }
  }

  console.log(`Loading merge prompt...`);
  const promptTemplate = await loadMergePrompt();

  console.log(`Loading stage4 results from run-${stage4RunNumber}...`);
  const stage4Results = loadStage4Results(stage4RunNumber);

  // Extract user name for {{user}} macro
  const userName = extractUserName(stage4Results);
  if (userName) {
    console.log(`User character: ${userName}`);
  }

  // Build timeline of entity appearances
  const entityTimeline = buildEntityTimeline(stage4Results);

  // Filter to entities with multiple appearances (merges needed)
  let entitiesToTest = Object.entries(entityTimeline)
    .filter(([name, updates]) => updates.length > 1)
    .map(([name, updates]) => ({ name, updates }));

  if (entityFilter) {
    entitiesToTest = entitiesToTest.filter(e =>
      e.name.toLowerCase().includes(entityFilter.toLowerCase())
    );
    if (entitiesToTest.length === 0) {
      // Maybe they want a single-appearance entity?
      const singleEntity = entityTimeline[entityFilter];
      if (singleEntity) {
        console.log(`Entity "${entityFilter}" only appears once - no merges to test`);
        process.exit(0);
      }
      throw new Error(`Entity "${entityFilter}" not found`);
    }
  }

  if (entitiesToTest.length === 0) {
    console.log('No entities with multiple appearances found - nothing to merge');
    process.exit(0);
  }

  console.log(`\nConfig: model=${config.model}, temp=${config.temperature}`);
  console.log(`Testing ${entitiesToTest.length} entities with multiple appearances...`);

  const results = [];

  for (const { name, updates } of entitiesToTest) {
    const result = await testEntityMerges(name, updates, promptTemplate, config, userName);
    results.push(result);
  }

  printSummary(results);
  saveResults(results, stage4RunNumber);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
