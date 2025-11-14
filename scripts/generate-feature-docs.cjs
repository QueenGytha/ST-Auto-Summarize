#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Define feature categories based on the overview
const FEATURES = [
  {
    dir: 'core-recapping',
    title: 'Core Recapping Features',
    description: 'Per-message recap generation with auto-recap, batch processing, and custom prompts.',
    items: [
      'Per-message recaps',
      'Auto-recap',
      'Manual recap regeneration',
      'Batch processing',
      'Message history context',
      'Regenerate on edit/swipe',
      'Custom recap prompts',
      'Prefill support',
      'Connection profiles',
      'Completion presets'
    ]
  },
  {
    dir: 'memory-system',
    title: 'Memory System',
    description: 'Multi-tier memory injection system with short-term, long-term, combined, scene, and running scene recaps.',
    items: [
      'Short-term memory',
      'Long-term memory',
      'Combined recap',
      'Scene recaps',
      'Running scene recap'
    ]
  },
  {
    dir: 'scene-management',
    title: 'Scene Management',
    description: 'Scene break creation, auto-detection, navigation, and metadata tracking.',
    items: [
      'Manual scene breaks',
      'Auto scene detection',
      'Scene navigator bar',
      'Scene names',
      'Auto-hide old messages',
      'Scene metadata tracking'
    ]
  },
  {
    dir: 'validation-system',
    title: 'Validation System',
    description: 'Quality checking for recaps using secondary LLM passes.',
    items: [
      'Recap validation',
      'Type-specific validation',
      'Retry logic',
      'Custom validation prompts',
      'Independent presets'
    ]
  },
  {
    dir: 'configuration-profiles',
    title: 'Configuration & Profiles',
    description: 'Save, load, and manage multiple configuration profiles with per-character and per-chat auto-loading.',
    items: [
      'Configuration profiles',
      'Per-character profiles',
      'Per-chat profiles',
      'Import/export',
      'Profile management',
      'Switch notifications'
    ]
  },
  {
    dir: 'operation-queue',
    title: 'Operation Queue',
    description: 'Persistent async operation queue with priority handling and chat blocking.',
    items: [
      'Persistent queue',
      'Sequential processing',
      'Priority handling',
      'Queue controls',
      'Progress UI',
      'Chat blocking',
      'Queue slash commands',
      'Retry logic'
    ]
  },
  {
    dir: 'lorebook-integration',
    title: 'Lorebook Integration',
    description: 'Automated lorebook creation, entity extraction, and world info tracking.',
    items: [
      'Auto-create lorebooks',
      'Entry creation',
      'Entry merging',
      'Duplicate detection',
      'Entity extraction',
      'Entity types',
      'Registry management',
      'Entry viewer',
      'Lorebook wrapping',
      'World info tracking'
    ]
  },
  {
    dir: 'entity-tracking',
    title: 'Entity Tracking (AI-Editable)',
    description: 'AI-editable GM Notes and Character Stats via special syntax.',
    items: [
      'GM Notes',
      'Character Stats',
      'AI-editable syntax',
      'Auto-creation',
      'Merge prompts'
    ]
  },
  {
    dir: 'ui-display',
    title: 'UI & Display',
    description: 'Visual feedback, color-coded recaps, memory editor, and customization.',
    items: [
      'Color-coded message visuals',
      'Memory editor',
      'Popout settings',
      'Scene navigator',
      'Progress bars',
      'Toast notifications',
      'Custom CSS',
      'Injection preview'
    ]
  },
  {
    dir: 'message-integration',
    title: 'Message Integration',
    description: 'Message menu buttons, filtering, and event handling.',
    items: [
      'Message menu buttons',
      'Message filtering',
      'Group chat support',
      'Event handling',
      'Lorebook viewer button'
    ]
  },
  {
    dir: 'proxy-integration',
    title: 'Proxy Integration',
    description: 'First-hop proxy metadata injection for request logging.',
    items: [
      'First-hop proxy support',
      'Chat identification',
      'Operation tracking',
      'XML-tagged format',
      'Suppression option'
    ]
  },
  {
    dir: 'advanced-features',
    title: 'Advanced Features',
    description: 'World info tracking, persistence, migration, and developer features.',
    items: [
      'World info activation logging',
      'Sticky entry tracking',
      'Message data persistence',
      'Chat metadata',
      'Settings migration',
      'Connection profile UUIDs',
      'LLM client',
      'Token counting',
      'Verbose logging',
      'Per-chat enable/disable',
      'Global toggle state'
    ]
  },
  {
    dir: 'slash-commands',
    title: 'Slash Commands',
    description: 'Command-line interface for controlling the extension.',
    items: [
      'Memory commands',
      'UI commands',
      'Queue commands',
      'Debug commands'
    ]
  }
];

const DOCS_DIR = path.join(__dirname, '..', 'docs', 'features');

function generateOverviewContent(feature) {
  return `# ${feature.title}

${feature.description}

---

## Overview

[Content to be added - detailed explanation of ${feature.title.toLowerCase()}]

---

## Features

${feature.items.map(item => `- **${item}**`).join('\n')}

---

## Usage

[Content to be added - usage examples and guidelines]

---

## Configuration

[Content to be added - configuration options and settings]

---

## Examples

[Content to be added - code examples and use cases]

---

## Related Documentation

- [Main Feature Overview](../overall-overview.md)
- [Documentation Hub](../../README.md)

---

**Status:** Template - Needs detailed content
`;
}

function createFeatureDocs() {
  console.log('Generating feature documentation structure...\n');

  for (const feature of FEATURES) {
    const featureDir = path.join(DOCS_DIR, feature.dir);
    const overviewPath = path.join(featureDir, 'overview.md');

    // Create directory
    if (!fs.existsSync(featureDir)) {
      fs.mkdirSync(featureDir, { recursive: true });
      console.log(`✓ Created directory: ${feature.dir}/`);
    } else {
      console.log(`  Directory exists: ${feature.dir}/`);
    }

    // Create overview.md
    if (!fs.existsSync(overviewPath)) {
      const content = generateOverviewContent(feature);
      fs.writeFileSync(overviewPath, content, 'utf8');
      console.log(`✓ Created overview: ${feature.dir}/overview.md`);
    } else {
      console.log(`  Overview exists: ${feature.dir}/overview.md (skipping)`);
    }
  }

  console.log('\n✓ Feature documentation structure generated!');
  console.log(`\nGenerated ${FEATURES.length} feature directories under docs/features/`);
}

// Run the script
createFeatureDocs();
