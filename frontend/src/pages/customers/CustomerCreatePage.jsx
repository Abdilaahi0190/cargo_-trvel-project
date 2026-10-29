import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { createCustomer } from '../../api/customers.api';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';
import { getCollection } from './customers.utils';

function CustomerCreatePage() {
  const navigate = useNavigate();
  const [formState, setFormState] = useState({
    full_name: '',
    phone: '',
    customer_type: 'regular',
    state: 'active',
    city_id: '',
    address_id: ''
  });

  const citiesQuery = useQuery({
    queryKey: ['customers-create-cities'],
    queryFn: async () => (await api.get('/api/v1/setup/cities', { params: { limit: 200 } })).data,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const addressesQuery = useQuery({
    queryKey: ['customers-create-addresses', formState.city_id],
    queryFn: async () => {
      return (await api.get('/api/v1/setup/addresses', {
        params: {
          limit: 500,
          ...(formState.city_id ? { city_id: formState.city_id } : {})
        }
      })).data;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  useEffect(() => {
    setFormState((current) => ({ ...current, address_id: '' }));
  }, [formState.city_id]);

  const createMutation = useMutation({
    mutationFn: (payload) => createCustomer(payload),
    onSuccess: (response) => {
      const customerId = response?.data?.data?.customer_id;
      toast.success('Customer created successfully');
      navigate(customerId ? `/customers/${customerId}` : '/customers');
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message || 'Unable to create customer');
    }
  });

  const cities = useMemo(() => getCollection(citiesQuery.data), [citiesQuery.data]);
  const addresses = useMemo(() => getCollection(addressesQuery.data), [addressesQuery.data]);

  if (citiesQuery.isLoading || addressesQuery.isLoading) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-14 shadow-sm transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" subtitle="Create a new customer profile" />

      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();

          createMutation.mutate({
            full_name: formState.full_name.trim(),
            phone: formState.phone.trim(),
            customer_type: formState.customer_type,
            address_id: formState.address_id ? Number(formState.address_id) : null
          });
        }}
      >
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Basic Info</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
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
                <option value="vip">VIP Customer</option>
              </select>
            </label>

            <label className="block text-sm text-slate-700 dark:text-slate-300">
              <span className="mb-2 block font-medium text-slate-800 dark:text-slate-100">State</span>
              <select
                value={formState.state}
                onChange={(event) => setFormState((current) => ({ ...current, state: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700"
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Address</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-slate-700 dark:text-slate-300">
              <span className="mb-2 block font-medium text-slate-800 dark:text-slate-100">City</span>
              <select
                value={formState.city_id}
                onChange={(event) => setFormState((current) => ({ ...current, city_id: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700"
              >
                <option value="">Select city</option>
                {cities.map((city) => (
                  <option key={city.city_id} value={city.city_id}>
                    {city.city_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-slate-700 dark:text-slate-300">
              <span className="mb-2 block font-medium text-slate-800 dark:text-slate-100">Address</span>
              <select
                value={formState.address_id}
                onChange={(event) => setFormState((current) => ({ ...current, address_id: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700"
              >
                <option value="">Select address</option>
                {addresses.map((address) => (
                  <option key={address.address_id} value={address.address_id}>
                    {address.location_name || address.description || `Address ${address.address_id}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => navigate('/customers')}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <Button type="submit" className="sm:w-auto" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Customer'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default CustomerCreatePage;
