import { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';

function CustomerFormModal({
  isOpen,
  onClose,
  title,
  customer,
  addresses,
  selectedCityId,
  onCityChange,
  onSubmit,
  isSubmitting,
  showStateField = false
}) {
  const [formState, setFormState] = useState({
    full_name: '',
    phone: '',
    customer_type: 'regular',
    address_id: '',
    state: 'active'
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setFormState({
      full_name: customer?.full_name || '',
      phone: customer?.phone || '',
      customer_type: customer?.customer_type || 'regular',
      address_id: customer?.address_id ? String(customer.address_id) : '',
      state: customer?.state || 'active'
    });
  }, [customer, isOpen]);

  const groupedAddresses = useMemo(() => {
    return addresses.filter((address) => {
      if (!selectedCityId) {
        return true;
      }

      return Number(address?.city_id) === Number(selectedCityId);
    });
  }, [addresses, selectedCityId]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();

          onSubmit({
            full_name: formState.full_name.trim(),
            phone: formState.phone.trim(),
            customer_type: formState.customer_type,
            address_id: formState.address_id ? Number(formState.address_id) : null,
            state: formState.state
          });
        }}
      >
        <Input
          label="Full Name"
          required
          value={formState.full_name}
          onChange={(event) => setFormState((current) => ({ ...current, full_name: event.target.value }))}
        />

        <Input
          label="Phone"
          required
          value={formState.phone}
          onChange={(event) => setFormState((current) => ({ ...current, phone: event.target.value }))}
        />

        <label className="block text-sm text-slate-700 dark:text-slate-300">
          <span className="mb-2 block font-medium text-slate-800 dark:text-slate-100">Customer Type</span>
          <select
            value={formState.customer_type}
            onChange={(event) => setFormState((current) => ({ ...current, customer_type: event.target.value }))}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700"
          >
            <option value="regular">Regular Customer</option>
            <option value="one_time">One-Time Customer</option>
          </select>
          {formState.customer_type === 'regular' && (
            <p className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              Regular customers automatically receive a 20% discount on all shipments.
            </p>
          )}
          {formState.customer_type === 'one_time' && (
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              One-time customers are not eligible for automatic discounts.
            </p>
          )}
        </label>

        <label className="block text-sm text-slate-700 dark:text-slate-300">
          <span className="mb-2 block font-medium text-slate-800 dark:text-slate-100">Address</span>
          <select
            value={formState.address_id}
            onChange={(event) => setFormState((current) => ({ ...current, address_id: event.target.value }))}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700"
          >
            <option value="">Select address</option>
            {groupedAddresses.map((address) => (
              <option key={address.address_id} value={address.address_id}>
                {address.location_name || address.description || `Address ${address.address_id}`} - {address.city_name}
              </option>
            ))}
          </select>
        </label>

        {showStateField ? (
          <label className="block text-sm text-slate-700 dark:text-slate-300">
            <span className="mb-2 block font-medium text-slate-800 dark:text-slate-100">Status</span>
            <select
              value={formState.state}
              onChange={(event) => setFormState((current) => ({ ...current, state: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700"
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>
        ) : null}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <Button type="submit" className="sm:w-auto" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default CustomerFormModal;
