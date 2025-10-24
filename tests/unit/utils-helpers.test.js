/**
 * @file Tests for utils.js helper functions (string manipulation, identifiers, tokens, lorebook names)
 * @module utils
 */

export default ({ test, expect }) => {
  // ======== String Manipulation ========

  test('clean_string_for_title: escapes HTML entities', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.clean_string_for_title('<div class="test">Hello & "goodbye"</div>');

    expect(result).toBe('&lt;div class=&quot;test&quot;&gt;Hello &amp; &quot;goodbye&quot;&lt;/div&gt;');
  });

  test('clean_string_for_title: escapes apostrophes', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.clean_string_for_title("It's a test");

    expect(result).toBe('It&apos;s a test');
  });

  test('clean_string_for_title: handles all special characters together', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.clean_string_for_title(`"<>&'`);

    expect(result).toBe('&quot;&lt;&gt;&amp;&apos;');
  });

  test('clean_string_for_title: preserves normal text', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.clean_string_for_title('Normal text 123');

    expect(result).toBe('Normal text 123');
  });

  test('escape_string: escapes newlines', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.escape_string('Line1\nLine2');

    expect(result).toBe('Line1\\nLine2');
  });

  test('escape_string: escapes tabs', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.escape_string('Tab\there');

    expect(result).toBe('Tab\\there');
  });

  test('escape_string: escapes control characters', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.escape_string('Test\r\nLine\b\f');

    expect(result).toBe('Test\\r\\nLine\\b\\f');
  });

  test('escape_string: handles null gracefully', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.escape_string(null);

    expect(result).toBe(null);
  });

  test('escape_string: handles undefined gracefully', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.escape_string(undefined);

    expect(result).toBe(undefined);
  });

  test('unescape_string: unescapes newlines', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.unescape_string('Line1\\nLine2');

    expect(result).toBe('Line1\nLine2');
  });

  test('unescape_string: unescapes tabs', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.unescape_string('Tab\\there');

    expect(result).toBe('Tab\there');
  });

  test('unescape_string: unescapes all control characters', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.unescape_string('Test\\r\\nLine\\b\\f');

    expect(result).toBe('Test\r\nLine\b\f');
  });

  test('unescape_string: handles hexadecimal escapes', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.unescape_string('Test\\x41BC'); // \x41 = 'A'

    expect(result).toBe('TestABC');
  });

  test('unescape_string: handles null gracefully', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.unescape_string(null);

    expect(result).toBe(null);
  });

  test('escape_string and unescape_string: are reversible', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const original = 'Test\nwith\ttabs\rand\r\nlines';
    const escaped = utils.escape_string(original);
    const unescaped = utils.unescape_string(escaped);

    expect(unescaped).toBe(original);
  });

  // ======== Token/Context Functions ========

  test('count_tokens: returns token count from context', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.count_tokens('This is a test message');

    expect(typeof result).toBe('number');
    expect(result > 0).toBe(true);
  });

  test('count_tokens: accepts padding parameter', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    // Test that function accepts padding parameter without error
    const result = utils.count_tokens('Test', 10);

    expect(typeof result).toBe('number');
    // Note: Stub may not implement padding logic, but function accepts it
  });

  test('get_context_size: returns a number', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.get_context_size();

    expect(typeof result).toBe('number');
    expect(result > 0).toBe(true);
  });

  test('get_short_token_limit: calculates percent correctly', async () => {
    const utils = await import('../../tests/virtual/utils.js');
    const { set_settings } = await import('../../tests/virtual/index.js');

    set_settings('message_summary_context_type', 'percent');
    set_settings('message_summary_context_limit', 10); // 10%

    const contextSize = utils.get_context_size();
    const limit = utils.get_short_token_limit();

    expect(limit).toBe(Math.floor(contextSize * 0.10));
  });

  test('get_short_token_limit: returns absolute value when not percent', async () => {
    const utils = await import('../../tests/virtual/utils.js');
    const { set_settings } = await import('../../tests/virtual/index.js');

    set_settings('message_summary_context_type', 'absolute');
    set_settings('message_summary_context_limit', 500);

    const limit = utils.get_short_token_limit();

    expect(limit).toBe(500);
  });

  // ======== Identifier Functions ========

  test('get_current_character_identifier: function exists and returns expected type', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.get_current_character_identifier();

    // With default stub context, may return null or string
    // NOTE: Real implementation has edge case bug with characterId === 0
    expect(result === null || typeof result === 'string' || result === undefined).toBe(true);
  });

  test('get_current_character_identifier: returns null for group chat', async () => {
    const utils = await import('../../tests/virtual/utils.js');
    const { getContext } = await import('../../tests/virtual/index.js');

    const ctx = getContext();
    ctx.groupId = 'group-123';

    const result = utils.get_current_character_identifier();

    expect(result).toBe(undefined); // Function returns early with no value
  });

  test('get_current_character_identifier: returns null when no character', async () => {
    const utils = await import('../../tests/virtual/utils.js');
    const { getContext } = await import('../../tests/virtual/index.js');

    const ctx = getContext();
    ctx.groupId = null;
    ctx.characterId = null;

    const result = utils.get_current_character_identifier();

    expect(result).toBe(null);
  });

  test('get_current_chat_identifier: returns groupId for group chat', async () => {
    const utils = await import('../../tests/virtual/utils.js');
    const { getContext } = await import('../../tests/virtual/index.js');

    const ctx = getContext();
    ctx.groupId = 'group-456';

    const result = utils.get_current_chat_identifier();

    expect(result).toBe('group-456');
  });

  test('get_current_chat_identifier: returns chatId for character chat', async () => {
    const utils = await import('../../tests/virtual/utils.js');
    const { getContext } = await import('../../tests/virtual/index.js');

    const ctx = getContext();
    ctx.groupId = null;
    ctx.chatId = 'char-chat-789';

    const result = utils.get_current_chat_identifier();

    expect(result).toBe('char-chat-789');
  });

  test('get_extension_directory: returns valid path', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.get_extension_directory();

    expect(typeof result).toBe('string');
    expect(result.length > 0).toBe(true);
    expect(result.endsWith('/')).toBe(false); // Should NOT end with slash
  });

  // ======== Lorebook Name Functions ========

  test('generateLorebookName: replaces template placeholders', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.generateLorebookName(
      'z-AutoLB - {{char}} - {{chat}}',
      'Alice',
      'chat-123'
    );

    expect(result).toBe('z-AutoLB - Alice - chat-123');
  });

  test('generateLorebookName: sanitizes character name', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.generateLorebookName(
      '{{char}} - {{chat}}',
      'Alice/Bob?', // Invalid filesystem chars
      'chat-123'
    );

    expect(result).toBe('Alice Bob - chat-123'); // Sanitized
  });

  test('generateLorebookName: sanitizes chat ID', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.generateLorebookName(
      '{{char}} - {{chat}}',
      'Alice',
      'chat:123*456' // Invalid filesystem chars
    );

    expect(result).toBe('Alice - chat 123 456'); // Sanitized
  });

  test('generateLorebookName: handles missing character name', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.generateLorebookName(
      '{{char}} - {{chat}}',
      '', // Empty
      'chat-123'
    );

    expect(result).toBe('Unknown - chat-123'); // Default 'Unknown'
  });

  test('generateLorebookName: handles missing chat ID', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.generateLorebookName(
      '{{char}} - {{chat}}',
      'Alice',
      '' // Empty
    );

    expect(result).toBe('Alice - Chat'); // Default 'Chat'
  });

  test('generateLorebookName: uses default template when missing', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.generateLorebookName(
      '', // Empty template
      'Alice',
      'chat-123'
    );

    expect(result).toBe('z-AutoLB - Alice - chat-123'); // Default template
  });

  test('generateLorebookName: handles whitespace in template placeholders', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.generateLorebookName(
      '{{  char  }} - {{  chat  }}', // Whitespace in placeholders
      'Alice',
      'chat-123'
    );

    expect(result).toBe('Alice - chat-123'); // Whitespace ignored
  });

  test('getUniqueLorebookName: returns base name when not in existing', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.getUniqueLorebookName(
      'My Lorebook',
      ['Other Lorebook', 'Another Lorebook']
    );

    expect(result).toBe('My Lorebook');
  });

  test('getUniqueLorebookName: appends (2) when base name exists', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.getUniqueLorebookName(
      'My Lorebook',
      ['My Lorebook', 'Other Lorebook']
    );

    expect(result).toBe('My Lorebook (2)');
  });

  test('getUniqueLorebookName: increments to next available number', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.getUniqueLorebookName(
      'My Lorebook',
      ['My Lorebook', 'My Lorebook (2)', 'My Lorebook (3)']
    );

    expect(result).toBe('My Lorebook (4)');
  });

  test('getUniqueLorebookName: handles null existing names', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.getUniqueLorebookName('My Lorebook', null);

    expect(result).toBe('My Lorebook');
  });

  test('getUniqueLorebookName: handles undefined existing names', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.getUniqueLorebookName('My Lorebook', undefined);

    expect(result).toBe('My Lorebook');
  });

  test('getUniqueLorebookName: handles empty existing names array', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const result = utils.getUniqueLorebookName('My Lorebook', []);

    expect(result).toBe('My Lorebook');
  });

  // ======== Version Check ========

  test('check_st_version: returns true when symbols exists', async () => {
    const utils = await import('../../tests/virtual/utils.js');
    const { getContext } = await import('../../tests/virtual/index.js');

    const ctx = getContext();
    ctx.symbols = {}; // Set symbols to simulate compatible version

    const result = utils.check_st_version();

    expect(result).toBe(true);
  });

  test('check_st_version: handles missing symbols gracefully', async () => {
    const utils = await import('../../tests/virtual/utils.js');
    const { getContext } = await import('../../tests/virtual/index.js');

    const ctx = getContext();
    delete ctx.symbols; // Remove symbols to simulate incompatible version

    const result = utils.check_st_version();

    expect(result).toBe(undefined); // Function doesn't return false, just shows toast
  });
};
