import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowUpRight, BarChart3, CalendarDays, Check, ChevronRight, Clock3, Github, Info, Moon, RefreshCw, Sun, TrendingUp, TriangleAlert } from 'lucide-react';
import AboutDialog from './components/AboutDialog';
import SourceNotice from './components/SourceNotice';
import { formatDate, seasonBanner } from './lib/presentation.mjs';
import { isManifest, isSeason, useData } from './lib/useData';
import type { Theme } from './types';

const Projections = lazy(() => import('./components/Projections'));
const StatLeaders = lazy(() => import('./components/StatLeaders'));
const repository = 'https://github.com/daniel-beachy/nfl-season-tracker-v3';
const phaseNames = { preseason: 'Preseason', regular: 'Regular season', postseason: 'Playoffs', offseason: 'Offseason' };

function Loading() {
  return <div className="loading-panel" role="status"><span className="loading-mark"><Activity size={25} /></span><strong>Reading the season…</strong><span>Loading committed snapshots, not live API requests.</span></div>;
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const [themeWarning, setThemeWarning] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [snapshotIndex, setSnapshotIndex] = useState<number | null>(null);
  const [sourceId, setSourceId] = useState('espn-fpi');
  const [tab, setTab] = useState<'projections' | 'leaders'>('projections');
  const [aboutOpen, setAboutOpen] = useState(false);
  const manifest = useData('manifest.json', isManifest);
  const currentYear = year ?? manifest.data?.currentSeason;
  const entry = manifest.data?.seasons.find(item => item.year === currentYear);
  const season = useData(entry?.file ?? null, isSeason);
  const fullData = season.data;
  const data = useMemo(() => fullData && snapshotIndex !== null
    ? { ...fullData, snapshots: fullData.snapshots.slice(0, snapshotIndex + 1) }
    : fullData, [fullData, snapshotIndex]);
  const source = data?.sources.find(item => item.id === sourceId) ?? data?.sources[0];
  const latest = data?.snapshots.at(-1);
  const banner = data ? seasonBanner(data) : null;
  const phase = latest?.phase ?? entry?.phase;
  const newestCapture = fullData?.snapshots.at(-1);
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
        </div>
        <div className="rail-bottom"><span className="rail-season">NFL</span><button aria-label="About the data" title="About the data" onClick={() => setAboutOpen(true)}><Info size={20} /></button><a href={repository} target="_blank" rel="noreferrer" aria-label="GitHub repository"><Github size={20} /></a></div>
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
              <label className="select-field source-select"><span><Activity size={12} /> {tab === 'leaders' ? 'STATS SOURCE' : 'PROJECTION SOURCE'}</span><select aria-label="Projection source" value={tab === 'leaders' ? 'espn-stats' : source?.id ?? ''} disabled={!data || tab === 'leaders'} onChange={event => setSourceId(event.target.value)}>{tab === 'leaders' ? <option value="espn-stats">ESPN · Regular season</option> : data?.sources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            </div>
          </section>
          {themeWarning && <p className="storage-warning">Theme changed for this visit. Your browser is blocking preference storage.</p>}
          {banner && <div className={`season-banner ${data?.kind === 'mock' ? 'mock-banner' : ''}`} data-testid="season-banner">{data?.kind === 'mock' ? <TriangleAlert size={17} /> : <CalendarDays size={17} />}<strong>{banner}</strong><span>{data?.kind === 'mock' ? 'Illustrative history, not a record of actual forecasts or results.' : 'The runway to kickoff. Monthly snapshots until the games begin.'}</span></div>}
          {error ? <div className="error-panel" role="alert"><TriangleAlert size={28} /><h2>We couldn’t load the season.</h2><p>{error} No substitute data has been shown.</p><button className="primary-button" onClick={() => { manifest.retry(); season.retry(); }}><RefreshCw size={15} /> Try again</button></div> : !data || !source ? <Loading /> : <>
            <div className="dashboard-nav">
              <div className="main-tabs" role="tablist" aria-label="Dashboard views">
                <button id="projections-tab" role="tab" aria-selected={tab === 'projections'} aria-controls="dashboard-panel" className={tab === 'projections' ? 'active' : ''} onClick={() => setTab('projections')}><TrendingUp size={17} />Projections</button>
                <button id="leaders-tab" role="tab" aria-selected={tab === 'leaders'} aria-controls="dashboard-panel" className={tab === 'leaders' ? 'active' : ''} onClick={() => setTab('leaders')}><BarChart3 size={17} />Stat Leaders</button>
              </div>
              <div className="snapshot-status"><span className={stale ? 'status-dot status-warning' : 'status-dot'} /><span>{data.snapshots.length} {data.snapshots.length === 1 ? 'snapshot' : 'snapshots'}</span><span className="status-divider">/</span><span>{phase ? phaseNames[phase] : 'Awaiting capture'}</span></div>
            </div>
            <div className="capture-strip"><span><Clock3 size={13} />{latest ? `Captured ${formatDate(latest.capturedAt)}` : 'No snapshots captured yet'}{stale && <b className="stale-label"> · Refresh overdue</b>}</span><button onClick={() => setAboutOpen(true)}>About the data <ArrowUpRight size={13} /></button></div>
            {fullData && fullData.snapshots.length > 1 && <div className="snapshot-explorer">
              <div className="explorer-label"><span className="eyebrow">REWIND THE SEASON</span><strong>{latest?.label}</strong></div>
              <input type="range" aria-label="Snapshot history" aria-valuetext={`${latest?.label}, ${latest ? formatDate(latest.capturedAt) : ''}`} min={0} max={fullData.snapshots.length - 1} value={snapshotIndex ?? fullData.snapshots.length - 1} onChange={event => setSnapshotIndex(Number(event.target.value))} />
              <span className="explorer-position" data-testid="snapshot-position">{data.snapshots.length} / {fullData.snapshots.length}</span>
              <button aria-label="Return to latest snapshot" disabled={data.snapshots.length === fullData.snapshots.length} onClick={() => setSnapshotIndex(null)}>Latest <ChevronRight size={13} /></button>
            </div>}
            {tab === 'projections' && <SourceNotice key={`${data.season}-${source.id}`} source={source} snapshot={latest} mocked={data.kind === 'mock'} />}
            <div id="dashboard-panel" role="tabpanel" aria-labelledby={tab === 'projections' ? 'projections-tab' : 'leaders-tab'}>
              <Suspense fallback={<Loading />}>{tab === 'projections' ? <Projections key={`${data.season}-${source.id}`} data={data} source={source} theme={theme} /> : <StatLeaders key={data.season} data={data} theme={theme} />}</Suspense>
            </div>
            <section className="bottom-note"><div className="note-icon"><CalendarDays size={20} /></div><div><h3>A snapshot, not a crystal ball.</h3><p>{data.kind === 'mock' ? 'You’re exploring simulated history. Switch to the current season for actual provider captures.' : 'New observations are saved weekly in-season and monthly in the offseason. This is the long view — not a live odds ticker.'}</p></div><a href={`${import.meta.env.BASE_URL}data/${entry?.file}`} download><ArrowDownToLine size={15} /> Snapshot JSON</a></section>
          </>}
        </main>
        <footer className="footer"><div><span className="footer-brand">sunday signal.</span><span>Independent. Open source. In it for the season.</span></div><div><span className="footer-keys"><Check size={12} /> No keys. No subscriptions.</span><a href={repository} target="_blank" rel="noreferrer">View on GitHub <ChevronRight size={13} /></a></div></footer>
      </div>
      <AboutDialog open={aboutOpen} close={() => setAboutOpen(false)} data={data} />
    </>
  );
}
