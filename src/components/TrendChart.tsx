import { useId, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Check, ChevronDown, CircleDashed } from 'lucide-react';
import { chartRows, formatDate, formatValue, latestRankings, readableTeamColor } from '../lib/presentation.mjs';
import type { Metric, Snapshot, Team, Theme } from '../types';

interface Series {
  id: string;
  name: string;
  color: string;
}

interface PlotProps {
  rows: Record<string, string | number | null>[];
  series: Series[];
  unit?: string;
  metric?: Metric;
  tall?: boolean;
  highlighted?: string | null;
}

interface TipEntry {
  name?: string | number;
  value?: string | number | readonly (string | number)[];
  color?: string;
  dataKey?: unknown;
}

function ChartTooltip({ active, payload, label, unit, metric, hold }: {
  active?: boolean; payload?: readonly TipEntry[]; label?: string | number; unit?: string; metric?: Metric; hold: (value: boolean) => void;
}) {
  if (!active || !payload?.length) return null;
  const entries = payload.filter(entry => typeof entry.value === 'number')
    .sort((a, b) => Number(b.value) - Number(a.value));
  return (
    <div className="chart-tooltip" onMouseEnter={() => hold(true)} onMouseLeave={() => hold(false)}
      onMouseMove={event => event.stopPropagation()} onFocus={() => hold(true)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) hold(false); }}>
      <strong>{label}</strong>
      <div className="tooltip-values" role="region" aria-label="Snapshot values" tabIndex={0}
        onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { hold(false); event.currentTarget.blur(); } }}>
        {entries.map(entry => (
          <div key={String(entry.dataKey)}>
            <span className="series-dot" style={{ background: entry.color }} />
            <span>{entry.name}</span>
            <b>{unit ? `${Number(entry.value).toLocaleString()} ${unit}` : formatValue(Number(entry.value), metric)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Plot({ rows, series, unit, metric = 'superBowl', tall, highlighted }: PlotProps) {
  const [tooltipHeld, setTooltipHeld] = useState(false);
  const sparse = rows.length < 3;
  const anyData = rows.some(row => series.some(item => typeof row[item.id] === 'number'));
  if (!anyData) return <div className="chart-empty"><CircleDashed size={28} /><strong>No observations to plot yet</strong><span>Missing values stay missing. New captures will appear here.</span></div>;
  return (
    <div className={`plot ${tall ? 'plot-tall' : ''}`} role="group" aria-label={`${series.length} series across ${rows.length} snapshots. Latest values are available below the chart.`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={rows} margin={{ top: 14, right: 20, bottom: 2, left: -14 }} accessibilityLayer>
          <CartesianGrid stroke="var(--cp-border)" vertical={false} strokeDasharray="3 5" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={35} tick={{ fill: 'var(--cp-text-muted)', fontSize: 11 }} dy={10} height={36} padding={{ left: sparse ? 65 : 10, right: sparse ? 65 : 10 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--cp-text-muted)', fontSize: 11 }} width={62} domain={[0, metric === 'wins' && !unit ? 17 : 'auto']} tickFormatter={value => unit ? Number(value).toLocaleString('en-US', { notation: 'compact' }) : metric === 'wins' ? String(value) : `${value}%`} />
          <Tooltip active={tooltipHeld ? true : undefined} wrapperStyle={{ pointerEvents: 'auto' }} isAnimationActive={false}
            content={props => <ChartTooltip active={props.active} payload={props.payload} label={props.label} unit={unit} metric={metric} hold={setTooltipHeld} />}
            cursor={{ stroke: 'var(--cp-border-strong)', strokeDasharray: '4 4' }} />
          {series.map((item, index) => (
            <Line
              key={item.id} dataKey={item.id} name={item.name} stroke={item.color}
              type="linear" strokeWidth={highlighted === item.id ? 3 : index < 5 ? 2.5 : 1.6}
              strokeOpacity={highlighted ? highlighted === item.id ? 1 : 0.13 : 1}
              dot={({ cx, cy, index: pointIndex }) => {
                if (typeof pointIndex !== 'number' || typeof rows[pointIndex]?.[item.id] !== 'number') return <g key={`${item.id}-${pointIndex}`} />;
                const isolated = typeof rows[pointIndex - 1]?.[item.id] !== 'number' && typeof rows[pointIndex + 1]?.[item.id] !== 'number';
                return sparse || isolated
                  ? <circle className="observation-dot" key={`${item.id}-${pointIndex}`} cx={cx} cy={cy} r={4} stroke={item.color} strokeWidth={2} fill="var(--cp-surface)" />
                  : <g key={`${item.id}-${pointIndex}`} />;
              }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--cp-surface)' }}
              isAnimationActive={false} connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function TrendChart({ title, subtitle, teams, snapshots, sourceId, metric, theme, tall = false }: {
  title: string; subtitle: string; teams: Team[]; snapshots: Snapshot[]; sourceId: string; metric: Metric; theme: Theme; tall?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const headingId = useId();
  const rankings = useMemo(() => latestRankings(snapshots, sourceId, metric, teams), [snapshots, sourceId, metric, teams]);
  const orderedTeams = [...teams].sort((a, b) => {
    const ai = rankings.findIndex(item => item.team.id === a.id);
    const bi = rankings.findIndex(item => item.team.id === b.id);
    return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi);
  });
  const rows = useMemo(() => chartRows(snapshots, sourceId, metric, teams), [snapshots, sourceId, metric, teams]);
  const visibleTeams = orderedTeams.filter(team => selected === null || selected.has(team.id));
  const availableCount = teams.filter(team => rows.some(row => typeof row[team.id] === 'number')).length;
  const toggleTeam = (id: string) => {
    const next = new Set(selected ?? teams.map(team => team.id));
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  return (
    <section className={`chart-card ${tall ? 'chart-card-wide' : ''}`} aria-labelledby={headingId}>
      <div className="chart-heading">
        <div><span className="eyebrow">{metric === 'wins' ? 'PROJECTED REGULAR-SEASON WINS' : 'PROBABILITY OVER TIME'}</span><h3 id={headingId}>{title}</h3><p>{subtitle}</p></div>
        <span className="chart-unit">{metric === 'wins' ? 'WINS' : '%'}</span>
      </div>
      <div className="chart-tools">
        <span><span className="mini-dot" />{availableCount} of {teams.length} teams with observations</span>
        <div className="chart-team-actions">
          {teams.length > 8 && <button onClick={() => setSelected(new Set(orderedTeams.slice(0, 8).map(team => team.id)))}>Top 8</button>}
          <button onClick={() => setSelected(null)} disabled={selected === null}><Check size={12} /> Show all</button>
        </div>
      </div>
      <Plot rows={rows} series={visibleTeams.map(team => ({ id: team.id, name: team.name, color: readableTeamColor(team, theme) }))} metric={metric} tall={tall} highlighted={highlighted} />
      {snapshots.length === 1 && availableCount > 0 && <p className="sparse-note">The first point is in. A trend needs at least two snapshots.</p>}
      <div className={`team-legend ${teams.length <= 4 ? 'team-legend-division' : ''}`} aria-label={`${title} team filters`}>
        {orderedTeams.map(team => {
          const enabled = selected === null || selected.has(team.id);
          return (
            <button key={team.id} className={enabled ? '' : 'muted-team'} aria-pressed={enabled}
              title={`${team.name} — click to ${enabled ? 'hide' : 'show'}`}
              onClick={() => toggleTeam(team.id)} onMouseEnter={() => setHighlighted(team.id)} onMouseLeave={() => setHighlighted(null)}
              onFocus={() => setHighlighted(team.id)} onBlur={() => setHighlighted(null)}>
              <span className="series-dot" style={{ background: readableTeamColor(team, theme) }} />
              <span>{team.abbreviation}</span>
              {teams.length <= 4 && <b>{formatValue(rankings.find(item => item.team.id === team.id)?.value, metric)}</b>}
            </button>
          );
        })}
      </div>
      <details className="data-table">
        <summary>Latest snapshot data <ChevronDown size={13} /></summary>
        <div className="table-scroll">
          <table><caption>{title} · {snapshots.at(-1) ? formatDate(snapshots.at(-1)!.capturedAt) : 'No captures'}</caption>
            <thead><tr><th scope="col">Team</th><th scope="col">{metric === 'wins' ? 'Projected wins' : 'Probability'}</th></tr></thead>
            <tbody>{orderedTeams.map(team => <tr key={team.id}><th scope="row">{team.name}</th><td>{formatValue(rankings.find(item => item.team.id === team.id)?.value, metric)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
