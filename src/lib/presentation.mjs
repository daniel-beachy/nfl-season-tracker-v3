/** @typedef {import('../types').Team} Team */
/** @typedef {import('../types').Snapshot} Snapshot */
/** @typedef {import('../types').Metric} Metric */
/** @typedef {import('../types').Player} Player */

/** @param {Partial<Record<Metric, number | null>> | undefined} values @param {Metric} metric */
export function metricValue(values, metric) {
  const value = values?.[metric];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** @param {Snapshot[]} snapshots @param {string} source @param {Metric} metric @param {Team[]} teams */
export function chartRows(snapshots, source, metric, teams) {
  return snapshots.map(snapshot => {
    /** @type {Record<string, string | number | null>} */
    const row = { label: snapshot.label, capturedAt: snapshot.capturedAt };
    for (const team of teams) {
      row[team.id] = snapshot.sources[source]?.status === 'ok'
        ? metricValue(snapshot.sources[source].projections[team.id], metric)
        : null;
    }
    return row;
  });
}

/** @param {Snapshot[]} snapshots @param {string} source @param {Metric} metric @param {Team[]} teams */
export function latestRankings(snapshots, source, metric, teams) {
  const latest = snapshots.at(-1)?.sources[source];
  if (latest?.status !== 'ok') return [];
  return teams.flatMap(team => {
    const value = metricValue(latest.projections[team.id], metric);
    return value === null ? [] : [{ team, value }];
  }).sort((a, b) => b.value - a.value);
}

/** @param {Snapshot[]} snapshots @param {string} categoryId @param {Player[]} players */
export function leaderRows(snapshots, categoryId, players) {
  return snapshots.map(snapshot => {
    const category = snapshot.leaders.status === 'ok'
      ? snapshot.leaders.categories.find(item => item.id === categoryId)
      : undefined;
    /** @type {Record<string, string | number | null>} */
    const row = { label: snapshot.label, capturedAt: snapshot.capturedAt };
    for (const player of players) {
      row[player.id] = category?.players.find(item => item.id === player.id)?.value ?? null;
    }
    return row;
  });
}

/** @param {string} color */
function luminance(color) {
  const hex = color.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  const rgb = [0, 2, 4].map(index => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

/** @param {Team} team @param {'light' | 'dark'} theme */
export function readableTeamColor(team, theme) {
  const background = theme === 'dark' ? 0.0222 : 1;
  const contrast = (/** @type {number} */ value) =>
    (Math.max(value, background) + 0.05) / (Math.min(value, background) + 0.05);
  const primary = luminance(team.color);
  const alternate = luminance(team.alternateColor);
  if (primary === null) return 'var(--cp-text-soft)';
  if (contrast(primary) >= 3) return `#${team.color.replace('#', '')}`;
  if (alternate !== null && contrast(alternate) >= 3) return `#${team.alternateColor.replace('#', '')}`;
  // Some teams have two dark colors. Preserve a brand hue while lifting contrast.
  const useAlternate = alternate !== null && alternate > 0.005 && contrast(alternate) > contrast(primary);
  const hex = (useAlternate ? team.alternateColor : team.color).replace('#', '');
  const channels = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
  const target = theme === 'dark' ? 255 : 0;
  for (let step = 1; step <= 100; step++) {
    const adjusted = channels.map(channel => Math.round(channel + (target - channel) * step / 100).toString(16).padStart(2, '0')).join('');
    const light = luminance(adjusted);
    if (light !== null && contrast(light) >= 3.1) return `#${adjusted}`;
  }
  return 'var(--cp-text-soft)';
}

/** @param {{kind: string, startsAt: string}} season @param {Date} [now] */
export function seasonBanner(season, now = new Date()) {
  if (season.kind === 'mock') return 'mocked — not fully accurate';
  if (now < new Date(season.startsAt)) return 'preseason — season not started';
  return null;
}

/** @param {Snapshot} snapshot @param {string} startsAt */
export function isPreseasonSnapshot(snapshot, startsAt) {
  return Date.parse(snapshot.capturedAt) < Date.parse(startsAt);
}

/** @param {Snapshot[]} snapshots @param {string} source @param {Team[]} teams */
export function largestMover(snapshots, source, teams) {
  if (snapshots.length < 2) return null;
  const previous = snapshots.at(-2)?.sources[source];
  const latest = snapshots.at(-1)?.sources[source];
  if (previous?.status !== 'ok' || latest?.status !== 'ok') return null;
  const movers = teams.flatMap(team => {
    const before = metricValue(previous.projections[team.id], 'superBowl');
    const after = metricValue(latest.projections[team.id], 'superBowl');
    return before === null || after === null ? [] : [{ team, delta: after - before, value: after }];
  }).sort((a, b) => b.delta - a.delta);
  return movers[0] ?? null;
}

/** @param {number | null | undefined} value @param {Metric} [metric] */
export function formatValue(value, metric = 'superBowl') {
  if (value === undefined || value === null) return '—';
  return metric === 'wins' ? value.toFixed(1) : `${value.toFixed(value < 1 && value > 0 ? 2 : 1)}%`;
}

/** @param {string} date */
export function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(date));
}

/** @param {(number | null)[]} values */
export function observationSegments(values) {
  /** @type {{index: number, value: number}[][]} */
  const segments = [];
  /** @type {{index: number, value: number}[]} */
  let segment = [];
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push({ index, value });
  });
  if (segment.length) segments.push(segment);
  return segments;
}
