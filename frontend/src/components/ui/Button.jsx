function Button({ children, className = '', ...props }) {
  return (
    <button
      className={`w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;
