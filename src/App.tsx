import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowUpRight, BarChart3, CalendarDays, Check, ChevronRight, Clock3, Github, Home, Info, Moon, RefreshCw, Sun, TrendingUp, TriangleAlert, Trophy } from 'lucide-react';
import AboutDialog from './components/AboutDialog';
import SourceNotice from './components/SourceNotice';
import { formatDate, isPreseasonSnapshot, seasonBanner } from './lib/presentation.mjs';
import { isManifest, isSeason, useData } from './lib/useData';
import type { Theme } from './types';

const Projections = lazy(() => import('./components/Projections'));
const StatLeaders = lazy(() => import('./components/StatLeaders'));
const Awards = lazy(() => import('./components/Awards'));
const repository = 'https://github.com/daniel-beachy/nfl-season-tracker-v3';
const portfolio = 'https://daniel-beachy.github.io/';
const phaseNames = { preseason: 'Preseason', regular: 'Regular season', postseason: 'Playoffs', offseason: 'Offseason' };

function Loading() {
  return <div className="loading-panel" role="status"><span className="loading-mark"><Activity size={25} /></span><strong>Reading the season…</strong><span>Loading committed snapshots, not live API requests.</span></div>;
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const [themeWarning, setThemeWarning] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [snapshotIndex, setSnapshotIndex] = useState<number | null>(null);
  const [showPreseason, setShowPreseason] = useState(true);
  const [sourceId, setSourceId] = useState('espn-fpi');
  const [awardSourceId, setAwardSourceId] = useState('draftkings');
  const [tab, setTab] = useState<'projections' | 'leaders' | 'awards'>('projections');
  const [aboutOpen, setAboutOpen] = useState(false);
  const manifest = useData('manifest.json', isManifest);
  const currentYear = year ?? manifest.data?.currentSeason;
  const entry = manifest.data?.seasons.find(item => item.year === currentYear);
  const season = useData(entry?.file ?? null, isSeason);
  const unfilteredData = season.data;
  const hasPreseason = unfilteredData?.snapshots.some(snapshot => isPreseasonSnapshot(snapshot, unfilteredData.startsAt));
  const fullData = useMemo(() => unfilteredData && !showPreseason
    ? { ...unfilteredData, snapshots: unfilteredData.snapshots.filter(snapshot => !isPreseasonSnapshot(snapshot, unfilteredData.startsAt)) }
    : unfilteredData, [unfilteredData, showPreseason]);
  const data = useMemo(() => fullData && snapshotIndex !== null
    ? { ...fullData, snapshots: fullData.snapshots.slice(0, snapshotIndex + 1) }
    : fullData, [fullData, snapshotIndex]);
  const source = data?.sources.find(item => item.id === sourceId) ?? data?.sources[0];
  const awardSources = data?.sources.filter(item => item.awards || data.snapshots.some(snapshot => snapshot.awards?.[item.id])) ?? [];
  const awardSource = awardSources.find(item => item.id === awardSourceId) ?? awardSources[0];
  const latest = data?.snapshots.at(-1);
  const banner = data ? seasonBanner(data) : null;
  const phase = latest?.phase ?? entry?.phase;
  const newestCapture = unfilteredData?.snapshots.at(-1);
  const stale = fullData?.kind === 'live' && newestCapture
    && Date.now() - new Date(newestCapture.capturedAt).getTime() > (newestCapture.phase === 'regular' || newestCapture.phase === 'postseason' ? 9 : 40) * 86400000;
  const error = manifest.error ?? season.error;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('sunday-signal-theme', theme); }
    catch { setThemeWarning(true); }
  }, [theme]);

  return (
    <>
      <a className="skip-link" href="#main">Skip to dashboard</a>
      <aside className="rail" aria-label="Application shortcuts">
        <a href="./" className="rail-logo" aria-label="Sunday Signal home"><TrendingUp size={25} strokeWidth={2.5} /></a>
        <div className="rail-nav">
          <button title="Projections" aria-label="Open projections" className={tab === 'projections' ? 'active' : ''} onClick={() => setTab('projections')}><TrendingUp size={21} /></button>
          <button title="Stat Leaders" aria-label="Open stat leaders" className={tab === 'leaders' ? 'active' : ''} onClick={() => setTab('leaders')}><BarChart3 size={21} /></button>
          <button title="Awards" aria-label="Open awards" className={tab === 'awards' ? 'active' : ''} onClick={() => setTab('awards')}><Trophy size={21} /></button>
        </div>
        <div className="rail-bottom"><span className="rail-season">NFL</span><a className="portfolio-link" href={portfolio} title="Back to portfolio" aria-label="Portfolio"><Home size={20} /><span>Portfolio</span></a><button aria-label="About the data" title="About the data" onClick={() => setAboutOpen(true)}><Info size={20} /></button><a href={repository} target="_blank" rel="noreferrer" aria-label="GitHub repository"><Github size={20} /></a></div>
      </aside>
      <div className="app-shell">
        <header className="masthead">
          <a className="wordmark" href="./">sunday<span>signal</span><span className="wordmark-dot">.</span></a>
          <span className="masthead-divider" /><span className="masthead-tagline">A little perspective on the long game.</span>
          <div className="masthead-actions"><span className="open-data"><span /> OPEN DATA. EVERY WEEK.</span><button className="icon-button theme-toggle" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button></div>
        </header>
        <main id="main">
          <section className="hero">
            <div className="hero-copy"><span className="hero-eyebrow"><span className="small-football">◈</span> NFL SEASON TRACKER <span className="eyebrow-rule" /></span><h1>The season,<br className="mobile-break" /> in perspective.</h1><p>Track the contenders. Follow the numbers. Watch the story unfold.</p></div>
            <div className="hero-controls">
              <label className="select-field season-select"><span><CalendarDays size={12} /> SEASON</span><select aria-label="Season" value={currentYear ?? ''} disabled={!manifest.data} onChange={event => { setYear(Number(event.target.value)); setSnapshotIndex(null); }}>{manifest.data?.seasons.map(item => <option key={item.year} value={item.year}>{item.kind === 'mock' ? `${item.year} — mocked — not fully accurate` : `${item.year} season`}</option>)}</select></label>
              <label className="select-field source-select"><span><Activity size={12} /> {tab === 'leaders' ? 'STATS SOURCE' : tab === 'awards' ? 'AWARDS SOURCE' : 'PROJECTION SOURCE'}</span>
                <select aria-label={tab === 'awards' ? 'Awards source' : 'Projection source'}
                  value={tab === 'leaders' ? 'espn-stats' : tab === 'awards' ? awardSource?.id ?? '' : source?.id ?? ''}
                  disabled={!data || tab === 'leaders' || tab === 'awards' && !awardSources.length}
                  onChange={event => tab === 'awards' ? setAwardSourceId(event.target.value) : setSourceId(event.target.value)}>
                  {tab === 'leaders' ? <option value="espn-stats">ESPN · Regular season</option>
                    : tab === 'awards' ? awardSources.length
                      ? awardSources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)
                      : <option value="">No award captures</option>
                    : data?.sources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            </div>
          </section>
          {themeWarning && <p className="storage-warning">Theme changed for this visit. Your browser is blocking preference storage.</p>}
          {banner && <div className={`season-banner ${data?.kind === 'mock' ? 'mock-banner' : ''}`} data-testid="season-banner">{data?.kind === 'mock' ? <TriangleAlert size={17} /> : <CalendarDays size={17} />}<strong>{banner}</strong><span>{data?.kind === 'mock' ? 'Illustrative history, not a record of actual forecasts or results.' : 'The runway to kickoff. Monthly snapshots until the games begin.'}</span></div>}
          {error ? <div className="error-panel" role="alert"><TriangleAlert size={28} /><h2>We couldn’t load the season.</h2><p>{error} No substitute data has been shown.</p><button className="primary-button" onClick={() => { manifest.retry(); season.retry(); }}><RefreshCw size={15} /> Try again</button></div> : !data || !source ? <Loading /> : <>
            <div className="dashboard-nav">
              <div className="main-tabs" role="tablist" aria-label="Dashboard views">
                <button id="projections-tab" role="tab" aria-selected={tab === 'projections'} aria-controls="dashboard-panel" className={tab === 'projections' ? 'active' : ''} onClick={() => setTab('projections')}><TrendingUp size={17} />Projections</button>
                <button id="leaders-tab" role="tab" aria-selected={tab === 'leaders'} aria-controls="dashboard-panel" className={tab === 'leaders' ? 'active' : ''} onClick={() => setTab('leaders')}><BarChart3 size={17} />Stat Leaders</button>
                <button id="awards-tab" role="tab" aria-selected={tab === 'awards'} aria-controls="dashboard-panel" className={tab === 'awards' ? 'active' : ''} onClick={() => setTab('awards')}><Trophy size={17} />Awards</button>
              </div>
              <div className="snapshot-status"><span className={stale ? 'status-dot status-warning' : 'status-dot'} /><span>{data.snapshots.length} {data.snapshots.length === 1 ? 'snapshot' : 'snapshots'}</span><span className="status-divider">/</span><span>{phase ? phaseNames[phase] : 'Awaiting capture'}</span></div>
            </div>
            <div className="capture-strip"><span><Clock3 size={13} />{latest ? `Captured ${formatDate(latest.capturedAt)}` : 'No snapshots in this view'}{stale && <b className="stale-label"> · Refresh overdue</b>}</span><button onClick={() => setAboutOpen(true)}>About the data <ArrowUpRight size={13} /></button></div>
            <div className="history-controls"><span>Week N = after the entire week.</span>{hasPreseason && <label><input type="checkbox" checked={showPreseason} onChange={event => { setShowPreseason(event.target.checked); setSnapshotIndex(null); }} />Show preseason history</label>}</div>
            {fullData && fullData.snapshots.length > 1 && <div className="snapshot-explorer">
              <div className="explorer-label"><span className="eyebrow">REWIND THE SEASON</span><strong>{latest?.label}</strong></div>
              <input type="range" aria-label="Snapshot history" aria-valuetext={`${latest?.label}, ${latest ? formatDate(latest.capturedAt) : ''}`} min={0} max={fullData.snapshots.length - 1} value={snapshotIndex ?? fullData.snapshots.length - 1} onChange={event => setSnapshotIndex(Number(event.target.value))} />
              <span className="explorer-position" data-testid="snapshot-position">{data.snapshots.length} / {fullData.snapshots.length}</span>
              <button aria-label="Return to latest snapshot" disabled={data.snapshots.length === fullData.snapshots.length} onClick={() => setSnapshotIndex(null)}>Latest <ChevronRight size={13} /></button>
            </div>}
            {latest?.note && <div className="source-notice" role="note"><Info size={17} /><span>{latest.note}</span></div>}
            {!data.snapshots.length && !showPreseason ? <div className="stats-empty history-empty" role="status"><span className="empty-icon"><CalendarDays size={28} /></span><h3>No completed-week snapshots yet.</h3><p>Preseason history is hidden. Turn it back on to see the available baseline.</p><button className="primary-button" onClick={() => { setShowPreseason(true); setSnapshotIndex(null); }}>Show preseason</button></div> : <>
            {tab === 'projections' && <SourceNotice key={`${data.season}-${source.id}`} source={source} snapshot={latest} mocked={data.kind === 'mock'} />}
            <div id="dashboard-panel" role="tabpanel" aria-labelledby={tab === 'projections' ? 'projections-tab' : tab === 'leaders' ? 'leaders-tab' : 'awards-tab'}>
              <Suspense fallback={<Loading />}>{tab === 'projections' ? <Projections key={`${data.season}-${source.id}`} data={data} source={source} theme={theme} />
                : tab === 'leaders' ? <StatLeaders key={data.season} data={data} theme={theme} />
                : <Awards key={`${data.season}-${awardSource?.id}`} data={data} source={awardSource} theme={theme} />}</Suspense>
            </div>
            <section className="bottom-note"><div className="note-icon"><CalendarDays size={20} /></div><div><h3>A snapshot, not a crystal ball.</h3><p>{data.kind === 'mock' ? 'You’re exploring simulated history. Switch to the current season for actual provider captures.' : 'New observations are saved weekly in-season and monthly in the offseason. This is the long view — not a live odds ticker.'}</p></div><a href={`${import.meta.env.BASE_URL}data/${entry?.file}`} download><ArrowDownToLine size={15} /> Snapshot JSON</a></section>
            </>}
          </>}
        </main>
        <footer className="footer"><div><span className="footer-brand">sunday signal.</span><span>Independent. Open source. In it for the season.</span></div><div><span className="footer-keys"><Check size={12} /> No keys. No subscriptions.</span><a href={portfolio}><Home size={13} /> Portfolio</a><a href={repository} target="_blank" rel="noreferrer">View on GitHub <ChevronRight size={13} /></a></div></footer>
      </div>
      <AboutDialog open={aboutOpen} close={() => setAboutOpen(false)} data={data} />
    </>
  );
}
