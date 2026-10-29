import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import useRbac from '../../hooks/useRbac';

export default function ForbiddenPage() {
  const { defaultRoute } = useRbac();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400">
        <ShieldOff className="h-8 w-8" />
      </div>
      <h1 className="text-2xl font-semibold text-white">Access denied</h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
        Your role does not have permission to view this page. Contact an administrator if you
        believe this is a mistake.
      </p>
      <Link
        to={defaultRoute}
        className="mt-8 inline-flex items-center rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
      >
        Go to your home page
      </Link>
    </div>
  );
}
