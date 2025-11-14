#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.join(__dirname, '..', 'docs', 'features');
const OVERVIEW_FILE = path.join(DOCS_DIR, 'overall-overview.md');

// Category mapping to directory names
const CATEGORY_DIRS = {
  'Recap Generation': 'recap-generation',
  'Memory Injection': 'memory-injection',
  'UI/Visual': 'ui-visual',
  'Automation': 'automation',
  'Profile/Configuration': 'profile-configuration',
  'Settings Migration': 'settings-migration',
  'Scene Management': 'scene-management',
  'Operation Queue': 'operation-queue',
  'Lorebook Integration': 'lorebook-integration',
  'Entity Types Management': 'entity-types-management',
  'LLM Client': 'llm-client',
  'Advanced': 'advanced',
  'Validation': 'validation',
  'Message Integration': 'message-integration',
  'Slash Command': 'slash-command',
  'Event Handling': 'event-handling',
  'Supporting/Internal': 'supporting-internal'
};

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseFeatures() {
  const content = fs.readFileSync(OVERVIEW_FILE, 'utf8');

  // Find the detailed inventory section
  const detailsMatch = content.match(/<details>[\s\S]*?<\/details>/);
  if (!detailsMatch) {
    throw new Error('Could not find detailed inventory section');
  }

  const detailsContent = detailsMatch[0];

  // Extract features using regex
  const featureRegex = /### (\d+)\. (.+?)\n\*\*Description:\*\* (.+?)\n\*\*Category:\*\* (.+?)(?:\n|$)/gs;

  const features = [];
  let match;

  while ((match = featureRegex.exec(detailsContent)) !== null) {
    const [, number, name, description, category] = match;
    features.push({
      number: parseInt(number),
      name: name.trim(),
      description: description.trim(),
      category: category.trim()
    });
  }

  console.log(`Parsed ${features.length} features from detailed inventory\n`);
  return features;
}

function generateFeatureOverview(feature) {
  return `# ${feature.name}

**Feature #${feature.number}**
**Category:** ${feature.category}

---

## Description

${feature.description}

---

## Overview

[Detailed explanation to be added]

---

## Usage

[Usage examples and guidelines to be added]

---

## Configuration

[Configuration options and settings to be added]

---

## Examples

[Code examples and use cases to be added]

---

## Related Documentation

- [${feature.category} Features](../README.md)
- [Main Feature Overview](../../overall-overview.md)
- [Documentation Hub](../../../README.md)

---

**Status:** Extracted from detailed inventory - Needs detailed content
`;
}

function createFeatureStructure() {
  console.log('Extracting features from detailed inventory...\n');

  const features = parseFeatures();

  // Group features by category
  const byCategory = {};
  for (const feature of features) {
    if (!byCategory[feature.category]) {
      byCategory[feature.category] = [];
    }
    byCategory[feature.category].push(feature);
  }

  console.log('Creating directory structure...\n');

  let created = 0;
  let skipped = 0;

  for (const [category, categoryFeatures] of Object.entries(byCategory)) {
    const categoryDir = CATEGORY_DIRS[category];
    if (!categoryDir) {
      console.log(`⚠ No directory mapping for category: ${category}`);
      continue;
    }

    const categoryPath = path.join(DOCS_DIR, categoryDir);

    // Create category directory
    if (!fs.existsSync(categoryPath)) {
      fs.mkdirSync(categoryPath, { recursive: true });
    }

    // Create category README
    const categoryReadmePath = path.join(categoryPath, 'README.md');
    if (!fs.existsSync(categoryReadmePath)) {
      const categoryReadme = `# ${category} Features

This directory contains ${categoryFeatures.length} feature(s) in the ${category} category.

## Features

${categoryFeatures.map(f => `- [${f.name}](./${slugify(f.name)}/overview.md) - ${f.description}`).join('\n')}

---

[Back to Feature Overview](../overall-overview.md)
`;
      fs.writeFileSync(categoryReadmePath, categoryReadme, 'utf8');
      console.log(`✓ Created ${categoryDir}/README.md`);
    }

    // Create feature directories and overview.md files
    for (const feature of categoryFeatures) {
      const featureSlug = slugify(feature.name);
      const featurePath = path.join(categoryPath, featureSlug);
      const overviewPath = path.join(featurePath, 'overview.md');

      // Create feature directory
      if (!fs.existsSync(featurePath)) {
        fs.mkdirSync(featurePath, { recursive: true });
      }

      // Create overview.md
      if (!fs.existsSync(overviewPath)) {
        const content = generateFeatureOverview(feature);
        fs.writeFileSync(overviewPath, content, 'utf8');
        created++;
      } else {
        skipped++;
      }
    }
  }

  console.log(`\n✓ Feature extraction complete!`);
  console.log(`  Created: ${created} feature overview files`);
  console.log(`  Skipped: ${skipped} existing files`);
  console.log(`  Total features: ${features.length}`);
  console.log(`  Categories: ${Object.keys(byCategory).length}`);
}

// Run the script
try {
  createFeatureStructure();
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
