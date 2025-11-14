Forked from SillyTavern-MessageRecap for the original per‑message recapping code.
https://github.com/qvink/SillyTavern-MessageRecap/

---

### Contents

- [Description](#description)
- [Notable Features](#notable-features)
- [Installation and Usage](#installation-and-usage)
- [Main Settings &amp; Controls](#main-settings--controls)
- [Slash Commands](#slash-commands)
- [Custom CSS](#custom-css)
- [Tips](#tips)
- [Troubleshooting](#troubleshooting)
- [Known Issues](#known-issues)
- [Development](#development)
- [Todo](#todo)

---

### Description

- This extension reworks how memory is stored by recapping each message individually, rather than all at once.
- Recaps are injected into the main prompt at two levels: short-term memory and long-term memory.
- Short-term memory rotates out the most recent message recaps automatically.
- Long-term memory stores recaps of manually-marked messages beyond the short-term limit.
- **Combined recap**: Optionally merges all message recaps into a single, coherent narrative recap, removing repetition and highlighting key events. The combined recap can be injected into the prompt at configurable positions and intervals.
- **Scene recaps**: Generate recaps for scene breaks, with their own prompt, injection, and validation settings.
- **Running scene recap (NEW)**: Combines multiple scene recaps into a single, cohesive narrative memory following best practices. Enabled by default. See `docs/RUNNING_SCENE_RECAP.md` for details.
- **Recap validation**: Optionally validates recaps (regular, combined, and scene) using a second LLM pass to ensure they meet your format and quality criteria.

**Benefits compared to the built-in recapping:**

- Generating recaps individually (as opposed to all at once) gets more accurate results and is less likely to miss details.
- Because memory storage is not handled by an LLM, old recaps will never change over time.
- Each recap is attached to the message it recaps, so deleting a message removes only the associated memory.
- Short-term memory guarantees that relevant info is always available from the most recent messages, but goes away once no longer relevant according to a set limit.
- Long-term memory allows you to choose which details are important to remember, keeping them available for longer, up to a separate limit.

---

### Notable Features

- **Configuration profiles**: Save and load different configuration profiles and set one to be auto-loaded for each character or chat.
- **Popout config menu**: Customize recap settings, injection settings, and auto‑recap message inclusion criteria.
- **Memory editor**: A separate interface for viewing and editing all memories in your chat.
- **Combined recap**: Optionally generate a single narrative recap from all message recaps, with customizable prompt, template, and validation.
- **Scene recaps**: Recap each scene break as a single recap, with customizable prompt, injection, and validation.
- **Running scene recap (NEW)**: Automatically combines scene recaps into cohesive narrative memory with versioning, navbar controls, and per-scene regeneration. Enabled by default.
- **Recap validation**: Optionally validate recaps (regular, combined, and scene) using a second LLM pass, with customizable prompt, retries, and preset.
- **Recaps displayed below messages**: Optionally display recaps in small text below each message, colored according to their status:
  - Green: Included in short-term memory
  - Blue: Marked for long-term memory (included in short-term or long-term memory)
  - Red: Marked for long-term memory, but now out of context
  - Grey: Excluded
- **Auto-hide**: Automatically hide messages from scenes older than a configurable threshold (scene-based).

---

### Installation and Usage

- Install the extension in ST using the github link: https://github.com/QueenGytha/ST-Auto-Recap
- To mark a message for long-term memory, click the "brain" icon in the message button menu.
- To regenerate a recap for a message, click the "Quote" icon in the message button menu.
- To edit a recap, click on the recap text directly or click the "pen" icon in the message button menu.
- To perform actions on multiple recaps at once, go to the config and click "Edit Memory". Here you can filter for specific memories or manually select memories to modify.
- To only recap certain characters in a group chat, open the group chat edit menu and scroll down to the member list. Click the glowing "brain" icon to toggle whether that character will be automatically recapped (if you have auto-recap enabled).
- To manually add or edit scene breaks, use the scene break button in the message menu (if enabled in settings).

---

### Main Settings & Controls

#### Memory Controls

- **Toggle Memory:** Enable/disable memory for the current chat.
- **Edit Memory:** Open the memory editor to view, filter, and bulk-edit recaps.
- **View Combined Recap:** See the current combined recap in a modal.
- **Refresh Memory:** Recalculate which recaps are included and update their display.

#### Configuration Profiles

- **Profile Dropdown:** Switch between saved configuration profiles.
- **Save/Rename/New/Delete/Restore:** Manage your profiles.
- **Character/Chat Profile:** Set the current profile as default for a character or chat.
- **Import/Export Profile:** Import or export profiles as JSON files.

#### Recap Settings

- **Edit Recap Prompt:** Customize the prompt used for recap generation.
- **Preview Recap Prompt:** See a filled-in example using the last message.
- **Stop Recap Generation:** Immediately halt any ongoing recap generation.
- **Connection Profile / Completion Preset:** Choose which API and preset to use for recap generation. (Profiles and presets can be set independently for regular, combined, and scene recaps.)
- **Recap Prefill:** Text to start each recap with.
- **Include Prefill In Memories:** Show prefill in displayed memories.
- **Auto Recap:** Automatically generate recaps for new messages.
- **Auto Recap Before Generation:** Generate recaps before sending a new message.
- **Auto Recap Progress Bar:** Show progress when generating multiple recaps.
- **Auto Recap Message Lag/Batch Size/Limit:** Control when and how many messages are recapped at once.
- **Message History:** Include previous messages or recaps as context for recap generation. (Configurable mode and count.)
- **Recap Time Delay:** Wait between recap operations (for rate-limited APIs).
- **Regenerate Recap on Edit/Swipe:** Automatically regenerate recaps when editing or swiping messages.
- **Block Chat:** Prevent sending messages while generating recaps.
- **Nest Message in Recap Prompt:** Place the message inside the system prompt (advanced).
- **Include All Context Content:** Add world info and other context to the recap prompt.
- **Include User/System/Narrator Messages:** Control which message types are recapped and included in history.
- **Message Length Threshold:** Only recap messages above a certain length.

#### Memory Injection Settings

- **Running Scene Recap Only:** The extension injects the running scene recap automatically when enabled.

##### Short-term & Long-term Memory

- **Context Limit:** How much context (tokens or percent) each memory type can use.
- **Include in World Info Scanning:** Make memories available for world info scans.
- **Injection Position/Depth/Role:** Where and how memories are injected into the prompt.
- **Scan for Memories:** Optionally scan for memories to include in world info or other features.

#### Combined Recap

- **Enable Combined Recap:** Turn on the combined recap feature.
- **Combined Recap Interval:** How often to generate a new combined recap (after how many new recaps).
- **Show Toast Popup:** Notify when generating a combined recap.
- **Edit Combined Prompt:** Customize the combined recap prompt.
- **Combined Completion Preset/Prefill/Context Limit:** Control how the combined recap is generated and injected.
- **Combined Recap Injection Position/Depth/Role:** Where and how the combined recap is injected into the prompt.
- **Combined Recap Validation:** Optionally validate the combined recap using a second LLM pass.
- **Combined Recap Scan:** Optionally scan for combined recaps for world info.

#### Scene Recap

- **Auto-generate Scene Names (Auto-Detection):** Automatically generate brief scene names (like chapter titles) when auto-generating scene recaps (e.g., during scene break detection), if no name is already set.
- **Auto-generate Scene Names (Manual):** Automatically generate brief scene names (like chapter titles) when manually generating scene recaps via the Generate button, if no name is already set.
- **Navigator Bar Width:** Customize the width of the scene navigator bar in pixels (default: 240px).
- **Navigator Font Size:** Customize the font size for scene names in the navigator bar in pixels (default: 12px).
- **Edit Scene Prompt:** Customize the prompt used for scene recaps.
- **Scene Completion Preset/Prefill/Context Limit:** Control how scene recaps are generated.
- **Scene Message History Mode/Count:** Configure which messages and how many are included as context for scene recaps.
- **Include Message Types:** Choose whether to include user messages only, AI messages only, or both when generating scene recaps (default: both).
- **Scene Recap Validation:** Optionally validate scene recaps using a second LLM pass.

#### Running Scene Recap (Recommended)

**NEW**: Combines multiple scene recaps into a single, cohesive narrative memory following best practices. **Enabled by default.**

- **Running Scene Recap:** Combine all scene recaps into one narrative (always enabled).
- **Exclude Latest N Scenes:** Wait N scenes before including in running recap (default: 1, allows validation).
- **Auto-generate on New Scene Recaps:** Automatically regenerate when new scene recaps are created.
- **Show Navbar Version Controls:** Display floating navbar with version selector, edit, and regenerate buttons.
- **Edit Running Recap Prompt:** Customize how scenes are combined. Output is JSON with a single `recap` field (markdown inside).
- **Version Management:** Switch between generated versions, edit to create new versions, manual regeneration.
- **Per-Scene Regenerate:** "Regenerate Running" button on each scene recap to manually trigger regeneration.
- **Running Recap Injection:** Uses separate position/depth/role/scan settings, replaces individual scene injection when enabled.

**How it works:**
1. Scene recaps are generated individually (as before)
2. Running recap auto-generates, combining all scenes minus latest N
3. LLM merges scenes into cohesive narrative (focuses on state, deduplicates, extreme brevity)
4. Running recap is injected instead of individual scene recaps
5. Versions are stored - switch between them or edit to create new versions

**See detailed documentation:** `docs/RUNNING_SCENE_RECAP.md`

#### Recap Validation

- **Enable Recap Validation:** Use a second LLM pass to check recap format.
- **Validate Regular/Combined/Scene Recaps:** Enable validation for each type.
- **Edit Validation Prompt:** Customize the validation criteria for regular, combined, and scene recaps.
- **Validation Completion Preset/Prefill/Max Retries:** Control how validation is performed for each recap type.

#### Auto-Hide

- **Auto Hide Messages Older Than The Last X Scene(s):** Automatically exclude messages from scenes older than the specified number of scenes. Set to -1 to disable.

#### Miscellaneous

- **Verbose Logging:** Always enabled for easier troubleshooting.
- **Enable Memory in New Chats:** Default memory state for new chats.
- **Use Global Toggle State:** Share memory enable/disable state across all chats.

---

### Slash Commands

- `/get_memory_enabled`: Returns whether the extension is enabled in the current chat.
- `/toggle_memory`: Toggles the extension on and off for the current chat. Same as clicking "Toggle Chat Memory" in the config. Can also provide a boolean argument to toggle the extension directly.
- `/toggle_memory_popout`: Toggles the popout config menu.
- `/toggle_memory_edit_interface`: Toggles the "Edit Memory" interface.
- `/toggle_memory_injection_preview`: Toggles a preview of the text that will be injected.
- `/recap`: Recaps the nth message in the chat (default to most recent message). Same as clicking the "quote" icon in the message button menu.
- `/recap_chat`: Performs a single auto‑recap pass on the chat, even if auto‑recap is disabled.
- `/stop_recapping`: Stops any recap generation currently running. Same as clicking the "stop" button in the config or next to the progress bar.
- `/remember <n>`: Mark the nth message for long‑term memory, recapping it if not already. Same as clicking the "brain" icon in the message button menu.
- `/force_exclude_memory <n>`: Toggles the inclusion of the recap for the nth message. Same as clicking the "Force Exclude" button in the message button menu.
- `/get_memory <n>`: Get the memory associated with the nth message. Defaults to the most recent message.
- `/auto_recap_log_chat`: Logs the current chat to the console.
- `/auto_recap_log_settings`: Logs the current extension settings to the console.
- `/hard_reset`: Resets all extension settings to default.
- `/scene_recap_injection`: Logs scene recap injection settings, collected indexes, and injection text.

---

### Custom CSS

You can easily customize the CSS for displayed memories by setting the following variables:

- `--qvink_short`: In short-term memory (default green)
- `--qvink_long`: In long-term memory (default blue)
- `--qvink_old`: Marked for long-term memory, but now out of context (default red)
- `--qvink_excluded`: Manually force-excluded (default dark grey)

Just make sure to use the `!important` directive to override the default styles.
For example, to color short-term memories yellow and long-term memories black, you would put the following in your "Custom CSS" user settings:

```css
:root {
   --qvink_short: yellow !important;
   --qvink_long: black !important;
}
```

---

### Tips

Each model is different of course, but here are just some general things that I have found help getting clean recaps. Try them out if you want.

- **Keep it simple**: Longer recap prompts tend to muddy the waters and get less accurate results. Just in general LLMs have trouble with information overload (hence the reason for this extension in the first place).
- **Low temperature**: I like to use a temp of 0 to reduce creativity and just get down to the facts. No need for flowery language.
- **No repetition penalty**: Again, no need for creativity, in fact I want it to repeat what happened.
- **The `{{words}}` macro doesn't always help**: While some models may reign themselves in if you tell them to keep it under X words, LLMs don't have a soul and therefore can't count, so don't bet on it.
- **You can use global macros**: If your recaps aren't using names properly, keep in mind that you can use the `{{char}}` or `{{user}}` macro in the prompt.
- **No need to pause roleplay**: You don't have to include anything like "ignore previous instructions" or "pause your roleplay". The recap prompt is completely independent and will only send what you see in the edit window.
- **I don't recommend reasoning**: Reasoning models can recap fine, but they do tend to blab for ages which makes recapping slow, so I wouldn't recommend them for that reason.
- **Save your presets**: If you are using a different completion preset or connection profile for recaps, make sure to save any changes to your regular completion preset or instruct template. When generating recaps, the extension has to temporarily switch presets or connection profiles, which will discard any unsaved changes to the one you are currently using.

---

### Troubleshooting

- **"ForbiddenError: invalid csrf token":** You opened ST in multiple tabs.
- **"Syntax Error: No number after minus sign in JSON at position X":** update your koboldcpp, or try disabling "Request token probabilities".
- **"min new tokens must be in (0, max_new_tokens(X)], got Y":** your model has a minimum token amount, which is conflicting with the max tokens you are using for recap generation. Either reduce the minimum token amount for your model (usually in the completion settings), or increase the maximum token length for recap generations.
- **Recaps seem to be continuing the conversation rather than recapping:** probably an issue with your instruct template.
  - Make sure you are using the correct template for your model, and make sure that system messages are properly distinct from user messages (the recaps use a system prompt).
  - This can be caused by the "System same as user" checkbox in your instruct template settings, which will cause all system messages to be treated like a user - uncheck that if your model can handle it.
  - Some default instruct templates also may not have anything defined for the "System message sequences" field - that should be filled out.
  - You can also try toggling "Nest Message in Recap Prompt" in the settings - some models behave better with this.
- **My jailbreak isn't working:** You'll need to put a jailbreak in the recap prompt if you want it to be included.
- **The recaps refer to "a person" or "someone" rather than the character by name:** Try using the `{{user}}` or `{{char}}` macros in the recap prompt. There is also a "Message History" setting to include a few previous messages in the recap prompt to give the model a little more context.
- **The recaps are too long:** You can select a custom completion preset in the settings to use for recap generations, and that can be used to set a maximum token length after which generation will be cut off. You can also use the {{words}} macro in the recap prompt to try and guide the LLM according to that token length, though LLMs cannot actually count words so it's really just a suggestion.
- **Incomplete sentences aren't getting trimmed even though the option is checked in the advanced formatting settings:** If you are using a different connection profile for recaps, note that instruction templates are part of that so the option needs to be checked in the template used for that connection profile.
- **When I use a different completion preset for recaps, my regular completion preset gets changed after generating:** When a recap is generated, we actually have to switch completion presets temporarily which discards any unsaved changes you might have made to your current completion preset. This is just how ST does things. The same applies to connection profiles (which in turn affects instruction templates.)
- **Just updated and things are broken:** try reloading the page first, and make sure you are on the most recent version of ST.

---

### Known Issues

- When editing a message that already has a memory, the memory displayed below the message does not have the right color. This is just a visual bug, and it will correct itself after the next recap generation.
- Validation prompts may have a high false positive rate due to meta-commentary in LLM outputs (see Todo for planned improvements).

---

### Development

This extension uses AI-driven development with comprehensive testing and validation.

#### Prerequisites
- **Node.js**: For development dependencies
- **SillyTavern**: For testing the extension

#### Setup & Installation
1. **Clone the repository**
   ```bash
   git clone https://github.com/QueenGytha/ST-Auto-Recap.git
   cd ST-Auto-Recap
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

#### Development Commands
```bash
# Check extension functionality
npm run test

# Build extension
npm run build

# Development mode
npm run dev
```

#### Key Files
- **AI_INSTRUCTIONS.md**: Complete development guide
- **index.js**: Main entry point
- **recapping.js**: Core recap logic
- **memoryCore.js**: Memory management
- **settingsManager.js**: Settings handling

#### Development Principles
- **Real Environment Testing**: Test against actual SillyTavern
- **Standalone Features**: Each feature works independently
- **Comprehensive Testing**: All scenarios and edge cases covered
- **Error Handling**: Robust error handling and logging

For detailed development instructions, see [AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md).

---

### Todo

- Default to off per chat (already a setting?)
- Default preset to off, with some included preset with generic out-of-the-box settings
- Automatically detecting when there is a scene change
- Automatically creating and updating lorebooks
- 'Auto' option for injection placement, adjusting based on recap size (tips from https://rentry.org/how2claude#recapping)
- Version the individual/combined recaps, with the option to choose between them. Including some screen for ease of viewing
- The validation prompts have a very large false positive rate, due to meta-commentary eg 'here is the recap:'. Possible solution: convert recaps to JSON objects for ease of validation. This will also be useful later, in portioning out what goes into a recap, vs into a lorebook
- A navigator bar to easily find the various marked scenes


Notes:


My experience with recapping and long-term memory in big adventure RPs that are >2500 messages long:

- All default long-term memory schemes/prompts suck in all frontends - ST, Risu etc. Devs design something that should work in theory, but never verify that it works well in practice.
- Recapping per message is a waste of time and context, I was never able to make it work well despite trying hard, as it's really simple to automate. Believe me, I tried.
- Hierarchical memory approaches that many extensions and frontends go with also suck, they're largely useless.
- Plot/scenario/sequence of what happened is absolutely useless as a recap, it just never works. You are NOT doing this to "make the character reminisce of the past"! That's nonsense. You are doing this to update the card itself and provide a stable reference point, simplifying the history.
- The only way that works is recapping per logical breakpoint/scene, and only in a specific way (extension of the card).
- Automated recapping is always poor because models still lack the foresight of a human and have no intuition in prompting themselves. You should always correct it by hand.
- Recaps that are too complex will eventually make even the best models dissociate badly. It needs to be simplified and cleaned up from time to time. Some things thrown out, some added, some grouped. You can only do this manually, as only you know what you want from your RP.
- All current models get distracted by the history just 2 messages into it. Your characters drift and stop follow the definitions. Sometimes it keeps the story coherent and also makes possible characters with huge mood swings or multiple personality modes. But sometimes you want to just truncate the history, leaving only the recapped version, so your {{char}} turns back to being self. This needs to be a manual option.
- Having the card AND the recap that overrides it is an extra source of confusion for the model. Instead of this, just update the card itself! Sooner or later in a long RP you'll just have to do this anyway because the characters just drift too much as your relationships develop. ST makes it hard because you need to juggle several card versions.
- Different lore facts revealed in the process should be stored in the lorebook, but the decision should be manual because only you know if you want to make it persistent. To know which locations, NPCs, etc you revealed and what it could trigger, the model needs a separate section in the recap with one-line characteristic of each entity. You can't have too many of those, so you have to choose which ones to make persistent.

The how2claude guide in [&gt;&gt;42367418](https://boards.4chan.org/mlp/thread/42363249#p42367418) has the right idea (ask for an "info panel" and edit it by hand) and has a very good prompt example, but it can be taken much further in a separate recapping extension that would:

> be able to update arbitrary context records (author's note, card, lorebook etc), instead of having a separate injectable recap like the current extension has.
> have a convenient way to modularize the recap prompt and the recap itself, akin to the ST prompt manager (toggle the pieces on and off)
> have a convenient way to detect the scene automatically with a separate prompt, or place a scene breakpoint by hand
> have a way to truncate the history tail at any arbitrary part of the roleplay manually
> (THE MOST IMPORTANT PART) have a versioning system for the entire RP session!
> Make it so that the entire state of SillyTavern is stored per swipe and message and tied to them, so you can roll it back, fork at any point, or delete some messages without fear or having to juggle multiple copies. Your preset, your card, lorebook, author's note, QRs, preset and lorebook toggles, everything should be saved per message/swipe inside the current chat. The original copy of the card/lorebook/etc should stay untouched, so you can start a new chat from scratch if you want.
>

https://github.com/bmen25124/lorebook-creator
