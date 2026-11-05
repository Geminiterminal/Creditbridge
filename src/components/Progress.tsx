import { useMemo } from 'react';
import { catalog, indexes, requirements } from '../lib/data';
import { coursesForArea, isLabMatch, type CourseMatch } from '../lib/matching';
import { areaCreditInfo, computeProgress, type AreaProgress } from '../lib/progress';
import { usePlan } from '../lib/store';
import type { CompetencyCode, GenEdAreaCode } from '../lib/types';
import { StatusBadge } from './bits';

function AreaCourseRow({ match, area, inPlan }: { match: CourseMatch; area: GenEdAreaCode; inPlan: boolean }) {
  const wsuCodes = [...match.inquiryMatches, ...match.competencyMatches]
    .filter((m) => m.area === area)
    .map((m) => m.wsuCode);
  const nsi = area === 'NSI' ? match.inquiryMatches.find((x) => x.area === 'NSI') : undefined;
  const lab = nsi ? isLabMatch(nsi) : false;
  return (
    <div className="area-course-row">
      <span className="area-course-code">{match.course.code}</span>
      <span className="muted small"> {match.course.name}</span>
      {nsi &&
        (lab ? (
          <span className="badge badge-lab" title={nsi.labNotes || 'NSI lab course'}>
            lab
          </span>
        ) : (
          <span className="badge badge-nolab">no lab</span>
        ))}
      {inPlan && <span className="badge badge-plan">in plan</span>}
      <span className="small muted"> → {wsuCodes.join(', ')}</span>
      {lab && nsi?.labNotes && <span className="small muted area-course-note"> ({nsi.labNotes})</span>}
    </div>
  );
}

function AreaCard({ area, plannedCodes }: { area: AreaProgress; plannedCodes: Set<string> }) {
  const credit = areaCreditInfo(requirements, area.area);
  const allCourses = useMemo(
    () => coursesForArea(catalog.courses, indexes, area.area),
    [area.area],
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

        <div>
          <h3>All HFCC courses that may fulfill this area ({allCourses.length})</h3>
          {allCourses.length === 0 ? (
            <p className="small muted">No HFCC catalog courses map exactly to this area in the supplied files.</p>
          ) : (
            allCourses.map((m) => (
              <AreaCourseRow key={m.course.code} match={m} area={area.area} inPlan={plannedCodes.has(m.course.code)} />
            ))
          )}
        </div>
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

  // HFCC courses that map to an NSI course the WSU list marks as having a lab.
  const nsiLabCourses = useMemo(
    () =>
      coursesForArea(catalog.courses, indexes, 'NSI').filter((m) =>
        m.inquiryMatches.some((x) => x.area === 'NSI' && isLabMatch(x)),
      ),
    [],
  );

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
            <span aria-hidden="true" className="caret">▸</span> NSI lab requirement
          </span>
          <StatusBadge
            status={result.nsiLab.status === 'satisfied' ? 'covered' : result.nsiLab.status === 'needs-review' ? 'needs-review' : 'open'}
          />
        </summary>
        <div className="area-body">
          <div className="banner banner-warn">
            <strong>Confirm on the WSU and HFCC websites.</strong> Lab conditions (concurrent courses, credit
            hours, lecture/lab combinations) are complex and can change — verify the lab requirement for your
            specific course on both the WSU and HFCC sites before relying on it.
          </div>
          <p className="small muted tight">
            WSU requires a second NSI course with a lab. The HFCC courses below map to an NSI course the WSU list
            marks as having a lab. Lab status comes only from the supplied NSI list — never assumed.
          </p>
          {nsiLabCourses.length === 0 ? (
            <p className="small muted">No HFCC catalog courses map to an NSI lab course in the supplied files.</p>
          ) : (
            nsiLabCourses.map((m) => (
              <AreaCourseRow key={m.course.code} match={m} area="NSI" inPlan={plannedCodes.has(m.course.code)} />
            ))
          )}
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
