import { Fragment, useMemo, useState } from 'react';
import { catalog, indexes, requirements } from '../lib/data';
import { searchRank } from '../lib/matching';
import { GRADES, STATUS_LABELS, type PlanStatus } from '../lib/plan';
import { areaCreditInfo, areaLabel } from '../lib/progress';
import { usePlan } from '../lib/store';
import type { GenEdAreaCode, PlanEntry } from '../lib/types';
import { PlanStatusBadge, matchFor } from './bits';
import type { CourseMatch } from '../lib/matching';

const STATUS_ORDER: PlanStatus[] = ['in-progress', 'planned', 'completed'];

/** All required WSU Gen Ed categories, in file order: 6 Inquiry groups + 4 Competencies. */
const CATEGORIES: GenEdAreaCode[] = [
  ...requirements.inquiry.map((g) => g.code),
  ...requirements.competencies.map((c) => c.code),
];

type EntryValues = {
  courseCode: string;
  status: PlanStatus;
  term?: string;
  grade?: string;
  credits?: number;
  notes?: string;
  appliedArea?: GenEdAreaCode;
};

function EntryForm({
  courseCode,
  initial,
  onSave,
  onCancel,
}: {
  courseCode: string;
  initial?: PlanEntry;
  onSave: (values: EntryValues) => void;
  onCancel?: () => void;
}) {
  const [status, setStatus] = useState<PlanStatus>(initial?.status ?? 'planned');
  const [term, setTerm] = useState(initial?.term ?? '');
  const [grade, setGrade] = useState(initial?.grade ?? '');
  const [credits, setCredits] = useState(initial?.credits?.toString() ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [appliedArea, setAppliedArea] = useState<GenEdAreaCode | undefined>(initial?.appliedArea);
  const [error, setError] = useState('');

  const possibleAreas = useMemo(() => matchFor(courseCode)?.allAreas ?? [], [courseCode]);

  const submit = () => {
    if (!catalog.courses.some((c) => c.code === courseCode)) {
      setError(`“${courseCode}” is not in the bundled HFCC catalog.`);
      return;
    }
    onSave({
      courseCode,
      status,
      term: term.trim() || undefined,
      grade: grade || undefined,
      credits: credits.trim() ? Number(credits) : undefined,
      notes: notes.trim() || undefined,
      appliedArea: possibleAreas.length > 1 ? appliedArea : undefined,
    });
  };

  return (
    <div>
      <p className="small muted tight">
        Editing <strong>{courseCode}</strong>
      </p>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" value={status} onChange={(e) => setStatus(e.target.value as PlanStatus)}>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="term">Term</label>
          <input id="term" type="text" placeholder="Fall 2026" value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="grade">Grade</label>
          <select id="grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">—</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          {status === 'completed' && <span className="small muted">BC, IC, QE need C or better.</span>}
        </div>
        <div className="field">
          <label htmlFor="credits">HFCC credits</label>
          <input id="credits" type="number" min="0" step="0.5" placeholder="3" value={credits} onChange={(e) => setCredits(e.target.value)} />
        </div>
        {possibleAreas.length > 1 && (
          <div className="field span2">
            <label htmlFor="applied-area">Apply toward (this course may fit {possibleAreas.length} categories)</label>
            <select
              id="applied-area"
              value={appliedArea ?? ''}
              onChange={(e) => setAppliedArea((e.target.value || undefined) as GenEdAreaCode | undefined)}
            >
              <option value="">— choose one —</option>
              {possibleAreas.map((a) => (
                <option key={a} value={a}>
                  {a} — {areaLabel(a)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field span2">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" placeholder="Anything to remember?" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      {error && (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-primary btn-small" onClick={submit}>
          Save
        </button>
        {onCancel && (
          <button type="button" className="btn btn-small" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function AddCoursePicker({ onPick, onCancel }: { onPick: (code: string) => void; onCancel: () => void }) {
  const [query, setQuery] = useState('');
  const suggestions = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    // Same ranked search as Find Classes: code-prefix matches first, then code, then name.
    return catalog.courses
      .map((c) => ({ c, rank: searchRank(c.code, c.name, q) }))
      .filter((x) => x.rank !== -1)
      .sort((a, b) => a.rank - b.rank || a.c.code.localeCompare(b.c.code))
      .slice(0, 8)
      .map((x) => x.c);
  }, [query]);

  return (
    <div>
      <div className="field">
        <label htmlFor="add-search">Find a course to add</label>
        <input
          id="add-search"
          type="text"
          placeholder="ENG131 or College Writing"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {suggestions.length > 0 && (
        <div style={{ marginTop: 6 }} role="listbox" aria-label="Matching courses">
          {suggestions.map((c) => (
            <button
              key={c.code}
              type="button"
              className="btn btn-small"
              style={{ display: 'block', width: '100%', textAlign: 'left', margin: 3 }}
              onClick={() => onPick(c.code)}
            >
              <strong>{c.code}</strong> · {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** WSU equivalents for a plan entry, with WSU-listed credits from the requirement files. */
function EquivalentCell({ match }: { match: CourseMatch }) {
  return (
    <ul className="equiv-mini">
      {match.course.equivalencies.map((eq, i) => {
        const req = eq.kind === 'exact' ? indexes.courseByCode.get(eq.wsuCode) : undefined;
        return (
          <li key={i}>
            {eq.kind === 'exact' && (
              <span className="badge badge-exact">
                WSU {eq.wsuCode}
                {req?.minCredits != null ? ` · ${req.minCredits} cr` : ''}
              </span>
            )}
            {eq.kind === 'broad' && <span className="badge badge-broad">broad {eq.wsuCode}</span>}
            {eq.kind === 'none' && <span className="badge badge-none">✕ Does not transfer</span>}
            {eq.effectiveTerm && <span className="small muted"> {eq.effectiveTerm}</span>}
          </li>
        );
      })}
    </ul>
  );
}

export default function MyCourses() {
  const { entries, addEntry, updateEntry, removeEntry } = usePlan();
  const [adding, setAdding] = useState(false);
  const [pickedCode, setPickedCode] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editing = entries.find((e) => e.id === editingId);

  // Rows are preloaded for every required category; a course appears in each
  // category it may satisfy — unless the student already chose which single
  // category it applies toward, in which case it only shows in that row.
  // Course cells stay empty ("—") until courses are added.
  const rows = CATEGORIES.map((cat) => {
    const inRow = entries.filter((e) => {
      const m = matchFor(e.courseCode);
      if (!m?.allAreas.includes(cat)) return false;
      if (e.appliedArea && e.appliedArea !== cat) return false;
      return true;
    });
    return { cat, inRow };
  });

  const renderMultiNote = (entry: PlanEntry, cat: GenEdAreaCode) => {
    const match = matchFor(entry.courseCode);
    if (!match || match.allAreas.length <= 1) return null;
    if (entry.appliedArea) {
      return (
        <span className="small muted"> ✓ applied to {cat}</span>
      );
    }
    return (
      <span className="multi-wrap">
        <span
          className="badge badge-multi"
          title="This course may fit multiple categories. Choose which single category it counts toward — it is not counted toward more than one automatically."
        >
          ⚠ choose category
        </span>
        <select
          className="mini-select"
          aria-label={`Apply ${entry.courseCode} toward a category`}
          value=""
          onChange={(e) => updateEntry(entry.id, { appliedArea: e.target.value as GenEdAreaCode })}
        >
          <option value="">apply to…</option>
          {match.allAreas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </span>
    );
  };

  return (
    <section aria-labelledby="courses-heading">
      <div className="row" style={{ margin: '0 0 8px' }}>
        <h2 id="courses-heading" style={{ margin: 0 }}>
          My Courses
        </h2>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-primary btn-small"
          onClick={() => {
            setAdding((v) => !v);
            setPickedCode(null);
          }}
          aria-expanded={adding}
        >
          {adding ? 'Close' : '+ Add course'}
        </button>
      </div>

      {adding && (
        <div className="card card-compact">
          {pickedCode ? (
            <EntryForm
              courseCode={pickedCode}
              onSave={(values) => {
                addEntry(values);
                setAdding(false);
                setPickedCode(null);
              }}
              onCancel={() => {
                setAdding(false);
                setPickedCode(null);
              }}
            />
          ) : (
            <AddCoursePicker onPick={(code) => setPickedCode(code)} onCancel={() => setAdding(false)} />
          )}
        </div>
      )}

      <div className="card table-card">
        <div className="table-wrap">
          <table className="plan-table">
              <thead>
                <tr>
                  <th scope="col">WSU Gen Ed Category</th>
                  <th scope="col">Credits</th>
                  <th scope="col">HFCC Course</th>
                  <th scope="col">WSU Equivalent</th>
                </tr>
              </thead>
            <tbody>
              {rows.map(({ cat, inRow }) => {
                const credit = areaCreditInfo(requirements, cat);
                const isEditingRow = inRow.some((e) => e.id === editingId);
                return (
                  <Fragment key={cat}>
                    <tr className={isEditingRow ? 'row-editing' : ''}>
                      <td data-label="WSU Gen Ed Category">
                        <span className="cat-name" title={credit.title}>
                          {areaLabel(cat)}
                        </span>
                        {inRow.map((e) => (
                          <span key={e.id}>{renderMultiNote(e, cat)}</span>
                        ))}
                      </td>
                      <td data-label="Credits" className="credits-cell">
                        <span className="credits-num" title={credit.label}>
                          {credit.credits}
                        </span>
                      </td>
                      <td data-label="HFCC Course">
                        {inRow.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          inRow.map((e) => {
                            const match = matchFor(e.courseCode);
                            return (
                              <div key={e.id} className="cell-course">
                                <button
                                  type="button"
                                  className="linklike"
                                  aria-label={`Edit ${e.courseCode}`}
                                  title="Click to edit"
                                  onClick={() => setEditingId(editingId === e.id ? null : e.id)}
                                >
                                  <strong>{e.courseCode}</strong>
                                  {match ? <span className="muted small"> {match.course.name}</span> : null}
                                </button>{' '}
                                <PlanStatusBadge status={e.status} />
                              </div>
                            );
                          })
                        )}
                      </td>
                      <td data-label="WSU Equivalent">
                        {inRow.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          inRow.map((e) => {
                            const match = matchFor(e.courseCode);
                            return match ? <EquivalentCell key={e.id} match={match} /> : null;
                          })
                        )}
                      </td>
                    </tr>
                    {isEditingRow && editing && (
                      <tr className="edit-row">
                        <td colSpan={4}>
                          <EntryForm
                            courseCode={editing.courseCode}
                            initial={editing}
                            onSave={(values) => {
                              updateEntry(editing.id, values);
                              setEditingId(null);
                            }}
                            onCancel={() => setEditingId(null)}
                          />
                          <div className="row" style={{ marginTop: 8 }}>
                            <button
                              type="button"
                              className="btn btn-small btn-danger"
                              onClick={() => {
                                removeEntry(editing.id);
                                setEditingId(null);
                              }}
                            >
                              Remove from plan
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
