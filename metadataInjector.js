
// metadataInjector.js - System for injecting structured metadata into LLM prompts
// Metadata is added as JSON blocks that can be parsed and stripped by downstream proxies

import { getCurrentChatId } from '../../../../script.js';
import { selected_group, groups } from '../../../group-chats.js';
import { debug, SUBSYSTEM, should_send_chat_details } from './index.js';
import { resolveOperationsPreset, resolveOperationConfig, resolveActualProfileAndPreset } from './operationsPresetsResolution.js';

export function initMetadataInjector() {
  // No longer needs to import get_settings
}

export function getChatName() {
  try {
    // For single character chats, getCurrentChatId() returns the full identifier with timestamp
    // This matches what's used in Auto-Lorebooks naming: "CharacterName - YYYY-MM-DD@HHhMMmSSs"
    const chatId = getCurrentChatId();
    if (chatId && !selected_group) {
      return String(chatId).trim();
    }

    // For group chats, use group name
    if (selected_group) {
      const group = groups?.find((x) => x.id === selected_group);
      if (group && group.name) {
        return String(group.name).trim();
      }
    }

    // Fallback
    return 'Unknown';
  } catch (err) {
    console.error('[Auto-Recap:Metadata] Error getting chat name:', err);
    return 'Unknown';
  }
}

export async function isMetadataInjectionEnabled(operationType) {
  try {
    // Automatically detect if using first-hop proxy based on connection profile
    const enabled = await should_send_chat_details(operationType);
    debug(SUBSYSTEM.CORE, `[Metadata] Injection enabled for "${operationType}": ${enabled}`);
    return enabled === true;
  } catch (err) {
    console.error('[Auto-Recap:Metadata] Error checking if enabled:', err);
    return false; // Default to disabled
  }
}

export function getDefaultMetadata() {
  const chatName = getChatName();

  return {
    version: '1.0',
    chat: chatName
  };
}

function parseOperationType(operation) {
  if (!operation || typeof operation !== 'string') {
    return null;
  }

  const operationTypeMap = {
    'detect_scene_break_FORCED': 'auto_scene_break',
    'detect_scene_break': 'auto_scene_break',
    'generate_scene_recap': 'scene_recap',
    'scene_recap': 'scene_recap',
    'generate_running_recap': 'running_scene_recap',
    'running_scene_recap': 'running_scene_recap',
    'recap_merge': 'auto_lorebooks_recap_merge',
    'lorebook_entry_lookup': 'auto_lorebooks_recap_lorebook_entry_lookup',
    'lorebook_entry_deduplicate': 'auto_lorebooks_recap_lorebook_entry_deduplicate',
    'bulk_populate': 'auto_lorebooks_bulk_populate'
  };

  for (const [key, value] of Object.entries(operationTypeMap)) {
    if (operation.startsWith(key)) {
      return value;
    }
  }

  return null;
}

function buildTokenMetadata(tokenBreakdown) {
  return {
    max_context: tokenBreakdown.max_context || null,
    max_response: tokenBreakdown.max_tokens || null,
    available_for_prompt: tokenBreakdown.max_context || null,
    content: {
      preset: tokenBreakdown.preset || 0,
      system: tokenBreakdown.system || 0,
      user: tokenBreakdown.user || 0,
      prefill: tokenBreakdown.prefill || 0,
      lorebooks: tokenBreakdown.lorebooks || null,
      messages: tokenBreakdown.messages || null,
      subtotal: tokenBreakdown.content_subtotal || 0
    },
    overhead: {
      json_structure: tokenBreakdown.json_structure || 0,
      metadata: tokenBreakdown.metadata || 0,
      subtotal: tokenBreakdown.overhead_subtotal || 0
    },
    total: tokenBreakdown.total || 0
  };
}

function extractArtifactConfig(artifact, operationString) {
  const isForced = operationString && operationString.includes('_FORCED');

  if (isForced && artifact.forced_connection_profile !== undefined) {
    debug(SUBSYSTEM.CORE, `[Metadata] Using FORCED artifact config`);
    return {
      profileId: artifact.forced_connection_profile,
      presetName: artifact.forced_completion_preset_name,
      includePresetPrompts: artifact.forced_include_preset_prompts,
      isForced: true
    };
  }

  return {
    profileId: artifact.connection_profile,
    presetName: artifact.completion_preset_name,
    includePresetPrompts: artifact.include_preset_prompts,
    isForced: false
  };
}

function resolveArtifactMetadata(operationType, operationString) {
  if (!operationType) {
    return null;
  }

  debug(SUBSYSTEM.CORE, `[Metadata] Resolving artifact for operationType="${operationType}"`);
  const artifact = resolveOperationConfig(operationType);

  if (!artifact) {
    debug(SUBSYSTEM.CORE, `[Metadata] No artifact found for operationType="${operationType}"`);
    return null;
  }

  const { profileId, presetName, includePresetPrompts, isForced } = extractArtifactConfig(artifact, operationString);

  const { profileName, presetName: completionPresetName, usingSTCurrentProfile, usingSTCurrentPreset } =
    resolveActualProfileAndPreset(profileId, presetName);

  debug(SUBSYSTEM.CORE, `[Metadata] Artifact: ${artifact.name} v${artifact.internalVersion}, profile: ${profileName}, preset: ${completionPresetName}, includePresetPrompts: ${includePresetPrompts}`);

  const metadata = {
    operation_type: operationType,
    name: artifact.name,
    version: artifact.internalVersion,
    connection_profile: profileName,
    completion_preset: completionPresetName,
    include_preset_prompts: includePresetPrompts || false
  };

  if (isForced) {
    metadata.using_forced_config = true;
  }

  if (usingSTCurrentProfile) {
    metadata.using_st_current_profile = true;
  }

  if (usingSTCurrentPreset) {
    metadata.using_st_current_preset = true;
  }

  return metadata;
}

function addPresetAndArtifactMetadata(metadata, options) {
  try {
    const { presetName, source } = resolveOperationsPreset();
    metadata.operations_preset = {
      name: presetName,
      source: source
    };
    debug(SUBSYSTEM.CORE, `[Metadata] Operations preset: "${presetName}" (source: ${source})`);

    let operationType = options?.operationType;
    if (!operationType && options?.operation) {
      operationType = parseOperationType(options.operation);
    }

    const artifactMetadata = resolveArtifactMetadata(operationType, options?.operation);
    if (artifactMetadata) {
      metadata.artifact = artifactMetadata;
    } else if (!operationType) {
      debug(SUBSYSTEM.CORE, `[Metadata] No operationType available (operation: ${options?.operation}), skipping artifact info`);
    }
  } catch (err) {
    debug(SUBSYSTEM.CORE, '[Metadata] Failed to include operations preset/artifact info:', err);
  }
}

export function createMetadataBlock(options  = {}) {
  const metadata  = getDefaultMetadata();

  if (options?.operation) {
    metadata.operation = String(options.operation);
  }

  if (options?.includeTimestamp) {
    metadata.timestamp = new Date().toISOString();
  }

  if (options?.tokenBreakdown && typeof options.tokenBreakdown === 'object') {
    metadata.tokens = buildTokenMetadata(options.tokenBreakdown);
  }

  if (options?.custom && typeof options.custom === 'object') {
    metadata.custom = options.custom;
  }

  addPresetAndArtifactMetadata(metadata, options);

  return metadata;
}

export function formatMetadataBlock(metadata ) {
  try {
    const jsonStr = JSON.stringify(metadata, null, 2);
    return `<ST_METADATA>\n${jsonStr}\n</ST_METADATA>\n\n`;
  } catch (err) {
    console.error('[Auto-Recap:Metadata] Error formatting metadata block:', err);
    return '';
  }
}

export async function injectMetadata(
prompt ,
options  = {})
{
  try {
    // Check if injection is enabled
    if (!(await isMetadataInjectionEnabled(options?.operation))) {
      return prompt;
    }

    // Create metadata block
    const metadata = createMetadataBlock(options);

    // Format as string
    const metadataStr = formatMetadataBlock(metadata);

    // Prepend to prompt
    return metadataStr + prompt;

  } catch (err) {
    console.error('[Auto-Recap:Metadata] Error injecting metadata:', err);
    // Return original prompt on error
    return prompt;
  }
}

export function stripMetadata(prompt ) {
  try {
    return prompt.replace(/<ST_METADATA>[\s\S]*?<\/ST_METADATA>\n?\n?/g, '');
  } catch (err) {
    console.error('[Auto-Recap:Metadata] Error stripping metadata:', err);
    return prompt;
  }
}

export function hasExistingMetadata(chatArray ) {
  try {
    if (!Array.isArray(chatArray) || chatArray.length === 0) {
      return false;
    }

    // Check ALL messages, not just system messages
    for (const msg of chatArray) {
      if (typeof msg.content === 'string' && /<ST_METADATA>[\s\S]*?<\/ST_METADATA>/.test(msg.content)) {
        return true;
      }
    }

    return false;
  } catch (err) {
    console.error('[Auto-Recap:Metadata] Error checking existing metadata:', err);
    return false;
  }
}

export function getExistingOperation(chatArray ) {
  try {
    if (!Array.isArray(chatArray) || chatArray.length === 0) {
      return null;
    }

    // Check ALL messages, not just system messages
    for (const msg of chatArray) {
      if (typeof msg.content === 'string') {
        const match = msg.content.match(/<ST_METADATA>([\s\S]*?)<\/ST_METADATA>/);
        if (match) {
          const metadata = JSON.parse(match[1]);
          return metadata?.operation || null;
        }
      }
    }

    return null;
  } catch (err) {
    console.error('[Auto-Recap:Metadata] Error getting existing operation:', err);
    return null;
  }
}

export async function injectMetadataIntoChatArray(
chatArray ,
options  = {})
{
  try {
    if (!(await isMetadataInjectionEnabled(options?.operation))) {
      return;
    }

    if (!Array.isArray(chatArray) || chatArray.length === 0) {
      return;
    }

    // Check if metadata already exists
    const existingOperation = getExistingOperation(chatArray);

    if (existingOperation !== null) {
      // Metadata already exists
      if (options?.replaceIfChat === true) {
        // Only replace if existing is a chat-type operation
        if (!existingOperation.startsWith('chat')) {
          debug(SUBSYSTEM.CORE,'[Auto-Recap:Interceptor] Existing specific operation found, keeping it:', existingOperation);
          return; // Keep existing specific operation
        }
        debug(SUBSYSTEM.CORE,'[Auto-Recap:Interceptor] Replacing chat-type operation with specific operation');
        // Continue to replace chat-type with specific operation
      } else {
        // Don't replace, defer to existing
        debug(SUBSYSTEM.CORE,'[Auto-Recap:Interceptor] Metadata already exists, skipping injection');
        return;
      }
    }

    // Create metadata block
    const metadata = createMetadataBlock(options);
    const metadataStr = formatMetadataBlock(metadata);

    // Find first system message, or create one if none exists
    const firstSystemMessage = chatArray.find((msg) => msg.role === 'system');

    if (firstSystemMessage) {
      // Strip existing metadata if replacing
      if (existingOperation !== null) {
        firstSystemMessage.content = firstSystemMessage.content.replace(/<ST_METADATA>[\s\S]*?<\/ST_METADATA>\n?\n?/, '');
      }
      // Prepend to existing system message
      firstSystemMessage.content = metadataStr + firstSystemMessage.content;
      debug(SUBSYSTEM.CORE,'[Auto-Recap:Interceptor] Injected metadata into existing system message');
    } else {
      // No system message exists, insert at beginning
      chatArray.unshift({
        role: 'system',
        content: metadataStr
      });
      debug(SUBSYSTEM.CORE,'[Auto-Recap:Interceptor] Created new system message with metadata');
    }

    debug(SUBSYSTEM.CORE,'[Auto-Recap:Interceptor] Metadata:', JSON.stringify(metadata));
  } catch (err) {
    console.error('[Auto-Recap:Metadata] Error injecting metadata into chat array:', err);
  }
}