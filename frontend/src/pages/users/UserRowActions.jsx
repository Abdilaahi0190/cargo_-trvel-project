import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, KeyRound, MoreVertical, Pencil, Power, Trash2 } from 'lucide-react';
import useAuth from '../../hooks/useAuth';

function UserRowActions({ user, onAssignBranch, onEdit, onToggleState, onResetPassword, onDelete }) {
  const { user: currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const isActive = String(user?.state || '').toLowerCase() === 'active';

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      return;
    }

    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 208;
    const menuHeight = 220;
    const gap = 8;
    const viewportPadding = 12;

    let top = rect.bottom + gap;
    let left = rect.right - menuWidth;

    if (top + menuHeight > window.innerHeight - viewportPadding) {
      top = Math.max(viewportPadding, rect.top - menuHeight - gap);
    }

    left = Math.min(
      Math.max(viewportPadding, left),
      window.innerWidth - menuWidth - viewportPadding
    );

    setMenuPosition({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event) {
      const target = event.target;
      if (
        buttonRef.current?.contains(target)
        || menuRef.current?.contains(target)
      ) {
        return;
      }

      setOpen(false);
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  function runAction(action) {
    setOpen(false);
    action();
  }

  const menu = open ? (
    <div
      ref={menuRef}
      role="menu"
      style={{ top: menuPosition.top, left: menuPosition.left }}
      className="fixed z-[100] w-52 overflow-hidden rounded-2xl border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)] py-1 shadow-xl backdrop-blur-md"
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => runAction(onAssignBranch)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-strong)]"
      >
        <Building2 className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
        Assign Branch
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => runAction(onEdit)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-strong)]"
      >
        <Pencil className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
        Edit User
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => runAction(onResetPassword)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-strong)]"
      >
        <KeyRound className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
        Reset Password
      </button>
      <div className="my-1 border-t border-[var(--border)]" />
      <button
        type="button"
        role="menuitem"
        onClick={() => runAction(onToggleState)}
        className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition hover:bg-[var(--surface-strong)] ${
          isActive ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
        }`}
      >
        <Power className="h-4 w-4 shrink-0" />
        {isActive ? 'Deactivate' : 'Activate'}
      </button>
      {currentUser?.role_id === 1 && (
        <button
          type="button"
          role="menuitem"
          onClick={() => runAction(onDelete)}
          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-rose-600 transition hover:bg-[var(--surface-strong)] dark:text-rose-400"
        >
          <Trash2 className="h-4 w-4 shrink-0" />
          Delete User
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className="flex justify-end">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${
          open
            ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
            : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
        aria-label="User actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

export default UserRowActions;
