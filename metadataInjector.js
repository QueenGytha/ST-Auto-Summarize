
// metadataInjector.js - System for injecting structured metadata into LLM prompts
// Metadata is added as JSON blocks that can be parsed and stripped by downstream proxies

import { getCurrentChatId } from '../../../../script.js';
import { selected_group, groups } from '../../../group-chats.js';
import { debug, SUBSYSTEM, should_send_chat_details } from './index.js';

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

export async function isMetadataInjectionEnabled() {
  try {
    // Automatically detect if using first-hop proxy based on connection profile
    const enabled = await should_send_chat_details();
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

export function createMetadataBlock(options  = {}) {
  const metadata  = getDefaultMetadata();

  // Add operation type if provided
  if (options?.operation) {
    metadata.operation = String(options.operation);
  }

  // Add timestamp if requested
  if (options?.includeTimestamp) {
    metadata.timestamp = new Date().toISOString();
  }

  // Add custom fields if provided
  if (options?.custom && typeof options.custom === 'object') {
    metadata.custom = options.custom;
  }

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
    if (!(await isMetadataInjectionEnabled())) {
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
    if (!(await isMetadataInjectionEnabled())) {
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