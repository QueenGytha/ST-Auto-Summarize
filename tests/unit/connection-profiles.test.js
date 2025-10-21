export default ({ test, expect }) => {
  test('connectionProfiles: inactive environment returns gracefully', async () => {
    // Provide a minimal jQuery-like stub
    globalThis.$ = (selector) => ({ find: () => ({ length: 0 }) });
    const cp = await import('../../tests/virtual/connectionProfiles.js');
    const api = await cp.get_current_connection_profile();
    // In our stubs, this returns undefined or empty string; both acceptable here
    expect([undefined, ''].includes(api)).toBe(true);
    const map = await cp.get_connection_profile_api();
    expect([undefined, ''].includes(map)).toBe(true);
  });
};
