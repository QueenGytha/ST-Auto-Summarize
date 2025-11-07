
// metadataInjector.js - System for injecting structured metadata into LLM prompts
// Metadata is added as JSON blocks that can be parsed and stripped by downstream proxies

import { getCurrentChatId } from '../../../../script.js';
import { selected_group, groups } from '../../../group-chats.js';
import { debug, SUBSYSTEM } from './index.js';

// Will be imported from index.js via barrel exports
let get_settings ;

export function initMetadataInjector(utils ) {
  get_settings = utils.get_settings;
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
    console.error('[Auto-Summarize:Metadata] Error getting chat name:', err);
    return 'Unknown';
  }
}

export function isMetadataInjectionEnabled() {
  try {
    // get_settings expects a key parameter
    const enabled = get_settings('first_hop_proxy_send_chat_details');
    return enabled === true;
  } catch (err) {
    console.error('[Auto-Summarize:Metadata] Error checking if enabled:', err);
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
    console.error('[Auto-Summarize:Metadata] Error formatting metadata block:', err);
    return '';
  }
}

export function injectMetadata(
prompt ,
options  = {})
{
  try {
    // Check if injection is enabled
    if (!isMetadataInjectionEnabled()) {
      return prompt;
    }

    // Create metadata block
    const metadata = createMetadataBlock(options);

    // Format as string
    const metadataStr = formatMetadataBlock(metadata);

    // Prepend to prompt
    return metadataStr + prompt;

  } catch (err) {
    console.error('[Auto-Summarize:Metadata] Error injecting metadata:', err);
    // Return original prompt on error
    return prompt;
  }
}

export function stripMetadata(prompt ) {
  try {
    return prompt.replace(/<ST_METADATA>[\s\S]*?<\/ST_METADATA>\n?\n?/g, '');
  } catch (err) {
    console.error('[Auto-Summarize:Metadata] Error stripping metadata:', err);
    return prompt;
  }
}

export function injectMetadataIntoChatArray(
chatArray ,
options  = {})
{
  try {
    if (!isMetadataInjectionEnabled()) {
      return;
    }

    if (!Array.isArray(chatArray) || chatArray.length === 0) {
      return;
    }

    // Create metadata block
    const metadata = createMetadataBlock(options);
    const metadataStr = formatMetadataBlock(metadata);

    // Find first system message, or create one if none exists
    const firstSystemMessage = chatArray.find((msg) => msg.role === 'system');

    if (firstSystemMessage) {
      // Prepend to existing system message
      firstSystemMessage.content = metadataStr + firstSystemMessage.content;
      debug(SUBSYSTEM.CORE,'[Auto-Summarize:Interceptor] Injected metadata into existing system message');
    } else {
      // No system message exists, insert at beginning
      chatArray.unshift({
        role: 'system',
        content: metadataStr
      });
      debug(SUBSYSTEM.CORE,'[Auto-Summarize:Interceptor] Created new system message with metadata');
    }

    debug(SUBSYSTEM.CORE,'[Auto-Summarize:Interceptor] Metadata:', JSON.stringify(metadata));
  } catch (err) {
    console.error('[Auto-Summarize:Metadata] Error injecting metadata into chat array:', err);
  }
}