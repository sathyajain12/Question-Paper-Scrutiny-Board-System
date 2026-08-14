/**
 * Role-gated routing (docs/ARCHITECTURE.md §10).
 *
 * The old portal's tab bar becomes real routes, so the back button and deep
 * links work. Admins land on /admin; HoDs land on /constitution.
 */
import { Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { RequireRole } from './components/RequireRole';
import ConstitutionPage from './routes/constitution';
import FileCheckerPage from './routes/file-checker';
import AdminPage from './routes/admin';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomeRedirect />} />

        <Route
          path="constitution"
          element={
            <RequireRole roles={['hod']}>
              <ConstitutionPage />
            </RequireRole>
          }
        />

        <Route path="checker" element={<FileCheckerPage />} />

        <Route
          path="admin"
          element={
            <RequireRole roles={['admin']}>
              <AdminPage />
            </RequireRole>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

/** Admin → /admin, HoD → /constitution. Replaces the old switchTab() default. */
function HomeRedirect() {
  // TODO Phase 1: read useSession() and redirect by role.
  return <Navigate to="/constitution" replace />;
}
