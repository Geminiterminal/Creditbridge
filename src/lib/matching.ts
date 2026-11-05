// Matching rules between the HFCC crosswalk and the WSU requirement lists.
//
// Rules implemented here (from the task and the supplied files):
//  - A WSU equivalent matches a Gen Ed requirement ONLY when the exact WSU code
//    appears in the supplied requirement lists (cross-listed codes are split on "/").
//  - Broad codes containing "X" (e.g. BIO1XXX, GEN2XXX) are broad transfer credit,
//    NOT a confirmed Gen Ed match.
//  - "Does not transfer" is shown separately from "transfers, but no specific
//    Gen Ed match was identified".
//  - One HFCC course may have several equivalencies; all are preserved.
//  - A WSU course may appear in several Inquiry groups; all possible matches are
//    shown, and one course is never automatically counted toward multiple areas.

import { normalizeCode } from './parse';
import type {
  CompetencyCode,
  GenEdAreaCode,
  HfccCourse,
  InquiryGroupCode,
  RequirementsData,
  WsuRequirementCourse,
} from './types';

export interface RequirementIndexes {
  /** WSU code -> inquiry groups whose list contains it. */
  inquiryByCode: Map<string, { group: InquiryGroupCode; course: WsuRequirementCourse }[]>;
  /** WSU code -> competencies whose list contains it. */
  competencyByCode: Map<string, { comp: CompetencyCode; course: WsuRequirementCourse }[]>;
  /** All requirement courses by code (inquiry + competency), for credit/lab lookup. */
  courseByCode: Map<string, WsuRequirementCourse>;
}

export function buildRequirementIndexes(requirements: RequirementsData): RequirementIndexes {
  const inquiryByCode = new Map<string, { group: InquiryGroupCode; course: WsuRequirementCourse }[]>();
  const competencyByCode = new Map<string, { comp: CompetencyCode; course: WsuRequirementCourse }[]>();
  const courseByCode = new Map<string, WsuRequirementCourse>();
  for (const group of requirements.inquiry) {
    for (const course of group.courses) {
      const list = inquiryByCode.get(course.code) ?? [];
      list.push({ group: group.code, course });
      inquiryByCode.set(course.code, list);
      if (!courseByCode.has(course.code)) courseByCode.set(course.code, course);
    }
  }
  for (const comp of requirements.competencies) {
    for (const course of comp.courses) {
      const list = competencyByCode.get(course.code) ?? [];
      list.push({ comp: comp.code, course });
      competencyByCode.set(course.code, list);
      if (!courseByCode.has(course.code)) courseByCode.set(course.code, course);
    }
  }
  return { inquiryByCode, competencyByCode, courseByCode };
}

export interface AreaMatch {
  area: GenEdAreaCode;
  kind: 'inquiry' | 'competency';
  wsuCode: string;
  wsuTitle: string;
  wsuMinCredits: number | null;
  labUnconditional?: boolean;
  labConditional?: boolean;
  labNotes?: string;
}

export interface CourseMatch {
  course: HfccCourse;
  /** True when at least one equivalency is not "Does not transfer". */
  transfers: boolean;
  hasExact: boolean;
  hasBroad: boolean;
  /** True when at least one equivalency is "Does not transfer". */
  hasDoesNotTransfer: boolean;
  inquiryMatches: AreaMatch[];
  competencyMatches: AreaMatch[];
  /** All possible Gen Ed areas (inquiry + competency), deduplicated, sorted. */
  allAreas: GenEdAreaCode[];
  caveats: string[];
}

function dedupeMatches(matches: AreaMatch[]): AreaMatch[] {
  const seen = new Set<string>();
  return matches.filter((m) => {
    const key = `${m.area}|${m.wsuCode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Match one HFCC course against the WSU requirement indexes. */
export function matchCourse(course: HfccCourse, indexes: RequirementIndexes): CourseMatch {
  const inquiryMatches: AreaMatch[] = [];
  const competencyMatches: AreaMatch[] = [];
  let transfers = false;
  let hasExact = false;
  let hasBroad = false;
  let hasDoesNotTransfer = false;
  const caveats: string[] = [];

  for (const eq of course.equivalencies) {
    if (eq.kind === 'none') {
      hasDoesNotTransfer = true;
      continue;
    }
    transfers = true;
    if (eq.kind === 'broad') {
      hasBroad = true;
      continue; // broad transfer credit — never a confirmed Gen Ed match
    }
    hasExact = true;
    const code = normalizeCode(eq.wsuCode);
    for (const hit of indexes.inquiryByCode.get(code) ?? []) {
      inquiryMatches.push({
        area: hit.group,
        kind: 'inquiry',
        wsuCode: code,
        wsuTitle: hit.course.title,
        wsuMinCredits: hit.course.minCredits,
        labUnconditional: hit.course.labUnconditional,
        labConditional: hit.course.labConditional,
        labNotes: hit.course.notes || undefined,
      });
    }
    for (const hit of indexes.competencyByCode.get(code) ?? []) {
      competencyMatches.push({
        area: hit.comp,
        kind: 'competency',
        wsuCode: code,
        wsuTitle: hit.course.title,
        wsuMinCredits: hit.course.minCredits,
      });
    }
  }

  if (hasDoesNotTransfer && transfers) {
    caveats.push('Some equivalency rows for this course are listed as “Does not transfer” — check the rows below.');
  }
  // Note: effective-term gaps and missing HFCC credit hours are documented on the
  // Data & Settings page; they are not repeated as blanket caveats on every card.

  const allAreas = dedupeMatches([...inquiryMatches, ...competencyMatches])
    .map((m) => m.area)
    .filter((area, i, arr) => arr.indexOf(area) === i)
    .sort() as GenEdAreaCode[];

  return {
    course,
    transfers,
    hasExact,
    hasBroad,
    hasDoesNotTransfer,
    inquiryMatches: dedupeMatches(inquiryMatches),
    competencyMatches: dedupeMatches(competencyMatches),
    allAreas,
    caveats,
  };
}

export type TransferFilter = 'all' | 'transfers' | 'does-not-transfer';
export type EquivalencyFilter = 'all' | 'exact' | 'broad' | 'none';
export type AreaFilter = 'all' | GenEdAreaCode;

export interface CourseFilters {
  query: string;
  area: AreaFilter;
  transfer: TransferFilter;
  equivalency: EquivalencyFilter;
}

/**
 * Lowercase and strip everything that isn't a letter or digit, so "hum-101",
 * "hum 101", "HUM.101" and "HUM101" all compare equal to the code "HUM101".
 * Dashes, spaces, dots and other punctuation in a query no longer break matching.
 */
function normalizeSearch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Rank a query against a course: 0 = code starts with the query (e.g. "hum" → HUM101,
 * "hum-101" → HUM101), 1 = every word appears in the code, 2 = every word appears in
 * code or name (e.g. "humanities" → "Intro To Humanities"), -1 = no match.
 */
export function searchRank(code: string, name: string, query: string): number {
  const q = query.trim();
  if (!q) return 0;
  const qn = normalizeSearch(q);
  if (!qn) return -1; // only punctuation/symbols — no meaningful match
  const cn = normalizeSearch(code);
  const nn = normalizeSearch(name);
  // 0 = normalized query is a prefix of the normalized code (e.g. "hum-101" → HUM101)
  if (cn.startsWith(qn)) return 0;
  // Split on whitespace so multi-word queries still work; normalize each word.
  const words = q
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeSearch)
    .filter(Boolean);
  // 1 = every word appears in the normalized code
  if (words.length > 0 && words.every((w) => cn.includes(w))) return 1;
  // 2 = every word appears in the normalized code or name
  if (words.length > 0 && words.every((w) => nn.includes(w) || cn.includes(w))) return 2;
  return -1;
}

/** Search and filter the catalog. Gen Ed area filters use exact matches only.
 *  Results are sorted so code-prefix matches come first, then code matches, then name matches. */
export function searchCourses(
  courses: HfccCourse[],
  indexes: RequirementIndexes,
  filters: CourseFilters,
): CourseMatch[] {
  const query = filters.query.trim();
  const ranked: { match: CourseMatch; rank: number }[] = [];
  for (const course of courses) {
    const rank = query ? searchRank(course.code, course.name, query) : 0;
    if (rank === -1) continue;
    const match = matchCourse(course, indexes);
    if (filters.area !== 'all' && !match.allAreas.includes(filters.area)) continue;
    if (filters.transfer === 'transfers' && !match.transfers) continue;
    if (filters.transfer === 'does-not-transfer' && !match.hasDoesNotTransfer) continue;
    if (filters.equivalency === 'exact' && !match.hasExact) continue;
    if (filters.equivalency === 'broad' && !match.hasBroad) continue;
    if (filters.equivalency === 'none' && !match.hasDoesNotTransfer) continue;
    ranked.push({ match, rank });
  }
  if (query) {
    ranked.sort((a, b) => a.rank - b.rank || a.match.course.code.localeCompare(b.match.course.code));
  }
  return ranked.map((r) => r.match);
}

/** True when a matched AreaMatch corresponds to a WSU course with a lab
 *  (either an unconditional lecture/lab course or one with a lab condition). */
export function isLabMatch(m: AreaMatch): boolean {
  return !!(m.labUnconditional || m.labConditional);
}

/**
 * All HFCC catalog courses that could cover a given Gen Ed area (exact matches only),
 * unlimited and in catalog order. Used to list every option for an area.
 */
export function coursesForArea(
  courses: HfccCourse[],
  indexes: RequirementIndexes,
  area: GenEdAreaCode,
): CourseMatch[] {
  const out: CourseMatch[] = [];
  for (const course of courses) {
    const match = matchCourse(course, indexes);
    if (!match.allAreas.includes(area)) continue;
    if (!match.hasExact) continue; // broad credit alone is not a Gen Ed match
    out.push(match);
  }
  return out;
}

/** HFCC catalog courses that could cover a given Gen Ed area (exact matches only),
 *  excluding planned codes and capped at `limit`. */
export function suggestCoursesForArea(
  courses: HfccCourse[],
  indexes: RequirementIndexes,
  area: GenEdAreaCode,
  excludeCodes: Set<string>,
  limit = 8,
): CourseMatch[] {
  return coursesForArea(courses, indexes, area)
    .filter((m) => !excludeCodes.has(m.course.code))
    .slice(0, limit);
}
