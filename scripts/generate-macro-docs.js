#!/usr/bin/env node
/* eslint-disable no-console, no-undef, no-await-in-loop, no-magic-numbers -- Node.js build script: uses console for CLI output, process for exit codes, sequential file reading, and string manipulation constants */

import { readdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MACROS_DIR = join(__dirname, '..', 'macros');
const OUTPUT_FILE = join(__dirname, '..', 'MACROS.md');

async function extractMacroInfo(filePath) {
  const content = await readFile(filePath, 'utf-8');

  // Extract name
  const nameMatch = content.match(/export const name = ['"]([^'"]+)['"]/);
  if (!nameMatch) {return null;}
  const name = nameMatch[1];

  // Extract build function signature
  const buildMatch = content.match(/export function build\(([^)]*)\)/);
  const params = buildMatch ? buildMatch[1].trim() : '';

  // Extract description object (multi-line aware, handle nested braces)
  const descMatch = content.match(/export const description = \{([\s\S]*?)\n\};/);
  if (!descMatch) {return { name, params, description: null };}

  const descContent = descMatch[1];

  // Parse description fields (handle multi-line strings)
  const formatMatch = descContent.match(/format:\s*['"]([\s\S]*?)['"]\s*,/);
  const sourceMatch = descContent.match(/source:\s*['"]([\s\S]*?)['"]\s*,/);
  const usedByMatch = descContent.match(/usedBy:\s*\[([\s\S]*?)\]/);

  const format = formatMatch ? formatMatch[1].replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"') : '';
  const source = sourceMatch ? sourceMatch[1].replace(/\\n/g, '\n').replace(/\\'/g, "'") : '';
  const usedBy = usedByMatch
    ? usedByMatch[1].split(',').map(s => s.trim().replace(/['"]/g, ''))
    : [];

  return {
    name,
    params,
    description: { format, source, usedBy }
  };
}

async function generateDocs() {
  const files = await readdir(MACROS_DIR);
  const macroFiles = files.filter(f => f.endsWith('.js') && f !== 'index.js').sort();

  const macros = [];
  for (const file of macroFiles) {
    const filePath = join(MACROS_DIR, file);
    const info = await extractMacroInfo(filePath);
    if (info && info.description) {
      macros.push(info);
    }
  }

  // Generate markdown
  let md = `# Macro System Documentation

**Auto-generated from macro files in \`macros/\` folder**
**DO NOT EDIT MANUALLY - run \`npm run generate-macro-docs\` to regenerate**

## Overview

This document describes all available macros in the system. Macros are template variables that get substituted into prompts using the \`{{macro_name}}\` syntax.

Each macro:
- Is self-contained with zero dependencies
- Takes pre-processed data as input
- Returns a formatted string for prompt substitution
- Is automatically registered when added to the \`macros/\` folder

## Total Macros: ${macros.length}

`;

  // Group macros by category based on usedBy
  const categories = {
    'Scene Recap': [],
    'Running Scene Recap': [],
    'Scene Break Detection': [],
    'Lorebook Processing': [],
    'Lorebook Merge': [],
    'General': []
  };

  for (const macro of macros) {
    const usedBy = macro.description.usedBy.join(', ');
    if (usedBy.includes('scene-recap') || usedBy.includes('sceneBreak')) {
      categories['Scene Recap'].push(macro);
    } else if (usedBy.includes('running-scene-recap')) {
      categories['Running Scene Recap'].push(macro);
    } else if (usedBy.includes('scene-break-detection')) {
      categories['Scene Break Detection'].push(macro);
    } else if (usedBy.includes('lorebook')) {
      categories['Lorebook Processing'].push(macro);
    } else if (usedBy.includes('merge')) {
      categories['Lorebook Merge'].push(macro);
    } else {
      categories['General'].push(macro);
    }
  }

  // Write each category
  for (const [category, macroList] of Object.entries(categories)) {
    if (macroList.length === 0) {continue;}

    md += `\n## ${category} (${macroList.length} macros)\n\n`;

    for (const macro of macroList) {
      md += `### \`{{${macro.name}}}\`\n\n`;
      md += `**Function signature:** \`build(${macro.params})\`\n\n`;
      md += `**Input:** ${macro.description.source}\n\n`;
      md += `**Output format:**\n\`\`\`\n${macro.description.format}\n\`\`\`\n\n`;
      md += `**Used by:** ${macro.description.usedBy.join(', ')}\n\n`;
      md += `---\n\n`;
    }
  }

  // Add quick reference table at the end
  md += `\n## Quick Reference Table\n\n`;
  md += `| Macro Name | Input | Used By |\n`;
  md += `|------------|-------|----------|\n`;

  for (const macro of macros) {
    const shortSource = macro.description.source.length > 50
      ? macro.description.source.slice(0, 47) + '...'
      : macro.description.source;
    const usedBy = macro.description.usedBy.join(', ');
    md += `| \`${macro.name}\` | ${shortSource} | ${usedBy} |\n`;
  }

  md += `\n\n## Adding New Macros\n\n`;
  md += `1. Create a new file in \`macros/\` folder: \`macros/your_macro.js\`\n`;
  md += `2. Export \`name\`, \`build()\` function, and \`description\` object\n`;
  md += `3. Run \`npm run generate-macros\` to register it\n`;
  md += `4. Run \`npm run generate-macro-docs\` to update this documentation\n`;
  md += `5. Both commands run automatically on git pre-commit\n\n`;

  md += `**Example macro file:**\n\`\`\`javascript\n`;
  md += `export const name = 'my_macro';\n\n`;
  md += `export function build(inputData) {\n`;
  md += `  // Your transformation logic here\n`;
  md += `  return String(inputData);\n`;
  md += `}\n\n`;
  md += `export const description = {\n`;
  md += `  format: 'Plain text string',\n`;
  md += `  source: 'Takes a string or number',\n`;
  md += `  usedBy: ['your-operation.js']\n`;
  md += `};\n`;
  md += `\`\`\`\n`;

  await writeFile(OUTPUT_FILE, md, 'utf-8');
  console.log(`✓ Generated MACROS.md with ${macros.length} macros`);
}

generateDocs().catch(err => {
  console.error('Error generating macro docs:', err);
  process.exit(1);
});
