import Button from '../ui/Button';

export default function ModalFormFooter({ onClose, isSubmitting, submitLabel = 'Save' }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end dark:border-slate-700">
      <button
        type="button"
        onClick={onClose}
        className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:min-w-[120px]"
      >
        Cancel
      </button>
      <Button type="submit" className="w-full sm:w-auto sm:min-w-[140px]" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel}
      </Button>
    </div>
  );
}
