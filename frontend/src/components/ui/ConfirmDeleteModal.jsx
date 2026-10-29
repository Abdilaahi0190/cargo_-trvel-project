import Modal from './Modal';
import Button from './Button';

export default function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
  title = 'Confirm Delete',
  message,
  confirmLabel = 'Delete'
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-5">
        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <Button
            type="button"
            onClick={onConfirm}
            className="sm:w-auto !bg-rose-600 hover:!bg-rose-700 dark:!bg-rose-600 dark:hover:!bg-rose-700"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Deleting...' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
