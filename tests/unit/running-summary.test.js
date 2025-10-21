export default ({ test, expect }) => {
  test('running summary: storage initializes and tracks versions', async () => {
    const rs = await import('../../tests/virtual/runningSceneSummary.js');
    // Initially empty
    expect(Array.isArray(rs.get_running_summary_versions())).toBe(true);
    expect(rs.get_running_summary_versions().length).toBe(0);

    // Add a version and verify getters
    const v = rs.add_running_summary_version('hello', 1, 0, 0, 0);
    expect(typeof v).toBe('number');
    expect(rs.get_current_running_summary_version()).toBe(v);
    expect(rs.get_current_running_summary_content()).toBe('hello');

    // Switch current to same; no throw
    rs.set_current_running_summary_version(v);

    // Delete and verify empty again
    rs.delete_running_summary_version(v);
    expect(rs.get_running_summary_versions().length).toBe(0);
  });
};

