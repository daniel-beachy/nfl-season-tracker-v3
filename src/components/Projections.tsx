import { useState } from 'react';
import { ArrowUpRight, Flag, Trophy, TrendingUp } from 'lucide-react';
import TrendChart from './TrendChart';
import { formatValue, largestMover, latestRankings, observationSegments, readableTeamColor } from '../lib/presentation.mjs';
import type { Metric, SeasonData, Source, Team, Theme } from '../types';

const views: { id: Metric; label: string; title: string; description: string }[] = [
  { id: 'superBowl', label: 'Super Bowl', title: 'Championship outlook', description: 'Thirty-two teams. One trophy. Watch the field take shape.' },
  { id: 'conference', label: 'Conference', title: 'The road through each conference', description: 'Who will represent the AFC and NFC on the biggest stage?' },
  { id: 'division', label: 'Divisions', title: 'Eight races. No easy roads.', description: 'Each division is normalized to 100% across its four teams.' },
  { id: 'playoffs', label: 'Playoffs', title: 'A ticket to the postseason', description: 'Follow every team’s chances of making the playoff field.' },
  { id: 'wins', label: 'Win totals', title: 'Every win changes the picture', description: 'Projected final regular-season wins, captured one week at a time.' },
];

function MiniTrend({ values, color }: { values: (number | null)[]; color: string }) {
  const real = values.filter((value): value is number => value !== null);
  if (real.length < 2) return <span className="mini-trend-placeholder">FIRST LOOK <span>•</span></span>;
  const min = Math.min(...real), range = Math.max(...real) - min || 1;
  const x = (index: number) => 2 + index / (values.length - 1) * 110;
  const y = (value: number) => 32 - (value - min) / range * 28;
  return <svg className="mini-trend" viewBox="0 0 114 38" aria-hidden="true">{observationSegments(values).map(segment => segment.length === 1
    ? <circle key={segment[0].index} cx={x(segment[0].index)} cy={y(segment[0].value)} r={2} fill={color} />
    : <polyline key={segment[0].index} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={segment.map(point => `${x(point.index)},${y(point.value)}`).join(' ')} />)}</svg>;
}

function SummaryCard({ label, team, value, metric, data, source, theme, accent, empty }: {
  label: string; team?: Team; value?: number; metric: Metric; data: SeasonData; source: Source; theme: Theme; accent?: boolean; empty?: string;
}) {
  const color = team ? readableTeamColor(team, theme) : 'var(--cp-accent)';
  const values = data.snapshots.map(snapshot => team && snapshot.sources[source.id]?.status === 'ok'
    ? snapshot.sources[source.id].projections[team.id]?.[metric] ?? null : null);
  return (
    <article className={`summary-card ${accent ? 'summary-accent' : ''}`}>
      <div className="summary-label">{label}{accent ? <Trophy size={15} /> : <Flag size={14} />}</div>
      <div className="summary-team"><span className="team-monogram" style={{ color, borderColor: color }}>{team?.abbreviation ?? '—'}</span><span>{team?.shortName ?? 'Awaiting data'}</span></div>
      <div className="summary-bottom"><strong>{formatValue(value, metric)}</strong><MiniTrend values={values} color={color} /></div>
      <span className="summary-caption">{team ? metric === 'superBowl' ? 'chance to win the Super Bowl' : 'chance to make the Super Bowl' : empty ?? 'No current observation from this source'}</span>
    </article>
  );
}

export default function Projections({ data, source, theme }: { data: SeasonData; source: Source; theme: Theme }) {
  const [metric, setMetric] = useState<Metric>('superBowl');
  const afc = data.teams.filter(team => team.conference === 'AFC');
  const nfc = data.teams.filter(team => team.conference === 'NFC');
  const favorite = latestRankings(data.snapshots, source.id, 'superBowl', data.teams)[0];
  const afcFavorite = latestRankings(data.snapshots, source.id, 'conference', afc)[0];
  const nfcFavorite = latestRankings(data.snapshots, source.id, 'conference', nfc)[0];
  const mover = largestMover(data.snapshots, source.id, data.teams);
  const view = views.find(item => item.id === metric)!;
  const supported = source.metrics.includes(metric);
  const chartProps = { snapshots: data.snapshots, sourceId: source.id, metric, theme };
  return (
    <>
      <div className="summary-grid">
        <SummaryCard label="SUPER BOWL FAVORITE" team={favorite?.team} value={favorite?.value} metric="superBowl" data={data} source={source} theme={theme} accent />
        <SummaryCard label="AFC FRONT-RUNNER" team={afcFavorite?.team} value={afcFavorite?.value} metric="conference" data={data} source={source} theme={theme} empty="Conference market not available yet" />
        <SummaryCard label="NFC FRONT-RUNNER" team={nfcFavorite?.team} value={nfcFavorite?.value} metric="conference" data={data} source={source} theme={theme} empty="Conference market not available yet" />
        <article className="summary-card movement-card">
          <div className="summary-label">BIGGEST RISER <TrendingUp size={15} /></div>
          {mover && mover.delta > 0 ? <>
            <div className="summary-team"><span className="team-monogram" style={{ color: readableTeamColor(mover.team, theme) }}>{mover.team.abbreviation}</span><span>{mover.team.shortName}</span></div>
            <div className="summary-bottom"><strong className="positive">+{mover.delta.toFixed(1)}<small> pp</small></strong><ArrowUpRight size={29} className="positive" /></div>
            <span className="summary-caption">Super Bowl change since last snapshot</span>
          </> : <>
            <div className="first-chapter"><span className="chapter-icon"><TrendingUp size={22} /></span><strong>{data.snapshots.length < 2 ? 'A new season.' : 'Holding steady.'}<br />{data.snapshots.length < 2 ? 'A clean slate.' : 'The race goes on.'}</strong></div>
            <span className="summary-caption">{data.snapshots.length < 2 ? 'Movers appear after the next capture' : 'No positive change to report this snapshot'}</span>
          </>}
        </article>
      </div>
      <section className="projections-section" aria-labelledby="projections-title">
        <div className="section-heading"><div><span className="eyebrow">THE BIG PICTURE</span><h2 id="projections-title">{view.title}</h2><p>{view.description}</p></div><span className="quiet-badge">{source.kind === 'market' ? 'MARKET IMPLIED' : 'MODEL PROJECTIONS'}</span></div>
        <div className="metric-tabs" aria-label="Projection category">
          {views.map(item => <button key={item.id} onClick={() => setMetric(item.id)} aria-pressed={metric === item.id} className={metric === item.id ? 'active' : ''}>{item.label}</button>)}
        </div>
        {!supported ? <div className="unavailable-panel"><CircleMarket /><h3>This source doesn’t publish this market.</h3><p>{source.name} currently supports {source.metrics.map(item => views.find(view => view.id === item)?.label).join(', ')}. Choose another source to explore {view.label.toLowerCase()}.</p></div> :
          <div className={`charts-grid ${metric === 'superBowl' || metric === 'wins' ? 'single-chart' : ''}`}>
            {metric === 'superBowl' && <TrendChart {...chartProps} key={`${source.id}-sb`} title="Road to the Lombardi" subtitle="Chance to win the Super Bowl · all 32 teams" teams={data.teams} tall />}
            {metric === 'wins' && <TrendChart {...chartProps} key={`${source.id}-wins`} title="Wins on the horizon" subtitle="Projected final regular-season wins · all 32 teams" teams={data.teams} tall />}
            {(metric === 'conference' || metric === 'playoffs') && ['AFC', 'NFC'].map(conference => <TrendChart {...chartProps} key={`${source.id}-${metric}-${conference}`} title={`${conference} ${metric === 'conference' ? 'championship' : 'playoff picture'}`} subtitle={metric === 'conference' ? 'Chance to make the Super Bowl · 16 teams' : 'Chance to make the playoffs · 16 teams'} teams={conference === 'AFC' ? afc : nfc} />)}
            {metric === 'division' && ['AFC', 'NFC'].flatMap(conference => ['East', 'North', 'South', 'West'].map(division => <TrendChart {...chartProps} key={`${source.id}-${conference}-${division}`} title={`${conference} ${division}`} subtitle="Chance to win the division · normalized to 100%" teams={data.teams.filter(team => team.conference === conference && team.division === division)} />))}
          </div>}
      </section>
    </>
  );
}

function CircleMarket() {
  return <span className="empty-icon"><TrendingUp size={26} /></span>;
}
