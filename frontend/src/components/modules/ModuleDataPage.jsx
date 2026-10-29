import PageHeader from '../ui/PageHeader';
import Pagination from '../ui/Pagination';
import Spinner from '../ui/Spinner';
import Table from '../ui/Table';

export default function ModuleDataPage({
  title,
  subtitle,
  actions,
  columns,
  rows,
  isLoading,
  errorMessage,
  page,
  limit,
  total,
  onPageChange
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} actions={actions} />

      {isLoading ? (
        <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-14 shadow-sm transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900">
          <Spinner />
        </div>
      ) : errorMessage ? (
        <section className="rounded-[28px] border border-rose-200 bg-white p-6 text-sm text-rose-700 shadow-sm dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-300">
          {errorMessage}
        </section>
      ) : (
        <>
          <Table columns={columns} data={rows} />
          <Pagination
            page={page}
            limit={limit}
            total={total}
            onPageChange={onPageChange}
          />
        </>
      )}
    </div>
  );
}
