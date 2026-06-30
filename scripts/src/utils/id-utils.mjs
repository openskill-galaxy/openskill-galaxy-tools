const DATA_FILES = [
  'courses', 'lessons', 'knowledge-points', 'questions',
  'exams', 'cases', 'routes', 'glossary', 'faqs', 'tags', 'module'
];

const ID_FIELDS = {
  courses: 'id',
  lessons: 'id',
  'knowledge-points': 'id',
  questions: 'id',
  exams: 'id',
  cases: 'id',
  routes: 'id',
  glossary: 'id',
  faqs: 'id',
  tags: 'id',
};

export { DATA_FILES, ID_FIELDS };

export function collectIds(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => item?.id).filter(Boolean);
}

export function makeIdSet(arr) {
  return new Set(collectIds(arr));
}
