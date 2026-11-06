import { useRef, useState } from 'react';
import { catalog, requirements } from '../lib/data';
import { usePlan } from '../lib/store';

export default function DataSettings() {
  const { entries, exportJson, importJson, replaceAll, removeEntry } = usePlan();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `creditbridge-plan-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ kind: 'ok', text: 'Plan exported as JSON — keep it somewhere safe.' });
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    const result = importJson(text);
    if (!result.ok) {
      setMessage({ kind: 'error', text: `Import failed: ${result.error}` });
      return;
    }
    replaceAll(result.entries);
    const warnings = result.warnings.length > 0 ? ` ${result.warnings.join(' ')}` : '';
    setMessage({
      kind: 'ok',
      text: `Imported ${result.entries.length} ${result.entries.length === 1 ? 'entry' : 'entries'} from “${file.name}”. This replaced the current plan.${warnings}`,
    });
  };

  const handleClear = () => {
    if (window.confirm(`Remove all ${entries.length} course(s) from your plan? Export a backup first if you want to keep them.`)) {
      entries.forEach((e) => removeEntry(e.id));
      setMessage({ kind: 'info', text: 'Plan cleared from this browser.' });
    }
  };

  const totalEquivalencies = catalog.courses.reduce((n, c) => n + c.equivalencies.length, 0);

  return (
    <section aria-labelledby="data-heading">
      <div className="page-head">
        <h2 id="data-heading">Data &amp; Settings</h2>
      </div>

      <div className="card">
        <h3 className="card-title">About</h3>
        <p className="small">
          Which HFCC courses may transfer to WSU and fit WSU Gen Ed requirements. Results are{' '}
          <strong>possible matches from the supplied files — not an official WSU degree evaluation</strong>. Confirm with a
          WSU advisor.
        </p>
      </div>

      <div className="card">
        <h3 className="card-title">Backup</h3>
        <p className="small muted">
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'} in your plan. Import replaces the current plan.
        </p>
        <div className="row">
          <button type="button" className="btn btn-primary btn-small" onClick={handleExport} disabled={entries.length === 0}>
            ⬇ Export plan
          </button>
          <button type="button" className="btn btn-small" onClick={() => fileRef.current?.click()}>
            ⬆ Import plan
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            aria-label="Import plan JSON file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
              e.target.value = '';
            }}
          />
          <button type="button" className="btn btn-danger btn-small" onClick={handleClear} disabled={entries.length === 0}>
            Clear plan
          </button>
        </div>
        {message && (
          <p className={`banner banner-${message.kind === 'ok' ? 'ok' : message.kind === 'error' ? 'error' : 'info'}`} role="status">
            {message.text}
          </p>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">Sources</h3>
        <dl className="source-list">
          <div>
            <dt>Crosswalk</dt>
            <dd>
              {catalog.courses.length.toLocaleString()} HFCC courses · {totalEquivalencies.toLocaleString()} equivalency rows — exact,
              broad (<code>XXX</code>), or “Does not transfer”
            </dd>
          </div>
          <div>
            <dt>Inquiry groups</dt>
            <dd>{requirements.inquiry.map((g) => g.code).join(' · ')}</dd>
          </div>
          <div>
            <dt>Competencies</dt>
            <dd>
              {requirements.competencies.map((c) => c.code).join(' · ')} —{' '}
              {requirements.rules.competencyGradeRule.join(', ')} need C or better
            </dd>
          </div>
        </dl>
      </div>

      <div className="card">
        <h3 className="card-title">Good to know</h3>
        <ul className="plain">
          {catalog.caveats.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
          <li>
            Broad codes like <code>BIO1XXX</code> are broad transfer credit, never a confirmed Gen Ed match.
          </li>
          <li>
            <strong>Open the hosted site once while online</strong> — after that it works fully offline. Your plan stays
            in this browser: no accounts, no servers, no tracking.
          </li>
        </ul>
      </div>
    </section>
  );
}
