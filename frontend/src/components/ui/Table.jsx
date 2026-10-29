function getHeaderClassName(column) {
  const classes = [
    'px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400'
  ];

  if (column.align === 'right') {
    classes.push('text-right');
  } else {
    classes.push('text-left');
  }

  if (column.headerClassName) {
    classes.push(column.headerClassName);
  }

  return classes.join(' ');
}

function getCellClassName(column) {
  const classes = ['px-5 py-4 text-sm text-slate-700 dark:text-slate-200'];

  if (column.wrap) {
    classes.push('whitespace-normal align-top');
  } else {
    classes.push('whitespace-nowrap align-middle');
  }

  if (column.align === 'right') {
    classes.push('text-right');
  }

  if (column.cellClassName) {
    classes.push(column.cellClassName);
  }

  return classes.join(' ');
}

function Table({ columns, data }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white shadow-sm transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead className="bg-slate-50 dark:bg-slate-950/70">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={getHeaderClassName(column)}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
            {data.length > 0 ? (
              data.map((row, rowIndex) => (
                <tr key={row.id || row.key || rowIndex} className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/60">
                  {columns.map((column) => (
                    <td key={column.key} className={getCellClassName(column)}>
                      {row[column.key] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                  No records found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Table;
