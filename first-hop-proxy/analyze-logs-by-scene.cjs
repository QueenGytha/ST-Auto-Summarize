#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseLogFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');

    const durationMatch = content.match(/\*\*Total Duration:\*\*\s+([\d.]+)\s+seconds/);
    const startTimeMatch = content.match(/\*\*Start Time:\*\*\s+([\d.]+)/);
    const endTimeMatch = content.match(/\*\*End Time:\*\*\s+([\d.]+)/);
    const promptTokensMatch = content.match(/\*\*Prompt Tokens:\*\*\s+([\d,]+)/);
    const completionTokensMatch = content.match(/\*\*Completion Tokens:\*\*\s+([\d,]+)/);

    const timeLlm = durationMatch ? parseFloat(durationMatch[1]) : 0;
    const startTime = startTimeMatch ? parseFloat(startTimeMatch[1]) : null;
    const endTime = endTimeMatch ? parseFloat(endTimeMatch[1]) : null;
    const promptTokens = promptTokensMatch ? parseInt(promptTokensMatch[1].replace(/,/g, ''), 10) : 0;
    const completionTokens = completionTokensMatch ? parseInt(completionTokensMatch[1].replace(/,/g, ''), 10) : 0;

    return { timeLlm, startTime, endTime, promptTokens, completionTokens };
}

function isSceneEndFile(fileName) {
    return fileName.includes('combine_scene_with_running');
}

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
    // Format: NNNNN-operation_type-other_stuff.md
    const match = fileName.match(/^\d+-([a-z_]+)/i);
    if (match) {
        return `unknown:${match[1]}`;
    }

    return 'unknown';
}

function groupFilesByScene(files) {
    const scenes = [];
    let currentScene = {
        files: [],
        sceneNumber: 1,
        endingFile: null
    };
    scenes.push(currentScene);

    let hasSeenSceneEnd = false;

    for (const file of files) {
        const fileName = path.basename(file);
        const isSceneEnd = isSceneEndFile(fileName);

        // If we've seen a scene-ending file and this is NOT a scene-ending file,
        // then this is a new scene (the previous scene-ending files were retries)
        if (hasSeenSceneEnd && !isSceneEnd) {
            currentScene = {
                files: [],
                sceneNumber: scenes.length + 1,
                endingFile: null
            };
            scenes.push(currentScene);
            hasSeenSceneEnd = false;
        }

        currentScene.files.push(file);

        if (isSceneEnd) {
            currentScene.endingFile = fileName;
            hasSeenSceneEnd = true;
        }
    }

    if (currentScene.files.length === 0) {
        scenes.pop();
    }

    return scenes;
}

function analyzeScene(scene) {
    let totalTimeLlm = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let filesProcessed = 0;
    let sceneStartTime = null;
    let sceneEndTime = null;

    const operationStats = {};

    for (const file of scene.files) {
        try {
            const { timeLlm, startTime, endTime, promptTokens, completionTokens } = parseLogFile(file);
            const fileName = path.basename(file);
            const opType = getOperationType(fileName);

            if (!operationStats[opType]) {
                operationStats[opType] = {
                    count: 0,
                    timeLlm: 0,
                    promptTokens: 0,
                    completionTokens: 0
                };
            }

            operationStats[opType].count++;
            operationStats[opType].timeLlm += timeLlm;
            operationStats[opType].promptTokens += promptTokens;
            operationStats[opType].completionTokens += completionTokens;

            totalTimeLlm += timeLlm;
            totalPromptTokens += promptTokens;
            totalCompletionTokens += completionTokens;
            filesProcessed++;

            // Track scene start/end times
            if (startTime !== null && (sceneStartTime === null || startTime < sceneStartTime)) {
                sceneStartTime = startTime;
            }
            if (endTime !== null && (sceneEndTime === null || endTime > sceneEndTime)) {
                sceneEndTime = endTime;
            }
        } catch (error) {
            console.error(`  Warning: Failed to process ${path.basename(file)}: ${error.message}`);
        }
    }

    // Calculate time-total and time-st
    let timeTotal = null;
    let timeSt = null;
    if (sceneStartTime !== null && sceneEndTime !== null) {
        timeTotal = sceneEndTime - sceneStartTime;
        timeSt = timeTotal - totalTimeLlm;
    }

    return {
        filesProcessed,
        timeLlm: totalTimeLlm,
        timeTotal,
        timeSt,
        sceneStartTime,
        sceneEndTime,
        totalPromptTokens,
        totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
        operationStats
    };
}

function analyzeLogs(logsFolder) {
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

    const scenes = groupFilesByScene(files);

    console.log(`Processing ${files.length} log files across ${scenes.length} scene(s)...\n`);

    let grandTotalTimeLlm = 0;
    let grandTotalTimeTotal = 0;
    let grandTotalTimeSt = 0;
    let grandTotalPromptTokens = 0;
    let grandTotalCompletionTokens = 0;
    let grandTotalFiles = 0;
    let grandStartTime = null;
    let grandEndTime = null;
    const grandOperationStats = {};

    for (const scene of scenes) {
        const sceneLabel = `Scene ${scene.sceneNumber}`;
        const stats = analyzeScene(scene);

        console.log(`${'-'.repeat(60)}`);
        console.log(`${sceneLabel}`);
        if (scene.endingFile) {
            console.log(`Ending File: ${scene.endingFile}`);
        }
        console.log(`${'-'.repeat(60)}`);
        console.log(`Files in Scene: ${stats.filesProcessed}`);

        // Display timing information
        if (stats.timeTotal !== null) {
            console.log(`Time Total: ${stats.timeTotal.toFixed(3)}s (${(stats.timeTotal / 60).toFixed(2)} min) - wall clock time`);
            console.log(`Time LLM:   ${stats.timeLlm.toFixed(3)}s (${(stats.timeLlm / 60).toFixed(2)} min) - LLM API calls`);
            console.log(`Time ST:    ${stats.timeSt.toFixed(3)}s (${(stats.timeSt / 60).toFixed(2)} min) - SillyTavern processing`);
        } else {
            console.log(`Time LLM: ${stats.timeLlm.toFixed(3)}s (${(stats.timeLlm / 60).toFixed(2)} min) - (no timestamps for time-total)`);
        }

        console.log(`Prompt Tokens: ${stats.totalPromptTokens.toLocaleString()}`);
        console.log(`Completion Tokens: ${stats.totalCompletionTokens.toLocaleString()}`);
        console.log(`Total Tokens: ${stats.totalTokens.toLocaleString()}`);
        console.log();

        const opTypes = Object.keys(stats.operationStats).sort();
        if (opTypes.length > 0) {
            console.log(`Breakdown by Operation:`);
            for (const opType of opTypes) {
                const op = stats.operationStats[opType];
                const totalTokens = op.promptTokens + op.completionTokens;
                console.log(`  ${opType} (${op.count} file${op.count !== 1 ? 's' : ''}):`);
                console.log(`    Time LLM: ${op.timeLlm.toFixed(3)}s`);
                console.log(`    Prompt: ${op.promptTokens.toLocaleString()}, Completion: ${op.completionTokens.toLocaleString()}, Total: ${totalTokens.toLocaleString()}`);

                if (!grandOperationStats[opType]) {
                    grandOperationStats[opType] = {
                        count: 0,
                        timeLlm: 0,
                        promptTokens: 0,
                        completionTokens: 0
                    };
                }
                grandOperationStats[opType].count += op.count;
                grandOperationStats[opType].timeLlm += op.timeLlm;
                grandOperationStats[opType].promptTokens += op.promptTokens;
                grandOperationStats[opType].completionTokens += op.completionTokens;
            }
            console.log();
        }

        grandTotalTimeLlm += stats.timeLlm;
        if (stats.timeTotal !== null) {
            grandTotalTimeTotal += stats.timeTotal;
            grandTotalTimeSt += stats.timeSt;
        }
        grandTotalPromptTokens += stats.totalPromptTokens;
        grandTotalCompletionTokens += stats.totalCompletionTokens;
        grandTotalFiles += stats.filesProcessed;

        // Track overall start/end times for grand totals
        if (stats.sceneStartTime !== null && (grandStartTime === null || stats.sceneStartTime < grandStartTime)) {
            grandStartTime = stats.sceneStartTime;
        }
        if (stats.sceneEndTime !== null && (grandEndTime === null || stats.sceneEndTime > grandEndTime)) {
            grandEndTime = stats.sceneEndTime;
        }
    }

    const grandTotalTokens = grandTotalPromptTokens + grandTotalCompletionTokens;

    // Calculate actual wall clock time from first to last timestamp
    let actualWallClockTime = null;
    if (grandStartTime !== null && grandEndTime !== null) {
        actualWallClockTime = grandEndTime - grandStartTime;
    }

    console.log(`${'='.repeat(60)}`);
    console.log(`GRAND TOTALS`);
    console.log(`${'='.repeat(60)}`);

    const grandOpTypes = Object.keys(grandOperationStats).sort();
    if (grandOpTypes.length > 0) {
        console.log(`Breakdown by Operation (All Scenes):`);
        for (const opType of grandOpTypes) {
            const op = grandOperationStats[opType];
            const totalTokens = op.promptTokens + op.completionTokens;
            console.log(`  ${opType} (${op.count} file${op.count !== 1 ? 's' : ''}):`);
            console.log(`    Time LLM: ${op.timeLlm.toFixed(3)}s (${(op.timeLlm / 60).toFixed(2)} min)`);
            console.log(`    Prompt: ${op.promptTokens.toLocaleString()}, Completion: ${op.completionTokens.toLocaleString()}, Total: ${totalTokens.toLocaleString()}`);
        }
        console.log();
    }

    console.log(`Total Files Processed: ${grandTotalFiles}`);
    console.log(`Total Scenes: ${scenes.length}`);
    console.log();

    // Display grand total timing
    if (actualWallClockTime !== null) {
        const actualTimeSt = actualWallClockTime - grandTotalTimeLlm;
        console.log(`Time Total (wall clock): ${actualWallClockTime.toFixed(3)}s (${(actualWallClockTime / 60).toFixed(2)} min)`);
        console.log(`Time LLM (sum):          ${grandTotalTimeLlm.toFixed(3)}s (${(grandTotalTimeLlm / 60).toFixed(2)} min)`);
        console.log(`Time ST (calculated):    ${actualTimeSt.toFixed(3)}s (${(actualTimeSt / 60).toFixed(2)} min)`);
        console.log();
        console.log(`Time Total (sum of scenes): ${grandTotalTimeTotal.toFixed(3)}s (${(grandTotalTimeTotal / 60).toFixed(2)} min)`);
        console.log(`Time ST (sum of scenes):    ${grandTotalTimeSt.toFixed(3)}s (${(grandTotalTimeSt / 60).toFixed(2)} min)`);
    } else {
        console.log(`Time LLM: ${grandTotalTimeLlm.toFixed(3)}s (${(grandTotalTimeLlm / 60).toFixed(2)} min) - (no timestamps for time-total)`);
    }

    console.log();
    console.log(`Total Prompt Tokens: ${grandTotalPromptTokens.toLocaleString()}`);
    console.log(`Total Completion Tokens: ${grandTotalCompletionTokens.toLocaleString()}`);
    console.log(`Total Tokens: ${grandTotalTokens.toLocaleString()}`);
    console.log(`${'='.repeat(60)}\n`);
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('Usage: node analyze-logs-by-scene.cjs <logs-folder-path>');
    console.log('\nExample:');
    console.log('  node analyze-logs-by-scene.cjs "C:\\Users\\sarah\\...\\logs\\characters\\MyCharacter\\2025-11-16..."');
    console.log('\nThis script groups logs by scenes using combine_scene_with_running files as scene endings.');
    console.log('All logs up to and including the combine_scene_with_running file are part of that scene.');
    console.log('The next file after starts a new scene.');
    process.exit(1);
}

const logsFolder = args[0];
analyzeLogs(logsFolder);
