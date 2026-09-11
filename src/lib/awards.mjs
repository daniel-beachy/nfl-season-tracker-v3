/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is string} */
const text = value => typeof value === 'string' && value.trim().length > 0;

/** @param {unknown} value */
function publishedHistory(value) {
  if (!record(value) || value.kind !== 'published-preseason' || !text(value.label)
    || !text(value.addedAt) || !Number.isFinite(Date.parse(value.addedAt))
    || !Array.isArray(value.references) || !value.references.length) return false;
  const added = Date.parse(value.addedAt);
  const urls = new Set();
  return value.references.every(reference => {
    if (!record(reference) || !text(reference.title) || !text(reference.url) || urls.has(reference.url)
      || !text(reference.publishedAt) || !text(reference.modifiedAt)) return false;
    try {
      const url = new URL(reference.url);
      if (url.protocol !== 'https:' || url.username || url.password) return false;
    } catch { return false; }
    urls.add(reference.url);
    const published = Date.parse(reference.publishedAt);
    const modified = Date.parse(reference.modifiedAt);
    return Number.isFinite(published) && Number.isFinite(modified) && published <= modified && modified <= added;
  });
}

/** @param {unknown} value @returns {value is import('../types').AwardSourceSnapshot} */
export function isAwardSource(value) {
  if (!record(value) || !['ok', 'unavailable'].includes(String(value.status)) || !text(value.note)
    || !Array.isArray(value.categories)
    || value.observedAt !== undefined && (!text(value.observedAt) || !Number.isFinite(Date.parse(value.observedAt)))
    || value.provenance !== undefined && !publishedHistory(value.provenance)) return false;
  if (value.status === 'unavailable') return value.categories.length === 0;
  if (!value.categories.length) return false;
  const categories = new Set();
  return value.categories.every(category => {
    if (!record(category) || !text(category.id) || categories.has(category.id)
      || !text(category.name) || !text(category.abbreviation) || !text(category.note)
      || !['player', 'coach'].includes(String(category.candidateType))
      || category.probabilityBasis !== 'raw-implied'
      || typeof category.listedCount !== 'number' || !Number.isInteger(category.listedCount)
      || !Array.isArray(category.candidates) || !category.candidates.length
      || category.candidates.length > category.listedCount) return false;
    categories.add(category.id);
    const candidates = new Set();
    let previous = Infinity;
    return category.candidates.every(candidate => {
      if (!record(candidate) || !text(candidate.id) || candidates.has(candidate.id)
        || !text(candidate.name) || candidate.teamId !== null && !text(candidate.teamId)
        || typeof candidate.americanOdds !== 'number' || !Number.isFinite(candidate.americanOdds)
        || Math.abs(candidate.americanOdds) < 100
        || typeof candidate.impliedProbability !== 'number' || !Number.isFinite(candidate.impliedProbability)
        || candidate.impliedProbability <= 0 || candidate.impliedProbability > 100
        || candidate.impliedProbability > previous) return false;
      const odds = candidate.americanOdds;
      const implied = odds > 0 ? 10000 / (odds + 100) : -odds / (-odds + 100) * 100;
      if (Math.abs(implied - candidate.impliedProbability) > 1e-8) return false;
      candidates.add(candidate.id);
      previous = candidate.impliedProbability;
      return true;
    });
  });
}

/** @param {unknown} value @param {string[]} sourceIds @param {string[]} teamIds @param {string} [startsAt] */
export function isAwards(value, sourceIds, teamIds, startsAt) {
  return record(value) && Object.keys(value).length > 0 && Object.entries(value).every(([id, source]) =>
    sourceIds.includes(id) && isAwardSource(source)
    && (!source.provenance || startsAt === undefined ||
      source.provenance.references.every(reference => Date.parse(reference.modifiedAt) < Date.parse(startsAt)))
    && source.categories.every(category => category.candidates.every(candidate =>
      candidate.teamId === null || teamIds.includes(candidate.teamId))));
}

/** @param {import('../types').Snapshot[]} snapshots @param {string} sourceId @param {string} categoryId @param {import('../types').AwardCandidate[]} candidates */
export function awardRows(snapshots, sourceId, categoryId, candidates) {
  return snapshots.map(snapshot => {
    const source = snapshot.awards?.[sourceId];
    const category = source?.status === 'ok' ? source.categories.find(item => item.id === categoryId) : undefined;
    /** @type {Record<string, string | number | null>} */
    const row = { label: snapshot.label, capturedAt: snapshot.capturedAt };
    for (const candidate of candidates) {
      row[candidate.id] = category?.candidates.find(item => item.id === candidate.id)?.impliedProbability ?? null;
    }
    return row;
  });
}

/** @param {number} odds */
export function formatAmericanOdds(odds) {
  return odds > 0 ? `+${odds}` : String(odds);
}
