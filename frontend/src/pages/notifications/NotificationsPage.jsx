import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { getApiErrorMessage, getCollection, getMeta } from '../../api/listUtils';
import ModuleDataPage from '../../components/modules/ModuleDataPage';
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal';
import Badge from '../../components/ui/Badge';
import { formatDate } from '../../utils/formatDate';

const PAGE_LIMIT = 20;

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const query = useQuery({
    queryKey: ['notifications-list', page],
    queryFn: async () => (await api.get('/api/v1/notifications', { params: { page, limit: PAGE_LIMIT } })).data,
    staleTime: 30 * 1000
  });

  const notifications = getCollection(query.data);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
  }

  const readMutation = useMutation({
    mutationFn: (id) => api.patch(`/api/v1/notifications/${id}/read`),
    onSuccess: () => { toast.success('Marked as read'); refresh(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to mark as read'))
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/v1/notifications/${id}`),
    onSuccess: () => { toast.success('Notification deleted'); setDeleteTarget(null); refresh(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Unable to delete notification'))
  });

  const columns = useMemo(() => [
    { key: 'title', label: 'Title' },
    { key: 'message', label: 'Message', wrap: true },
    { key: 'channel', label: 'Channel' },
    { key: 'status', label: 'Status' },
    { key: 'created', label: 'Created' },
    { key: 'actions', label: 'Actions', align: 'right' }
  ], []);

  const rows = useMemo(() => notifications.map((n) => {
    const unread = n.is_read === false || String(n.status || '').toLowerCase() === 'unread';
    return {
      id: n.notification_id,
      title: n.title || '--',
      message: n.message || '--',
      channel: n.channel_name || n.channel || '--',
      status: <Badge label={unread ? 'unread' : 'read'} status={unread ? 'pending' : 'success'} />,
      created: formatDate(n.created_at),
      actions: (
        <div className="flex justify-end gap-2">
          {unread ? <button type="button" onClick={() => readMutation.mutate(n.notification_id)} className="rounded-xl border px-3 py-1.5 text-xs dark:border-slate-700">Mark Read</button> : null}
          <button type="button" onClick={() => setDeleteTarget(n)} className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs text-rose-700 dark:border-rose-900/50">Delete</button>
        </div>
      )
    };
  }), [notifications, readMutation]);

  const meta = getMeta(query.data);

  return (
    <>
      <ModuleDataPage
        title="Notifications"
        subtitle="Recent user notifications"
        columns={columns}
        rows={rows}
        isLoading={query.isLoading}
        errorMessage={query.isError ? getApiErrorMessage(query.error) : null}
        page={page}
        limit={PAGE_LIMIT}
        total={Number(meta.total) || rows.length}
        onPageChange={setPage}
      />

      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.notification_id)}
        isSubmitting={deleteMutation.isPending}
        title="Delete Notification"
        message="Delete this notification?"
      />
    </>
  );
}
