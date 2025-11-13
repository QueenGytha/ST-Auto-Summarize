// connection-manager-blocking.spec.js
// Tests for ConnectionManagerRequestService migration with correct blocking logic
// BLOCKING LOGIC: Empty profile (same as current) → BLOCKS (conflict), Non-empty → DOESN'T BLOCK (concurrent)

import { test, expect } from '@playwright/test';
import { selectorsSillyTavern } from '../../selectorsSillyTavern.js';

test.describe('ConnectionManager Blocking Logic', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to SillyTavern and ensure extension is loaded
    await page.goto('http://localhost:8000');
    await page.waitForSelector(selectorsSillyTavern.chat.input, { timeout: 30000 });

    // Enable auto-recap extension
    await page.evaluate(() => {
      const settings = SillyTavern.getContext().extensionSettings.auto_recap;
      settings.enabled = true;
    });
  });

  test('Empty profile setting blocks chat (prevents conflict on same connection)', async ({ page }) => {
    // Setup: User on main profile, recap also uses "same as current" (empty)
    await page.evaluate(() => {
      const settings = SillyTavern.getContext().extensionSettings.auto_recap;
      settings.scene_recap_connection_profile = '';  // Same as current
    });

    // Queue scene recap operation
    await page.evaluate(() => {
      const { enqueueOperation, OperationType, OperationPriority } = window.AutoRecap;
      return enqueueOperation({
        type: OperationType.GENERATE_SCENE_RECAP,
        priority: OperationPriority.NORMAL,
        metadata: { test: 'blocking-test' }
      });
    });

    // ASSERT: Chat UI IS BLOCKED (operation uses same profile as user)
    const isBlocked = await page.evaluate(() => {
      return window.AutoRecap.isChatBlockedByQueue();
    });
    expect(isBlocked).toBe(true);

    // ASSERT: Send button is hidden/disabled
    const sendButtonVisible = await page.locator(selectorsSillyTavern.buttons.send).isVisible();
    expect(sendButtonVisible).toBe(false);

    // Wait for operation to complete
    await page.waitForFunction(() => {
      return window.AutoRecap.isChatBlockedByQueue() === false;
    }, { timeout: 60000 });

    // ASSERT: Chat unblocked after completion
    const isUnblocked = await page.evaluate(() => {
      return window.AutoRecap.isChatBlockedByQueue();
    });
    expect(isUnblocked).toBe(false);
  });

  test('Different profile setting does NOT block chat (concurrent operation)', async ({ page }) => {
    // Setup: Get a different profile UUID from Connection Manager
    const differentProfileId = await page.evaluate(() => {
      const ctx = SillyTavern.getContext();
      const profiles = ctx.extensionSettings.connectionManager?.profiles || [];

      // Find any profile that's not the current one
      const currentProfile = ctx.extensionSettings.connectionProfile;
      const differentProfile = profiles.find(p => p.id !== currentProfile);

      if (!differentProfile) {
        throw new Error('No different profile available for testing. Please configure multiple Connection Manager profiles.');
      }

      return differentProfile.id;
    });

    // Set recap to use different profile
    await page.evaluate((profileId) => {
      const settings = SillyTavern.getContext().extensionSettings.auto_recap;
      settings.scene_recap_connection_profile = profileId;  // Different profile
    }, differentProfileId);

    // Queue scene recap operation
    await page.evaluate(() => {
      const { enqueueOperation, OperationType, OperationPriority } = window.AutoRecap;
      return enqueueOperation({
        type: OperationType.GENERATE_SCENE_RECAP,
        priority: OperationPriority.NORMAL,
        metadata: { test: 'non-blocking-test' }
      });
    });

    // ASSERT: Chat UI is NOT BLOCKED (operation uses separate profile)
    const isBlocked = await page.evaluate(() => {
      return window.AutoRecap.isChatBlockedByQueue();
    });
    expect(isBlocked).toBe(false);

    // ASSERT: Send button is visible/enabled
    const sendButtonVisible = await page.locator(selectorsSillyTavern.buttons.send).isVisible();
    expect(sendButtonVisible).toBe(true);

    // ASSERT: User CAN type and send message
    await page.fill(selectorsSillyTavern.chat.input, 'Test message while recap runs');
    await page.click(selectorsSillyTavern.buttons.send);

    // Wait for message to appear in chat
    await page.waitForFunction((text) => {
      const ctx = SillyTavern.getContext();
      const lastMsg = ctx.chat[ctx.chat.length - 1];
      return lastMsg?.mes?.includes(text);
    }, 'Test message while recap runs', { timeout: 30000 });

    // ASSERT: Recap completes successfully on separate profile
    await page.waitForFunction(() => {
      const { getQueueState } = window.AutoRecap;
      const queue = getQueueState();
      return queue.length === 0;
    }, { timeout: 60000 });
  });

  test('Mixed queue blocks only when needed', async ({ page }) => {
    // Setup: Get a different profile for recap
    const differentProfileId = await page.evaluate(() => {
      const ctx = SillyTavern.getContext();
      const profiles = ctx.extensionSettings.connectionManager?.profiles || [];
      const currentProfile = ctx.extensionSettings.connectionProfile;
      const differentProfile = profiles.find(p => p.id !== currentProfile);
      return differentProfile?.id || null;
    });

    if (!differentProfileId) {
      test.skip();
      return;
    }

    // Setup: Validation uses same profile, recap uses different profile
    await page.evaluate((profileId) => {
      const settings = SillyTavern.getContext().extensionSettings.auto_recap;
      settings.scene_recap_error_detection_connection_profile = '';  // Same as current (BLOCKS)
      settings.scene_recap_connection_profile = profileId;  // Different (DOESN'T BLOCK)
    }, differentProfileId);

    // Queue both operations
    await page.evaluate(() => {
      const { enqueueOperation, OperationType, OperationPriority } = window.AutoRecap;

      // Queue validation (blocking operation)
      enqueueOperation({
        type: OperationType.VALIDATE_RECAP,
        priority: OperationPriority.HIGH,
        metadata: { recap: 'test recap', type: 'comprehensive' }
      });

      // Queue scene recap (non-blocking operation)
      enqueueOperation({
        type: OperationType.GENERATE_SCENE_RECAP,
        priority: OperationPriority.NORMAL,
        metadata: { test: 'mixed-queue' }
      });
    });

    // ASSERT: Chat blocked initially (validation uses same profile)
    const initiallyBlocked = await page.evaluate(() => {
      return window.AutoRecap.isChatBlockedByQueue();
    });
    expect(initiallyBlocked).toBe(true);

    // Wait for validation to complete
    await page.waitForFunction(() => {
      const { getQueueState } = window.AutoRecap;
      const queue = getQueueState();
      // Check if validation operation is gone
      return !queue.some(op => op.type === 'VALIDATE_RECAP');
    }, { timeout: 60000 });

    // ASSERT: Chat UNBLOCKED after validation completes
    // (even though recap still running, it uses separate profile)
    const unblockedAfterValidation = await page.evaluate(() => {
      return window.AutoRecap.isChatBlockedByQueue();
    });
    expect(unblockedAfterValidation).toBe(false);

    // ASSERT: Send button visible while recap continues
    const sendButtonVisible = await page.locator(selectorsSillyTavern.buttons.send).isVisible();
    expect(sendButtonVisible).toBe(true);
  });

  test('User chats on main profile while extension uses different profile concurrently', async ({ page }) => {
    // Skip if no different profiles available
    const hasMultipleProfiles = await page.evaluate(() => {
      const ctx = SillyTavern.getContext();
      const profiles = ctx.extensionSettings.connectionManager?.profiles || [];
      return profiles.length >= 2;
    });

    if (!hasMultipleProfiles) {
      test.skip();
      return;
    }

    // Setup: Get different profile for recap
    const differentProfileId = await page.evaluate(() => {
      const ctx = SillyTavern.getContext();
      const profiles = ctx.extensionSettings.connectionManager?.profiles || [];
      const currentProfile = ctx.extensionSettings.connectionProfile;
      return profiles.find(p => p.id !== currentProfile)?.id;
    });

    await page.evaluate((profileId) => {
      const settings = SillyTavern.getContext().extensionSettings.auto_recap;
      settings.scene_recap_connection_profile = profileId;
    }, differentProfileId);

    // Get initial message count
    const initialMessageCount = await page.evaluate(() => {
      return SillyTavern.getContext().chat.length;
    });

    // User sends first message
    await page.fill(selectorsSillyTavern.chat.input, 'First message');
    await page.click(selectorsSillyTavern.buttons.send);
    await page.waitForFunction((count) => {
      return SillyTavern.getContext().chat.length > count;
    }, initialMessageCount, { timeout: 30000 });

    // Queue recap (runs in background on different profile)
    await page.evaluate(() => {
      const { enqueueOperation, OperationType, OperationPriority } = window.AutoRecap;
      return enqueueOperation({
        type: OperationType.GENERATE_SCENE_RECAP,
        priority: OperationPriority.NORMAL,
        metadata: { test: 'concurrent-test' }
      });
    });

    // ASSERT: Chat NOT blocked
    const isBlocked = await page.evaluate(() => {
      return window.AutoRecap.isChatBlockedByQueue();
    });
    expect(isBlocked).toBe(false);

    // User sends ANOTHER message immediately
    const messageCountBeforeSecond = await page.evaluate(() => {
      return SillyTavern.getContext().chat.length;
    });

    await page.fill(selectorsSillyTavern.chat.input, 'Second message while recap runs');
    await page.click(selectorsSillyTavern.buttons.send);

    // ASSERT: Second message sent successfully
    await page.waitForFunction((count) => {
      return SillyTavern.getContext().chat.length > count;
    }, messageCountBeforeSecond, { timeout: 30000 });

    const finalMessageCount = await page.evaluate(() => {
      return SillyTavern.getContext().chat.length;
    });
    expect(finalMessageCount).toBeGreaterThan(messageCountBeforeSecond);

    // Wait for recap to complete
    await page.waitForFunction(() => {
      const { getQueueState } = window.AutoRecap;
      return getQueueState().length === 0;
    }, { timeout: 60000 });
  });

  test('Metadata injected correctly for both generateRaw and ConnectionManager paths', async ({ page }) => {
    // Skip if test proxy not available
    const hasProxy = await page.evaluate(() => {
      const settings = SillyTavern.getContext().extensionSettings.auto_recap;
      return settings.first_hop_proxy_send_chat_details === true;
    });

    if (!hasProxy) {
      test.skip();
      return;
    }

    // Test 1: User chat (uses generateRaw + event handler)
    await page.fill(selectorsSillyTavern.chat.input, 'User message for metadata test');
    await page.click(selectorsSillyTavern.buttons.send);

    // Intercept request and check metadata
    const userChatMetadata = await page.evaluate(() => {
      return new Promise((resolve) => {
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
          const response = await originalFetch.apply(this, args);
          const requestBody = args[1]?.body;
          if (requestBody && requestBody.includes('ST_METADATA')) {
            resolve(requestBody);
          }
          return response;
        };
      });
    });

    expect(userChatMetadata).toContain('<ST_METADATA operation="chat-');

    // Test 2: Extension operation with "same as current" (uses generateRaw + interceptor)
    await page.evaluate(() => {
      const settings = SillyTavern.getContext().extensionSettings.auto_recap;
      settings.scene_recap_connection_profile = '';  // Same as current
    });

    await page.evaluate(() => {
      const { enqueueOperation, OperationType } = window.AutoRecap;
      return enqueueOperation({
        type: OperationType.GENERATE_SCENE_RECAP,
        metadata: { test: 'metadata-same-profile' }
      });
    });

    // Check that operation includes metadata
    await page.waitForFunction(() => {
      const { getQueueState } = window.AutoRecap;
      return getQueueState().length === 0;
    }, { timeout: 60000 });

    // Test 3: Extension operation with different profile (uses sendLLMRequest + manual injection)
    const differentProfileId = await page.evaluate(() => {
      const ctx = SillyTavern.getContext();
      const profiles = ctx.extensionSettings.connectionManager?.profiles || [];
      const currentProfile = ctx.extensionSettings.connectionProfile;
      return profiles.find(p => p.id !== currentProfile)?.id;
    });

    if (differentProfileId) {
      await page.evaluate((profileId) => {
        const settings = SillyTavern.getContext().extensionSettings.auto_recap;
        settings.scene_recap_connection_profile = profileId;
      }, differentProfileId);

      await page.evaluate(() => {
        const { enqueueOperation, OperationType } = window.AutoRecap;
        return enqueueOperation({
          type: OperationType.GENERATE_SCENE_RECAP,
          metadata: { test: 'metadata-different-profile' }
        });
      });

      await page.waitForFunction(() => {
        const { getQueueState } = window.AutoRecap;
        return getQueueState().length === 0;
      }, { timeout: 60000 });
    }
  });

  test('Settings migrate from profile names to UUIDs', async ({ page }) => {
    // Setup: Set old format (profile names) if they exist
    const profileNames = await page.evaluate(() => {
      const ctx = SillyTavern.getContext();
      const profiles = ctx.extensionSettings.connectionManager?.profiles || [];
      return profiles.map(p => p.name);
    });

    if (profileNames.length === 0) {
      test.skip();
      return;
    }

    // Set old format (profile name as string)
    await page.evaluate((names) => {
      const settings = SillyTavern.getContext().extensionSettings.auto_recap;
      settings.scene_recap_connection_profile = names[0];  // Profile name, not UUID
      if (names[1]) {
        settings.auto_scene_break_connection_profile = names[1];
      }
    }, profileNames);

    // Run migration
    await page.evaluate(async () => {
      if (window.AutoRecap.migrateConnectionProfileSettings) {
        await window.AutoRecap.migrateConnectionProfileSettings();
      }
    });

    // ASSERT: UUIDs stored (UUID format is 8-4-4-4-12 hex digits)
    const migratedSettings = await page.evaluate(() => {
      const settings = SillyTavern.getContext().extensionSettings.auto_recap;
      return {
        scene_recap: settings.scene_recap_connection_profile,
        scene_break: settings.auto_scene_break_connection_profile
      };
    });

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (migratedSettings.scene_recap !== '') {
      expect(migratedSettings.scene_recap).toMatch(uuidRegex);
    }

    if (migratedSettings.scene_break !== '') {
      expect(migratedSettings.scene_break).toMatch(uuidRegex);
    }

    // ASSERT: Operations still work with migrated settings
    await page.evaluate(() => {
      const { enqueueOperation, OperationType } = window.AutoRecap;
      return enqueueOperation({
        type: OperationType.GENERATE_SCENE_RECAP,
        metadata: { test: 'post-migration' }
      });
    });

    await page.waitForFunction(() => {
      const { getQueueState } = window.AutoRecap;
      return getQueueState().length === 0;
    }, { timeout: 60000 });
  });

});
