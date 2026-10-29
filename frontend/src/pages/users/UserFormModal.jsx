import { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';

const EMPTY_FORM = {
  name: '',
  username: '',
  password: '',
  phone: '',
  role_id: '',
  state: 'active'
};

function UserFormModal({
  isOpen,
  onClose,
  title,
  mode = 'create',
  user,
  roles = [],
  onSubmit,
  isSubmitting
}) {
  const [formState, setFormState] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (mode === 'edit' && user) {
      setFormState({
        name: user.full_name || '',
        username: user.username || '',
        password: '',
        phone: user.phone || '',
        role_id: user.role_id ? String(user.role_id) : '',
        state: user.state || 'active'
      });
      return;
    }

    setFormState(EMPTY_FORM);
  }, [isOpen, mode, user]);

  function validate() {
    if (!formState.name.trim()) {
      return 'Name is required';
    }

    if (mode === 'create') {
      if (!formState.username.trim()) {
        return 'Username is required';
      }

      if (!formState.password || formState.password.length < 6) {
        return 'Password must be at least 6 characters';
      }
    }

    if (!formState.role_id) {
      return 'Role is required';
    }

    return null;
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const validationError = validate();

          if (validationError) {
            onSubmit(null, validationError);
            return;
          }

          const payload = {
            name: formState.name.trim(),
            phone: formState.phone.trim() || undefined,
            role_id: Number(formState.role_id),
            state: formState.state
          };

          if (mode === 'create') {
            onSubmit({
              ...payload,
              username: formState.username.trim(),
              password: formState.password
            });
            return;
          }

          onSubmit(payload);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Name"
            required
            value={formState.name}
            onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
          />

          <Input
            label="Phone"
            value={formState.phone}
            onChange={(event) => setFormState((current) => ({ ...current, phone: event.target.value }))}
          />
        </div>

        {mode === 'create' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Username"
              required
              value={formState.username}
              onChange={(event) => setFormState((current) => ({ ...current, username: event.target.value }))}
            />
            <Input
              label="Password"
              type="password"
              required
              minLength={6}
              value={formState.password}
              onChange={(event) => setFormState((current) => ({ ...current, password: event.target.value }))}
            />
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-slate-700 dark:text-slate-300">
            <span className="mb-2 block font-medium text-slate-800 dark:text-slate-100">Role</span>
            <select
              required
              value={formState.role_id}
              onChange={(event) => setFormState((current) => ({ ...current, role_id: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700"
            >
              <option value="">Select role</option>
              {roles.map((role) => (
                <option key={role.role_id} value={role.role_id}>
                  {role.role_name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-slate-700 dark:text-slate-300">
            <span className="mb-2 block font-medium text-slate-800 dark:text-slate-100">State</span>
            <select
              value={formState.state}
              onChange={(event) => setFormState((current) => ({ ...current, state: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:min-w-[120px]"
          >
            Cancel
          </button>
          <Button type="submit" className="w-full sm:w-auto sm:min-w-[140px]" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : mode === 'create' ? 'Create User' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default UserFormModal;
