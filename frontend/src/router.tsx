import { createBrowserRouter, Navigate, type RouteObject } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { UploadPage } from "./pages/UploadPage";
import { PreparePage } from "./pages/PreparePage";
import { ResultsPage } from "./pages/ResultsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { NotFoundPage } from "./pages/NotFoundPage";

/** Route table shared by the app bootstrap and integration tests. */
export const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <UploadPage /> },
      { path: "prepare", element: <PreparePage /> },
      { path: "rules", element: <Navigate to="/prepare" replace /> },
      { path: "results", element: <ResultsPage /> },
      // Deep-link route for viewing a persisted run by id. The History page
      // links to `/results/<run_id>` so refreshing or sharing the URL still
      // shows the saved result.
      { path: "results/:runId", element: <ResultsPage /> },
      { path: "history", element: <HistoryPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
