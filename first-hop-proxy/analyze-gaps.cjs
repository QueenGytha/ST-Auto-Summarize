#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// All operation types from operationTypes.js
const KNOWN_OPERATION_TYPES = [
    'validate_recap',
    'detect_scene_break',
    'detect_scene_break_backwards',
    'generate_scene_recap',
    'organize_scene_recap',
    'parse_scene_recap',
    'filter_scene_recap_sl',
    'generate_running_recap',
    'combine_scene_with_running',
    'lorebook_entry_lookup',
    'resolve_lorebook_entry',
    'create_lorebook_entry',
    'merge_lorebook_entry',
    'auto_lorebooks_recap_lorebook_entry_compaction',
    'populate_registries',
    'update_lorebook_registry',
    'update_lorebook_snapshot',
    'chat'
];

// Variants that should be tracked separately (suffixes to base operation types)
const TRACKED_VARIANTS = ['_FORCED'];

function getOperationType(fileName) {
    // Check each known operation type (longer matches first to avoid partial matches)
    const sortedTypes = [...KNOWN_OPERATION_TYPES].sort((a, b) => b.length - a.length);

    for (const opType of sortedTypes) {
        if (fileName.includes(opType)) {
            // Check for tracked variants
            for (const variant of TRACKED_VARIANTS) {
                if (fileName.includes(opType + variant)) {
                    return opType + variant;
                }
            }
            return opType;
        }
    }

    // Extract what appears to be the operation type for unknown cases
    const match = fileName.match(/^\d+-([a-z_]+)/i);
    if (match) {
        return `unknown:${match[1]}`;
    }

    return 'unknown';
}

function parseLogFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');

    const startTimeMatch = content.match(/\*\*Start Time:\*\*\s+([\d.]+)/);
    const endTimeMatch = content.match(/\*\*End Time:\*\*\s+([\d.]+)/);

    const startTime = startTimeMatch ? parseFloat(startTimeMatch[1]) : null;
    const endTime = endTimeMatch ? parseFloat(endTimeMatch[1]) : null;

    return { startTime, endTime };
}

function analyzeGaps(logsFolder) {
    if (!fs.existsSync(logsFolder)) {
        console.error(`Error: Folder does not exist: ${logsFolder}`);
        process.exit(1);
    }

    const stat = fs.statSync(logsFolder);
    if (!stat.isDirectory()) {
        console.error(`Error: Path is not a directory: ${logsFolder}`);
        process.exit(1);
    }

    const files = fs.readdirSync(logsFolder)
        .filter(file => file.endsWith('.md'))
        .sort()
        .map(file => path.join(logsFolder, file));

    if (files.length === 0) {
        console.error(`Error: No .md files found in ${logsFolder}`);
        process.exit(1);
    }

    // Parse all files and collect timing data
    const operations = [];
    for (const file of files) {
        const fileName = path.basename(file);
        const opType = getOperationType(fileName);
        const { startTime, endTime } = parseLogFile(file);

        if (startTime !== null && endTime !== null) {
            operations.push({
                fileName,
                opType,
                startTime,
                endTime
            });
        }
    }

    // Sort by start time
    operations.sort((a, b) => a.startTime - b.startTime);

    console.log(`Processing ${operations.length} operations with valid timestamps...\n`);

    // Calculate gaps between ALL consecutive operations
    // Key format: "from_op -> to_op" (includes same-type like "A -> A")
    const allTransitions = {};
    const allGapsList = [];

    for (let i = 0; i < operations.length - 1; i++) {
        const current = operations[i];
        const next = operations[i + 1];

        const gap = next.startTime - current.endTime;

        // Only count positive gaps (negative means overlap/parallel execution)
        if (gap > 0) {
            const transitionKey = `${current.opType} -> ${next.opType}`;

            if (!allTransitions[transitionKey]) {
                allTransitions[transitionKey] = { totalGap: 0, count: 0, gaps: [] };
            }
            allTransitions[transitionKey].totalGap += gap;
            allTransitions[transitionKey].count++;
            allTransitions[transitionKey].gaps.push({
                gap,
                afterFile: current.fileName,
                beforeFile: next.fileName
            });

            allGapsList.push({
                gap,
                afterFile: current.fileName,
                beforeFile: next.fileName,
                transition: transitionKey
            });
        }
    }

    // Calculate totals
    let totalGapTime = 0;
    let totalGapCount = 0;

    for (const key of Object.keys(allTransitions)) {
        totalGapTime += allTransitions[key].totalGap;
        totalGapCount += allTransitions[key].count;
    }

    // Display ALL transitions sorted by total time
    console.log(`${'='.repeat(80)}`);
    console.log(`ALL TRANSITIONS (sorted by total gap time)`);
    console.log(`${'='.repeat(80)}\n`);

    const sortedKeys = Object.keys(allTransitions).sort((a, b) => {
        return allTransitions[b].totalGap - allTransitions[a].totalGap;
    });

    for (const key of sortedKeys) {
        const stats = allTransitions[key];
        const avg = stats.totalGap / stats.count;
        const pct = (stats.totalGap / totalGapTime * 100).toFixed(1);

        console.log(`${key}:`);
        console.log(`  Count: ${stats.count}, Total: ${stats.totalGap.toFixed(3)}s (${(stats.totalGap / 60).toFixed(2)} min), Avg: ${avg.toFixed(3)}s - ${pct}%`);
    }
    console.log();

    // Show largest individual gaps
    console.log(`${'='.repeat(80)}`);
    console.log(`TOP 20 LARGEST INDIVIDUAL GAPS`);
    console.log(`${'='.repeat(80)}\n`);

    allGapsList.sort((a, b) => b.gap - a.gap);

    for (let i = 0; i < Math.min(20, allGapsList.length); i++) {
        const g = allGapsList[i];
        console.log(`${(i + 1).toString().padStart(2)}. ${g.gap.toFixed(3)}s - ${g.transition}`);
        console.log(`    After: ${g.afterFile}`);
        console.log(`    Before: ${g.beforeFile}`);
    }

    // Summary
    console.log();
    console.log(`${'='.repeat(80)}`);
    console.log(`SUMMARY`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Total operations: ${operations.length}`);
    console.log(`Total gaps analyzed: ${totalGapCount}`);
    console.log(`Total gap time: ${totalGapTime.toFixed(3)}s (${(totalGapTime / 60).toFixed(2)} min)`);
    console.log(`Average gap: ${(totalGapTime / totalGapCount).toFixed(3)}s`);

    // Calculate wall clock time
    if (operations.length > 0) {
        const wallClock = operations[operations.length - 1].endTime - operations[0].startTime;
        const totalLlmTime = operations.reduce((sum, op) => sum + (op.endTime - op.startTime), 0);
        console.log(`\nWall clock time: ${wallClock.toFixed(3)}s (${(wallClock / 60).toFixed(2)} min)`);
        console.log(`Total LLM time: ${totalLlmTime.toFixed(3)}s (${(totalLlmTime / 60).toFixed(2)} min)`);
        console.log(`Gap time as % of wall clock: ${(totalGapTime / wallClock * 100).toFixed(1)}%`);
    }
    console.log(`${'='.repeat(80)}\n`);
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('Usage: node analyze-gaps.cjs <logs-folder-path>');
    console.log('\nAnalyzes the time gaps between consecutive LLM operations.');
    console.log('This helps identify where SillyTavern processing time is spent.');
    console.log('\nThe script shows:');
    console.log('  - Gaps by following operation: ST processing before each op type starts');
    console.log('  - Gaps by preceding operation: ST processing after each op type ends');
    console.log('  - Top 20 largest individual gaps');
    process.exit(1);
}

const logsFolder = args[0];
analyzeGaps(logsFolder);
