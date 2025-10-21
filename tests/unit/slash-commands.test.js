export default ({ test, expect }) => {
  test('slashCommands: initialize without errors', async () => {
    // Ensure getContext provides parser via stub (already in externals)
    const sc = await import('../../tests/virtual/slashCommands.js');
    expect(typeof sc.initialize_slash_commands).toBe('function');
    // Should not throw
    sc.initialize_slash_commands();
  });
};

