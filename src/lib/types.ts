// Shared types for Creditbridge data, matching, and the student plan.

export type EquivalencyKind = 'exact' | 'broad' | 'none';

export interface Equivalency {
  /** Normalized WSU code as it appears in the source, e.g. "ENG1020", "ET1XXX". Empty for "Does not transfer". */
  wsuCode: string;
  /** Raw text from the source file (before normalization). */
  rawWsuCode: string;
  kind: EquivalencyKind;
  /** Effective term from the source, e.g. "Fall 2015", or null when not listed. */
  effectiveTerm: string | null;
}

export interface HfccCourse {
  /** Normalized HFCC course code, uppercase, no spaces, e.g. "ENG131". */
  code: string;
  /** Course name from the source file. */
  name: string;
  /** All equivalency rows for this course, in source order (multiple mappings preserved). */
  equivalencies: Equivalency[];
}

export type InquiryGroupCode = 'CIV' | 'CI' | 'GL' | 'NSI' | 'SI' | 'USP';
export type CompetencyCode = 'BC' | 'IC' | 'OC' | 'QE';
export type GenEdAreaCode = InquiryGroupCode | CompetencyCode;

export interface WsuRequirementCourse {
  /** A single normalized WSU code. Cross-listed codes ("AFS/ENG 2390") are split into one entry per code. */
  code: string;
  title: string;
  /** Raw credit string from the source, e.g. "3", "3-4", "3,5". */
  creditsRaw: string;
  minCredits: number | null;
  maxCredits: number | null;
  /** Lab / concurrent-course notes preserved from the source (parenthetical text in the title). */
  notes: string;
  /** True when the source says the course unconditionally satisfies the NSI lab requirement. */
  labUnconditional: boolean;
  /** True when the source attaches a condition (concurrent course, extra course, credit count) to the lab. */
  labConditional: boolean;
}

export interface InquiryGroup {
  code: InquiryGroupCode;
  label: string;
  minCreditsPerCourse: number;
  courses: WsuRequirementCourse[];
}

export interface Competency {
  code: CompetencyCode;
  label: string;
  requiresGradeCOrBetter: boolean;
  courses: WsuRequirementCourse[];
}

export interface RequirementsData {
  inquiry: InquiryGroup[];
  competencies: Competency[];
  rules: {
    /** Each Inquiry group requires a course of at least this many credits (3 per source). */
    inquiryMinCredits: number;
    /** NSI requires a second NSI course with a lab section (7 courses total across Gen Ed). */
    nsiRequiresSecondCourseWithLab: boolean;
    /** Competencies that require a grade of C or better (BC, IC, QE per source). */
    competencyGradeRule: CompetencyCode[];
    /** "Courses used to satisfy Competency requirements shall not generally also be used to satisfy Inquiry requirements." */
    competencyNotGenerallyDoubleCountedWithInquiry: boolean;
  };
}

export interface CatalogData {
  courses: HfccCourse[];
  generatedAt: string;
  sourceFiles: string[];
  caveats: string[];
}

export type PlanStatus = 'completed' | 'in-progress' | 'planned';

export interface PlanEntry {
  id: string;
  /** Normalized HFCC course code, e.g. "ENG131". */
  courseCode: string;
  status: PlanStatus;
  term?: string;
  grade?: string;
  /** HFCC credit hours entered by the student (the crosswalk does not list them). */
  credits?: number;
  notes?: string;
  /**
   * When a course may fit several Gen Ed categories, the student can choose which
   * single category it is applied toward. Undefined = not chosen yet (warning shown).
   */
  appliedArea?: GenEdAreaCode;
  addedAt: string;
}

export interface PlanFile {
  app: 'creditbridge';
  version: 1;
  exportedAt: string;
  entries: PlanEntry[];
}
