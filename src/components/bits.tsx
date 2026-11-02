import { matchCourse, type CourseMatch } from '../lib/matching';
import { courseByCode, indexes } from '../lib/data';
import { usePlan } from '../lib/store';
import { STATUS_LABELS, type PlanStatus } from '../lib/plan';
import type { GenEdAreaCode } from '../lib/types';

export function StatusBadge({ status }: { status: 'covered' | 'on-track' | 'open' | 'needs-review' }) {
  const map: Record<typeof status, { cls: string; icon: string; label: string }> = {
    covered: { cls: 'badge-covered', icon: '✓', label: 'Covered' },
    'on-track': { cls: 'badge-on-track', icon: '◐', label: 'On track' },
    open: { cls: 'badge-open', icon: '○', label: 'Open' },
    'needs-review': { cls: 'badge-review', icon: '!', label: 'Needs review' },
  };
  const m = map[status];
  return (
    <span className={`badge ${m.cls}`}>
      <span aria-hidden="true">{m.icon}</span>
      {m.label}
    </span>
  );
}

export function PlanStatusBadge({ status }: { status: PlanStatus }) {
  return <span className={`badge badge-status-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function AreaChips({ areas }: { areas: GenEdAreaCode[] }) {
  if (areas.length === 0) return null;
  return (
    <span>
      {areas.map((a) => (
        <span key={a} className="chip chip-area" title={`Possible WSU Gen Ed area: ${a}`}>
          {a}
        </span>
      ))}
    </span>
  );
}

function EquivalencyRows({ match }: { match: CourseMatch }) {
  return (
    <ul className="equiv-list">
      {match.course.equivalencies.map((eq, i) => (
        <li key={i}>
          {eq.kind === 'none' && <span className="badge badge-none">✕ Does not transfer</span>}
          {eq.kind === 'broad' && <span className="badge badge-broad">≈ broad {eq.wsuCode}</span>}
          {eq.kind === 'exact' && <span className="badge badge-exact">→ WSU {eq.wsuCode}</span>}
          {eq.effectiveTerm && <span className="small muted">{eq.effectiveTerm}</span>}
        </li>
      ))}
    </ul>
  );
}

export function CourseCard({ match }: { match: CourseMatch }) {
  const { entryForCourse, addEntry, removeEntry } = usePlan();
  const entry = entryForCourse(match.course.code);
  return (
    <article className="card course-card" aria-label={`${match.course.code} ${match.course.name}`}>
      <div className="course-head">
        <div>
          <div className="course-code">{match.course.code}</div>
          <div className="course-name">{match.course.name}</div>
        </div>
        <div className="row">
          <AreaChips areas={match.allAreas} />
          {!match.transfers && <span className="badge badge-none">✕ Does not transfer</span>}
          {match.transfers && !match.hasExact && <span className="badge badge-broad">≈ Broad credit only</span>}
          {entry ? (
            <>
              <PlanStatusBadge status={entry.status} />
              <button type="button" className="btn btn-small btn-danger" onClick={() => removeEntry(entry.id)}>
                Remove
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-small btn-primary" onClick={() => addEntry({ courseCode: match.course.code, status: 'planned' })}>
              + Add
            </button>
          )}
        </div>
      </div>
      <EquivalencyRows match={match} />
      {match.allAreas.length > 0 && (
        <p className="small muted tight">Possible Gen Ed: {match.allAreas.join(', ')}</p>
      )}
      {match.caveats.map((c, i) => (
        <p key={i} className="caveat">
          ⚠ {c}
        </p>
      ))}
    </article>
  );
}

export function matchFor(code: string): CourseMatch | null {
  const course = courseByCode.get(code.toUpperCase());
  return course ? matchCourse(course, indexes) : null;
}
