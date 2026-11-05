import { Fragment, useMemo, useState } from 'react';
import { catalog, indexes, requirements } from '../lib/data';
import { searchRank } from '../lib/matching';
import { GRADES, STATUS_LABELS, type PlanStatus } from '../lib/plan';
import { areaCreditInfo, areaLabel, computeProgress } from '../lib/progress';
import { usePlan } from '../lib/store';
import type { GenEdAreaCode, PlanEntry } from '../lib/types';
import { PlanStatusBadge, matchFor } from './bits';
import type { CourseMatch } from '../lib/matching';

const STATUS_ORDER: PlanStatus[] = ['in-progress', 'planned', 'completed'];

type RowSub = 'lab' | 'no-lab';

interface RowDef {
  cat: GenEdAreaCode;
  /** NSI is split into two rows: one for courses without a lab, one for lab courses. */
  sub?: RowSub;
  label: string;
}

/**
 * All required WSU Gen Ed categories as table rows, in file order: 6 Inquiry groups
 * + 4 Competencies. NSI is split into two rows — "Natural Scientific Inquiry (no lab)"
 * and "Natural Scientific Inquiry (lab)" — because NSI requires two courses, one with a lab.
 */
const ROW_DEFS: RowDef[] = [
  ...requirements.inquiry.flatMap((g) =>
    g.code === 'NSI'
      ? [
          { cat: 'NSI' as GenEdAreaCode, sub: 'no-lab' as RowSub, label: 'Natural Scientific Inquiry (no lab)' },
          { cat: 'NSI' as GenEdAreaCode, sub: 'lab' as RowSub, label: 'Natural Scientific Inquiry (lab)' },
        ]
      : [{ cat: g.code as GenEdAreaCode, label: areaLabel(g.code as GenEdAreaCode) }],
  ),
  ...requirements.competencies.map((c) => ({ cat: c.code as GenEdAreaCode, label: areaLabel(c.code as GenEdAreaCode) })),
];

/** For a plan entry that maps to NSI, whether it has a lab and/or non-lab NSI match. */
function entryNsiLab(entry: PlanEntry): { lab: boolean; noLab: boolean } {
  const m = matchFor(entry.courseCode);
  if (!m) return { lab: false, noLab: false };
  const nsi = m.inquiryMatches.filter((x) => x.area === 'NSI');
  return {
    lab: nsi.some((x) => x.labUnconditional || x.labConditional),
    noLab: nsi.some((x) => !x.labUnconditional && !x.labConditional),
  };
}

/** Credit requirement shown for a table row. NSI is split into a 3-cr non-lab row and a
 *  lab row (NSI totals 7 cr across both). */
function rowCreditInfo(row: RowDef): { label: string; title: string; courseCount: number; credits: number } {
  if (row.cat === 'NSI') {
    if (row.sub === 'no-lab') {
      return {
        label: '3 cr required',
        title:
          'Natural Scientific Inquiry (no lab)\nOne NSI course of at least 3 credits without a lab section.\nNSI needs two courses total — one here and one with a lab (7 cr combined).\nSource: Inquiry Course Requirements.txt',
        courseCount: 0,
        credits: 3,
      };
    }
    return {
      label: '4 cr required · lab',
      title:
        'Natural Scientific Inquiry (lab)\nA second NSI course with a lab section (commonly 4 cr; e.g. CHM 1020).\nNSI total: 7 cr across both rows. Lab status comes only from the supplied NSI list — confirm on the WSU and HFCC websites.\nSource: Inquiry Course Requirements.txt',
      courseCount: 0,
      credits: 4,
    };
  }
  return areaCreditInfo(requirements, row.cat);
}

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

/** Why a plan entry is shown under Electives & Broad Transfer instead of a category row. */
interface Elective {
  entry: PlanEntry;
  match: CourseMatch | null;
  /** 'no-match' = no WSU Gen Ed category; 'filled' = maps only to already-covered categories. */
  reason: 'no-match' | 'filled';
  /** Short badge label, e.g. "Broad transfer", "Elective". */
  reasonLabel: string;
  /** Longer explanation shown on hover. */
  reasonDetail: string;
}

function ElectiveRow({
  elective,
  editingId,
  onEdit,
  onUpdate,
  onRemove,
}: {
  elective: Elective;
  editingId: string | null;
  onEdit: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<Omit<PlanEntry, 'id'>>) => void;
  onRemove: (id: string) => void;
}) {
  const { entry, match, reasonLabel, reasonDetail } = elective;
  const isEditing = editingId === entry.id;
  const badgeClass =
    reasonLabel === 'Does not transfer'
      ? 'badge-none'
      : reasonLabel === 'Broad transfer'
        ? 'badge-broad'
        : 'badge-elective';
  return (
    <Fragment>
      <div className="match-row elective-row">
        <div>
          <button
            type="button"
            className="linklike"
            aria-label={`Edit ${entry.courseCode}`}
            onClick={() => onEdit(isEditing ? null : entry.id)}
          >
            <strong>{entry.courseCode}</strong>
            {match ? <span className="muted small"> {match.course.name}</span> : null}
          </button>
          <PlanStatusBadge status={entry.status} />
          <span className={`badge ${badgeClass}`} title={reasonDetail}>
            {reasonLabel}
          </span>
        </div>
        <div>{match ? <EquivalentCell match={match} /> : <span className="muted small">—</span>}</div>
      </div>
      {isEditing && (
        <div className="card card-compact">
          <EntryForm
            courseCode={entry.courseCode}
            initial={entry}
            onSave={(values) => {
              onUpdate(entry.id, values);
              onEdit(null);
            }}
            onCancel={() => onEdit(null)}
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-small btn-danger"
              onClick={() => {
                onRemove(entry.id);
                onEdit(null);
              }}
            >
              Remove from plan
            </button>
          </div>
        </div>
      )}
    </Fragment>
  );
}

function ElectivesSection({
  electives,
  editingId,
  onEdit,
  onUpdate,
  onRemove,
}: {
  electives: Elective[];
  editingId: string | null;
  onEdit: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<Omit<PlanEntry, 'id'>>) => void;
  onRemove: (id: string) => void;
}) {
  const noMatch = electives.filter((e) => e.reason === 'no-match');
  const filled = electives.filter((e) => e.reason === 'filled');
  const renderList = (items: Elective[]) =>
    items.map((el) => (
      <ElectiveRow
        key={el.entry.id}
        elective={el}
        editingId={editingId}
        onEdit={onEdit}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />
    ));
  return (
    <div className="card elective-card">
      <div className="area-head">
        <h3 className="elective-title">Electives &amp; Broad Transfer</h3>
        <span className="small muted">
          {electives.length} course{electives.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="small muted tight">
        These courses do not count toward a specific WSU Gen Ed requirement — either they have no
        WSU Gen Ed category match (broad transfer credit or “Does not transfer”), or the category
        they map to is already filled. They may still count as transfer or elective credit.
      </p>
      {electives.length === 0 ? (
        <div className="empty">
          <span className="big">∅</span>
          No electives yet. Courses with no Gen Ed match, or that map to an already-filled category,
          will appear here.
        </div>
      ) : (
        <>
          {noMatch.length > 0 && (
            <div className="elective-group">
              <div className="elective-group-title">No Gen Ed category match</div>
              {renderList(noMatch)}
            </div>
          )}
          {filled.length > 0 && (
            <div className="elective-group">
              <div className="elective-group-title">Category already filled</div>
              {renderList(filled)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function MyCourses() {
  const { entries, addEntry, updateEntry, removeEntry } = usePlan();
  const [adding, setAdding] = useState(false);
  const [pickedCode, setPickedCode] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editing = entries.find((e) => e.id === editingId);

  // Which required categories are already satisfied (covered) by completed courses.
  const progress = useMemo(
    () => computeProgress(entries, catalog.courses, requirements, indexes),
    [entries],
  );
  const coveredAreas = useMemo(
    () => new Set(progress.areas.filter((a) => a.status === 'covered').map((a) => a.area)),
    [progress],
  );

  // A course is an "elective" when it does not count toward any specific Gen Ed
  // requirement: either it has no WSU Gen Ed category match at all (broad transfer
  // credit or "Does not transfer"), or every category it maps to is already filled
  // and the course is not itself a completed course satisfying one of them.
  const electives = useMemo<Elective[]>(() => {
    const out: Elective[] = [];
    for (const entry of entries) {
      const match = matchFor(entry.courseCode);
      if (!match || match.allAreas.length === 0) {
        let label: string;
        let detail: string;
        if (!match) {
          label = 'Not in catalog';
          detail = 'This course was not found in the bundled HFCC catalog.';
        } else if (!match.transfers) {
          label = 'Does not transfer';
          detail = 'The crosswalk lists this course as “Does not transfer” to WSU.';
        } else if (match.hasBroad && !match.hasExact) {
          label = 'Broad transfer';
          detail = 'Transfers as broad XXX credit — no specific WSU Gen Ed category match.';
        } else {
          label = 'No Gen Ed match';
          detail = 'Transfers to WSU but does not map to a specific Gen Ed category.';
        }
        out.push({ entry, match, reason: 'no-match', reasonLabel: label, reasonDetail: detail });
        continue;
      }
      const assigned = entry.appliedArea ? [entry.appliedArea] : match.allAreas;
      if (entry.status !== 'completed' && assigned.every((a) => coveredAreas.has(a))) {
        out.push({
          entry,
          match,
          reason: 'filled',
          reasonLabel: 'Elective',
          reasonDetail: `The category this course maps to (${assigned.join(', ')}) is already filled — it no longer counts toward that requirement.`,
        });
      }
    }
    return out;
  }, [entries, coveredAreas]);

  // Rows are preloaded for every required category; a course appears in each
  // category it may satisfy — unless the student already chose which single
  // category it applies toward, in which case it only shows in that row, or the
  // category is already filled and the course is not a completed course satisfying
  // it (those move to the Electives & Broad Transfer section below). NSI is split
  // into a no-lab row and a lab row; a course lands in the row matching its WSU
  // equivalent's lab status. Course cells stay empty ("—") until courses are added.
  const rows = ROW_DEFS.map((row) => {
    const inRow = entries.filter((e) => {
      const m = matchFor(e.courseCode);
      if (!m?.allAreas.includes(row.cat)) return false;
      if (e.appliedArea && e.appliedArea !== row.cat) return false;
      if (row.sub === 'lab' && !entryNsiLab(e).lab) return false;
      if (row.sub === 'no-lab' && !entryNsiLab(e).noLab) return false;
      if (coveredAreas.has(row.cat) && e.status !== 'completed') return false;
      return true;
    });
    return { row, inRow };
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
              {rows.map(({ row, inRow }) => {
                const credit = rowCreditInfo(row);
                const isEditingRow = inRow.some((e) => e.id === editingId);
                return (
                  <Fragment key={row.cat + (row.sub ?? '')}>
                    <tr className={isEditingRow ? 'row-editing' : ''}>
                      <td data-label="WSU Gen Ed Category">
                        <span className="cat-name" title={credit.title}>
                          {row.label}
                        </span>
                        {inRow.map((e) => (
                          <span key={e.id}>{renderMultiNote(e, row.cat)}</span>
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

      <ElectivesSection
        electives={electives}
        editingId={editingId}
        onEdit={setEditingId}
        onUpdate={updateEntry}
        onRemove={removeEntry}
      />
    </section>
  );
}
