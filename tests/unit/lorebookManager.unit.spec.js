/**
 * Unit tests for lorebookManager helper functions
 *
 * These are pure function tests that don't require SillyTavern integration.
 */

import { test, expect } from '@playwright/test';
import { isInternalEntry } from '../../lorebookManager.js';

test.describe('isInternalEntry', () => {

  test('returns true for registry entries with _registry_ prefix', () => {
    expect(isInternalEntry('_registry_character')).toBe(true);
    expect(isInternalEntry('_registry_location')).toBe(true);
    expect(isInternalEntry('_registry_faction')).toBe(true);
    expect(isInternalEntry('_registry_event')).toBe(true);
  });

  test('returns true for exact queue entry comment __operation_queue', () => {
    expect(isInternalEntry('__operation_queue')).toBe(true);
  });

  test('returns false for normal entry comments', () => {
    expect(isInternalEntry('Character: John')).toBe(false);
    expect(isInternalEntry('Location: Tavern')).toBe(false);
    expect(isInternalEntry('Some random comment')).toBe(false);
  });

  test('returns false for null or undefined comments', () => {
    expect(isInternalEntry(null)).toBe(false);
    expect(isInternalEntry(undefined)).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isInternalEntry('')).toBe(false);
  });

  test('returns false for non-string values', () => {
    expect(isInternalEntry(123)).toBe(false);
    expect(isInternalEntry({})).toBe(false);
    expect(isInternalEntry([])).toBe(false);
    expect(isInternalEntry(true)).toBe(false);
  });

  test('returns false for queue entry with wrong pattern', () => {
    // The old broken pattern (should NOT match)
    expect(isInternalEntry('_operations_queue_')).toBe(false);
    expect(isInternalEntry('_operations_queue_something')).toBe(false);
  });

  test('returns false for queue entry with partial match', () => {
    expect(isInternalEntry('__operation_queue_extra')).toBe(false);
    expect(isInternalEntry('prefix__operation_queue')).toBe(false);
    expect(isInternalEntry('operation_queue')).toBe(false);
  });

});
