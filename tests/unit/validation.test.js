export default ({ test, expect }) => {
  test('validation: disabled path short-circuits to true', async () => {
    const { validate_summary } = await import('../../tests/virtual/summaryValidation.js');
    const ok = await validate_summary('anything', 'regular');
    expect(ok).toBe(true);
  });
};

