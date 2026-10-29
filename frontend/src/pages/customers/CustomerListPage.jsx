import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { deleteCustomer, getAllCustomers, updateCustomer } from '../../api/customers.api';
import Badge from '../../components/ui/Badge';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import Spinner from '../../components/ui/Spinner';
import Table from '../../components/ui/Table';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import CustomerFormModal from './CustomerFormModal';
import {
  buildAddressMap,
  formatDate,
  getBadgeStatus,
  getCollection,
  getMeta,
  resolveCustomerState
} from './customers.utils';

const PAGE_LIMIT = 10;

async function fetchAllCargo() {
  let page = 1;
  let pages = 1;
  const rows = [];

  while (page <= pages) {
    const response = await api.get('/api/cargo', { params: { page, limit: 100 } });
    const payload = response.data;
    const data = getCollection(payload);
    const meta = getMeta(payload);

    rows.push(...data);
    pages = Number(meta.pages) > 0 ? Number(meta.pages) : 1;
    page += 1;
  }

  return rows;
}

function CustomerListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [customerToDelete, setCustomerToDelete] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editCityId, setEditCityId] = useState('');

  const customersQuery = useQuery({
    queryKey: ['customers-list', page, search, cityFilter, typeFilter],
    queryFn: async () => (await getAllCustomers({
      page,
      limit: PAGE_LIMIT,
      search: search.trim() || undefined,
      city: cityFilter !== 'all' ? cityFilter : undefined,
      customer_type: typeFilter !== 'all' ? typeFilter : undefined
    })).data,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false
  });

  const citiesQuery = useQuery({
    queryKey: ['customers-cities'],
    queryFn: async () => {
      try {
        return (await api.get('/api/v1/setup/cities', { params: { limit: 200 } })).data;
      } catch {
        return { data: [] };
      }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const addressesQuery = useQuery({
    queryKey: ['customers-addresses'],
    queryFn: async () => {
      try {
        return (await api.get('/api/v1/setup/addresses', { params: { limit: 500 } })).data;
      } catch {
        return { data: [] };
      }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const cargoQuery = useQuery({
    queryKey: ['customers-cargo-all'],
    queryFn: fetchAllCargo,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false
  });

  const deleteMutation = useMutation({
    mutationFn: (customerId) => deleteCustomer(customerId),
    onSuccess: async () => {
      toast.success('Customer deleted successfully');
      setCustomerToDelete(null);
      await queryClient.invalidateQueries({ queryKey: ['customers-list'] });
      await queryClient.invalidateQueries({ queryKey: ['customers-cargo-all'] });
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message || 'Unable to delete customer');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ customerId, payload }) => updateCustomer(customerId, payload),
    onSuccess: async () => {
      toast.success('Customer updated successfully');
      setEditingCustomer(null);
      await queryClient.invalidateQueries({ queryKey: ['customers-list'] });
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message || 'Unable to update customer');
    }
  });

  const addresses = useMemo(() => getCollection(addressesQuery.data), [addressesQuery.data]);
  const customersPayload = customersQuery.data || {};
  const customersMeta = useMemo(() => getMeta(customersPayload), [customersPayload]);
  const customers = useMemo(() => getCollection(customersPayload), [customersPayload]);
  const cargoRows = useMemo(() => cargoQuery.data || [], [cargoQuery.data]);
  const addressMap = useMemo(() => buildAddressMap(addresses), [addresses]);

  const shipmentCounts = useMemo(() => {
    return cargoRows.reduce((map, item) => {
      const senderId = Number(item?.sender_id);
      const receiverId = Number(item?.receiver_id);

      map.set(senderId, (map.get(senderId) || 0) + 1);
      map.set(receiverId, (map.get(receiverId) || 0) + 1);

      return map;
    }, new Map());
  }, [cargoRows]);

  const cityOptions = useMemo(
    () => getCollection(citiesQuery.data).map((city) => city.city_name).filter(Boolean).sort((left, right) => left.localeCompare(right)),
    [citiesQuery.data]
  );

  const stats = useMemo(() => {
    const summary = customersMeta.summary || {};

    return [
      { label: 'Total Customers', value: Number(summary.total_customers || 0) },
      { label: 'Active Customers', value: Number(summary.active_customers || 0) },
      { label: 'Inactive Customers', value: Number(summary.inactive_customers || 0) },
      { label: 'New This Month', value: Number(summary.new_this_month || 0) }
    ];
  }, [customersMeta.summary]);

  const TYPE_LABELS = { regular: 'Regular', one_time: 'One-Time', vip: 'VIP' };
  const TYPE_COLORS = {
    regular: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    one_time: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    vip: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
  };

  const columns = [
    { key: 'full_name', label: 'Full Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'type', label: 'Type' },
    { key: 'city', label: 'City' },
    { key: 'status', label: 'Status' },
    { key: 'shipments', label: 'Shipments' },
    { key: 'created_at', label: 'Created' },
    { key: 'actions', label: 'Actions' }
  ];

  const rows = useMemo(() => {
    return customers
      .filter((customer) => statusFilter === 'all' || resolveCustomerState(customer) === statusFilter)
      .map((customer) => ({
      id: customer.customer_id,
      full_name: (
        <button
          type="button"
          onClick={() => navigate(`/customers/${customer.customer_id}`)}
          className="font-semibold text-slate-900 hover:text-cyan-600 dark:text-slate-100 dark:hover:text-cyan-300"
        >
          {customer.full_name}
        </button>
      ),
      phone: customer.phone || '--',
      type: (
        <span className={`inline-flex rounded-xl px-2.5 py-1 text-xs font-semibold ${TYPE_COLORS[customer.customer_type] || TYPE_COLORS.regular}`}>
          {TYPE_LABELS[customer.customer_type] || customer.customer_type || 'Regular'}
        </span>
      ),
      city: customer.city_name || 'Unknown city',
      status: <Badge label={resolveCustomerState(customer)} status={getBadgeStatus(resolveCustomerState(customer))} />,
      shipments: shipmentCounts.get(Number(customer.customer_id)) || 0,
      created_at: formatDate(customer.created_at),
      actions: (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(`/customers/${customer.customer_id}`)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="View customer"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingCustomer(customer);
              setEditCityId(customer.address_id ? String(addressMap.get(Number(customer.address_id))?.city_id || '') : '');
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Edit customer"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCustomerToDelete(customer)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-rose-200 text-rose-600 transition hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/30"
            aria-label="Delete customer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )
    }));
  }, [addressMap, customers, navigate, shipmentCounts, statusFilter]);

  if (customersQuery.isLoading || citiesQuery.isLoading || addressesQuery.isLoading || cargoQuery.isLoading) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-14 shadow-sm transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        subtitle="Manage your customer base"
        actions={(
          <button
            type="button"
            onClick={() => navigate('/customers/new')}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            + New Customer
          </button>
        )}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <article key={item.label} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{item.label}</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900 dark:text-slate-100">{item.value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900">
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <label className="block text-sm text-slate-700 dark:text-slate-300">
            <span className="mb-2 block font-medium text-slate-800 dark:text-slate-100">Search</span>
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by name or phone"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700"
            />
          </label>

          <label className="block text-sm text-slate-700 dark:text-slate-300">
            <span className="mb-2 block font-medium text-slate-800 dark:text-slate-100">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700"
            >
              <option value="all">All</option>
              <option value="active">active</option>
            </select>
          </label>

          <label className="block text-sm text-slate-700 dark:text-slate-300">
            <span className="mb-2 block font-medium text-slate-800 dark:text-slate-100">City</span>
            <select
              value={cityFilter}
              onChange={(event) => {
                setCityFilter(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700"
            >
              <option value="all">All Cities</option>
              {cityOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-slate-700 dark:text-slate-300">
            <span className="mb-2 block font-medium text-slate-800 dark:text-slate-100">Type</span>
            <select
              value={typeFilter}
              onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700"
            >
              <option value="all">All Types</option>
              <option value="regular">Regular</option>
              <option value="one_time">One-Time</option>
              <option value="vip">VIP</option>
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
                setCityFilter('all');
                setTypeFilter('all');
                setPage(1);
              }}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Reset
            </button>
          </div>
        </div>
      </section>

      <Table columns={columns} data={rows} />

      <Pagination page={page} limit={PAGE_LIMIT} total={customersMeta.total || rows.length} onPageChange={setPage} />

      <CustomerFormModal
        isOpen={Boolean(editingCustomer)}
        onClose={() => setEditingCustomer(null)}
        title="Edit Customer"
        customer={editingCustomer}
        addresses={addresses}
        selectedCityId={editCityId}
        onCityChange={setEditCityId}
        showStateField
        onSubmit={(payload) => {
          if (!editingCustomer) {
            return;
          }

          updateMutation.mutate({
            customerId: editingCustomer.customer_id,
            payload: {
              full_name: payload.full_name,
              phone: payload.phone,
              address_id: payload.address_id,
              customer_type: payload.customer_type
            }
          });
        }}
        isSubmitting={updateMutation.isPending}
      />

      <ConfirmDeleteModal
        isOpen={Boolean(customerToDelete)}
        onClose={() => setCustomerToDelete(null)}
        onConfirm={() => customerToDelete && deleteMutation.mutate(customerToDelete.customer_id)}
        isSubmitting={deleteMutation.isPending}
        customerName={customerToDelete?.full_name}
      />
    </div>
  );
}

export default CustomerListPage;
