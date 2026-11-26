// Keep draft records addressable by ID, but exclude them from learner-facing counts and indexes.
export function isPublished(record) {
  return record?.editorialStatus !== 'draft';
}
