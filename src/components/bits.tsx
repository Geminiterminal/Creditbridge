import { matchCourse, type CourseMatch } from '../lib/matching';
import { courseByCode, displayName, indexes } from '../lib/data';
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
    <span className="area-chips">
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
  const hasGenEd = match.allAreas.length > 0;
  // Green = has a Gen Ed match; gray = transfers but no Gen Ed match; red = does not transfer.
  const cardClass = hasGenEd
    ? 'card course-card course-card-gen-ed'
    : match.transfers
      ? 'card course-card course-card-transfer'
      : 'card course-card course-card-none';
  return (
    <article className={cardClass} aria-label={`${match.course.code} ${match.course.name}`}>
      <div className="course-head">
        <div className="course-identity">
          <div className="course-code">{match.course.code}</div>
          <div className="course-name">{displayName(match.course.name)}</div>
          {hasGenEd ? (
            <div className="course-tags">
              <span className="badge badge-gen-ed">✓ Gen Ed</span>
              <AreaChips areas={match.allAreas} />
            </div>
          ) : match.transfers ? (
            <div className="course-tags">
              <span className="badge badge-transfer-only">≈ Transfer only</span>
            </div>
          ) : null}
        </div>
        <div className="row course-actions">
          {entry ? (
            <>
              <PlanStatusBadge status={entry.status} />
              <button type="button" className="btn btn-small btn-quiet" onClick={() => removeEntry(entry.id)}>
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
        <p className="small muted course-areas">Possible Gen Ed: {match.allAreas.join(', ')}</p>
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
