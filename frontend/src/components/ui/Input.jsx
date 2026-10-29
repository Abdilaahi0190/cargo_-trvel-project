function Input({ label, className = '', ...props }) {
  return (
    <label className="block text-sm text-slate-700 dark:text-slate-300">
      <span className="mb-2 block font-medium text-slate-800 dark:text-slate-100">{label}</span>
      <input
        className={`w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700 ${className}`}
        {...props}
      />
    </label>
  );
}

export default Input;
