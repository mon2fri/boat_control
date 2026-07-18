import { NavLink, Outlet } from "react-router-dom";
import { useSessionExpiryRedirect } from "../features/session/useSessionExpiry";

const NAV_ITEMS = [
  { to: "/", label: "1. Upload files", end: true },
  { to: "/prepare", label: "2. Filters & targets" },
  { to: "/rules", label: "3. Validation rules" },
  { to: "/results", label: "4. Results" },
  { to: "/history", label: "History" },
  { to: "/settings", label: "Settings" },
];

/** Persistent application frame: skip link, primary navigation, main region. */
export function AppShell() {
  useSessionExpiryRedirect();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <nav className="app-nav" aria-label="Primary">
        <h1>Boat Control</h1>
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
  );
}
