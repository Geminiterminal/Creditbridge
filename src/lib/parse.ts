// Parsers for the three supplied source files. These functions are pure so they can
// run both at data-build time (scripts/build-data.ts) and inside unit tests.
//
// Sources (kept verbatim in data/source/):
//   - Equivalent Courses from Henry Ford College.txt  (HFCC -> WSU crosswalk)
//   - Inquiry Course Requirements.txt                 (WSU Inquiry groups CIV/CI/GL/NSI/SI/USP)
//   - Competency Requirements.txt                     (WSU competencies BC/IC/OC/QE)

import type {
  CatalogData,
  Competency,
  CompetencyCode,
  Equivalency,
  EquivalencyKind,
  HfccCourse,
  InquiryGroup,
  InquiryGroupCode,
  RequirementsData,
  WsuRequirementCourse,
} from './types';

/** Normalize a course code: uppercase and strip whitespace ("ENG 1020" -> "ENG1020"). */
export function normalizeCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase();
}

/**
 * Split a cross-listed code into its individual normalized codes.
 * The numeric suffix is shared by prefixes that precede it:
 *   "AFS/ENG 2390"            -> ["AFS2390", "ENG2390"]
 *   "ELR/ANT/HIS/PS 1110"     -> ["ELR1110", "ANT1110", "HIS1110", "PS1110"]
 *   "US/GPH/HIS/PS 2000/SOC 2500" -> ["US2000", "GPH2000", "HIS2000", "PS2000", "SOC2500"]
 */
export function splitCrossListed(code: string): string[] {
  const parts = code.split('/').map((p) => p.trim()).filter((p) => p.length > 0);
  const result: string[] = [];
  let carriedNumber = '';
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    const own = part.match(/^([A-Za-z]+)\s*(\d[\d,.\-]*)$/);
    if (own) {
      carriedNumber = own[2];
      result.unshift(normalizeCode(`${own[1]}${own[2]}`));
    } else {
      const letters = normalizeCode(part);
      if (!letters) continue;
      result.unshift(carriedNumber ? `${letters}${carriedNumber}` : letters);
    }
  }
  return result;
}

/** Classify a WSU equivalent string from the crosswalk. */
export function classifyEquivalency(rawWsuCode: string): EquivalencyKind {
  const normalized = normalizeCode(rawWsuCode);
  if (normalized === 'DOESNOTTRANSFER') return 'none';
  if (normalized.includes('X')) return 'broad'; // wildcards like ET1XXX, ACO12XX, CMT2X10
  return 'exact';
}

/**
 * Parse the "Equivalent Courses from Henry Ford College" file.
 * Data rows are tab-separated with 4 fields: HFCC code, name, WSU equivalent, effective term.
 * The page header/footer lines (fewer than 4 fields, or the "Course" header row) are skipped.
 * Multiple rows for the same HFCC course are preserved and grouped, in source order.
 */
export function parseEquivalents(text: string): HfccCourse[] {
  const lines = text.split(/\r?\n/);
  const byCode = new Map<string, HfccCourse>();
  for (const line of lines) {
    if (!line.includes('\t')) continue;
    const fields = line.split('\t');
    if (fields.length !== 4) continue;
    const [rawCode, name, rawWsu, rawTerm] = fields.map((f) => f.trim());
    if (!rawCode || rawCode.toLowerCase() === 'course') continue; // header row
    if (!rawWsu) continue;
    const code = normalizeCode(rawCode);
    const equivalency: Equivalency = {
      wsuCode: classifyEquivalency(rawWsu) === 'none' ? '' : normalizeCode(rawWsu),
      rawWsuCode: rawWsu,
      kind: classifyEquivalency(rawWsu),
      effectiveTerm: rawTerm.length > 0 ? rawTerm : null,
    };
    let course = byCode.get(code);
    if (!course) {
      course = { code, name, equivalencies: [] };
      byCode.set(code, course);
    }
    course.equivalencies.push(equivalency);
  }
  return [...byCode.values()];
}

/** Parse a credits cell like "3", "3-4", "3,5" into min/max numbers. */
export function parseCredits(raw: string): { min: number | null; max: number | null } {
  const cleaned = raw.trim().replace(/,/g, '-');
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?$/);
  if (!match) return { min: null, max: null };
  const min = Number(match[1]);
  const max = match[2] !== undefined ? Number(match[2]) : min;
  return { min, max };
}

/** Extract parenthetical notes (lab / concurrent-course conditions) from a requirement title. */
function extractNotes(title: string): { cleanTitle: string; notes: string } {
  const notes: string[] = [];
  const cleanTitle = title.replace(/\(([^)]*)\)/g, (_m, note: string) => {
    notes.push(note.trim());
    return '';
  });
  return { cleanTitle: cleanTitle.replace(/\s{2,}/g, ' ').trim(), notes: notes.join(' ') };
}

function parseRequirementRow(codeField: string, titleField: string, creditsField: string): WsuRequirementCourse[] {
  const { cleanTitle, notes } = extractNotes(titleField.trim());
  const { min, max } = parseCredits(creditsField);
  const noteText = notes.toLowerCase();
  const mentionsLab = noteText.includes('lab');
  const conditional = /\b(when|upon)\b/.test(noteText);
  return splitCrossListed(codeField).map((code) => ({
    code,
    title: cleanTitle,
    creditsRaw: creditsField.trim(),
    minCredits: min,
    maxCredits: max,
    notes,
    labUnconditional: mentionsLab && !conditional,
    labConditional: mentionsLab && conditional,
  }));
}

const INQUIRY_HEADERS: [RegExp, InquiryGroupCode, string][] = [
  [/Civic Literacy Inquiry\s*\((CIV)\)/i, 'CIV', 'Civic Literacy Inquiry'],
  [/Cultural Inquiry\s*\((CI)\)/i, 'CI', 'Cultural Inquiry'],
  [/Global Learning Inquiry\s*\((GL)\)/i, 'GL', 'Global Learning Inquiry'],
  [/Natural Scientific Inquiry\s*\((NSI)\)/i, 'NSI', 'Natural Scientific Inquiry'],
  [/Social Inquiry\s*\((SI)\)/i, 'SI', 'Social Inquiry'],
  [/US Perspectives\s*\((USP)\)/i, 'USP', 'US Perspectives'],
];

/**
 * Parse the "Inquiry Course Requirements" file into the six Inquiry groups.
 * Each group section contains a "Course List" followed by a "Code Title Credits"
 * header and tab-separated rows.
 */
export function parseInquiry(text: string): InquiryGroup[] {
  const lines = text.split(/\r?\n/);
  const groups: InquiryGroup[] = [];
  let current: InquiryGroup | null = null;
  let inCourseList = false;
  for (const line of lines) {
    const headerMatch = INQUIRY_HEADERS.find(([re]) => re.test(line));
    if (headerMatch) {
      const [, code, label] = headerMatch;
      // Group names also appear in the intro list at the top of the file; re-attach
      // to the existing group instead of creating a duplicate empty one.
      const existing = groups.find((g) => g.code === code);
      current = existing ?? { code, label, minCreditsPerCourse: 3, courses: [] };
      if (!existing) groups.push(current);
      inCourseList = false;
      continue;
    }
    if (!current) continue;
    if (/^Course List\s*$/i.test(line.trim())) {
      inCourseList = true;
      continue;
    }
    if (inCourseList) {
      if (!line.includes('\t')) {
        inCourseList = false;
        continue;
      }
      const fields = line.split('\t').map((f) => f.trim());
      if (fields.length < 3) {
        inCourseList = false;
        continue;
      }
      const [codeField, titleField, creditsField] = fields;
      if (codeField.toLowerCase() === 'code') continue; // column header row
      if (!codeField || !titleField) {
        inCourseList = false;
        continue;
      }
      current.courses.push(...parseRequirementRow(codeField, titleField, creditsField ?? ''));
    }
  }
  return groups;
}

const COMPETENCY_HEADERS: [RegExp, CompetencyCode, string][] = [
  [/Basic Composition\s*\((BC)\)\s*Requirement/i, 'BC', 'Basic Composition'],
  [/Intermediate Composition\s*\((IC)\)\s*Requirement/i, 'IC', 'Intermediate Composition'],
  [/Oral Communication\s*\((OC)\)\s*Requirement/i, 'OC', 'Oral Communication'],
  [/Quantitative Experience\s*\((QE)\)\s*Requirement/i, 'QE', 'Quantitative Experience'],
];

/**
 * Parse the "Competency Requirements" file into the four competencies.
 * A competency requires a grade of C or better when its section says so
 * (the file states this explicitly for BC, IC, and QE).
 */
export function parseCompetencies(text: string): Competency[] {
  const lines = text.split(/\r?\n/);
  const comps: Competency[] = [];
  let current: Competency | null = null;
  let currentSectionText = '';
  let inCourseList = false;
  const finish = () => {
    if (current) {
      // The file states per-section whether a grade of C or better is required
      // (true for BC, IC, and QE; not stated for OC).
      current.requiresGradeCOrBetter = /grade of C or (better|higher)/i.test(currentSectionText);
    }
    current = null;
    currentSectionText = '';
  };
  for (const line of lines) {
    // Section headers end with "Requirement", so intro-list lines like
    // "Oral Communication (OC)" do not match and no duplicates are created.
    const headerMatch = COMPETENCY_HEADERS.find(([re]) => re.test(line));
    if (headerMatch) {
      finish();
      const [, code, label] = headerMatch;
      current = { code, label, requiresGradeCOrBetter: false, courses: [] };
      comps.push(current);
      inCourseList = false;
      continue;
    }
    if (!current) continue;
    currentSectionText += line + '\n';
    if (/^Course List\s*$/i.test(line.trim())) {
      inCourseList = true;
      continue;
    }
    if (inCourseList) {
      if (!line.includes('\t')) {
        inCourseList = false;
        continue;
      }
      const fields = line.split('\t').map((f) => f.trim());
      if (fields.length < 3) {
        inCourseList = false;
        continue;
      }
      const [codeField, titleField, creditsField] = fields;
      if (codeField.toLowerCase() === 'code') continue;
      if (!codeField || !titleField) {
        inCourseList = false;
        continue;
      }
      current.courses.push(...parseRequirementRow(codeField, titleField, creditsField ?? ''));
    }
  }
  finish();
  return comps;
}

/** Parse the cross-cutting rules stated in the requirement files. */
export function parseRules(inquiryText: string, competencyText: string): RequirementsData['rules'] {
  const inquiryMinMatch = inquiryText.match(/course of at least (\d+) credits/i);
  const inquiryMinCredits = inquiryMinMatch ? Number(inquiryMinMatch[1]) : 3;
  const nsiLab = /NSI[^.]*second NSI course with a lab/i.test(inquiryText);
  const gradeRuleMatch = competencyText.match(/Competency requirements ([^.]*?) must be completed with a grade of C or higher/i);
  const gradeRuleText = gradeRuleMatch ? gradeRuleMatch[1] : 'BC, IC, and QE';
  const competencyGradeRule = [...new Set([...gradeRuleText.matchAll(/\b(BC|IC|OC|QE)\b/g)].map((m) => m[1]))] as CompetencyCode[];
  const competencyNotGenerallyDoubleCountedWithInquiry =
    /shall not generally also be used to satisfy Inquiry requirements/i.test(competencyText);
  return {
    inquiryMinCredits,
    nsiRequiresSecondCourseWithLab: nsiLab,
    competencyGradeRule,
    competencyNotGenerallyDoubleCountedWithInquiry,
  };
}

/** Build the full normalized requirements object from raw source text. */
export function parseRequirements(inquiryText: string, competencyText: string): RequirementsData {
  return {
    inquiry: parseInquiry(inquiryText),
    competencies: parseCompetencies(competencyText),
    rules: parseRules(inquiryText, competencyText),
  };
}

/** Build the full normalized catalog object from raw source text. */
export function parseCatalog(equivalentsText: string, generatedAt: string): CatalogData {
  return {
    courses: parseEquivalents(equivalentsText),
    generatedAt,
    sourceFiles: [
      'Equivalent Courses from Henry Ford College.txt',
      'Inquiry Course Requirements.txt',
      'Competency Requirements.txt',
    ],
    caveats: [
      'The HFCC crosswalk does not list HFCC credit hours; enter credits yourself when known.',
      'Many crosswalk rows have no effective term; those mappings need review.',
    ],
  };
}
