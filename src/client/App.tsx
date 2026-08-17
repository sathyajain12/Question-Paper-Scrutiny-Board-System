/**
 * Role-gated routing (docs/ARCHITECTURE.md §10).
 *
 * The old portal's tab bar becomes real routes, so the back button and deep
 * links work. Admins land on /admin; HoDs land on /constitution.
 */
import { Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { RequireRole } from './components/RequireRole';
import { LoadingState } from './components/ui/states';
import { useSession } from './lib/hooks';
import ConstitutionPage from './routes/constitution';
import FileCheckerPage from './routes/file-checker';
import AdminPage from './routes/admin';
import FacultyOverridesPage from './routes/faculty';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomeRedirect />} />

        <Route
          path="constitution"
          element={
            <RequireRole roles={['hod', 'viewer']}>
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

        <Route
          path="faculty"
          element={
            <RequireRole roles={['admin']}>
              <FacultyOverridesPage />
            </RequireRole>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

/** Replaces the old switchTab() default-landing behaviour. */
function HomeRedirect() {
  const { data: user, isPending } = useSession();

  if (isPending) return <LoadingState label="Signing in…" />;
  if (!user) return <LoadingState label="Redirecting to sign in…" />;

  return <Navigate to={user.role === 'admin' ? '/admin' : '/constitution'} replace />;
}
