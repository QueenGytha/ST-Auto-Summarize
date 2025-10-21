export default ({ test }) => {
  test('operationQueue: init idempotence', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');
    await oq.initOperationQueue();
    await oq.initOperationQueue();
  }, 8000);
};

