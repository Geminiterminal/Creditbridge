import { useEffect, useState } from 'react';
import FindClasses from './components/FindClasses';
import MyCourses from './components/MyCourses';
import Progress from './components/Progress';
import DataSettings from './components/DataSettings';

/** True when the app is running inside an iframe (e.g. the sandboxed live preview). */
export function isFramedPreview(win: Window): boolean {
  try {
    return win.self !== win.top;
  } catch {
    return true; // cross-origin access threw -> definitely framed
  }
}

type Tab = 'find' | 'courses' | 'progress' | 'data';

const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
  {
    id: 'find',
    label: 'Find Classes',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.5" y2="16.5" />
      </svg>
    ),
  },
  {
    id: 'courses',
    label: 'My Courses',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13z" />
        <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
      </svg>
    ),
  },
  {
    id: 'progress',
    label: 'Gen Ed Progress',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 3v18h18" />
        <rect x="7" y="12" width="3" height="6" />
        <rect x="12" y="8" width="3" height="10" />
        <rect x="17" y="5" width="3" height="13" />
      </svg>
    ),
  },
  {
    id: 'data',
    label: 'Data & Settings',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

const WSU_LINKS = [
  { href: 'https://provost.wayne.edu/general-education/curriculum', label: 'WSU GEN ED CURRICULUM' },
  { href: 'https://wayne.edu/transfer/course-equivalency', label: 'WSU EQUIVALENTS' },
] as const;

export default function App() {
  const [tab, setTab] = useState<Tab>('find');
  const [framed, setFramed] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  useEffect(() => {
    setFramed(isFramedPreview(window));
  }, []);

  useEffect(() => {
    if (!copiedUrl) return;
    const t = setTimeout(() => setCopiedUrl(null), 6000);
    return () => clearTimeout(t);
  }, [copiedUrl]);

  // Inside the sandboxed preview iframe, try a real redirect first; if the
  // sandbox blocks popups, fall back to copying the URL. On a real deployment
  // (not framed) this never triggers and the plain new-tab link is used.
  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!framed) return;
    e.preventDefault();
    // NOTE: no 'noopener' in the features string — that would make window.open
    // return null even on success, defeating the blocked-popup detection.
    const popup = window.open(href, '_blank');
    if (popup) {
      popup.opener = null;
      popup.focus();
      return; // redirected to a new tab
    }
    void navigator.clipboard?.writeText(href).catch(() => undefined);
    setCopiedUrl(href);
  };

  return (
    <div className="app">
      <header className="app-header">
        <img src="/favicon.svg" alt="" className="app-logo" width="34" height="34" />
        <div>
          <h1 className="app-title">Creditbridge</h1>
          <p className="app-subtitle">Henry Ford College → Wayne State University</p>
        </div>
      </header>

      <div className="ext-links" aria-label="Official Wayne State references">
        {WSU_LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            title={l.href}
            onClick={(e) => handleLinkClick(e, l.href)}
          >
            {l.label} ↗
            {framed && <span className="ext-url">{l.href}</span>}
          </a>
        ))}
      </div>
      {copiedUrl && (
        <div className="toast" role="status">
          This preview blocks opening external tabs, so the link was copied to your clipboard: <strong>{copiedUrl}</strong> — paste
          it in a new browser tab. (On the deployed site, links open normally.)
        </div>
      )}

      <main className="app-main" id="main">
        {tab === 'find' && <FindClasses />}
        {tab === 'courses' && <MyCourses />}
        {tab === 'progress' && <Progress />}
        {tab === 'data' && <DataSettings />}
      </main>

      <nav className="app-nav" aria-label="Main navigation">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`nav-item${tab === t.id ? ' nav-item-active' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
