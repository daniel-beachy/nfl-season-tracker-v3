import { useState } from 'react';
import { ArrowUpRight, BarChart3, Medal } from 'lucide-react';
import { Plot } from './TrendChart';
import { leaderRows, readableTeamColor } from '../lib/presentation.mjs';
import type { SeasonData, Theme } from '../types';

export default function StatLeaders({ data, theme }: { data: SeasonData; theme: Theme }) {
  const latest = data.snapshots.at(-1);
  const categories = latest?.leaders.status === 'ok' ? latest.leaders.categories : [];
  const [categoryId, setCategoryId] = useState('');
  const category = categories.find(item => item.id === categoryId) ?? categories[0];
  const players = [...(category?.players ?? [])].sort((a, b) => b.value - a.value).slice(0, 10);
  const rows = leaderRows(data.snapshots, category?.id ?? '', players);
  const colorFor = (teamId: string) => {
    const team = data.teams.find(team => team.id === teamId);
    return team ? readableTeamColor(team, theme) : 'var(--cp-accent)';
  };
  const previousCategory = data.snapshots.at(-2)?.leaders.categories.find(item => item.id === category?.id);
  return (
    <section className="stats-section">
      <div className="section-heading">
        <div><span className="eyebrow">THE INDIVIDUAL GAME</span><h2>The numbers behind the names.</h2><p>Today’s top ten. Their path through the regular season.</p></div>
        {category && <label className="select-field category-select"><span>STAT CATEGORY</span><select aria-label="Stat category" value={category.id} onChange={event => setCategoryId(event.target.value)}>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      </div>
      {!category || !players.length ? <div className="stats-empty">
        <div className="empty-field"><span className="field-line" /><BarChart3 size={42} /><span className="field-line" /></div>
        <span className="eyebrow">EVERY YARD WILL COUNT</span><h3>{latest?.leaders.status === 'not-started' ? 'The stat sheet is still a blank slate.' : 'No leader totals in this snapshot.'}</h3>
        <p>{latest?.leaders.note ?? 'Regular-season leaders will appear when ESPN publishes current-season statistics. No preseason numbers are mixed in.'}</p>
        <div className="empty-categories"><span>Passing</span><span>Rushing</span><span>Receiving</span><span>Defense</span></div>
      </div> : <>
        <section className="chart-card chart-card-wide">
          <div className="chart-heading"><div><span className="eyebrow">CUMULATIVE REGULAR-SEASON TOTALS</span><h3>{category.name}</h3><p>The latest top 10 athletes, tracked by player ID across snapshots</p></div><span className="chart-unit">{category.unit}</span></div>
          <Plot rows={rows} series={players.map(player => ({ id: player.id, name: player.name, color: colorFor(player.teamId) }))} unit={category.unit} tall />
          <div className="player-legend">{players.map(player => <span key={player.id}><span className="series-dot" style={{ background: colorFor(player.teamId) }} />{player.name}</span>)}</div>
          <p className="chart-footnote">Gaps mean the athlete wasn’t in a captured leaderboard, not zero production. Postseason stats are not added to regular-season totals.</p>
        </section>
        <div className="leaderboard-heading"><h3><Medal size={19} /> The leaderboard</h3><span>Latest totals · {latest?.label}</span></div>
        <ol className="leaderboard">
          {players.map((player, index) => {
            const team = data.teams.find(team => team.id === player.teamId);
            const previous = previousCategory?.players.find(item => item.id === player.id)?.value;
            const change = previous === undefined ? null : player.value - previous;
            return <li key={player.id} className={`leader-card ${index === 0 ? 'leader-first' : ''}`}>
              <span className="leader-rank">{String(index + 1).padStart(2, '0')}</span>
              <div className="leader-person"><strong>{player.name}</strong><span><span className="series-dot" style={{ background: colorFor(player.teamId) }} />{team?.name ?? 'Team not provided'}</span></div>
              <div className="leader-total"><strong>{player.value.toLocaleString()}</strong><span>{category.unit}</span></div>
              <div className="leader-change">{change !== null && change > 0 ? <><ArrowUpRight size={13} />{change.toLocaleString()}</> : <span>—</span>}</div>
            </li>;
          })}
        </ol>
        {latest?.leaders.note && <p className="source-note">{latest.leaders.note}</p>}
      </>}
    </section>
  );
}
