import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { getApiErrorMessage, getCollection, getMeta } from '../../api/listUtils';
import ModuleDataPage from '../../components/modules/ModuleDataPage';
import Badge from '../../components/ui/Badge';
import AssignBranchModal from './AssignBranchModal';
import UserBranchTags from './UserBranchTags';
import UserFormModal from './UserFormModal';
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import ModalFormFooter from '../../components/modules/ModalFormFooter';
import UserRowActions from './UserRowActions';

const PAGE_LIMIT = 20;

function statusTone(value) {
  const normalized = String(value || '').toLowerCase();
  return normalized === 'active' ? 'active' : 'danger';
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [assignUser, setAssignUser] = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);
  const [resetUser, setResetUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const query = useQuery({
    queryKey: ['users-list', page],
    queryFn: async () => (await api.get('/api/v1/users', { params: { page, limit: PAGE_LIMIT } })).data,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false
  });

  const rolesQuery = useQuery({
    queryKey: ['users-roles'],
    queryFn: async () => (await api.get('/api/v1/users/roles')).data,
    staleTime: 5 * 60 * 1000
  });

  const branchesQuery = useQuery({
    queryKey: ['setup-branches', 'users'],
    queryFn: async () => (await api.get('/api/v1/setup/branches', { params: { limit: 200 } })).data,
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(assignUser)
  });

  const userDetailQuery = useQuery({
    queryKey: ['user-detail', assignUser?.user_id],
    queryFn: async () => (await api.get(`/api/v1/users/${assignUser.user_id}`)).data,
    staleTime: 0,
    enabled: Boolean(assignUser?.user_id)
  });

  const roles = getCollection(rolesQuery.data);
  const branches = getCollection(branchesQuery.data);
  const users = getCollection(query.data);
  const userBranches = userDetailQuery.data?.data?.branches ?? [];

  function refreshUsers() {
    queryClient.invalidateQueries({ queryKey: ['users-list'] });
  }

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/api/v1/users', payload),
    onSuccess: () => {
      toast.success('User created successfully');
      setCreateOpen(false);
      refreshUsers();
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Unable to create user'));
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/api/v1/users/${id}`, payload),
    onSuccess: () => {
      toast.success('User updated successfully');
      setEditingUser(null);
      refreshUsers();
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Unable to update user'));
    }
  });

  const assignBranchMutation = useMutation({
    mutationFn: (payload) => api.post('/api/v1/users/branch/assign', payload),
    onSuccess: () => {
      toast.success('Branch assigned successfully');
      queryClient.invalidateQueries({ queryKey: ['user-detail', assignUser?.user_id] });
      refreshUsers();
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Unable to assign branch'));
    }
  });

  const revokeBranchMutation = useMutation({
    mutationFn: (uBrId) => api.delete(`/api/v1/users/branch/${uBrId}`),
    onSuccess: () => {
      toast.success('Branch access removed');
      queryClient.invalidateQueries({ queryKey: ['user-detail', assignUser?.user_id] });
      refreshUsers();
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Unable to remove branch'));
    }
  });

  const stateMutation = useMutation({
    mutationFn: ({ id, state }) => api.patch(`/api/v1/users/${id}/state`, { state }),
    onSuccess: (_data, variables) => {
      toast.success(variables.state === 'active' ? 'User activated' : 'User deactivated');
      refreshUsers();
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Unable to update user state'));
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/v1/users/${id}`),
    onSuccess: () => {
      toast.success('User deleted');
      setDeleteUser(null);
      refreshUsers();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to delete user'))
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, new_password }) => api.patch(`/api/v1/users/${id}/password`, { new_password }),
    onSuccess: () => {
      toast.success('Password reset successfully');
      setResetUser(null);
      setNewPassword('');
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to reset password'))
  });

  const handleToggleState = useCallback((user) => {
    const nextState = String(user.state || '').toLowerCase() === 'active' ? 'inactive' : 'active';
    stateMutation.mutate({ id: user.user_id, state: nextState });
  }, [stateMutation]);

  function handleValidationError(message) {
    if (message) {
      toast.error(message);
    }
  }

  const columns = useMemo(
    () => [
      { key: 'name', label: 'Name' },
      { key: 'username', label: 'Username' },
      { key: 'role', label: 'Role' },
      { key: 'state', label: 'State' },
      { key: 'branch', label: 'Branches', wrap: true, cellClassName: 'min-w-[200px] max-w-sm' },
      { key: 'actions', label: '', align: 'right', cellClassName: 'w-16', headerClassName: 'w-16' }
    ],
    []
  );

  const rows = useMemo(() => {
    return users.map((user) => ({
      id: user.user_id,
      name: user.full_name || '--',
      username: user.username || '--',
      role: user.role_name || user.role_id || '--',
      state: <Badge label={user.state || 'inactive'} status={statusTone(user.state)} />,
      branch: <UserBranchTags branchNames={user.branch_names} />,
      actions: (
        <UserRowActions
          user={user}
          onAssignBranch={() => setAssignUser(user)}
          onEdit={() => setEditingUser(user)}
          onToggleState={() => handleToggleState(user)}
          onResetPassword={() => { setResetUser(user); setNewPassword(''); }}
          onDelete={() => setDeleteUser(user)}
        />
      )
    }));
  }, [users, handleToggleState]);

  const meta = getMeta(query.data);

  return (
    <>
      <ModuleDataPage
        title="User Management"
        subtitle="System users, roles, and branch access"
        actions={(
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            + Create New User
          </button>
        )}
        columns={columns}
        rows={rows}
        isLoading={query.isLoading}
        errorMessage={query.isError ? getApiErrorMessage(query.error) : null}
        page={page}
        limit={PAGE_LIMIT}
        total={Number(meta.total) || rows.length}
        onPageChange={setPage}
      />

      <UserFormModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create New User"
        mode="create"
        roles={roles}
        isSubmitting={createMutation.isPending}
        onSubmit={(payload, validationError) => {
          if (validationError) {
            handleValidationError(validationError);
            return;
          }

          createMutation.mutate(payload);
        }}
      />

      <UserFormModal
        isOpen={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
        title="Edit User"
        mode="edit"
        user={editingUser}
        roles={roles}
        isSubmitting={updateMutation.isPending}
        onSubmit={(payload, validationError) => {
          if (validationError) {
            handleValidationError(validationError);
            return;
          }

          updateMutation.mutate({ id: editingUser.user_id, payload });
        }}
      />

      <AssignBranchModal
        isOpen={Boolean(assignUser)}
        onClose={() => setAssignUser(null)}
        user={assignUser}
        branches={branches}
        userBranches={userBranches}
        isSubmitting={assignBranchMutation.isPending}
        isRevoking={revokeBranchMutation.isPending}
        onRevoke={(uBrId) => revokeBranchMutation.mutate(uBrId)}
        onSubmit={(payload, validationError) => {
          if (validationError) {
            handleValidationError(validationError);
            return;
          }

          assignBranchMutation.mutate(payload);
        }}
      />

      <Modal isOpen={Boolean(resetUser)} onClose={() => setResetUser(null)} title="Reset Password" size="sm">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newPassword || newPassword.length < 6) {
              toast.error('Password must be at least 6 characters');
              return;
            }
            resetPasswordMutation.mutate({ id: resetUser.user_id, new_password: newPassword });
          }}
        >
          <Input label="New Password" type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <ModalFormFooter onClose={() => setResetUser(null)} isSubmitting={resetPasswordMutation.isPending} submitLabel="Reset Password" />
        </form>
      </Modal>

      <ConfirmDeleteModal
        isOpen={Boolean(deleteUser)}
        onClose={() => setDeleteUser(null)}
        onConfirm={() => deleteUser && deleteMutation.mutate(deleteUser.user_id)}
        isSubmitting={deleteMutation.isPending}
        title="Delete User"
        message={<>Delete user <strong>{deleteUser?.full_name}</strong>?</>}
      />
    </>
  );
}
