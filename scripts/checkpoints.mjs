import { URLS } from './providers.mjs';

const DAY = 86400000;
const monthLabel = now => new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(now);

export async function resolveCheckpoint(season, now, schedule, metadata, get) {
  const calendar = schedule?.leagues?.find(league => Number(league.season?.year) === season)?.calendar;
  const periods = (calendar ?? []).filter(period => ['2', '3'].includes(String(period.value)))
    .flatMap(period => (period.entries ?? [])
      .filter(entry => !(String(period.value) === '3' && /pro bowl/i.test(entry.label ?? '')))
      .map(entry => ({ type: Number(period.value), week: Number(entry.value), start: Date.parse(entry.startDate), end: Date.parse(entry.endDate) })))
    .sort((a, b) => a.start - b.start);
  // The fall schedule is often unpublished in spring. These dates cannot be regular-season games.
  if (now.getUTCFullYear() === season && now.getUTCMonth() >= 2 && now.getUTCMonth() < 8 &&
    (!periods.length || !schedule?.events?.length)) {
    return {
      ...metadata, week: null, label: monthLabel(now), eligible: true, closesAt: Date.UTC(season, 8, 1),
      note: `${metadata.note} Monthly preseason history: fall game schedule is not yet verified. Actual current prices only; regular-season statistics are not substituted.`,
    };
  }
  if (!periods.length || periods.some(period => !Number.isFinite(period.start) || !Number.isFinite(period.end) ||
    !Number.isInteger(period.week) || period.week < 1 || period.week > 18)) {
    throw new Error('Cannot verify capture window: ESPN season calendar is missing or invalid.');
  }
  const readWeek = async period => {
    const payload = period.type === 2 && period.week === 1
      ? schedule : await get(URLS.scoreboard(season, period.type, period.week));
    const events = payload?.events;
    if (!Array.isArray(events) || !events.length || events.some(event =>
      Number(event.season?.year) !== season || Number(event.season?.type) !== period.type ||
      Number(event.week?.number) !== period.week || !Number.isFinite(Date.parse(event.date)) ||
      typeof event.status?.type?.completed !== 'boolean' || !['pre', 'in', 'post'].includes(event.status?.type?.state))) {
      throw new Error(`Cannot verify schedule events for season ${season}, type ${period.type}, week ${period.week}.`);
    }
    return {
      firstKickoff: Math.min(...events.map(event => Date.parse(event.date))),
      complete: events.every(event => event.status.type.completed && event.status.type.state === 'post' && Date.parse(event.date) < +now),
      untouched: events.every(event => !event.status.type.completed && event.status.type.state === 'pre' && Date.parse(event.date) > +now),
    };
  };
  const opening = periods.find(period => period.type === 2 && period.week === 1);
  if (!opening) throw new Error('Cannot verify schedule: regular-season Week 1 is missing.');
  const opener = await readWeek(opening);
  if (+now < opener.firstKickoff) {
    if (!opener.untouched) throw new Error('Opening schedule status conflicts with its future kickoff.');
    return {
      ...metadata, week: null,
      label: now.getUTCMonth() < 8 || now.getUTCDate() === 1 ? monthLabel(now) : 'Preseason',
      closesAt: opener.firstKickoff, eligible: true,
      note: `${metadata.note} Pre-kickoff baseline; no regular-season game has started.`,
    };
  }
  if (metadata.phase === 'offseason' && +now - Date.parse(metadata.endsAt) >= 7 * DAY) {
    return { ...metadata, week: null, label: 'Offseason', eligible: true, closesAt: null };
  }
  let index = periods.findLastIndex(period => period.start <= +now);
  if (index < 0) throw new Error('Cannot verify active schedule period.');
  const current = await readWeek(periods[index]);
  const incomplete = () => ({
    ...metadata, eligible: false, reason: 'in-progress',
    note: 'Capture skipped: games are in progress or the preceding week is unfinished. No preseason or completed-week prices were saved.',
  });
  let closesAt;
  if (current.complete) {
    const next = periods[index + 1];
    if (next) {
      const upcoming = await readWeek(next);
      if (!upcoming.untouched) return incomplete();
      closesAt = upcoming.firstKickoff;
    }
  } else if (current.untouched && index > 0) {
    closesAt = current.firstKickoff;
    index--;
    if (!(await readWeek(periods[index])).complete) return incomplete();
  } else return incomplete();
  const completed = periods[index];
  const phase = completed.type === 2 ? 'regular' : 'postseason';
  return {
    ...metadata, phase, week: completed.week, eligible: true, closesAt,
    label: phase === 'regular' ? `Week ${completed.week}` : `Postseason week ${completed.week}`,
    note: `${metadata.note} Checkpoint is AFTER all games in ${phase} week ${completed.week}, not the upcoming week. The next competitive NFL week has not started.`,
  };
}

export function assertBeforeNextKickoff(time, closesAt) {
  if (closesAt != null && time >= closesAt) {
    throw new Error('The next kickoff occurred during collection; refusing to save mixed-week odds or statistics.');
  }
}
