#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import defaultConfig from './config.js';

const ENDPOINT = 'http://localhost:8765/opus6-claude/chat/completions';

function parseArgs(args) {
  const result = { file: null, overrides: {} };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[++i];

      if (key === 'temperature' || key === 'top-p' || key === 'top-k' ||
          key === 'presence-penalty' || key === 'frequency-penalty') {
        result.overrides[key.replace(/-/g, '_')] = parseFloat(value);
      } else if (key === 'max-tokens') {
        result.overrides.max_tokens = parseInt(value, 10);
      } else if (key === 'model') {
        result.overrides.model = value;
      }
    } else if (!result.file) {
      result.file = arg;
    }
  }

  return result;
}

function buildMessages(prompt) {
  const messages = [];

  if (prompt.system) {
    messages.push({ role: 'system', content: prompt.system });
  }

  if (prompt.user) {
    messages.push({ role: 'user', content: prompt.user });
  }

  if (prompt.prefill) {
    messages.push({ role: 'assistant', content: prompt.prefill });
  }

  return messages;
}

async function sendRequest(messages, config) {
  const payload = {
    messages,
    model: config.model,
    temperature: config.temperature,
    max_tokens: config.max_tokens,
    stream: config.stream,
    presence_penalty: config.presence_penalty,
    frequency_penalty: config.frequency_penalty,
    top_p: config.top_p,
    top_k: config.top_k
  };

  console.log('\n=== Request ===');
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`Model: ${config.model}`);
  console.log(`Temperature: ${config.temperature}`);
  console.log(`Max tokens: ${config.max_tokens}`);
  console.log(`Messages: ${messages.length}`);

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response.json();
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node test-prompt.js <prompt-file.json> [options]

Options:
  --temperature <n>     Override temperature (default: ${defaultConfig.temperature})
  --max-tokens <n>      Override max tokens (default: ${defaultConfig.max_tokens})
  --top-p <n>           Override top_p (default: ${defaultConfig.top_p})
  --top-k <n>           Override top_k (default: ${defaultConfig.top_k})
  --model <name>        Override model (default: ${defaultConfig.model})

Prompt file format (JSON):
{
  "system": "System message (optional)",
  "user": "User message (required)",
  "prefill": "Assistant prefill (optional)"
}

Example:
  node test-prompt.js prompts/sample.json --temperature 0.3
`);
    process.exit(0);
  }

  const { file, overrides } = parseArgs(args);

  if (!file) {
    console.error('Error: No prompt file specified');
    process.exit(1);
  }

  const config = { ...defaultConfig, ...overrides };

  let promptPath = file;
  if (!file.startsWith('/') && !file.match(/^[a-zA-Z]:/)) {
    promptPath = resolve(process.cwd(), file);
  }

  let prompt;
  try {
    const content = readFileSync(promptPath, 'utf-8');
    prompt = JSON.parse(content);
  } catch (err) {
    console.error(`Error reading prompt file: ${err.message}`);
    process.exit(1);
  }

  if (!prompt.user) {
    console.error('Error: Prompt file must have a "user" field');
    process.exit(1);
  }

  const messages = buildMessages(prompt);

  try {
    const result = await sendRequest(messages, config);

    console.log('\n=== Response ===');

    if (result.choices && result.choices[0]) {
      const content = result.choices[0].message?.content || result.choices[0].text || '';
      console.log(content);

      if (result.usage) {
        console.log('\n=== Usage ===');
        console.log(`Prompt tokens: ${result.usage.prompt_tokens}`);
        console.log(`Completion tokens: ${result.usage.completion_tokens}`);
        console.log(`Total tokens: ${result.usage.total_tokens}`);
      }
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.error(`\nRequest failed: ${err.message}`);
    process.exit(1);
  }
}

main();
