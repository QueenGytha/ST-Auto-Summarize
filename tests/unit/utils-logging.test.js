/**
 * @file Tests for utils.js logging functions (log, debug, error, toast)
 * @module utils
 */

export default ({ test, expect }) => {
  test('log: outputs with correct prefix', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    // Capture console.log output
    const originalLog = console.log;
    let capturedArgs = [];
    console.log = (...args) => { capturedArgs = args; };

    utils.log('[Test]', 'message', { data: 'test' });

    console.log = originalLog;

    expect(capturedArgs[0]).toBe('[Gytha][AutoSummarize]');
    expect(capturedArgs[1]).toBe('[Test]');
    expect(capturedArgs[2]).toBe('message');
  });

  test('log: handles multiple arguments', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const originalLog = console.log;
    let capturedArgs = [];
    console.log = (...args) => { capturedArgs = args; };

    utils.log('[Core]', 'msg1', 'msg2', 123, { key: 'value' });

    console.log = originalLog;

    expect(capturedArgs.length).toBe(6); // prefix + subsystem + 4 args
    expect(capturedArgs[0]).toBe('[Gytha][AutoSummarize]');
    expect(capturedArgs[1]).toBe('[Core]');
    expect(capturedArgs[5].key).toBe('value');
  });

  test('debug: does NOT log when debug_mode is false', async () => {
    const utils = await import('../../tests/virtual/utils.js');
    const { set_settings } = await import('../../tests/virtual/index.js');

    set_settings('debug_mode', false);

    const originalLog = console.log;
    let called = false;
    console.log = () => { called = true; };

    utils.debug('[Test]', 'should not appear');

    console.log = originalLog;

    expect(called).toBe(false);
  });

  test('debug: DOES log when debug_mode is true', async () => {
    const utils = await import('../../tests/virtual/utils.js');
    const { set_settings } = await import('../../tests/virtual/index.js');

    set_settings('debug_mode', true);

    const originalLog = console.log;
    let capturedArgs = [];
    console.log = (...args) => { capturedArgs = args; };

    utils.debug('[Memory]', 'debug message', { state: 'active' });

    console.log = originalLog;

    expect(capturedArgs[0]).toBe('[Gytha][AutoSummarize]');
    expect(capturedArgs[1]).toBe('[DEBUG]');
    expect(capturedArgs[2]).toBe('[Memory]');
    expect(capturedArgs[3]).toBe('debug message');
  });

  test('error: logs to console.error with prefix', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const originalError = console.error;
    let capturedArgs = [];
    console.error = (...args) => { capturedArgs = args; };

    utils.error('[Validation]', 'error occurred', new Error('test'));

    console.error = originalError;

    expect(capturedArgs[0]).toBe('[Gytha][AutoSummarize]');
    expect(capturedArgs[1]).toBe('[ERROR]');
    expect(capturedArgs[2]).toBe('[Validation]');
    expect(capturedArgs[3]).toBe('error occurred');
  });

  test('error: handles non-subsystem format (backward compatibility)', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const originalError = console.error;
    let capturedArgs = [];
    console.error = (...args) => { capturedArgs = args; };

    utils.error('Simple error message');

    console.error = originalError;

    expect(capturedArgs[0]).toBe('[Gytha][AutoSummarize]');
    expect(capturedArgs[1]).toBe('[ERROR]');
    expect(capturedArgs[2]).toBe('Simple error message');
  });

  test('toast: calls toastr with correct type', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    // Mock toastr
    const originalToastr = globalThis.toastr;
    let capturedMessage = '';
    let capturedType = '';
    globalThis.toastr = {
      info: (msg) => { capturedMessage = msg; capturedType = 'info'; },
      success: (msg) => { capturedMessage = msg; capturedType = 'success'; },
      error: (msg) => { capturedMessage = msg; capturedType = 'error'; },
      warning: (msg) => { capturedMessage = msg; capturedType = 'warning'; }
    };

    utils.toast('Test message', 'success');

    globalThis.toastr = originalToastr;

    expect(capturedMessage).toBe('Test message');
    expect(capturedType).toBe('success');
  });

  test('toast: defaults to info type', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    const originalToastr = globalThis.toastr;
    let capturedType = '';
    globalThis.toastr = {
      info: () => { capturedType = 'info'; },
      success: () => { capturedType = 'success'; },
      error: () => { capturedType = 'error'; },
      warning: () => { capturedType = 'warning'; }
    };

    utils.toast('Default type test');

    globalThis.toastr = originalToastr;

    expect(capturedType).toBe('info');
  });

  test('SUBSYSTEM: exports all subsystem constants', async () => {
    const utils = await import('../../tests/virtual/utils.js');

    expect(utils.SUBSYSTEM).toBeDefined();
    expect(utils.SUBSYSTEM.CORE).toBe('[Core]');
    expect(utils.SUBSYSTEM.MEMORY).toBe('[Memory]');
    expect(utils.SUBSYSTEM.SCENE).toBe('[Scene]');
    expect(utils.SUBSYSTEM.RUNNING).toBe('[Running]');
    expect(utils.SUBSYSTEM.COMBINED).toBe('[Combined]');
    expect(utils.SUBSYSTEM.VALIDATION).toBe('[Validation]');
    expect(utils.SUBSYSTEM.UI).toBe('[UI]');
    expect(utils.SUBSYSTEM.PROFILE).toBe('[Profile]');
    expect(utils.SUBSYSTEM.EVENT).toBe('[Event]');
    expect(utils.SUBSYSTEM.QUEUE).toBe('[Queue]');
  });
};
