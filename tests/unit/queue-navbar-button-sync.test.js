// Test: Queue navbar button state synchronization
// This verifies the fix for: navbar sometimes displays itself even when collapsed
export default ({ test, expect }) => {
  test('operationQueueUI: includes button state sync when showing navbar', async () => {
    // Read the source code to verify the fix is in place
    const fs = await import('fs');
    const path = await import('path');
    const sourceFile = path.join(process.cwd(), 'operationQueueUI.js');
    const source = fs.readFileSync(sourceFile, 'utf-8');

    // Verify updateQueueDisplay includes button icon/title updates when showing navbar
    // Check for constant usage (updated code uses ICON_CHEVRON_RIGHT/LEFT constants)
    const hasShowIconUpdate = source.includes("removeClass(ICON_CHEVRON_RIGHT).addClass(ICON_CHEVRON_LEFT)");
    const hasShowTitleUpdate = source.includes("attr('title', 'Hide Queue Navbar')");

    expect(hasShowIconUpdate).toBe(true);
    expect(hasShowTitleUpdate).toBe(true);
  });

  test('operationQueueUI: includes button state sync when hiding navbar', async () => {
    // Read the source code to verify the fix is in place
    const fs = await import('fs');
    const path = await import('path');
    const sourceFile = path.join(process.cwd(), 'operationQueueUI.js');
    const source = fs.readFileSync(sourceFile, 'utf-8');

    // Verify updateQueueDisplay includes button icon/title updates when hiding navbar
    // Check for constant usage (updated code uses ICON_CHEVRON_RIGHT/LEFT constants)
    const hasHideIconUpdate = source.includes("removeClass(ICON_CHEVRON_LEFT).addClass(ICON_CHEVRON_RIGHT)");
    const hasHideTitleUpdate = source.includes("attr('title', 'Show Queue Navbar')");

    expect(hasHideIconUpdate).toBe(true);
    expect(hasHideTitleUpdate).toBe(true);
  });
};
