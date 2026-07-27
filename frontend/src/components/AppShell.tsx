import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useSessionExpiryRedirect } from "../features/session/useSessionExpiry";
import { useSettings } from "../features/settings/useSettings";
import { useWorkflow } from "../state/WorkflowContext";
import { TableOfContents } from "../features/results/TableOfContents";

const NAV_ITEMS = [
  { to: "/", label: "1. Upload", end: true },
  { to: "/prepare", label: "2. Compare and validate" },
  { to: "/results", label: "3. Results" },
  { to: "/families", label: "Column/Value Family" },
  { to: "/history", label: "History" },
  { to: "/settings", label: "Settings" },
];

/**
 * The hexagonal brand mark, rendered inline as SVG so it ships with the bundle
 * and respects the current theme via `currentColor` / `fill-opacity` rules.
 * Two-tone: a strong outer hexagon and an inner offset hex for the layered
 * "stamped" look the brand uses.
 */
function BrandMark() {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="Boat Control mark"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer hexagon — stroked for definition */}
      <path
        d="M32 2 L60 17.5 L60 46.5 L32 62 L4 46.5 L4 17.5 Z"
        fill="var(--color-accent)"
        fillOpacity="0.95"
        stroke="var(--color-accent)"
        strokeWidth="1"
        strokeLinejoin="miter"
      />
      {/* Inner hexagon — white knockout with brand-red stroke */}
      <path
        d="M32 13 L51 23.75 L51 40.25 L32 51 L13 40.25 L13 23.75 Z"
        fill="var(--color-accent-contrast)"
        fillOpacity="1"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeLinejoin="miter"
      />
      {/* Tiny center hex as a brand-period */}
      <path
        d="M32 26.5 L40 31 L40 38 L32 42.5 L24 38 L24 31 Z"
        fill="var(--color-accent)"
        fillOpacity="1"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a.5.5 0 0 0-.7-.5 6.5 6.5 0 1 0 7.7 7.7.5.5 0 0 0-.5-.7Z" />
    </svg>
  );
}

/** Persistent application frame: skip link, primary navigation, main region. */
export function AppShell() {
  useSessionExpiryRedirect();
  const location = useLocation();
  const { state } = useWorkflow();
  const settings = useSettings();
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("boat-control-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  const isResultsRoute = location.pathname === "/results" || location.pathname.startsWith("/results/");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("boat-control-theme", theme);
  }, [theme]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="app-header">
        <div className="app-header__brand">
          <div className="app-header__mark" aria-hidden="true">
            <BrandMark />
          </div>
          <div className="app-header__title-block">
            <p className="app-header__kicker">Calibration Console</p>
            <h1 className="app-header__title">{settings.data?.applicationName ?? "Boat Control"}</h1>
          </div>
        </div>
        <div className="app-header__actions">
          <button
            type="button"
            className="btn theme-toggle"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
        </div>
      </header>
      <div className="app-content">
        <nav className="app-nav" aria-label="Primary">
          <div>
            <p className="app-nav__heading">Workflow</p>
            <ol>
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end ?? false}
                    className={({ isActive }) => (isActive ? "is-active" : undefined)}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ol>
          </div>
          {isResultsRoute && state.result && (
            <div className="app-nav__results">
              <TableOfContents result={state.result} variant="nav" />
            </div>
          )}
        </nav>
        <main id="main-content" className="app-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}