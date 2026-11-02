import { useMemo } from 'react';
import { catalog, indexes, requirements } from '../lib/data';
import { suggestCoursesForArea } from '../lib/matching';
import { areaCreditInfo, computeProgress, type AreaProgress } from '../lib/progress';
import { usePlan } from '../lib/store';
import type { CompetencyCode } from '../lib/types';
import { CourseCard, StatusBadge } from './bits';

function AreaCard({ area, plannedCodes }: { area: AreaProgress; plannedCodes: Set<string> }) {
  const uncovered = area.status === 'open' || area.status === 'needs-review';
  const credit = areaCreditInfo(requirements, area.area);
  const suggestions = useMemo(
    () => (uncovered ? suggestCoursesForArea(catalog.courses, indexes, area.area, plannedCodes, 6) : []),
    [uncovered, area.area, plannedCodes],
  );

  return (
    <details className="card card-compact area-details" aria-label={area.label}>
      <summary className="area-head">
        <span className="area-title" title={credit.title}>
          <span aria-hidden="true" className="caret">▸</span> {area.label}
          <span className="small muted"> · {credit.label}</span>
          {area.kind === 'competency' && requirements.rules.competencyGradeRule.includes(area.area as CompetencyCode) && (
            <span className="small muted"> · C or better</span>
          )}
        </span>
        <StatusBadge status={area.status} />
      </summary>

      <div className="area-body">
        {area.completed.length > 0 && (
          <div>
            <h3>Completed — may fit</h3>
            {area.completed.map((t) => (
              <div key={t.entry.id + t.wsuCode} className="match-row">
                <span>
                  <strong>{t.entry.courseCode}</strong> → WSU {t.wsuCode}
                  {t.credits != null && (
                    <span className="small muted">
                      {' '}
                      · {t.credits} cr ({t.creditsSource === 'entered' ? 'entered' : 'WSU-listed'})
                    </span>
                  )}
                  {t.credits == null && <span className="small muted"> · credits unknown — needs review</span>}
                  {t.entry.grade && <span className="small muted"> · {t.entry.grade}</span>}
                  {t.gradeOk === null && <span className="small muted"> · grade needs confirmation (C or better required)</span>}
                  {t.gradeOk === false && <span className="small muted"> · below C</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {area.potential.length > 0 && (
          <div>
            <h3>In progress / planned</h3>
            {area.potential.map((t) => (
              <div key={t.entry.id + t.wsuCode} className="match-row">
                <span>
                  <strong>{t.entry.courseCode}</strong> → WSU {t.wsuCode} · <em>{t.entry.status}</em>
                </span>
              </div>
            ))}
          </div>
        )}

        {area.notes.map((n, i) => (
          <p key={i} className="caveat">
            ⚠ {n}
          </p>
        ))}

        {uncovered && (
          <div>
            <h3>Possible next courses</h3>
            {suggestions.length === 0 ? (
              <p className="small muted">No other HFCC catalog courses map exactly to this area in the supplied files.</p>
            ) : (
              suggestions.map((m) => (
                <div key={m.course.code} className="suggestion">
                  <CourseCard match={m} />
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </details>
  );
}

export default function Progress() {
  const { entries } = usePlan();
  const plannedCodes = useMemo(() => new Set(entries.map((e) => e.courseCode.toUpperCase())), [entries]);
  const result = useMemo(() => computeProgress(entries, catalog.courses, requirements, indexes), [entries]);

  const inquiryAreas = result.areas.filter((a) => a.kind === 'inquiry');
  const competencyAreas = result.areas.filter((a) => a.kind === 'competency');

  return (
    <section aria-labelledby="progress-heading">
      <h2 id="progress-heading">Gen Ed Progress</h2>

      {result.warnings.length > 0 && (
        <div className="banner banner-warn" role="alert">
          <strong>Warnings:</strong>
          <ul className="plain">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {entries.length === 0 && (
        <div className="card empty">
          <span className="big" aria-hidden="true">🧭</span>
          <p>
            <strong>Your plan is empty.</strong>
          </p>
          <p className="small">Add courses in My Courses to see progress here.</p>
        </div>
      )}

      <h3>Inquiry groups</h3>
      <p className="small muted tight">
        Courses completed: <strong>{result.inquiryCourses.count} of {result.inquiryCourses.required}</strong> — each of the six
        groups needs a ≥3-credit course, and NSI needs a second course with a lab (seven courses total).
      </p>
      {inquiryAreas.map((a) => (
        <AreaCard key={a.area} area={a} plannedCodes={plannedCodes} />
      ))}

      <details className="card card-compact area-details">
        <summary className="area-head">
          <span className="area-title">
            <span aria-hidden="true" className="caret">▸</span> NSI lab condition
          </span>
          <StatusBadge
            status={result.nsiLab.status === 'satisfied' ? 'covered' : result.nsiLab.status === 'needs-review' ? 'needs-review' : 'open'}
          />
        </summary>
        <div className="area-body">
          <p className="small muted tight">
            WSU requires a second NSI course with a lab. Lab status comes only from the supplied NSI list — never assumed.
          </p>
          {result.nsiLab.notes.map((n, i) => (
            <p key={i} className="caveat">
              ⚠ {n}
            </p>
          ))}
        </div>
      </details>

      <h3>Competencies (4)</h3>
      {competencyAreas.map((a) => (
        <AreaCard key={a.area} area={a} plannedCodes={plannedCodes} />
      ))}
    </section>
  );
}
