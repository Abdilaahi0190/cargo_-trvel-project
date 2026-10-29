import { useEffect } from 'react';
import { X } from 'lucide-react';

function Modal({ isOpen, onClose, title, children, size = 'lg', subtitle, headerActions }) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const maxWidthClass = {
    sm: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    xxl: 'max-w-6xl'
  }[size] || 'max-w-2xl';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_28%),rgba(2,6,23,0.72)] px-4 py-6 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className={`glass-ring w-full ${maxWidthClass} overflow-hidden rounded-[32px] border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--surface)_92%,transparent)] shadow-2xl transition-colors duration-300`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent)] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)] sm:text-xl">{title}</h2>
              {subtitle ? <p className="mt-1 text-sm text-[var(--text-secondary)]">{subtitle}</p> : null}
            </div>

            <div className="flex items-center gap-2">
              {headerActions}
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] text-[var(--text-secondary)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--text)]"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
        <div className="app-scrollbar max-h-[calc(100vh-10rem)] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export default Modal;
