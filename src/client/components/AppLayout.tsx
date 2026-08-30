/**
 * Shell: logo header + role-aware nav + <Outlet />.
 *
 * The logo is a plain static asset served from the edge — no getLogoBase64()
 * round trip, so it renders on first paint (docs §10, "Static assets").
 */
import { NavLink, Outlet } from 'react-router';
import type { Role } from '@shared/types';
import { useSession } from '@/lib/hooks';
import { HelpChatWidget } from './help-chat/HelpChatWidget';
import { LoadingState } from './ui/states';

interface NavEntry {
  to: string;
  label: string;
  roles: Role[];
}

const NAV: NavEntry[] = [
  { to: '/admin', label: 'Admin Portal', roles: ['admin'] },
  { to: '/faculty', label: 'Faculty Overrides', roles: ['admin'] },
  { to: '/constitution', label: 'QPSB Constitution', roles: ['hod', 'viewer'] },
  { to: '/checker', label: 'File Checker', roles: ['admin', 'hod', 'viewer'] },
];

export function AppLayout() {
  const { data: user, isPending } = useSession();

  return (
    <div className="min-h-full">
      <header className="border-b-4 border-brand-600 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 py-5">
          {/* Files in public/ are referenced by path, not imported — Vite
              copies them through untouched. Drop public/logo.png in place. */}
          <img
            src="/logo.png"
            alt="SSSIHL"
            className="h-20 w-auto sm:h-28"
            // Until public/logo.png is added, hide rather than show a broken
            // image icon. Harmless once the real asset is in place.
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>

        {user && (
          <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-3 px-4">
            <nav className="flex flex-wrap gap-1">
              {NAV.filter((entry) => entry.roles.includes(user.role)).map(
                (entry) => (
                  <NavLink
                    key={entry.to}
                    to={entry.to}
                    className={({ isActive }) =>
                      `rounded-t-md px-5 py-3 text-sm font-bold transition ${
                        isActive
                          ? 'bg-brand-600 text-white'
                          : 'bg-brand-50 text-brand-600 hover:bg-brand-100'
                      }`
                    }
                  >
                    {entry.label}
                  </NavLink>
                ),
              )}
            </nav>

            <p className="pb-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{user.name}</span>
              {' · '}
              {user.role === 'admin' ? 'Administrator' : 'Head of Department'}
              {user.departments.length > 0 && ` · ${user.departments.join(', ')}`}
            </p>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {isPending ? <LoadingState label="Checking access…" /> : <Outlet />}
      </main>

      {user?.role === 'hod' && <HelpChatWidget />}
    </div>
  );
}
