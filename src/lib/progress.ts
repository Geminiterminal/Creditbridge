// Gen Ed progress computation from the student's plan.
//
// Rules applied (from the supplied files):
//  - Only "completed" entries count toward satisfying an area. In-progress and
//    planned entries are shown as potential coverage, never as completed.
//  - Each of the six Inquiry groups requires a course of at least 3 credits.
//    Credits come from the student's entry when provided, otherwise from the WSU
//    requirement list for the matched course; otherwise the area is "needs review".
//  - NSI additionally requires a second NSI course with a lab; lab status comes
//    only from the notes in the supplied NSI list — never inferred.
//  - BC, IC and QE require a grade of C or better. When a grade is entered it is
//    applied; otherwise the requirement is flagged as needing confirmation.
//  - A course may match several areas; all possible matches are shown, and one
//    course is never automatically counted toward multiple requirements. Overlaps
//    produce warnings instead.
//  - Competency courses generally should not also satisfy Inquiry requirements;
//    that situation produces a warning, not a claim of double coverage.

import { matchCourse, type CourseMatch, type RequirementIndexes } from './matching';
import { isGradeCOrBetter } from './plan';
import type {
  CompetencyCode,
  GenEdAreaCode,
  HfccCourse,
  InquiryGroupCode,
  PlanEntry,
  RequirementsData,
} from './types';

export interface TrackedMatch {
  entry: PlanEntry;
  match: CourseMatch;
  wsuCode: string;
  /** Effective credits used for the >=3 rule: student-entered, else WSU-listed, else null. */
  credits: number | null;
  creditsSource: 'entered' | 'wsu-list' | 'unknown';
  /** For BC/IC/QE: whether the entered grade is C or better. Null = needs confirmation. */
  gradeOk: boolean | null;
}

export type AreaStatus = 'covered' | 'on-track' | 'open' | 'needs-review';

export interface AreaProgress {
  area: GenEdAreaCode;
  kind: 'inquiry' | 'competency';
  label: string;
  status: AreaStatus;
  /** Completed entries that may satisfy this area. */
  completed: TrackedMatch[];
  /** In-progress / planned entries that may help this area. */
  potential: TrackedMatch[];
  notes: string[];
}

export interface NsiLabProgress {
  /** Second NSI course with a lab: satisfied, not yet, or needs review (conditional lab note). */
  status: 'satisfied' | 'open' | 'needs-review';
  notes: string[];
}

export interface ProgressResult {
  areas: AreaProgress[];
  nsiLab: NsiLabProgress;
  /**
   * "Each student must complete a course of at least three credits from each of the
   * six inquiry groups; the NSI group requires a second NSI course with a lab section,
   * for a minimum total of seven courses." — count of completed qualifying inquiry
   * courses vs. the required total (7 when the NSI lab rule applies, else 6).
   */
  inquiryCourses: { count: number; required: number };
  /** Areas with status "covered", and the sum of their required credits (of GEN_ED_STRUCTURE.totalCredits). */
  areasCovered: number;
  creditsCovered: number;
  warnings: string[];
}

const AREA_LABELS: Record<GenEdAreaCode, string> = {
  CIV: 'Civic Literacy Inquiry (CIV)',
  CI: 'Cultural Inquiry (CI)',
  GL: 'Global Learning Inquiry (GL)',
  NSI: 'Natural Scientific Inquiry (NSI)',
  SI: 'Social Inquiry (SI)',
  USP: 'US Perspectives (USP)',
  BC: 'Basic Composition (BC)',
  IC: 'Intermediate Composition (IC)',
  OC: 'Oral Communication (OC)',
  QE: 'Quantitative Experience (QE)',
};

export function areaLabel(area: GenEdAreaCode): string {
  return AREA_LABELS[area];
}

/**
 * WSU General Education credit structure (minimum 34 credits total):
 *   Competencies: BC, IC, OC, QE x 3 cr = 12 cr
 *   Inquiry: CIV, CI, GL, SI, USP x 3 cr + NSI 7 cr (one NSI course plus a second
 *   NSI course with a lab, e.g. 3 cr + 4 cr) = 22 cr — "a minimum total of seven
 *   courses" across the six Inquiry groups (Inquiry Course Requirements.txt).
 *   12 + 22 = 34 cr.
 */
export const GEN_ED_STRUCTURE = {
  totalCredits: 34,
  competencyCredits: 3,
  inquiryCredits: 3,
  nsiCredits: 7,
} as const;

/**
 * Credit requirement shown next to each Gen Ed category. Per-group minimums come
 * from the supplied TXT files ("a course of at least three credits from each of the
 * six inquiry groups"; NSI "requires a second NSI course with a lab section"); the
 * 34-credit category breakdown is the WSU Gen Ed structure.
 */
export function areaCreditInfo(
  requirements: RequirementsData,
  area: GenEdAreaCode,
): { label: string; title: string; courseCount: number; credits: number } {
  // Hover tooltip: full category name first, then the credit requirement, then the source.
  const fullName = areaLabel(area);
  const inq = requirements.inquiry.find((g) => g.code === area);
  if (inq) {
    const cr = requirements.rules.inquiryMinCredits;
    const courseCount = new Set(inq.courses.map((c) => c.code)).size;
    if (inq.code === 'NSI' && requirements.rules.nsiRequiresSecondCourseWithLab) {
      return {
        label: `${GEN_ED_STRUCTURE.nsiCredits} cr required · 2 courses (1 with lab)`,
        title: `${fullName}\n${GEN_ED_STRUCTURE.nsiCredits} cr total — one NSI course (at least ${cr} cr) plus a second NSI course with a lab section ("for a minimum total of seven courses")\n${courseCount} WSU courses listed — source: Inquiry Course Requirements.txt`,
        courseCount,
        credits: GEN_ED_STRUCTURE.nsiCredits,
      };
    }
    return {
      label: `${GEN_ED_STRUCTURE.inquiryCredits} cr required`,
      title: `${fullName}\n${GEN_ED_STRUCTURE.inquiryCredits} cr required (a course of at least ${cr} credits)\n${courseCount} WSU courses listed — source: Inquiry Course Requirements.txt`,
      courseCount,
      credits: GEN_ED_STRUCTURE.inquiryCredits,
    };
  }
  const comp = requirements.competencies.find((c) => c.code === area)!;
  const courseCount = new Set(comp.courses.map((c) => c.code)).size;
  return {
    label: `${GEN_ED_STRUCTURE.competencyCredits} cr required`,
    title: `${fullName}\n${GEN_ED_STRUCTURE.competencyCredits} cr required (counts toward the ${GEN_ED_STRUCTURE.totalCredits}-credit Gen Ed minimum)\n${courseCount} WSU courses listed — source: Competency Requirements.txt`,
    courseCount,
    credits: GEN_ED_STRUCTURE.competencyCredits,
  };
}

function toTrackedMatch(entry: PlanEntry, match: CourseMatch, wsuCode: string, requirements: RequirementsData): TrackedMatch {
  const wsuCourse = requirements.inquiry
    .flatMap((g) => g.courses)
    .concat(requirements.competencies.flatMap((c) => c.courses))
    .find((c) => c.code === wsuCode);
  let credits: number | null = null;
  let creditsSource: TrackedMatch['creditsSource'] = 'unknown';
  if (typeof entry.credits === 'number' && Number.isFinite(entry.credits)) {
    credits = entry.credits;
    creditsSource = 'entered';
  } else if (wsuCourse?.minCredits != null) {
    credits = wsuCourse.minCredits;
    creditsSource = 'wsu-list';
  }
  const comp = requirements.competencies.find((c) => c.code === (match.competencyMatches.find((m) => m.wsuCode === wsuCode)?.area as CompetencyCode));
  const gradeRuleApplies = !!comp && requirements.rules.competencyGradeRule.includes(comp.code);
  const gradeOk = gradeRuleApplies ? isGradeCOrBetter(entry.grade) : true;
  return { entry, match, wsuCode, credits, creditsSource, gradeOk };
}

function entryQualifies(tracked: TrackedMatch, area: GenEdAreaCode, requirements: RequirementsData): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  const isInquiry = (['CIV', 'CI', 'GL', 'NSI', 'SI', 'USP'] as GenEdAreaCode[]).includes(area);
  if (isInquiry) {
    const min = requirements.rules.inquiryMinCredits;
    if (tracked.credits == null) {
      notes.push('Credit hours unknown — needs review (Inquiry requires at least 3 credits).');
      return { ok: false, notes };
    }
    if (tracked.creditsSource === 'wsu-list') {
      notes.push(`Credits based on the WSU listing (${tracked.credits}); HFCC credits need review.`);
    }
    if (tracked.credits < min) {
      notes.push(`Only ${tracked.credits} credits — Inquiry requires at least ${min}.`);
      return { ok: false, notes };
    }
  }
  if (tracked.gradeOk === null) {
    notes.push('Grade not entered or not recognized — this competency requires a grade of C or better; needs confirmation.');
    return { ok: false, notes };
  }
  if (tracked.gradeOk === false) {
    notes.push('Entered grade is below C — this competency requires a grade of C or better.');
    return { ok: false, notes };
  }
  return { ok: true, notes };
}

export function computeProgress(
  entries: PlanEntry[],
  courses: HfccCourse[],
  requirements: RequirementsData,
  indexes: RequirementIndexes,
): ProgressResult {
  const courseByCode = new Map(courses.map((c) => [c.code, c]));
  const allAreas: GenEdAreaCode[] = [
    ...requirements.inquiry.map((g) => g.code),
    ...requirements.competencies.map((c) => c.code),
  ];

  // Map each entry to its matches.
  const entryMatches = new Map<string, CourseMatch>();
  for (const entry of entries) {
    const course = courseByCode.get(entry.courseCode.toUpperCase());
    if (course) entryMatches.set(entry.id, matchCourse(course, indexes));
  }

  // Completed entries that qualify for at least one Inquiry group (each entry counts once).
  const inquiryQualifying = new Set<string>();

  const areas: AreaProgress[] = allAreas.map((area) => {
    const kind = (requirements.inquiry.some((g) => g.code === area) ? 'inquiry' : 'competency') as 'inquiry' | 'competency';
    const completed: TrackedMatch[] = [];
    const potential: TrackedMatch[] = [];
    const notes: string[] = [];
    for (const entry of entries) {
      if (entry.status !== 'completed' && entry.status !== 'in-progress' && entry.status !== 'planned') continue;
      // If the student chose which category a multi-category course applies toward,
      // it only counts toward that one.
      if (entry.appliedArea && entry.appliedArea !== area) continue;
      const match = entryMatches.get(entry.id);
      if (!match) continue;
      const areaMatches = [...match.inquiryMatches, ...match.competencyMatches].filter((m) => m.area === area);
      for (const am of areaMatches) {
        const tracked = toTrackedMatch(entry, match, am.wsuCode, requirements);
        if (entry.status === 'completed') completed.push(tracked);
        else potential.push(tracked);
      }
    }
    let status: AreaStatus = 'open';
    if (completed.length > 0) {
      const qualifying = completed.filter((t) => entryQualifies(t, area, requirements).ok);
      if (qualifying.length > 0) status = 'covered';
      else status = 'needs-review';
      if (kind === 'inquiry') for (const t of qualifying) inquiryQualifying.add(t.entry.id);
      for (const t of completed) notes.push(...entryQualifies(t, area, requirements).notes);
    } else if (potential.length > 0) {
      status = 'on-track';
    }
    return { area, kind, label: areaLabel(area), status, completed, potential, notes };
  });

  // NSI lab condition: needs a second NSI course with a lab, tracked separately.
  const nsiNotes: string[] = [];
  const nsiCompleted = areas.find((a) => a.area === 'NSI')?.completed ?? [];
  const labCourses = nsiCompleted.filter((t) => {
    const m = [...t.match.inquiryMatches].find((x) => x.area === 'NSI' && x.wsuCode === t.wsuCode);
    return m && (m.labUnconditional || m.labConditional);
  });
  const unconditional = labCourses.filter((t) => {
    const m = t.match.inquiryMatches.find((x) => x.area === 'NSI' && x.wsuCode === t.wsuCode);
    return m?.labUnconditional;
  });
  const conditional = labCourses.filter((t) => {
    const m = t.match.inquiryMatches.find((x) => x.area === 'NSI' && x.wsuCode === t.wsuCode);
    return m?.labConditional;
  });
  let nsiLabStatus: NsiLabProgress['status'] = 'open';
  if (unconditional.length > 0) {
    nsiLabStatus = 'satisfied';
  } else if (conditional.length > 0) {
    nsiLabStatus = 'needs-review';
    for (const t of conditional) {
      const m = t.match.inquiryMatches.find((x) => x.area === 'NSI' && x.wsuCode === t.wsuCode);
      nsiNotes.push(`${t.entry.courseCode} → ${t.wsuCode}: ${m?.labNotes ?? 'lab condition applies'} — confirm the condition is met.`);
    }
  }
  if (nsiCompleted.length === 0) {
    nsiNotes.push('No completed NSI course yet. NSI needs two courses, one with a lab (7 courses total across Gen Ed).');
  } else if (labCourses.length === 0) {
    nsiNotes.push('No completed NSI course is listed with a lab in the WSU NSI list — the lab requirement stays open. Labs are never assumed.');
  }
  const nsiLab: NsiLabProgress = { status: nsiLabStatus, notes: nsiNotes };

  // NSI group rule (Inquiry Course Requirements.txt): "the Natural Scientific Inquiry
  // (NSI) group requires a second NSI course with a lab section, for a minimum total of
  // seven courses." The NSI area is only fully covered with TWO qualifying NSI courses,
  // at least one of them a lab course.
  const nsiArea = areas.find((a) => a.area === 'NSI');
  if (nsiArea && requirements.rules.nsiRequiresSecondCourseWithLab) {
    const nsiQualifyingCount = nsiArea.completed.filter((t) => entryQualifies(t, 'NSI', requirements).ok).length;
    if (nsiQualifyingCount >= 2 && nsiLab.status === 'satisfied') {
      nsiArea.status = 'covered';
    } else if (nsiQualifyingCount >= 1) {
      nsiArea.status = 'needs-review';
      nsiArea.notes.push(
        'NSI also requires a second NSI course with a lab section — “for a minimum total of seven courses” across the six Inquiry groups (Inquiry Course Requirements.txt).',
      );
    }
  }

  const inquiryCourses = {
    count: inquiryQualifying.size,
    required: requirements.rules.nsiRequiresSecondCourseWithLab ? 7 : 6,
  };

  // Warnings: overlapping areas and competency/inquiry conflicts.
  const warnings: string[] = [];
  for (const entry of entries) {
    if (entry.status !== 'completed') continue;
    const match = entryMatches.get(entry.id);
    if (!match) continue;
    const inquiryAreas = match.inquiryMatches.map((m) => m.area);
    const compAreas = match.competencyMatches.map((m) => m.area);
    const uniqueInquiry = [...new Set(inquiryAreas)];
    if (uniqueInquiry.length > 1 && !entry.appliedArea) {
      warnings.push(
        `${entry.courseCode} may fit multiple Inquiry groups (${uniqueInquiry.join(', ')}). One course is not automatically counted toward more than one requirement — plan needs review.`,
      );
    }
    if (inquiryAreas.length > 0 && compAreas.length > 0 && !entry.appliedArea && requirements.rules.competencyNotGenerallyDoubleCountedWithInquiry) {
      warnings.push(
        `${entry.courseCode} matches both a Competency (${[...new Set(compAreas)].join(', ')}) and an Inquiry group (${uniqueInquiry.join(', ')}). The supplied rules say Competency courses generally should NOT also satisfy Inquiry requirements — treat as one or the other, not both.`,
      );
    }
  }

  const areasCovered = areas.filter((a) => a.status === 'covered').length;
  const creditsCovered = areas
    .filter((a) => a.status === 'covered')
    .reduce((sum, a) => sum + areaCreditInfo(requirements, a.area).credits, 0);

  return { areas, nsiLab, inquiryCourses, areasCovered, creditsCovered, warnings };
}

export function inquiryGroupCodes(requirements: RequirementsData): InquiryGroupCode[] {
  return requirements.inquiry.map((g) => g.code);
}

export function competencyCodes(requirements: RequirementsData): CompetencyCode[] {
  return requirements.competencies.map((c) => c.code);
}
