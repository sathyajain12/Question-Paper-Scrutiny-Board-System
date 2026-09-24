import { useQuery } from '@tanstack/react-query';
import { api, redirectToLogin } from '@/lib/api';
import { Button } from './ui/Button';

/**
 * What an unauthenticated visitor sees.
 *
 * Deliberately a screen with a button rather than an automatic redirect to
 * Google. Bouncing on first load meant the portal flashed "Checking access…"
 * and vanished, which reads as a fault; it also left no way back if the
 * OAuth client was misconfigured, because the error lived on Google's side
 * of a redirect the person never chose to make.
 *
 * The button is only offered when sign-in can actually complete. A deployment
 * whose OAuth client is not configured yet says so, instead of handing people
 * a control that fails the moment they press it.
 */
export function SignInScreen() {
  const { data, isPending } = useQuery({
    queryKey: ['auth', 'status'],
    queryFn: () => api.get<{ googleConfigured: boolean }>('/auth/status'),
    staleTime: Infinity,
    retry: false,
  });

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">
          Question Paper Scrutiny Board
        </h1>

        {isPending ? (
          <p className="mt-2 text-sm text-slate-600">Loading…</p>
        ) : data?.googleConfigured ? (
          <>
            <p className="mt-2 text-sm text-slate-600">
              Sign in with your institute Google account to continue.
            </p>

            <Button
              className="mt-6 w-full justify-center"
              onClick={redirectToLogin}
            >
              Sign in with Google
            </Button>

            <p className="mt-4 text-xs text-slate-500">
              Access is limited to sssihl.edu.in accounts on the QPSB access
              list. If you are turned away, ask the Controller of Examinations
              to add you.
            </p>
          </>
        ) : (
          <div className="mt-3 rounded-lg border-l-[3px] border-amber-600 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-900">
              Sign-in is not set up on this deployment yet.
            </p>
            <p className="mt-1 text-xs text-amber-800">
              The Google sign-in client still has to be configured. If you were
              sent a preview link, open that link directly — it carries its own
              access.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
