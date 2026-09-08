import { useEffect, useRef } from 'react';
import { ArrowUpRight, CalendarClock, Database, ShieldCheck, X } from 'lucide-react';
import type { SeasonData } from '../types';

export default function AboutDialog({ open, close, data }: { open: boolean; close: () => void; data?: SeasonData }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current?.close();
  }, [open]);
  return (
    <dialog ref={ref} onCancel={close} onClose={close} className="about-dialog" aria-labelledby="about-title" onClick={event => { if (event.target === ref.current) close(); }}>
      <div className="dialog-header"><span className="eyebrow">TRANSPARENCY, BY DESIGN</span><button className="icon-button" aria-label="Close about the data" onClick={close}><X size={20} /></button></div>
      <h2 id="about-title">A season-long paper trail.</h2>
      <p>Sunday Signal is a free, independent NFL dashboard. Every point comes from a dated JSON snapshot in the public repository. Your browser reads those files — never a live sports API.</p>
      <div className="method-row"><CalendarClock size={22} /><div><h3>One capture. The right moment.</h3><p>Wednesday at 14:15 UTC during the regular season and playoffs, after Monday’s games and before the next kickoff. In the offseason and preseason, the first Wednesday of each month. GitHub may delay scheduled runs. Manual captures are also possible.</p></div></div>
      <div className="method-row"><Database size={22} /><div><h3>Forecasts are not sportsbook odds.</h3><p>ESPN FPI supplies model probabilities and projected wins. Alternative market sources are adapted separately and never blended with FPI. A missing market is left blank. Complete division groups are normalized to 100%; playoff chances are independent and do not sum to 100%.</p></div></div>
      <div className="method-row"><ShieldCheck size={22} /><div><h3>Honest history. No invented live data.</h3><p>The previous season is a deterministic illustration, labeled “mocked — not fully accurate.” Current-season records use actual captures. One snapshot is a point, not a trend. Top-10 stat lines follow athlete IDs; gaps are not zeros. Regular-season leader totals stay separate from postseason totals.</p></div></div>
      <div className="source-list">{data?.sources.map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><div><strong>{source.name}</strong><p>{source.description}</p></div><ArrowUpRight size={17} /></a>)}</div>
      <p className="disclaimer">Not affiliated with the NFL, ESPN, or any team. Team names and colors belong to their respective owners. Projections are uncertain, not guarantees or betting advice. Free upstream APIs are undocumented and can change.</p>
    </dialog>
  );
}
