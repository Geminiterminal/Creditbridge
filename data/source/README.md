# Source data (verbatim copies)

These three files are verbatim copies of the supplied source documents and are the
initial source of truth for Creditbridge. The app never reads them at runtime;
`npm run build:data` parses them into the normalized JSON bundled with the app
(`src/data/courses.json`, `src/data/requirements.json`).

- `Equivalent Courses from Henry Ford College.txt` — HFCC → WSU course crosswalk
  (HFCC code, name, WSU equivalent, effective term). "Does not transfer" and broad
  `XXX` wildcard codes are preserved as-is.
- `Inquiry Course Requirements.txt` — WSU General Education Inquiry groups
  (CIV, CI, GL, NSI, SI, USP) with course lists, credits, and lab/concurrent-course notes.
- `Competency Requirements.txt` — WSU Competencies (BC, IC, OC, QE), including the
  "grade of C or better" rule for BC, IC, and QE.
