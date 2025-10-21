export default ({ test, expect }) => {
  test('utils: logging functions exist', async () => {
    const m = await import('../../tests/virtual/index.js');
    expect(typeof m.log).toBe('function');
    expect(typeof m.debug).toBe('function');
    expect(typeof m.error).toBe('function');
  });

  test('utils: get_settings fallback values', async () => {
    const m = await import('../../tests/virtual/index.js');
    expect(m.get_settings('debug_mode')).toBe(true);
    expect(m.get_settings('operation_queue_enabled')).toBe(true);
    expect(m.get_settings('operation_queue_use_lorebook')).toBe(false);
  });
};

