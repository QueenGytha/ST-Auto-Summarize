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

function isSceneBreakFile(fileName) {
    return fileName.includes('detect_scene_break');
}

function groupFilesByScene(files) {
    const scenes = [];
    let currentScene = null;

    for (const file of files) {
        const fileName = path.basename(file);

        if (isSceneBreakFile(fileName)) {
            if (!currentScene || currentScene.files.some(f => !isSceneBreakFile(path.basename(f)))) {
                currentScene = {
                    sceneBreakFiles: [],
                    files: [],
                    sceneNumber: scenes.length + 1
                };
                scenes.push(currentScene);
            }
            currentScene.sceneBreakFiles.push(file);
            currentScene.files.push(file);
        } else {
            if (!currentScene) {
                currentScene = {
                    sceneBreakFiles: [],
                    files: [],
                    sceneNumber: 0
                };
                scenes.push(currentScene);
            }
            currentScene.files.push(file);
        }
    }

    return scenes;
}

function analyzeScene(scene) {
    let totalDuration = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let filesProcessed = 0;

    for (const file of scene.files) {
        try {
            const { duration, promptTokens, completionTokens } = parseLogFile(file);
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
        totalTokens: totalPromptTokens + totalCompletionTokens
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

    for (const scene of scenes) {
        const sceneLabel = scene.sceneNumber === 0 ? 'Pre-Scene Logs' : `Scene ${scene.sceneNumber}`;
        const stats = analyzeScene(scene);

        console.log(`${'-'.repeat(60)}`);
        console.log(`${sceneLabel}`);
        console.log(`${'-'.repeat(60)}`);

        if (scene.sceneBreakFiles.length > 0) {
            console.log(`Scene Break Files (${scene.sceneBreakFiles.length}):`);
            for (const file of scene.sceneBreakFiles) {
                console.log(`  - ${path.basename(file)}`);
            }
        }

        console.log(`Files in Scene: ${stats.filesProcessed}`);
        console.log(`Duration: ${stats.totalDuration.toFixed(3)} seconds (${(stats.totalDuration / 60).toFixed(2)} minutes)`);
        console.log(`Prompt Tokens: ${stats.totalPromptTokens.toLocaleString()}`);
        console.log(`Completion Tokens: ${stats.totalCompletionTokens.toLocaleString()}`);
        console.log(`Total Tokens: ${stats.totalTokens.toLocaleString()}`);
        console.log();

        grandTotalDuration += stats.totalDuration;
        grandTotalPromptTokens += stats.totalPromptTokens;
        grandTotalCompletionTokens += stats.totalCompletionTokens;
        grandTotalFiles += stats.filesProcessed;
    }

    const grandTotalTokens = grandTotalPromptTokens + grandTotalCompletionTokens;

    console.log(`${'='.repeat(60)}`);
    console.log(`GRAND TOTALS`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Total Files Processed: ${grandTotalFiles}`);
    console.log(`Total Scenes: ${scenes.filter(s => s.sceneNumber > 0).length}`);
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
    console.log('\nThis script groups logs by scene breaks (detect_scene_break files).');
    console.log('Consecutive detect_scene_break files are treated as part of the same scene.');
    process.exit(1);
}

const logsFolder = args[0];
analyzeLogs(logsFolder);
