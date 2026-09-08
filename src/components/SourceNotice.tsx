import { ChevronDown, Info } from 'lucide-react';
import { formatDate } from '../lib/presentation.mjs';
import type { Snapshot, Source } from '../types';

export default function SourceNotice({ source, snapshot, mocked }: { source: Source; snapshot?: Snapshot; mocked: boolean }) {
  const observation = snapshot?.sources[source.id];
  const unavailable = observation?.status !== 'ok';
  const age = observation?.observedAt && snapshot
    ? Math.floor((Date.parse(snapshot.capturedAt) - Date.parse(observation.observedAt)) / 86400000)
    : null;
  const delayed = age !== null && age >= 7;
  const partial = /partial data|partial \d|incomplete|not normalized/i.test(observation?.note ?? '');
  let summary = mocked ? 'Simulated history, not actual provider forecasts.'
    : observation?.observedAt
      ? `Provider updated ${formatDate(observation.observedAt)}${delayed ? ` — ${age} days before capture. Delayed forecast.` : '.'}`
      : 'Provider update time not supplied. Capture time does not prove market freshness.';
  if (partial && !unavailable) summary += ' Partial coverage — read the source notes.';
  return (
    <div className={`source-notice ${unavailable || delayed || partial ? 'source-unavailable' : ''}`}>
      <Info size={16} />
      <div className="source-notice-content">
        <div className="source-notice-summary"><strong>{source.name}{unavailable ? ' · not available in this capture' : source.kind === 'market' ? ' · market-implied odds' : ' · model forecast'}</strong>
          {!unavailable && <span className={delayed ? 'delayed-note' : ''}>{summary}</span>}
        </div>
        {unavailable ? <p>{observation?.note ?? 'No observations were returned for this source. No estimated values have been substituted.'}</p>
          : observation?.note && <details className="source-details"><summary>Method &amp; capture notes <ChevronDown size={12} /></summary><p>{observation.note}</p></details>}
      </div>
    </div>
  );
}
