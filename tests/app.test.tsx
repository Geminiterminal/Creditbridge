// @vitest-environment jsdom
// Smoke test: the real app renders and the core flows work end to end
// (search → dropdown results → add to plan → preloaded category table with
// click-to-edit and multi-category chooser → progress dropdowns with credit labels),
// all offline from bundled data.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App, { isFramedPreview } from '../src/App';
import { PlanProvider } from '../src/lib/store';

function renderApp() {
  return render(
    <PlanProvider>
      <App />
    </PlanProvider>,
  );
}

const search = () => screen.getByLabelText(/^Search$/i);
const openResults = () => {
  const summary = screen.getByText(/Show \d[\d,]* matching course/i);
  if (!(summary.closest('details') as HTMLDetailsElement).open) fireEvent.click(summary);
};
const cardFor = (code: string) => screen.getByLabelText(new RegExp(`^${code}\\s`));
const addCourse = (code: string) => {
  fireEvent.change(search(), { target: { value: code } });
  openResults();
  fireEvent.click(within(cardFor(code)).getByRole('button', { name: '+ Add' }));
};
const goTo = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));
/** Find the table row for a category via its full-name cell (avoids matching <option> text).
 *  NSI is split into two rows — pass sub='lab' or 'no-lab' to pick one. */
const catRow = (code: string, sub?: 'lab' | 'no-lab') => {
  const table = screen.getByRole('table');
  const row = within(table)
    .getAllByRole('row')
    .find((tr) => {
      const t = tr.querySelector('.cat-name')?.textContent ?? '';
      if (code === 'NSI') {
        const needle = sub === 'lab' ? '(lab)' : sub === 'no-lab' ? '(no lab)' : 'Natural Scientific Inquiry';
        return t.includes('Natural Scientific Inquiry') && t.includes(needle);
      }
      return t.includes(`(${code})`);
    });
  if (!row) throw new Error(`no row for category ${code}${sub ? ' ' + sub : ''}`);
  return row;
};

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
});

describe('Creditbridge app smoke test', () => {
  it('Find Classes has no intro paragraph and finds ENG131 → BC in the collapsible results', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: 'Find Classes' })).toBeTruthy();
    for (const label of ['Find Classes', 'My Courses', 'Gen Ed Progress', 'Data & Settings']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.queryByText(/Possible matches from the supplied HFCC/i)).toBeNull(); // removed

    fireEvent.change(search(), { target: { value: 'ENG131' } });
    const details = screen.getByText(/matching course/i).closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(true); // dropdown auto-opens as the user types

    const card = cardFor('ENG131');
    expect(within(card).getByText('BC')).toBeTruthy();
    expect(within(card).getByText(/WSU ENG1020/)).toBeTruthy();
    expect(within(card).getByText(/Possible Gen Ed: BC/)).toBeTruthy();
    expect(within(card).queryByText(/Effective term not listed/i)).toBeNull();
    expect(within(card).queryByText(/HFCC credit hours are not listed/i)).toBeNull();
  });

  it('auto-opens the results dropdown while typing, and the user can collapse it', () => {
    renderApp();
    const details = screen.getByText(/matching course/i).closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false); // empty query: collapsed
    fireEvent.change(search(), { target: { value: 'eng' } });
    expect(details.open).toBe(true); // typing opens it
    fireEvent.click(screen.getByText(/matching course/i));
    expect(details.open).toBe(false); // clicking the summary collapses it
    fireEvent.change(search(), { target: { value: 'eng131' } });
    expect(details.open).toBe(true); // typing again reopens it
  });

  it('color-codes result cards: green for Gen Ed, gray for transfer-only, red for does-not-transfer', () => {
    renderApp();
    fireEvent.change(search(), { target: { value: 'ENG131' } });
    const engCard = cardFor('ENG131');
    expect(engCard.className).toContain('course-card-gen-ed');
    expect(within(engCard).getByText('✓ Gen Ed')).toBeTruthy();

    fireEvent.change(search(), { target: { value: 'ACT101' } });
    const actCard = cardFor('ACT101');
    expect(actCard.className).toContain('course-card-transfer');
    expect(within(actCard).getByText('≈ Transfer only')).toBeTruthy();

    fireEvent.change(search(), { target: { value: 'AERO110' } });
    const aeroCard = cardFor('AERO110');
    expect(aeroCard.className).toContain('course-card-none');
    expect(within(aeroCard).getAllByText(/Does not transfer/i).length).toBeGreaterThan(0);
  });

  it('My Courses table is preloaded with all 10 required categories, course cells empty, with hover info on categories', () => {
    renderApp();
    goTo('My Courses');
    expect(screen.queryByText(/Saved only in this browser/i)).toBeNull(); // removed
    expect(screen.queryByText(/supplied crosswalk/i)).toBeNull(); // caption removed

    const table = screen.getByRole('table');
    // four columns: category (full name) | credits | HFCC course | WSU equivalent
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'WSU Gen Ed Category',
      'Credits',
      'HFCC Course',
      'WSU Equivalent',
    ]);
    const bodyRows = within(table).getAllByRole('row').slice(1); // skip header
    expect(bodyRows.length).toBe(11); // CIV CI GL NSI(no lab) NSI(lab) SI USP BC IC OC QE
    for (const row of bodyRows) {
      expect(within(row).getAllByText('—').length).toBe(2); // HFCC Course + WSU Equivalent empty
    }
    // category column shows the FULL name (no icon/code-only chip)
    const siRow = catRow('SI');
    expect(within(siRow).getByText('Social Inquiry (SI)')).toBeTruthy();
    // hover tooltip on the full name leads with the full category name, then credits + source
    const siName = siRow.querySelector('.cat-name')!;
    expect(siName.getAttribute('title')!.startsWith('Social Inquiry (SI)')).toBe(true);
    expect(siName.getAttribute('title')).toContain('3 cr required');
    expect(siName.getAttribute('title')).toContain('at least 3 credits');
    expect(siName.getAttribute('title')).toContain('Inquiry Course Requirements.txt');
    // credits column shows just the number; the "cr required" detail is on hover (title)
    const siCredits = siRow.querySelector('[data-label="Credits"]')!;
    expect(siCredits.textContent!.trim()).toBe('3');
    expect(siCredits.querySelector('.credits-num')!.getAttribute('title')).toContain('3 cr required');
    const qeRowEmpty = catRow('QE');
    const qeName = qeRowEmpty.querySelector('.cat-name')!;
    expect(qeName.textContent).toBe('Quantitative Experience (QE)');
    expect(qeName.getAttribute('title')).toContain('34-credit');
    expect(qeName.getAttribute('title')).toContain('Competency Requirements.txt');
    // NSI is split into two rows: no-lab (3 cr) and lab (4 cr · lab)
    const nsiNoLab = catRow('NSI', 'no-lab');
    expect(within(nsiNoLab).getByText('Natural Scientific Inquiry (no lab)')).toBeTruthy();
    expect(nsiNoLab.querySelector('[data-label="Credits"]')!.textContent!.trim()).toBe('3');
    expect(nsiNoLab.querySelector('.cat-name')!.getAttribute('title')).toContain('without a lab');
    const nsiLab = catRow('NSI', 'lab');
    expect(within(nsiLab).getByText('Natural Scientific Inquiry (lab)')).toBeTruthy();
    expect(nsiLab.querySelector('[data-label="Credits"]')!.textContent!.trim()).toBe('4');
    expect(nsiLab.querySelector('.credits-num')!.getAttribute('title')).toContain('lab');
    expect(nsiLab.querySelector('.cat-name')!.getAttribute('title')).toContain('WSU and HFCC websites');
    // QE row credits cell shows just "3"
    expect(catRow('QE').querySelector('[data-label="Credits"]')!.textContent!.trim()).toBe('3');
  });

  it('added course fills its category row; clicking it edits inline; WSU credits come from the requirement files', () => {
    renderApp();
    addCourse('MATH131');
    goTo('My Courses');

    const qeRow = catRow('QE');
    expect(within(qeRow).getByText('MATH131')).toBeTruthy();
    expect(within(qeRow).getByText(/WSU MAT1000 · 3 cr/)).toBeTruthy(); // WSU-listed credits
    expect(within(qeRow).getByText('Planned')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Edit MATH131'));
    const editCell = screen.getByText(/Editing/).closest('td')!;
    fireEvent.change(within(editCell).getByLabelText('Status'), { target: { value: 'completed' } });
    fireEvent.change(within(editCell).getByLabelText('Grade'), { target: { value: 'B' } });
    fireEvent.click(within(editCell).getByRole('button', { name: 'Save' }));

    const qeRowAfter = catRow('QE');
    expect(within(qeRowAfter).getByText('MATH131')).toBeTruthy();
    expect(within(qeRowAfter).getByText('Completed')).toBeTruthy();
  });

  it('multi-category course shows a red "choose category" notification until the user picks one', () => {
    renderApp();
    addCourse('ANTH131'); // → ANT1100 → possible SI and USP
    goTo('My Courses');

    const siRow = catRow('SI');
    const uspRow = catRow('USP');
    expect(within(siRow).getByText('ANTH131')).toBeTruthy();
    expect(within(uspRow).getByText('ANTH131')).toBeTruthy();

    // red notification next to the category in each matching row
    expect(within(siRow).getByText(/choose category/i)).toBeTruthy();
    expect(within(uspRow).getByText(/choose category/i)).toBeTruthy();
    expect(document.querySelectorAll('.badge-multi').length).toBe(2);

    // choose SI via the inline select in the SI row
    fireEvent.change(within(siRow).getByLabelText('Apply ANTH131 toward a category'), { target: { value: 'SI' } });
    const siRowAfter = catRow('SI');
    const uspRowAfter = catRow('USP');
    expect(within(siRowAfter).getByText(/✓ applied to SI/)).toBeTruthy();
    // once applied to CI/SI, the course no longer appears in the other row (HUM101-in-GL bug)
    expect(within(uspRowAfter).queryByText('ANTH131')).toBeNull();
    expect(within(uspRowAfter).getAllByText('—').length).toBe(2); // both course cells empty again
    expect(document.querySelectorAll('.badge-multi').length).toBe(0);
  });

  it('regression: HUM101 (→ MUH1340, listed in both CI and GL) leaves the GL row once applied to CI', () => {
    renderApp();
    addCourse('HUM101');
    goTo('My Courses');
    // MUH1340 is in both CI and GL per the Inquiry file, so both rows show it with the red notice
    expect(within(catRow('CI')).getByText('HUM101')).toBeTruthy();
    expect(within(catRow('GL')).getByText('HUM101')).toBeTruthy();
    expect(document.querySelectorAll('.badge-multi').length).toBe(2);

    fireEvent.change(within(catRow('CI')).getByLabelText('Apply HUM101 toward a category'), { target: { value: 'CI' } });
    expect(within(catRow('CI')).getByText(/✓ applied to CI/)).toBeTruthy();
    expect(within(catRow('GL')).queryByText('HUM101')).toBeNull(); // not shown for GL anymore
    expect(within(catRow('GL')).getAllByText('—').length).toBe(2);
  });

  it('courses with no Gen Ed match or whose category is already filled appear under Electives & Broad Transfer', () => {
    renderApp();
    addCourse('ACT101'); // broad ET1XXX only -> no Gen Ed match
    addCourse('MATH131'); // QE (Math For Mod World -> MAT1000)
    addCourse('MATH140'); // QE (Intro To Statistics -> STA1020)
    goTo('My Courses');

    // Both QE courses stay in the QE row while QE is not covered yet.
    const qeRow = catRow('QE');
    expect(within(qeRow).getByText('MATH131')).toBeTruthy();
    expect(within(qeRow).getByText('MATH140')).toBeTruthy();

    // ACT101 has no Gen Ed match -> straight to electives, not any category row.
    const electiveCard = screen.getByText(/Electives & Broad Transfer/i).closest('.card') as HTMLElement;
    expect(within(electiveCard).getByText('ACT101')).toBeTruthy();
    expect(within(electiveCard).getByText('Broad transfer')).toBeTruthy();

    // Mark MATH131 completed with a C-or-better grade -> QE covered.
    fireEvent.click(screen.getByLabelText('Edit MATH131'));
    const editCell = screen.getByText(/Editing/).closest('td')!;
    fireEvent.change(within(editCell).getByLabelText('Status'), { target: { value: 'completed' } });
    fireEvent.change(within(editCell).getByLabelText('Grade'), { target: { value: 'B' } });
    fireEvent.click(within(editCell).getByRole('button', { name: 'Save' }));

    // MATH131 is the completed course that covered QE -> it stays in the QE row.
    const qeRowAfter = catRow('QE');
    expect(within(qeRowAfter).getByText('MATH131')).toBeTruthy();
    expect(within(qeRowAfter).getByText('Completed')).toBeTruthy();

    // MATH140 is still planned and QE is now covered -> redundant, moves to electives.
    const electiveCardAfter = screen.getByText(/Electives & Broad Transfer/i).closest('.card') as HTMLElement;
    expect(within(electiveCardAfter).getByText('MATH140')).toBeTruthy();
    expect(within(electiveCardAfter).getByText('Elective')).toBeTruthy();
    expect(within(qeRowAfter).queryByText('MATH140')).toBeNull();
  });

  it('splits NSI into no-lab and lab rows: a lab course lands in the lab row, a non-lab course in the no-lab row', () => {
    renderApp();
    addCourse('PSY131'); // → PSY1020 → NSI (no lab)
    addCourse('BIO131'); // → BIO1050 → NSI (lab, conditional)
    goTo('My Courses');

    const noLab = catRow('NSI', 'no-lab');
    const lab = catRow('NSI', 'lab');
    expect(within(noLab).getByText('PSY131')).toBeTruthy();
    expect(within(noLab).queryByText('BIO131')).toBeNull();
    expect(within(lab).getByText('BIO131')).toBeTruthy();
    expect(within(lab).queryByText('PSY131')).toBeNull();
  });

  it('Gen Ed Progress boxes are collapsed by default, open on click, and show TXT-file credit requirements', () => {
    renderApp();
    addCourse('MATH131');
    goTo('My Courses');
    fireEvent.click(screen.getByLabelText('Edit MATH131'));
    const editCell = screen.getByText(/Editing/).closest('td')!;
    fireEvent.change(within(editCell).getByLabelText('Status'), { target: { value: 'completed' } });
    fireEvent.change(within(editCell).getByLabelText('Grade'), { target: { value: 'B' } });
    fireEvent.click(within(editCell).getByRole('button', { name: 'Save' }));

    goTo('Gen Ed Progress');
    const boxes = [...document.querySelectorAll('.area-details')] as HTMLDetailsElement[];
    expect(boxes.length).toBe(11); // 6 inquiry + 4 competencies + NSI lab
    expect(boxes.every((b) => !b.open)).toBe(true); // hidden by default
    // seven-course inquiry counter (MATH131 is a competency, so inquiry count is 0)
    expect(screen.getByText(/0 of 7/)).toBeTruthy();

    // credit requirement from the TXT file is shown next to each category
    expect(screen.getByText(/Civic Literacy Inquiry \(CIV\)/).textContent).toContain('3 cr required');
    const qeTitle = screen.getByText(/Quantitative Experience \(QE\)/);
    expect(qeTitle.textContent).toContain('3 cr required');
    expect(qeTitle.getAttribute('title')).toContain('Competency Requirements.txt');
    const nsiTitle = screen.getByText(/Natural Scientific Inquiry \(NSI\)/);
    expect(nsiTitle.textContent).toContain('7 cr required');

    fireEvent.click(qeTitle); // click the arrow/title to show
    const qeBox = qeTitle.closest('details') as HTMLDetailsElement;
    expect(qeBox.open).toBe(true);
    expect(qeBox.querySelector('.badge-covered')).toBeTruthy(); // MATH131 completed with B → QE covered
  });

  it('Gen Ed Progress NSI tab lists all HFCC NSI courses; NSI lab section warns to confirm on WSU/HFCC and lists lab courses', () => {
    renderApp();
    goTo('Gen Ed Progress');

    // Open the NSI inquiry tab — it lists every HFCC course that may fulfill NSI.
    const nsiTitle = screen.getByText(/Natural Scientific Inquiry \(NSI\)/);
    fireEvent.click(nsiTitle);
    const nsiBox = nsiTitle.closest('details') as HTMLDetailsElement;
    expect(nsiBox.open).toBe(true);
    expect(within(nsiBox).getByText(/All HFCC courses that may fulfill this area/i)).toBeTruthy();
    expect(within(nsiBox).getByText('PSY131')).toBeTruthy(); // no-lab NSI course
    expect(within(nsiBox).getAllByText('lab').length).toBeGreaterThan(0); // lab courses are marked

    // NSI lab section: confirm banner + lab courses listed.
    const labSection = screen.getByText(/NSI lab requirement/).closest('details') as HTMLElement;
    expect(within(labSection).getByText(/Confirm on the WSU and HFCC websites/i)).toBeTruthy();
    expect(within(labSection).getByText('BIO131')).toBeTruthy(); // BIO131 → BIO1050 is a lab NSI course
  });

  it('search matches code prefixes first ("hum" → HUM101) and names ("humanities")', () => {
    renderApp();
    fireEvent.change(search(), { target: { value: 'hum' } });
    openResults();
    // first result card is HUM101 (code prefix match ranked first)
    const details = screen.getByText(/matching course/i).closest('details')!;
    const firstCard = details.querySelector('.course-card') as HTMLElement;
    expect(firstCard.getAttribute('aria-label')).toMatch(/^HUM101\s/);

    fireEvent.change(search(), { target: { value: 'humanities' } });
    openResults();
    expect(cardFor('HUM101')).toBeTruthy(); // matched by name "Intro To Humanities"
  });

  it('the My Courses "add course" picker uses the same ranked prefix search ("hum" → HUM101 first)', () => {
    renderApp();
    goTo('My Courses');
    fireEvent.click(screen.getByRole('button', { name: '+ Add course' }));
    const picker = screen.getByLabelText(/Find a course to add/i);
    fireEvent.change(picker, { target: { value: 'hum' } });
    const listbox = screen.getByRole('listbox');
    const firstBtn = within(listbox).getAllByRole('button')[0];
    expect(firstBtn.textContent).toContain('HUM101'); // code-prefix match ranked first
    fireEvent.change(picker, { target: { value: 'humanities' } });
    expect(within(screen.getByRole('listbox')).getAllByRole('button').some((b) => b.textContent?.includes('HUM101'))).toBe(true);
  });

  it('shows "Does not transfer" and broad XXX credit distinctly in search results', () => {
    renderApp();
    fireEvent.change(search(), { target: { value: 'AERO110' } });
    openResults();
    expect(within(cardFor('AERO110')).getAllByText(/Does not transfer/i).length).toBeGreaterThan(0);

    fireEvent.change(search(), { target: { value: 'ACT101' } });
    openResults();
    const card = cardFor('ACT101');
    expect(within(card).getByText(/broad ET1XXX/i)).toBeTruthy();
    expect(within(card).queryByText(/Possible Gen Ed/i)).toBeNull();
  });

  it('top-of-menu links point to the official WSU pages (verified live) and open in a new tab when not framed', () => {
    renderApp();
    const curr = screen.getByRole('link', { name: /WSU GEN ED CURRICULUM/i });
    expect(curr.getAttribute('href')).toBe('https://provost.wayne.edu/general-education/curriculum');
    expect(curr.getAttribute('target')).toBe('_blank');
    expect(curr.getAttribute('rel')).toContain('noopener');
    expect(curr.getAttribute('title')).toBe('https://provost.wayne.edu/general-education/curriculum');
    const equiv = screen.getByRole('link', { name: /WSU EQUIVALENTS/i });
    expect(equiv.getAttribute('href')).toBe('https://wayne.edu/transfer/course-equivalency');
    expect(equiv.getAttribute('target')).toBe('_blank');
  });

  it('isFramedPreview: false in a top-level window (jsdom), true when iframed or when access throws', () => {
    expect(isFramedPreview(window)).toBe(false);
    const fakeFramed = { self: {}, top: {} } as unknown as Window;
    expect(isFramedPreview(fakeFramed)).toBe(true);
    const throwing = {
      get self() { return {}; },
      get top() { throw new Error('cross-origin'); },
    } as unknown as Window;
    expect(isFramedPreview(throwing)).toBe(true);
  });

  it('Data & Settings keeps the disclaimer, explains offline use, and offers JSON export', () => {
    renderApp();
    goTo('Data & Settings');
    expect(screen.getByText(/not an official WSU degree evaluation/i)).toBeTruthy();
    expect(screen.getByText(/Open the hosted site once while online/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Export plan/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Import plan/i })).toBeTruthy();
  });
});
