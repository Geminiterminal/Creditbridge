import { useEffect, useMemo, useRef, useState } from 'react';
import { catalog, indexes, requirements } from '../lib/data';
import { searchCourses, type AreaFilter, type CourseFilters, type EquivalencyFilter, type TransferFilter } from '../lib/matching';
import { CourseCard } from './bits';

const AREA_OPTIONS: { value: AreaFilter; label: string }[] = [
  { value: 'all', label: 'All areas' },
  ...requirements.inquiry.map((g) => ({ value: g.code as AreaFilter, label: `${g.code} — ${g.label.replace(' Inquiry', '')}` })),
  ...requirements.competencies.map((c) => ({ value: c.code as AreaFilter, label: `${c.code} — ${c.label}` })),
];

export default function FindClasses() {
  const [query, setQuery] = useState('');
  const [area, setArea] = useState<AreaFilter>('all');
  const [transfer, setTransfer] = useState<TransferFilter>('all');
  const [equivalency, setEquivalency] = useState<EquivalencyFilter>('all');

  const filters: CourseFilters = { query, area, transfer, equivalency };
  const results = useMemo(() => searchCourses(catalog.courses, indexes, filters), [query, area, transfer, equivalency]);

  const dropdownRef = useRef<HTMLDetailsElement>(null);
  // Auto-open the results dropdown while the user is typing a query, so matching
  // courses appear as they type. It stays open until they collapse it or clear the search.
  useEffect(() => {
    const el = dropdownRef.current;
    if (el) el.open = query.trim().length > 0;
  }, [query, results.length > 0]);

  return (
    <section aria-labelledby="find-heading">
      <div className="page-head">
        <h2 id="find-heading">Find Classes</h2>
      </div>

      <div className="card card-compact">
        <div className="controls">
          <div className="field" style={{ flex: 2, minWidth: 180 }}>
            <label htmlFor="search">Search</label>
            <input
              id="search"
              type="search"
              placeholder="ENG131 or anthropology…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="f-area">Gen Ed area</label>
            <select id="f-area" value={area} onChange={(e) => setArea(e.target.value as AreaFilter)}>
              {AREA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-transfer">Transfer</label>
            <select id="f-transfer" value={transfer} onChange={(e) => setTransfer(e.target.value as TransferFilter)}>
              <option value="all">All</option>
              <option value="transfers">Transfers</option>
              <option value="does-not-transfer">Does not transfer</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-equiv">Equivalency</label>
            <select id="f-equiv" value={equivalency} onChange={(e) => setEquivalency(e.target.value as EquivalencyFilter)}>
              <option value="all">Any</option>
              <option value="exact">Exact only</option>
              <option value="broad">Broad only</option>
              <option value="none">No transfer</option>
            </select>
          </div>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="card empty" role="status">
          <p>
            <strong>No matches.</strong>
          </p>
          <p className="small">Try a different search or clear the filters.</p>
        </div>
      ) : (
        <>
          <div className="small muted legend">
            <span>
              <span className="legend-swatch legend-green" aria-hidden="true" /> Gen Ed match
            </span>
            <span>
              <span className="legend-swatch legend-gray" aria-hidden="true" /> transfers, no Gen Ed
            </span>
            <span>
              <span className="legend-swatch legend-red" aria-hidden="true" /> does not transfer
            </span>
          </div>
          <details className="results-dropdown" ref={dropdownRef}>
            <summary>
              <span aria-hidden="true" className="caret">▸</span>
              <span>
                Show {Math.min(results.length, 200).toLocaleString()} matching course{results.length === 1 ? '' : 's'}
              </span>
              {results.length > 200 && (
                <span className="summary-count">first 200 of {results.length.toLocaleString()}</span>
              )}
            </summary>
            <div className="results-body">
            {results.slice(0, 200).map((m) => (
              <CourseCard key={m.course.code} match={m} />
            ))}
            {results.length > 200 && (
              <p className="muted small results-more">Narrow the search or filters to see the rest.</p>
            )}
          </div>
        </details>
        </>
      )}
    </section>
  );
}
