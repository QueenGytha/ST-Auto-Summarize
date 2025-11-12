import { selectorsSillyTavern } from '../../selectorsSillyTavern.js';

export class CheckpointTestHelper {
  constructor(page) {
    this.page = page;
    this.stSelectors = selectorsSillyTavern;
  }

  // ============================================================================
  // Chat Management
  // ============================================================================

  async createTestChat(name = null) {
    const chatName = name || `TestChat_${Date.now()}`;

    await this.page.evaluate((testChatName) => {
      const ctx = SillyTavern.getContext();

      const characterId = ctx.characters?.[0]?.avatar || 'test_character';

      ctx.chat_metadata = {
        note_prompt: '',
        note_interval: 0,
        note_position: 0,
        note_depth: 0
      };

      ctx.chat = [];

      window.chat = ctx.chat;
      window.chat_metadata = ctx.chat_metadata;

      return window.saveChat(testChatName);
    }, chatName);

    return chatName;
  }

  async openCharacterChat(chatName) {
    await this.page.evaluate((name) => {
      return window.openCharacterChat(name);
    }, chatName);

    await this.page.waitForFunction(
      (expectedName) => {
        const ctx = SillyTavern.getContext();
        return ctx.chat_metadata?.file_name === expectedName;
      },
      expectedName,
      { timeout: 10000 }
    );
  }

  async createTestGroupChat(characterNames) {
    const groupName = `TestGroup_${Date.now()}`;

    await this.page.evaluate((chars) => {
      const ctx = SillyTavern.getContext();

      const group = {
        id: `test_group_${Date.now()}`,
        name: groupName,
        members: chars,
        avatar_url: ''
      };

      if (!ctx.groups) {
        ctx.groups = [];
      }
      ctx.groups.push(group);

      return window.saveGroupChat(group.id);
    }, characterNames);

    return groupName;
  }

  // ============================================================================
  // Checkpoint Operations
  // ============================================================================

  async createCheckpoint(mesId, checkpointName) {
    return await this.page.evaluate(
      ({ id, name }) => {
        if (!window.AutoRecap?.createCheckpoint) {
          throw new Error('AutoRecap.createCheckpoint not available');
        }
        return window.AutoRecap.createCheckpoint(id, name);
      },
      { id: mesId, name: checkpointName }
    );
  }

  async openCheckpoint(checkpointName) {
    await this.page.evaluate((name) => {
      const ctx = SillyTavern.getContext();
      const checkpoints = ctx.chat_metadata?.checkpoints || [];
      const checkpoint = checkpoints.find(cp => cp.name === name);

      if (!checkpoint) {
        throw new Error(`Checkpoint not found: ${name}`);
      }

      return window.openCharacterChat(checkpoint.fileName);
    }, checkpointName);

    await this.page.waitForTimeout(500);
  }

  async getCheckpoints() {
    return await this.page.evaluate(() => {
      const ctx = SillyTavern.getContext();
      return ctx.chat_metadata?.checkpoints || [];
    });
  }

  // ============================================================================
  // Branch Operations
  // ============================================================================

  async createBranch(mesId) {
    const result = await this.page.evaluate((id) => {
      if (!window.AutoRecap?.createBranch) {
        if (!window.branchChat) {
          throw new Error('branchChat not available');
        }
        return window.branchChat(id);
      }
      return window.AutoRecap.createBranch(id);
    }, mesId);

    if (result?.success === false) {
      throw new Error(result.error || 'Branch creation failed');
    }

    return result.fileName || result;
  }

  // ============================================================================
  // Lorebook Operations
  // ============================================================================

  async addLorebookEntry(key, options = {}) {
    await this.page.evaluate(
      ({ entryKey, opts }) => {
        const ctx = SillyTavern.getContext();

        let lorebookName = ctx.chat_metadata.world_info;

        if (!lorebookName) {
          lorebookName = `lorebook_${Date.now()}`;
          ctx.chat_metadata.world_info = lorebookName;

          if (!window.world_info_data) {
            window.world_info_data = {};
          }
          window.world_info_data[lorebookName] = {
            entries: {}
          };
        }

        const lorebook = window.world_info_data[lorebookName];
        const entryId = `entry_${Date.now()}_${Math.random()}`;

        lorebook.entries[entryId] = {
          uid: entryId,
          key: [entryKey],
          keysecondary: [],
          comment: opts.comment || '',
          content: opts.content || `Content for ${entryKey}`,
          constant: opts.constant || false,
          selective: opts.selective || false,
          insertion_order: opts.insertion_order || 100,
          enabled: opts.enabled !== false,
          position: opts.position || 'before_char',
          extensions: {}
        };

        return window.saveWorldInfo(lorebookName);
      },
      { entryKey: key, opts: options }
    );
  }

  async editLorebookEntry(key, newContent) {
    await this.page.evaluate(
      ({ entryKey, content }) => {
        const ctx = SillyTavern.getContext();
        const lorebookName = ctx.chat_metadata.world_info;

        if (!lorebookName) {
          throw new Error('No lorebook attached to chat');
        }

        const lorebook = window.world_info_data[lorebookName];
        if (!lorebook) {
          throw new Error(`Lorebook not found: ${lorebookName}`);
        }

        const entry = Object.values(lorebook.entries).find(e =>
          e.key.includes(entryKey)
        );

        if (!entry) {
          throw new Error(`Lorebook entry not found: ${entryKey}`);
        }

        entry.content = content;

        return window.saveWorldInfo(lorebookName);
      },
      { entryKey: key, content: newContent }
    );
  }

  async getLorebookEntry(index) {
    return await this.page.evaluate((idx) => {
      const ctx = SillyTavern.getContext();
      const lorebookName = ctx.chat_metadata.world_info;

      if (!lorebookName) {
        return null;
      }

      const lorebook = window.world_info_data[lorebookName];
      if (!lorebook) {
        return null;
      }

      const entries = Object.values(lorebook.entries);
      return entries[idx] || null;
    }, index);
  }

  async getLorebookEntryCount() {
    return await this.page.evaluate(() => {
      const ctx = SillyTavern.getContext();
      const lorebookName = ctx.chat_metadata.world_info;

      if (!lorebookName) {
        return 0;
      }

      const lorebook = window.world_info_data[lorebookName];
      if (!lorebook) {
        return 0;
      }

      return Object.keys(lorebook.entries).length;
    });
  }

  async getLorebookName() {
    return await this.page.evaluate(() => {
      const ctx = SillyTavern.getContext();
      return ctx.chat_metadata.world_info || null;
    });
  }

  // ============================================================================
  // Auto-Recap Operations
  // ============================================================================

  async enableAutoRecap() {
    await this.page.evaluate(() => {
      const settings = SillyTavern.getContext().extensionSettings.auto_recap;
      if (!settings) {
        throw new Error('AutoRecap extension not loaded');
      }
      settings.enabled = true;
      settings.auto_recap_enabled = true;
    });
  }

  async enableCombinedRecap() {
    await this.page.evaluate(() => {
      const settings = SillyTavern.getContext().extensionSettings.auto_recap;
      settings.combined_recap_enabled = true;
    });
  }

  async enableSceneRecap() {
    await this.page.evaluate(() => {
      const settings = SillyTavern.getContext().extensionSettings.auto_recap;
      settings.scene_recap_enabled = true;
      settings.auto_scene_break_enabled = true;
    });
  }

  async sendMessage(text) {
    await this.page.fill(this.stSelectors.chat.input, text);
    await this.page.click(this.stSelectors.buttons.send);

    await this.page.waitForFunction(
      (messageText) => {
        const ctx = SillyTavern.getContext();
        const lastMsg = ctx.chat[ctx.chat.length - 1];
        return lastMsg && lastMsg.mes === messageText;
      },
      text,
      { timeout: 30000 }
    );
  }

  async waitForRecap(messageIndex, timeout = 60000) {
    await this.page.waitForFunction(
      (idx) => {
        const ctx = SillyTavern.getContext();
        const message = ctx.chat[idx];
        return message?.extra?.memory !== undefined;
      },
      messageIndex,
      { timeout }
    );
  }

  async getMessageRecap(messageIndex) {
    return await this.page.evaluate((idx) => {
      const ctx = SillyTavern.getContext();
      const message = ctx.chat[idx];
      return message?.extra?.memory || null;
    }, messageIndex);
  }

  async regenerateRecap(messageIndex) {
    await this.page.evaluate((idx) => {
      if (!window.AutoRecap?.regenerateRecap) {
        throw new Error('AutoRecap.regenerateRecap not available');
      }
      return window.AutoRecap.regenerateRecap(idx);
    }, messageIndex);

    await this.waitForRecap(messageIndex);
  }

  async getCombinedRecap() {
    return await this.page.evaluate(() => {
      const ctx = SillyTavern.getContext();
      return ctx.chat_metadata?.auto_recap?.combined_recap?.memory || null;
    });
  }

  async regenerateCombinedRecap() {
    await this.page.evaluate(() => {
      if (!window.AutoRecap?.regenerateCombinedRecap) {
        throw new Error('AutoRecap.regenerateCombinedRecap not available');
      }
      return window.AutoRecap.regenerateCombinedRecap();
    });

    await this.page.waitForFunction(
      () => {
        const ctx = SillyTavern.getContext();
        return ctx.chat_metadata?.auto_recap?.combined_recap?.memory !== undefined;
      },
      { timeout: 60000 }
    );
  }

  async getRunningSceneRecap() {
    return await this.page.evaluate(() => {
      const ctx = SillyTavern.getContext();
      return ctx.chat_metadata?.auto_recap?.running_scene_recap?.memory || null;
    });
  }

  async waitForRunningSceneRecap(timeout = 60000) {
    await this.page.waitForFunction(
      () => {
        const ctx = SillyTavern.getContext();
        return ctx.chat_metadata?.auto_recap?.running_scene_recap?.memory !== undefined;
      },
      { timeout }
    );
  }

  async createSceneBreak() {
    await this.page.evaluate(() => {
      if (!window.AutoRecap?.createSceneBreak) {
        throw new Error('AutoRecap.createSceneBreak not available');
      }
      return window.AutoRecap.createSceneBreak();
    });
  }

  // ============================================================================
  // Message Operations
  // ============================================================================

  async getMessageCount() {
    return await this.page.evaluate(() => {
      const ctx = SillyTavern.getContext();
      return ctx.chat?.length || 0;
    });
  }

  async getMessage(index) {
    return await this.page.evaluate((idx) => {
      const ctx = SillyTavern.getContext();
      return ctx.chat[idx] || null;
    }, index);
  }

  async deleteMessage(index) {
    await this.page.evaluate((idx) => {
      const ctx = SillyTavern.getContext();
      ctx.chat.splice(idx, 1);
      return window.saveChatConditional();
    }, index);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  async waitForExtensionLoaded() {
    await this.page.waitForFunction(() => {
      return window.AutoRecap !== undefined;
    }, { timeout: 10000 });
  }

  async getChatMetadata() {
    return await this.page.evaluate(() => {
      return window.chat_metadata || {};
    });
  }

  async setChatMetadata(metadata) {
    await this.page.evaluate((meta) => {
      Object.assign(window.chat_metadata, meta);
    }, metadata);
  }

  async waitForQueueEmpty(timeout = 60000) {
    await this.page.waitForFunction(
      () => {
        if (!window.AutoRecap?.getQueueState) {
          return true;
        }
        const queue = window.AutoRecap.getQueueState();
        return queue.length === 0;
      },
      { timeout }
    );
  }

  async getQueueState() {
    return await this.page.evaluate(() => {
      if (!window.AutoRecap?.getQueueState) {
        return [];
      }
      return window.AutoRecap.getQueueState();
    });
  }

  async isChatBlocked() {
    return await this.page.evaluate(() => {
      if (!window.AutoRecap?.isChatBlockedByQueue) {
        return false;
      }
      return window.AutoRecap.isChatBlockedByQueue();
    });
  }

  async screenshot(name) {
    await this.page.screenshot({
      path: `test-results/screenshots/checkpoint_${name}.png`,
      fullPage: true
    });
  }

  async waitForTimeout(ms) {
    await this.page.waitForTimeout(ms);
  }

  async cleanupTestData() {
    await this.page.evaluate(() => {
      const ctx = SillyTavern.getContext();

      if (ctx.chat_metadata?.auto_recap_checkpoint_state) {
        delete ctx.chat_metadata.auto_recap_checkpoint_state;
      }

      if (ctx.chat_metadata?.checkpoints) {
        ctx.chat_metadata.checkpoints = [];
      }
    });
  }
}
