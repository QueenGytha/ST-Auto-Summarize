#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseLogFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');

    const durationMatch = content.match(/\*\*Total Duration:\*\*\s+([\d.]+)\s+seconds/);
    const promptTokensMatch = content.match(/\*\*Prompt Tokens:\*\*\s+([\d,]+)/);
    const completionTokensMatch = content.match(/\*\*Completion Tokens:\*\*\s+([\d,]+)/);

    const duration = durationMatch ? parseFloat(durationMatch[1]) : 0;
    const promptTokens = promptTokensMatch ? parseInt(promptTokensMatch[1].replace(/,/g, ''), 10) : 0;
    const completionTokens = completionTokensMatch ? parseInt(completionTokensMatch[1].replace(/,/g, ''), 10) : 0;

    return { duration, promptTokens, completionTokens };
}

function isSceneEndFile(fileName) {
    return fileName.includes('combine_scene_with_running');
}

function getOperationType(fileName) {
    if (fileName.includes('detect_scene_break')) return 'detect_scene_break';
    if (fileName.includes('generate_scene_recap')) return 'generate_scene_recap';
    if (fileName.includes('parse_scene_recap')) return 'parse_scene_recap';
    if (fileName.includes('lorebook_entry_lookup')) return 'lorebook_entry_lookup';
    if (fileName.includes('resolve_lorebook')) return 'resolve_lorebook';
    if (fileName.includes('merge_lorebook')) return 'merge_lorebook';
    if (fileName.includes('combine_scene_with_running')) return 'combine_scene_with_running';
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
    let totalDuration = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let filesProcessed = 0;

    const operationStats = {};

    for (const file of scene.files) {
        try {
            const { duration, promptTokens, completionTokens } = parseLogFile(file);
            const fileName = path.basename(file);
            const opType = getOperationType(fileName);

            if (!operationStats[opType]) {
                operationStats[opType] = {
                    count: 0,
                    duration: 0,
                    promptTokens: 0,
                    completionTokens: 0
                };
            }

            operationStats[opType].count++;
            operationStats[opType].duration += duration;
            operationStats[opType].promptTokens += promptTokens;
            operationStats[opType].completionTokens += completionTokens;

            totalDuration += duration;
            totalPromptTokens += promptTokens;
            totalCompletionTokens += completionTokens;
            filesProcessed++;
        } catch (error) {
            console.error(`  Warning: Failed to process ${path.basename(file)}: ${error.message}`);
        }
    }

    return {
        filesProcessed,
        totalDuration,
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

    let grandTotalDuration = 0;
    let grandTotalPromptTokens = 0;
    let grandTotalCompletionTokens = 0;
    let grandTotalFiles = 0;
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
        console.log(`Duration: ${stats.totalDuration.toFixed(3)} seconds (${(stats.totalDuration / 60).toFixed(2)} minutes)`);
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
                console.log(`    Duration: ${op.duration.toFixed(3)}s`);
                console.log(`    Prompt: ${op.promptTokens.toLocaleString()}, Completion: ${op.completionTokens.toLocaleString()}, Total: ${totalTokens.toLocaleString()}`);

                if (!grandOperationStats[opType]) {
                    grandOperationStats[opType] = {
                        count: 0,
                        duration: 0,
                        promptTokens: 0,
                        completionTokens: 0
                    };
                }
                grandOperationStats[opType].count += op.count;
                grandOperationStats[opType].duration += op.duration;
                grandOperationStats[opType].promptTokens += op.promptTokens;
                grandOperationStats[opType].completionTokens += op.completionTokens;
            }
            console.log();
        }

        grandTotalDuration += stats.totalDuration;
        grandTotalPromptTokens += stats.totalPromptTokens;
        grandTotalCompletionTokens += stats.totalCompletionTokens;
        grandTotalFiles += stats.filesProcessed;
    }

    const grandTotalTokens = grandTotalPromptTokens + grandTotalCompletionTokens;

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
            console.log(`    Duration: ${op.duration.toFixed(3)}s (${(op.duration / 60).toFixed(2)} minutes)`);
            console.log(`    Prompt: ${op.promptTokens.toLocaleString()}, Completion: ${op.completionTokens.toLocaleString()}, Total: ${totalTokens.toLocaleString()}`);
        }
        console.log();
    }

    console.log(`Total Files Processed: ${grandTotalFiles}`);
    console.log(`Total Scenes: ${scenes.length}`);
    console.log(`Total Duration: ${grandTotalDuration.toFixed(3)} seconds (${(grandTotalDuration / 60).toFixed(2)} minutes)`);
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
