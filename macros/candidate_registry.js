export const name = 'candidate_registry';

export function build(registryListing) {
  return registryListing;
}

export const description = {
  format: 'Plain text listing "- [uid] Name (type) - Synopsis\\n  Aliases: alias1, alias2"',
  source: 'recapToLorebookProcessor.js (builds from registry state)',
  usedBy: ['lorebook-entry-lookup.js']
};
