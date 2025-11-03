// @flow
// Listens for SillyTavern world info entry loads and wraps each entry with XML tags

import { get_settings, getContext } from './index.js';

const WRAPPER_OPEN = '<lorebook ';
const WRAPPER_CLOSE = '</lorebook>';

let isListenerRegistered /*: boolean */ = false;

/**
 * Register listener that wraps lorebook entries as soon as they are loaded.
 */
export function installLorebookWrapper() /*: void */ {
    if (isListenerRegistered) {
        console.log('[Auto-Summarize:LorebookWrapper] Listener already installed, skipping');
        return;
    }

    try {
        const ctx = getContext();
        const eventSource = ctx?.eventSource;
        const event_types = ctx?.event_types;

        if (!eventSource || !event_types?.WORLDINFO_ENTRIES_LOADED) {
            console.warn('[Auto-Summarize:LorebookWrapper] Unable to install wrapper listener (missing eventSource or event type)');
            return;
        }

        eventSource.on(event_types.WORLDINFO_ENTRIES_LOADED, handleWorldInfoEntriesLoaded);
        isListenerRegistered = true;
        console.log('[Auto-Summarize:LorebookWrapper] ✓ Registered WORLDINFO_ENTRIES_LOADED listener');
    } catch (err) {
        console.error('[Auto-Summarize:LorebookWrapper] Failed to install wrapper listener:', err);
    }
}

/**
 * Wrap entries whenever SillyTavern finishes loading lore data.
 */
function handleWorldInfoEntriesLoaded(payload /*: any */) /*: void */ {
    try {
        if (!get_settings('wrap_lorebook_entries')) {
            return;
        }

        if (!payload || typeof payload !== 'object') {
            return;
        }

        const collections = [
            payload.globalLore,
            payload.characterLore,
            payload.chatLore,
            payload.personaLore,
        ];

        for (const collection of collections) {
            applyWrapperToCollection(collection);
        }
    } catch (err) {
        console.error('[Auto-Summarize:LorebookWrapper] Error handling WORLDINFO_ENTRIES_LOADED:', err);
    }
}

/**
 * Apply wrapping to every entry inside a collection.
 */
function applyWrapperToCollection(collection /*: any */) /*: void */ {
    if (!Array.isArray(collection)) {
        return;
    }

    for (const entry of collection) {
        wrapEntryContent(entry);
    }
}

/**
 * Wrap a single entry's content while preserving decorator lines.
 */
function wrapEntryContent(entry /*: any */) /*: void */ {
    if (!entry || typeof entry.content !== 'string') {
        return;
    }

    const normalized = normalizeNewlines(entry.content);
    const { decorators, body } = splitDecorators(normalized);

    if (!body || !body.trim()) {
        return;
    }

    if (isAlreadyWrapped(body)) {
        return;
    }

    const wrappedBody = wrapBody(body, entry);
    if (!wrappedBody) {
        return;
    }

    entry.content = decorators ? [decorators, wrappedBody].filter(Boolean).join('\n') : wrappedBody;
}

/**
 * Separate decorator lines (prefixed with @@) from the main body.
 */
function splitDecorators(content /*: string */) /*: { decorators: string, body: string } */ {
    if (!content.startsWith('@@')) {
        return { decorators: '', body: content };
    }

    const lines = content.split('\n');
    let bodyStartIndex = 0;

    while (bodyStartIndex < lines.length && lines[bodyStartIndex].startsWith('@@')) {
        bodyStartIndex += 1;
    }

    const decorators = lines.slice(0, bodyStartIndex).join('\n');
    const body = lines.slice(bodyStartIndex).join('\n');

    return { decorators, body };
}

/**
 * Build the wrapped lorebook body with XML metadata.
 */
function wrapBody(content /*: string */, entry /*: any */) /*: ?string */ {
    const normalized = content.replace(/\r/g, '');
    if (!normalized.trim()) {
        return null;
    }

    const inner = normalized.trimEnd();
    const name = escapeXML(entry?.comment || 'Unnamed Entry');
    const uid = escapeXML(String(entry?.uid ?? 'unknown'));
    const world = entry?.world ? ` world="${escapeXML(String(entry.world))}"` : '';

    return `<lorebook name="${name}" uid="${uid}"${world}>\n${inner}\n</lorebook>`;
}

/**
 * Best-effort detection of an already wrapped entry.
 */
function isAlreadyWrapped(content /*: string */) /*: boolean */ {
    const trimmed = content.trim();
    return trimmed.startsWith(WRAPPER_OPEN) && trimmed.endsWith(WRAPPER_CLOSE);
}

function normalizeNewlines(value /*: string */) /*: string */ {
    return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function escapeXML(str /*: any */) /*: string */ {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
