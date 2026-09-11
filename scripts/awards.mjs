import { mapLimit } from './http.mjs';
import { americanToPercent, loadFutures, referenceId } from './providers.mjs';

const AWARDS = [
  { id: 'mvp', name: 'Most Valuable Player', abbreviation: 'MVP', match: /^(?:regular season )?(?:mvp|most valuable player)$/i },
  { id: 'opoy', name: 'Offensive Player of the Year', abbreviation: 'OPOY', match: /^offensive player of the year$/i },
  { id: 'dpoy', name: 'Defensive Player of the Year', abbreviation: 'DPOY', match: /^defensive player of the year$/i },
  { id: 'oroy', name: 'Offensive Rookie of the Year', abbreviation: 'OROY', match: /^offensive rookie of the year$/i },
  { id: 'droy', name: 'Defensive Rookie of the Year', abbreviation: 'DROY', match: /^defensive rookie of the year$/i },
  { id: 'coy', name: 'Coach of the Year', abbreviation: 'COY', match: /^coach of the year$/i },
  { id: 'cpoy', name: 'Comeback Player of the Year', abbreviation: 'CPOY', match: /^comeback player of the year$/i },
  { id: 'protector', name: 'Protector of the Year', abbreviation: 'Protector', match: /^protector of the year$/i },
];
const unavailable = note => ({ status: 'unavailable', note, categories: [] });

export async function adaptAwards(payload, teams, season, get) {
  const markets = new Map();
  let rejected = 0;
  for (const item of payload?.items ?? []) {
    const definition = AWARDS.find(award => award.match.test(String(item.name ?? '').trim()));
    if (!definition) continue;
    const book = item.futures?.find(future => future.provider?.name?.toLowerCase() === 'draftkings');
    if (!referenceId(item.$ref, 'futures', season) || !Array.isArray(book?.books) || markets.has(definition.id)) {
      rejected++;
      continue;
    }
    const candidates = new Map();
    let omitted = 0;
    for (const row of book.books) {
      const id = referenceId(row.athlete?.$ref, 'athletes', season);
      const impliedProbability = americanToPercent(row.value);
      if (!id || impliedProbability === null || candidates.has(id)) { omitted++; continue; }
      candidates.set(id, {
        id, reference: row.athlete.$ref, impliedProbability,
        americanOdds: /^(EVEN|EVENS)$/i.test(String(row.value).trim()) ? 100 : Number(row.value),
      });
    }
    const selected = [...candidates.values()].sort((a, b) => b.impliedProbability - a.impliedProbability).slice(0, 50);
    markets.set(definition.id, { definition, selected, omitted, listedCount: book.books.length, truncated: candidates.size > 50 });
  }

  // A single worker pool bounds all categories together, not six workers per award.
  const jobs = [...markets.values()].flatMap(market => market.selected.map(candidate => ({ market, candidate })));
  const identities = new Map();
  const resolveIdentity = reference => {
    if (!identities.has(reference)) identities.set(reference, get(reference));
    return identities.get(reference);
  };
  const resolved = await mapLimit(jobs, 6, async ({ market, candidate }) => {
    try {
      const person = await resolveIdentity(candidate.reference);
      if (String(person.id) !== candidate.id || typeof person.displayName !== 'string' || !person.displayName.trim()
        || person.$ref && referenceId(person.$ref, 'athletes', season) !== candidate.id) throw new Error('Unverified candidate identity');
      const teamId = market.definition.id === 'coy' || person.active === false ? null : referenceId(person.team?.$ref, 'teams', season);
      return { categoryId: market.definition.id, candidate: {
        id: candidate.id, name: person.displayName.trim(),
        teamId: teams.some(team => team.id === teamId) ? teamId : null,
        americanOdds: candidate.americanOdds, impliedProbability: candidate.impliedProbability,
      } };
    } catch {
      market.omitted++;
      return null;
    }
  });
  const categories = AWARDS.flatMap(definition => {
    const market = markets.get(definition.id);
    if (!market) return [];
    const candidates = resolved.filter(result => result?.categoryId === definition.id)
      .map(result => result.candidate).sort((a, b) => b.impliedProbability - a.impliedProbability || a.name.localeCompare(b.name));
    if (!candidates.length) return [];
    return [{
      id: definition.id, name: definition.name, abbreviation: definition.abbreviation,
      candidateType: definition.id === 'coy' ? 'coach' : 'player', probabilityBasis: 'raw-implied',
      listedCount: market.listedCount, candidates,
      note: `${candidates.length} candidates captured from ${market.listedCount} listed outcomes.${market.truncated ? ' Only the strongest 50 valid quotes are resolved per market; the rest are not captured.' : ''}${market.omitted ? ` Partial data: ${market.omitted} invalid, duplicate or unresolved outcomes omitted.` : ''} Raw implied percentages include bookmaker margin; the captured field is not normalized to 100%.${definition.id === 'coy' ? ' Coach teams are not inferred from former playing-team records.' : ''}`,
    }];
  });
  if (!categories.length) return unavailable(`DraftKings awards unavailable: no resolvable season ${season} award markets. ${rejected} markets rejected. No historical or simulated odds substituted.`);
  const missing = AWARDS.filter(award => !categories.some(category => category.id === award.id)).map(award => award.abbreviation);
  return {
    status: 'ok',
    note: `DraftKings award futures via ESPN, season ${season}. American odds and raw implied percentages include bookmaker margin, not fair-probability forecasts. Provider update time is not supplied; capture time does not establish freshness. Current quotes are not backdated as preseason observations.${missing.length ? ` Missing markets: ${missing.join(', ')}.` : ''}${rejected ? ` ${rejected} unverifiable or duplicate markets omitted.` : ''}${payload.resolutionFailures ? ` ${payload.resolutionFailures} market references failed to resolve.` : ''}${Number(payload.pageCount) > 1 || Number(payload.count) > 100 ? ' Only the first 100 futures markets were inspected.' : ''}`,
    categories,
  };
}

export async function fetchAwards(season, teams, get, payloadPromise = loadFutures(season, get)) {
  try { return await adaptAwards(await payloadPromise, teams, season, get); }
  catch (error) { return unavailable(`DraftKings awards unavailable: ${error.message}. No prior or simulated values substituted.`); }
}
