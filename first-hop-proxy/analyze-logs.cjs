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
        .map(file => path.join(logsFolder, file));

    if (files.length === 0) {
        console.error(`Error: No .md files found in ${logsFolder}`);
        process.exit(1);
    }

    let totalDuration = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let filesProcessed = 0;

    console.log(`Processing ${files.length} log files...\n`);

    for (const file of files) {
        try {
            const { duration, promptTokens, completionTokens } = parseLogFile(file);
            totalDuration += duration;
            totalPromptTokens += promptTokens;
            totalCompletionTokens += completionTokens;
            filesProcessed++;

            if (duration > 0 || promptTokens > 0 || completionTokens > 0) {
                console.log(`  ${path.basename(file)}: ${duration}s, ${promptTokens.toLocaleString()} prompt + ${completionTokens.toLocaleString()} completion tokens`);
            }
        } catch (error) {
            console.error(`  Warning: Failed to process ${path.basename(file)}: ${error.message}`);
        }
    }

    const totalTokens = totalPromptTokens + totalCompletionTokens;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Files Processed: ${filesProcessed}`);
    console.log(`Total Duration: ${totalDuration.toFixed(3)} seconds (${(totalDuration / 60).toFixed(2)} minutes)`);
    console.log(`Total Prompt Tokens: ${totalPromptTokens.toLocaleString()}`);
    console.log(`Total Completion Tokens: ${totalCompletionTokens.toLocaleString()}`);
    console.log(`Total Tokens: ${totalTokens.toLocaleString()}`);
    console.log(`${'='.repeat(60)}\n`);
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('Usage: node analyze-logs.js <logs-folder-path>');
    console.log('\nExample:');
    console.log('  node analyze-logs.js "C:\\Users\\sarah\\...\\logs\\characters\\MyCharacter\\2025-11-16..."');
    process.exit(1);
}

const logsFolder = args[0];
analyzeLogs(logsFolder);
