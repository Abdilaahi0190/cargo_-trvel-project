function parseBranchNames(value) {
  if (!value || !String(value).trim()) {
    return [];
  }

  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function UserBranchTags({ branchNames }) {
  const branches = parseBranchNames(branchNames);

  if (!branches.length) {
    return (
      <span className="inline-flex items-center rounded-lg border border-dashed border-slate-200 px-2.5 py-1 text-xs text-slate-400 dark:border-slate-600 dark:text-slate-500">
        Unassigned
      </span>
    );
  }

  return (
    <div className="flex max-w-[320px] flex-wrap gap-1.5">
      {branches.map((name, index) => (
        <span
          key={`${name}-${index}`}
          title={name}
          className="inline-flex max-w-full items-center truncate rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-800 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200"
        >
          {name}
        </span>
      ))}
    </div>
  );
}

export default UserBranchTags;
