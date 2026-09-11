import { useState } from 'react';
import { ArrowUpRight, ChevronDown, Trophy } from 'lucide-react';
import { Plot } from './TrendChart';
import { awardRows, formatAmericanOdds } from '../lib/awards.mjs';
import { formatDate, formatValue, readableTeamColor } from '../lib/presentation.mjs';
import type { SeasonData, Source, Theme } from '../types';

export default function Awards({ data, source, theme }: { data: SeasonData; source?: Source; theme: Theme }) {
  const [categoryId, setCategoryId] = useState('mvp');
  const [showAll, setShowAll] = useState(false);
  const latest = data.snapshots.at(-1);
  const observation = source ? latest?.awards?.[source.id] : undefined;
  const categories = observation?.status === 'ok' ? observation.categories : [];
  const category = categories.find(item => item.id === categoryId) ?? categories[0];
  const candidates = category?.candidates ?? [];
  const topTen = candidates.slice(0, 10);
  const rows = awardRows(data.snapshots, source?.id ?? '', category?.id ?? '', topTen);
  const observations = rows.filter(row => topTen.some(candidate => typeof row[candidate.id] === 'number')).length;
  const selectCategory = (id: string) => { setCategoryId(id); setShowAll(false); };
  const colorFor = (teamId: string | null) => {
    const team = data.teams.find(item => item.id === teamId);
    return team ? readableTeamColor(team, theme) : 'var(--cp-accent)';
  };
  return (
    <section className="awards-section">
      <div className="section-heading">
        <div><span className="eyebrow">THE INDIVIDUAL HONORS</span><h2>The race for recognition.</h2><p>Player and coach award odds. A season’s worth of contenders.</p></div>
        {category && <label className="select-field category-select award-category-select"><span>AWARD CATEGORY</span>
          <select aria-label="Award category" value={category.id} onChange={event => selectCategory(event.target.value)}>
            {categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>}
      </div>
      {!category ? <div className="stats-empty">
        <div className="empty-field"><span className="field-line" /><Trophy size={42} /><span className="field-line" /></div>
        <span className="eyebrow">NO INVENTED HISTORY</span>
        <h3>{observation?.status === 'unavailable' ? 'Award odds are unavailable.' : 'Awards weren’t captured in this snapshot.'}</h3>
        <p>{observation?.note ?? 'Award tracking starts with its first actual capture. Earlier snapshots and the mocked archive have no award odds; choose a later snapshot or the current season.'}</p>
      </div> : <>
        <div className="awards-market-grid" aria-label="Award market favorites">
          {categories.map(item => {
            const favorite = item.candidates[0];
            return <button key={item.id} className={`award-market ${category.id === item.id ? 'active' : ''}`}
              aria-pressed={category.id === item.id} onClick={() => selectCategory(item.id)} title={item.name}>
              <span className="award-market-label">{item.abbreviation}<Trophy size={13} /></span>
              <strong>{favorite.name}</strong>
              <span className="award-market-quote"><span className="series-dot" style={{ background: colorFor(favorite.teamId) }} />
                {formatAmericanOdds(favorite.americanOdds)} <span>{formatValue(favorite.impliedProbability)} implied</span>
              </span>
            </button>;
          })}
        </div>
        <div className="award-provenance">
          <span><span className="status-dot" />{source?.name} · {latest ? formatDate(latest.capturedAt) : 'No capture'}</span>
          <span>Bookmaker margin included · not normalized</span>
        </div>
        <section className="chart-card chart-card-wide">
          <div className="chart-heading"><div><span className="eyebrow">RAW IMPLIED PROBABILITY OVER TIME</span><h3>{category.name}</h3><p>The latest top {topTen.length} candidates · missing quotes stay missing</p></div><span className="chart-unit">%</span></div>
          <Plot rows={rows} series={topTen.map(candidate => ({ id: candidate.id, name: candidate.name, color: colorFor(candidate.teamId) }))} tall />
          {observations === 1 && <div className="award-first-observation"><strong>First award observation</strong><span>A trend needs another capture. This point uses its actual date, not a backdated preseason estimate.</span></div>}
          <div className="player-legend">{topTen.map(candidate => <span key={candidate.id}><span className="series-dot" style={{ background: colorFor(candidate.teamId) }} />{candidate.name}</span>)}</div>
          <p className="chart-footnote">These are price-implied percentages, not model forecasts or fair chances. Award fields may be incomplete; the displayed probabilities do not sum to 100%.</p>
        </section>
        <div className="leaderboard-heading"><h3><Trophy size={18} /> The contenders</h3><span>{candidates.length} captured / {category.listedCount} listed</span></div>
        <div className="award-table-key"><span>{category.candidateType === 'coach' ? 'Coach' : 'Player'}</span><span>American odds <span>/ Implied %</span></span></div>
        <ol className="leaderboard awards-leaderboard">
          {(showAll ? candidates : topTen).map((candidate, index) => {
            const team = data.teams.find(team => team.id === candidate.teamId);
            return <li key={candidate.id} className={`leader-card award-candidate ${index === 0 ? 'leader-first' : ''}`}>
              <span className="leader-rank">{String(index + 1).padStart(2, '0')}</span>
              <div className="leader-person"><strong>{candidate.name}</strong><span><span className="series-dot" style={{ background: colorFor(candidate.teamId) }} />{category.candidateType === 'coach' ? 'Coach · team not verified' : team?.name ?? 'Team not provided'}</span></div>
              <div className="leader-total"><strong>{formatAmericanOdds(candidate.americanOdds)}</strong><span>{formatValue(candidate.impliedProbability)} implied</span></div>
            </li>;
          })}
        </ol>
        {candidates.length > 10 && <button className="award-expand" onClick={() => setShowAll(value => !value)}>
          {showAll ? 'Show top 10 candidates' : `Show all ${candidates.length} candidates`}<ChevronDown size={14} />
        </button>}
        <p className="source-note">{category.note}</p>
        <details className="award-source-details"><summary>Source &amp; capture notes <ChevronDown size={13} /></summary><p>{observation?.note}</p>
          {source && <a href={source.url} target="_blank" rel="noreferrer">View source <ArrowUpRight size={13} /></a>}
        </details>
      </>}
    </section>
  );
}
