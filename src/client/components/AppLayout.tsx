/**
 * Shell: logo header + role-aware nav + <Outlet />.
 *
 * The logo is a plain static asset served from the edge — no getLogoBase64()
 * round trip, so it renders on first paint (docs §10, "Static assets").
 *
 * The support socket is opened here rather than inside the help widget or the
 * Support Desk page, because an administrator counts as available to HoDs
 * while they have the portal open — not only while they are sitting on the
 * desk screen. See lib/support.tsx.
 */
import { NavLink, Outlet } from 'react-router';
import type { Role, SessionUser } from '@shared/types';
import { useSession } from '@/lib/hooks';
import { SupportProvider, useAdminUnreadCount } from '@/lib/support';
import { HelpChatWidget } from './help-chat/HelpChatWidget';
import { LoadingState } from './ui/states';

interface NavEntry {
  to: string;
  label: string;
  roles: Role[];
  /** Renders the unread-conversation count from the support socket. */
  badge?: 'supportUnread';
}

const NAV: NavEntry[] = [
  { to: '/admin', label: 'Admin Portal', roles: ['admin'] },
  { to: '/faculty', label: 'Faculty Overrides', roles: ['admin'] },
  { to: '/support', label: 'Support Desk', roles: ['admin'], badge: 'supportUnread' },
  { to: '/constitution', label: 'QPSB Constitution', roles: ['hod', 'viewer'] },
  { to: '/checker', label: 'File Checker', roles: ['admin', 'hod', 'viewer'] },
];

export function AppLayout() {
  const { data: user, isPending } = useSession();

  return (
    <SupportProvider user={user}>
      <div className="min-h-full">
        {/* Sticky and compact: the logo used to sit centred at h-28 on a row of
            its own, spending ~180px of every screen before any content. */}
        <header className="sticky top-0 z-30 border-b-4 border-brand-600 bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-end gap-x-8 gap-y-1 px-4">
            {/* logo.png is a 967×111 lockup: the emblem and both lines of the
                institute's name are part of the image. Nothing is set beside
                it, because anything we wrote would repeat what it already
                says — which is exactly how this header ended up crowded. */}
            <img
              src="/logo.png"
              alt="Sri Sathya Sai Institute of Higher Learning — QPSB Management System"
              className="my-2.5 h-8 w-auto shrink-0 self-center sm:h-10"
              // Until public/logo.png is added, hide rather than show a broken
              // image icon. Harmless once the real asset is in place.
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />

            {user && <NavBar user={user} />}
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6">
          {isPending ? <LoadingState label="Checking access…" /> : <Outlet />}
        </main>

        {user?.role === 'hod' && <HelpChatWidget />}
      </div>
    </SupportProvider>
  );
}

function NavBar({ user }: { user: SessionUser }) {
  const supportUnread = useAdminUnreadCount();

  return (
    <div className="flex flex-1 flex-wrap items-end justify-between gap-3">
      <nav className="flex flex-wrap gap-1">
        {NAV.filter((entry) => entry.roles.includes(user.role)).map((entry) => (
          <NavLink
            key={entry.to}
            to={entry.to}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-t-md px-5 py-3 text-sm font-bold transition ${
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'bg-brand-50 text-brand-600 hover:bg-brand-100'
              }`
            }
          >
            {entry.label}
            {entry.badge === 'supportUnread' && supportUnread > 0 && (
              <span
                aria-label={`${supportUnread} unread ${supportUnread === 1 ? 'message' : 'messages'}`}
                className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white"
              >
                {supportUnread > 9 ? '9+' : supportUnread}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <p className="pb-2 text-xs text-slate-500">
        <span className="font-semibold text-slate-700">{user.name}</span>
        {' · '}
        {user.role === 'admin' ? 'Administrator' : 'Head of Department'}
        {user.departments.length > 0 && ` · ${user.departments.join(', ')}`}
      </p>
    </div>
  );
}
