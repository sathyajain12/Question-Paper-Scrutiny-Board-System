/**
 * Shell: logo header + role-based nav + <Outlet />.
 *
 * The logo is a plain static asset served from the edge — no getLogoBase64()
 * round trip, so it renders on first paint (docs §10, "Static assets").
 */
import { NavLink, Outlet } from 'react-router';

export function AppLayout() {
  return (
    <div className="min-h-full">
      <header className="border-b-4 border-brand-600">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 py-5">
          {/* Files in public/ are referenced by path, not imported — Vite
              copies them through untouched. Drop public/logo.png in place. */}
          <img src="/logo.png" alt="SSSIHL" className="h-24 w-auto sm:h-28" />
          <h1 className="text-center text-xl font-bold text-brand-600">
            Question Paper Scrutiny Board
          </h1>
        </div>

        {/* TODO Phase 1: render links by role; add the user chip + sign out. */}
        <nav className="mx-auto flex max-w-7xl gap-1 px-4">
          <NavItem to="/constitution">QPSB Constitution</NavItem>
          <NavItem to="/checker">File Checker</NavItem>
          <NavItem to="/admin">Admin Portal</NavItem>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-t-md px-6 py-3 text-sm font-bold transition ${
          isActive
            ? 'bg-brand-600 text-white'
            : 'bg-brand-50 text-brand-600 hover:bg-brand-100'
        }`
      }
    >
      {children}
    </NavLink>
  );
}
