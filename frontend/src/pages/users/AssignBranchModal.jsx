import { useEffect, useState } from 'react';
import { Building2, X } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';

function AssignBranchModal({
  isOpen,
  onClose,
  user,
  branches = [],
  userBranches = [],
  isSubmitting,
  isRevoking,
  onSubmit,
  onRevoke
}) {
  const [brId, setBrId] = useState('');

  const userInitial = user ? (user.full_name || user.username || '?').charAt(0).toUpperCase() : '?';

  useEffect(() => {
    if (!isOpen) return;
    setBrId('');
  }, [isOpen, user]);

  const assignedBrIds = new Set(userBranches.map((b) => Number(b.branch_id)));
  const availableBranches = branches.filter((b) => !assignedBrIds.has(Number(b.branch_id)));

  function handleAssign(e) {
    e.preventDefault();
    if (!brId) {
      onSubmit(null, 'Select a branch to assign');
      return;
    }
    onSubmit({ user_id: user.user_id, branch_id: Number(brId) });
    setBrId('');
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage Branch Access" size="sm">
      {user ? (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/15 text-base font-semibold text-cyan-700 dark:text-cyan-300">
            {userInitial}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900 dark:text-slate-100">{user.full_name}</p>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">@{user.username}</p>
          </div>
        </div>
      ) : null}

      {/* Current branch assignments */}
      <div className="mb-5">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Current Branches
        </p>
        {userBranches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
            No branches assigned yet
          </p>
        ) : (
          <ul className="space-y-2">
            {userBranches.map((b) => (
              <li
                key={b.user_branch_id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                  <Building2 className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
                  {b.branch_name}
                </span>
                <button
                  type="button"
                  disabled={isRevoking}
                  onClick={() => onRevoke(b.user_branch_id)}
                  title="Remove branch access"
                  className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-rose-200 text-rose-500 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/20"
                >
                  {isRevoking ? <Spinner size="xs" /> : <X className="h-3.5 w-3.5" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add new branch */}
      <form className="space-y-4 border-t border-slate-200 pt-4 dark:border-slate-700" onSubmit={handleAssign}>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Add Branch
        </p>
        <label className="block text-sm text-slate-700 dark:text-slate-300">
          <select
            value={brId}
            onChange={(e) => setBrId(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700"
          >
            <option value="">— Select branch —</option>
            {availableBranches.map((branch) => (
              <option key={branch.branch_id} value={branch.branch_id}>
                {branch.city_name
                  ? `${branch.branch_name || `Branch ${branch.branch_id}`} (${branch.city_name})`
                  : branch.branch_name || `Branch ${branch.branch_id}`}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:min-w-[120px]"
          >
            Close
          </button>
          <Button type="submit" className="w-full sm:w-auto sm:min-w-[140px]" disabled={isSubmitting || !brId}>
            {isSubmitting ? 'Assigning…' : 'Assign Branch'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default AssignBranchModal;
