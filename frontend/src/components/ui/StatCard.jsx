function StatCard({ title, value, icon: Icon, color = 'bg-slate-100 text-slate-700' }) {
  return (
    <article className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-5">
        <div className="h-10 rounded-2xl bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 p-3">
          <div className="flex h-full items-end gap-1">
            <span className="h-3 w-1/6 rounded-full bg-slate-200" />
            <span className="h-5 w-1/6 rounded-full bg-slate-200" />
            <span className="h-4 w-1/6 rounded-full bg-slate-200" />
            <span className="h-6 w-1/6 rounded-full bg-slate-200" />
            <span className="h-5 w-1/6 rounded-full bg-slate-200" />
            <span className="h-7 w-1/6 rounded-full bg-slate-200" />
          </div>
        </div>
      </div>
    </article>
  );
}

export default StatCard;
