import { Navigate } from 'react-router';
import type { Role } from '@shared/types';
import { useSession } from '@/lib/hooks';
import { LoadingState } from './ui/states';

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
  const { data: user, isPending } = useSession();

  if (isPending) return <LoadingState label="Checking access…" />;
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />;

  return <>{children}</>;
}
