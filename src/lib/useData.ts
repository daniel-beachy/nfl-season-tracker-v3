import { useEffect, useState } from 'react';
import type { Manifest, SeasonData } from '../types';
import { isAwards } from './awards.mjs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isManifest(value: unknown): value is Manifest {
  return isRecord(value) && value.schemaVersion === 1 && typeof value.currentSeason === 'number'
    && typeof value.generatedAt === 'string' && Array.isArray(value.seasons) && value.seasons.length > 0
    && value.seasons.every(entry => isRecord(entry) && typeof entry.year === 'number'
      && typeof entry.label === 'string' && typeof entry.file === 'string'
      && /^seasons\/\d{4}\.json$/.test(entry.file));
}

export function isSeason(value: unknown): value is SeasonData {
  if (!isRecord(value)) return false;
  const { sources, teams } = value;
  return isRecord(value) && value.schemaVersion === 1 && typeof value.season === 'number'
    && (value.kind === 'live' || value.kind === 'mock') && typeof value.startsAt === 'string'
    && Array.isArray(teams) && teams.length === 32
    && teams.every(team => isRecord(team) && typeof team.id === 'string'
      && typeof team.name === 'string' && typeof team.color === 'string' && typeof team.alternateColor === 'string')
    && Array.isArray(sources) && sources.every(source => isRecord(source)
      && typeof source.id === 'string' && Array.isArray(source.metrics))
    && Array.isArray(value.snapshots) && value.snapshots.every(snapshot => isRecord(snapshot)
      && typeof snapshot.capturedAt === 'string' && isRecord(snapshot.sources)
      && isRecord(snapshot.leaders) && Array.isArray(snapshot.leaders.categories)
      && (snapshot.awards === undefined || isAwards(snapshot.awards,
        sources.map(source => source.id), teams.map(team => team.id))));
}

export function useData<T>(path: string | null, validate: (value: unknown) => value is T) {
  const [result, setResult] = useState<{ path: string; data?: T; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setResult(null);
    fetch(`${import.meta.env.BASE_URL}data/${path}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`Snapshot request failed (HTTP ${response.status}).`);
        const body: unknown = await response.json();
        if (!validate(body)) throw new Error('The snapshot file has an unsupported or incomplete format.');
        return body;
      })
      .then(data => setResult({ path, data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ path, error: error instanceof Error ? error.message : 'Could not read the snapshot file.' });
      });
    return () => controller.abort();
  }, [path, validate, retry]);
  const current = result?.path === path ? result : null;
  return { data: current?.data, error: current?.error, loading: !!path && !current, retry: () => setRetry(value => value + 1) };
}
