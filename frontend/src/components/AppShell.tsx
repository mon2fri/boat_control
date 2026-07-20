import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { useSessionExpiryRedirect } from "../features/session/useSessionExpiry";
import { useSettings } from "../features/settings/useSettings";

const NAV_ITEMS = [
  { to: "/", label: "1. Upload", end: true },
  { to: "/prepare", label: "2. Compare and validate" },
  { to: "/results", label: "3. Results" },
  { to: "/history", label: "History" },
  { to: "/settings", label: "Settings" },
];

/** Persistent application frame: skip link, primary navigation, main region. */
export function AppShell() {
  useSessionExpiryRedirect();
  const settings = useSettings();
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("boat-control-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

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
        <h1 className="app-header__title">{settings.data?.applicationName ?? "Boat Control"}</h1>
        <button
          type="button"
          className="btn theme-toggle"
          onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </header>
      <div className="app-content">
        <nav className="app-nav" aria-label="Primary">
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
        </nav>
        <main id="main-content" className="app-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
