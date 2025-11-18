export const name = 'prefill';

export function build(prefillText) {
  return prefillText || '';
}

export const description = {
  format: 'Plain text string to prefill LLM response',
  source: 'Operation config (from artifact.prefill)',
  usedBy: ['All operations (optional)']
};
