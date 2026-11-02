import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  classifyEquivalency,
  parseCompetencies,
  parseCredits,
  parseEquivalents,
  parseInquiry,
  parseRules,
  splitCrossListed,
} from '../src/lib/parse';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name: string) => readFileSync(join(root, 'data', 'source', name), 'utf8');

const EQUIV = read('Equivalent Courses from Henry Ford College.txt');
const INQUIRY = read('Inquiry Course Requirements.txt');
const COMPETENCY = read('Competency Requirements.txt');

describe('parseEquivalents (HFCC crosswalk)', () => {
  const courses = parseEquivalents(EQUIV);

  it('parses all HFCC courses and preserves every equivalency row', () => {
    expect(courses.length).toBe(3325);
    const rows = courses.reduce((n, c) => n + c.equivalencies.length, 0);
    expect(rows).toBe(3399); // 3400 tabular lines minus the header row
  });

  it('classifies exact, broad (XXX), and does-not-transfer rows', () => {
    expect(classifyEquivalency('ENG1020')).toBe('exact');
    expect(classifyEquivalency('ET1XXX')).toBe('broad');
    expect(classifyEquivalency('ACO12XX')).toBe('broad');
    expect(classifyEquivalency('CMT2X10')).toBe('broad'); // X in the middle is still a wildcard
    expect(classifyEquivalency('Does not transfer')).toBe('none');
  });

  it('keeps multiple equivalencies for one HFCC course, with effective terms', () => {
    const art108 = courses.find((c) => c.code === 'ART108')!;
    expect(art108.equivalencies).toHaveLength(2);
    expect(art108.equivalencies[0]).toMatchObject({ wsuCode: 'ADA2XXX', kind: 'broad', effectiveTerm: null });
    expect(art108.equivalencies[1]).toMatchObject({ wsuCode: 'ADA2210', kind: 'exact', effectiveTerm: 'Fall 2015' });
  });

  it('parses the sample rows used as checks', () => {
    expect(courses.find((c) => c.code === 'ENG131')!.equivalencies[0]).toMatchObject({ wsuCode: 'ENG1020', kind: 'exact' });
    expect(courses.find((c) => c.code === 'ART120')!.equivalencies[0]).toMatchObject({ wsuCode: 'AH1000', kind: 'exact' });
    expect(courses.find((c) => c.code === 'MATH131')!.equivalencies[0]).toMatchObject({ wsuCode: 'MAT1000', kind: 'exact' });
    expect(courses.find((c) => c.code === 'ANTH131')!.equivalencies[0]).toMatchObject({ wsuCode: 'ANT1100', kind: 'exact' });
  });

  it('marks "Does not transfer" rows', () => {
    const aero = courses.find((c) => c.code === 'AERO110')!;
    expect(aero.equivalencies[0].kind).toBe('none');
    const noneCount = courses.flatMap((c) => c.equivalencies).filter((e) => e.kind === 'none').length;
    expect(noneCount).toBe(510);
  });
});

describe('splitCrossListed', () => {
  it('expands shared numeric suffixes', () => {
    expect(splitCrossListed('AFS/ENG 2390')).toEqual(['AFS2390', 'ENG2390']);
    expect(splitCrossListed('ELR/ANT/HIS/PS 1110')).toEqual(['ELR1110', 'ANT1110', 'HIS1110', 'PS1110']);
    expect(splitCrossListed('US/GPH/HIS/PS 2000/SOC 2500')).toEqual(['US2000', 'GPH2000', 'HIS2000', 'PS2000', 'SOC2500']);
    expect(splitCrossListed('ENG 1020')).toEqual(['ENG1020']);
  });
});

describe('parseCredits', () => {
  it('handles single, range, and list credit values', () => {
    expect(parseCredits('3')).toEqual({ min: 3, max: 3 });
    expect(parseCredits('3-4')).toEqual({ min: 3, max: 4 });
    expect(parseCredits('3,5')).toEqual({ min: 3, max: 5 });
  });
});

describe('parseInquiry (six Inquiry groups)', () => {
  const groups = parseInquiry(INQUIRY);

  it('finds exactly the six groups, once each, in order', () => {
    expect(groups.map((g) => g.code)).toEqual(['CIV', 'CI', 'GL', 'NSI', 'SI', 'USP']);
  });

  it('parses course rows with credits', () => {
    const civ = groups.find((g) => g.code === 'CIV')!;
    const ps1010 = civ.courses.find((c) => c.code === 'PS1010')!;
    expect(ps1010.title).toBe('American Government');
    expect(ps1010.minCredits).toBe(4);
  });

  it('splits cross-listed codes into individual codes', () => {
    const civ = groups.find((g) => g.code === 'CIV')!;
    for (const code of ['ELR1110', 'ANT1110', 'HIS1110', 'PS1110']) {
      expect(civ.courses.some((c) => c.code === code)).toBe(true);
    }
  });

  it('preserves lab / concurrent-course notes and classifies them', () => {
    const nsi = groups.find((g) => g.code === 'NSI')!;
    const ast2010 = nsi.courses.find((c) => c.code === 'AST2010')!;
    expect(ast2010.labConditional).toBe(true);
    expect(ast2010.labUnconditional).toBe(false);
    expect(ast2010.notes).toContain('AST 2011');
    const chm1020 = nsi.courses.find((c) => c.code === 'CHM1020')!;
    expect(chm1020.labUnconditional).toBe(true);
    // A non-lab science course must not be flagged as a lab
    const esg1500 = nsi.courses.find((c) => c.code === 'ESG1500')!;
    expect(esg1500.labUnconditional || esg1500.labConditional).toBe(false);
  });

  it('a WSU course can appear in multiple groups (ANT1100 in SI and USP)', () => {
    const withAnt = groups.filter((g) => g.courses.some((c) => c.code === 'ANT1100')).map((g) => g.code);
    expect(withAnt).toEqual(['SI', 'USP']);
  });
});

describe('parseCompetencies (four competencies)', () => {
  const comps = parseCompetencies(COMPETENCY);

  it('finds exactly the four competencies, once each', () => {
    expect(comps.map((c) => c.code)).toEqual(['BC', 'IC', 'OC', 'QE']);
  });

  it('BC lists ENG 1020', () => {
    const bc = comps.find((c) => c.code === 'BC')!;
    expect(bc.courses.some((c) => c.code === 'ENG1020')).toBe(true);
  });

  it('applies the C-or-better grade rule only where the file states it', () => {
    const byCode = Object.fromEntries(comps.map((c) => [c.code, c.requiresGradeCOrBetter]));
    expect(byCode).toEqual({ BC: true, IC: true, OC: false, QE: true });
  });
});

describe('parseRules', () => {
  it('extracts the cross-cutting rules from the files', () => {
    const rules = parseRules(INQUIRY, COMPETENCY);
    expect(rules.inquiryMinCredits).toBe(3);
    expect(rules.nsiRequiresSecondCourseWithLab).toBe(true);
    expect(rules.competencyGradeRule).toEqual(['BC', 'IC', 'QE']);
    expect(rules.competencyNotGenerallyDoubleCountedWithInquiry).toBe(true);
  });
});
