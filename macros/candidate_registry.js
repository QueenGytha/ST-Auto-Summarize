export const name = 'candidate_registry';

export function build(registryListing) {
  return registryListing;
}

export const description = {
  format: 'Plain text listing "- UID=<number> | name: <type-name> | aliases: <aliases> | synopsis: <synopsis>"',
  source: 'recapToLorebookProcessor.js (builds from registry state)',
  usedBy: ['lorebook-entry-lookup.js']
};
