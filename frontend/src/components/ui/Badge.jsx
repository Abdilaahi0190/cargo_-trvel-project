const badgeStyles = {
  active: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  inactive: 'bg-slate-100 text-slate-600 ring-slate-200',
  pending: 'bg-amber-100 text-amber-700 ring-amber-200',
  success: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  danger: 'bg-rose-100 text-rose-700 ring-rose-200',
  warning: 'bg-orange-100 text-orange-700 ring-orange-200'
};

function Badge({ label, status = 'inactive' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
        badgeStyles[status] || badgeStyles.inactive
      }`}
    >
      {label}
    </span>
  );
}

export default Badge;
