import { Navigate } from 'react-router';
import type { Role } from '@shared/types';

/**
 * Client-side route gate. Convenience only — the Worker enforces the same
 * rules, since hiding a route is not access control (docs §6).
 */
export function RequireRole({
  roles,
  children,
}: {
  roles: Role[];
  children: React.ReactNode;
}) {
  // TODO Phase 1: const { data: user, isPending } = useSession();
  void roles;
  const user: { role: Role } | null = null;

  if (!user) return <Navigate to="/" replace />;
  return <>{children}</>;
}
