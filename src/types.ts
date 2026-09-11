export type Metric = 'superBowl' | 'conference' | 'division' | 'playoffs' | 'wins';
export type Phase = 'preseason' | 'regular' | 'postseason' | 'offseason';
export type Theme = 'light' | 'dark';

export interface Team {
  id: string;
  name: string;
  shortName: string;
  abbreviation: string;
  conference: 'AFC' | 'NFC';
  division: 'East' | 'North' | 'South' | 'West';
  color: string;
  alternateColor: string;
  logo?: string;
}

export interface Source {
  id: string;
  name: string;
  kind: 'forecast' | 'market';
  description: string;
  url: string;
  metrics: Metric[];
  awards?: boolean;
}

export interface SourceSnapshot {
  status: 'ok' | 'unavailable';
  observedAt?: string;
  note?: string;
  projections: Record<string, Partial<Record<Metric, number | null>>>;
}

export interface Player {
  id: string;
  name: string;
  teamId: string;
  value: number;
}

export interface LeaderCategory {
  id: string;
  name: string;
  unit: string;
  players: Player[];
}

export interface AwardCandidate {
  id: string;
  name: string;
  teamId: string | null;
  americanOdds: number;
  impliedProbability: number;
}

export interface AwardCategory {
  id: string;
  name: string;
  abbreviation: string;
  candidateType: 'player' | 'coach';
  probabilityBasis: 'raw-implied';
  listedCount: number;
  note: string;
  candidates: AwardCandidate[];
}

export interface AwardSourceSnapshot {
  status: 'ok' | 'unavailable';
  observedAt?: string;
  note: string;
  categories: AwardCategory[];
}

export interface Snapshot {
  id: string;
  capturedAt: string;
  season: number;
  phase: Phase;
  week: number | null;
  label: string;
  note?: string;
  sources: Record<string, SourceSnapshot>;
  awards?: Record<string, AwardSourceSnapshot>;
  leaders: {
    status: 'ok' | 'unavailable' | 'not-started';
    note?: string;
    categories: LeaderCategory[];
  };
}

export interface SeasonData {
  schemaVersion: 1;
  season: number;
  kind: 'live' | 'mock';
  startsAt: string;
  teams: Team[];
  sources: Source[];
  snapshots: Snapshot[];
}

export interface SeasonEntry {
  year: number;
  label: string;
  kind: 'live' | 'mock';
  phase: Phase;
  startsAt: string;
  snapshotCount: number;
  lastCapturedAt: string | null;
  file: string;
}

export interface Manifest {
  schemaVersion: 1;
  currentSeason: number;
  generatedAt: string;
  seasons: SeasonEntry[];
}
