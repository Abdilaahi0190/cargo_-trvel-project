import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { deleteCustomer, getAllCustomers, getCustomerById, getCustomerCargo, updateCustomer } from '../../api/customers.api';
import Badge from '../../components/ui/Badge';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import Spinner from '../../components/ui/Spinner';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import CustomerFormModal from './CustomerFormModal';
import {
  buildAddressMap,
  buildCustomerCargo,
  formatCurrency,
  formatDate,
  getBadgeStatus,
  getCollection,
  getInitials,
  getMeta,
  paginateRows,
  resolveCustomerState
} from './customers.utils';
import {
  formatStatusLabel,
  getStatusTone,
  paymentStatusClass,
  resolvePaymentStatus
} from '../cargo/cargo.utils';

const PAGE_LIMIT = 10;

async function fetchCustomerDirectory() {
  let page = 1;
  let pages = 1;
  const rows = [];

  while (page <= pages) {
    const response = await getAllCustomers({ page, limit: 100 });
    const payload = response.data;
    const data = getCollection(payload);
    const meta = getMeta(payload);

    rows.push(...data);
    pages = Number(meta.pages) > 0 ? Number(meta.pages) : 1;
    page += 1;
  }

  return {
    success: true,
    data: rows
  };
}

function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editCityId, setEditCityId] = useState('');

  const customerQuery = useQuery({
    queryKey: ['customer-detail', id],
    queryFn: async () => (await getCustomerById(id)).data,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false
  });

  const customerDirectoryQuery = useQuery({
    queryKey: ['customer-directory'],
    queryFn: fetchCustomerDirectory,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false
  });

  const customerCargoQuery = useQuery({
    queryKey: ['customer-cargo', id],
    queryFn: async () => (await getCustomerCargo(id, { page: 1, limit: 500 })).data,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false
  });

  const branchesQuery = useQuery({
    queryKey: ['customer-branches'],
    queryFn: async () => (await api.get('/api/v1/setup/branches', { params: { limit: 200 } })).data,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const addressesQuery = useQuery({
    queryKey: ['customer-addresses'],
    queryFn: async () => (await api.get('/api/v1/setup/addresses', { params: { limit: 500 } })).data,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCustomer(id),
    onSuccess: async () => {
      toast.success('Customer deleted successfully');
      await queryClient.invalidateQueries({ queryKey: ['customers-list'] });
      navigate('/customers');
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message || 'Unable to delete customer');
    }
  });

  const updateMutation = useMutation({
    mutationFn: (payload) => updateCustomer(id, payload),
    onSuccess: async () => {
      toast.success('Customer updated successfully');
      setIsEditOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['customer-detail', id] });
      await queryClient.invalidateQueries({ queryKey: ['customer-directory'] });
      await queryClient.invalidateQueries({ queryKey: ['customers-list'] });
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message || 'Unable to update customer');
    }
  });

  const customer = useMemo(() => {
    return customerQuery.data?.data || customerQuery.data || null;
  }, [customerQuery.data]);
  const customerDirectory = useMemo(() => getCollection(customerDirectoryQuery.data), [customerDirectoryQuery.data]);
  const directoryCustomer = useMemo(
    () => customerDirectory.find((item) => Number(item?.customer_id) === Number(id)) || null,
    [customerDirectory, id]
  );
  const addresses = useMemo(() => getCollection(addressesQuery.data), [addressesQuery.data]);
  const addressMap = useMemo(() => buildAddressMap(addresses), [addresses]);
  const resolvedAddress = directoryCustomer?.address_id ? addressMap.get(Number(directoryCustomer.address_id)) : null;

  const branchMap = useMemo(() => {
    return new Map(
      getCollection(branchesQuery.data).map((branch) => [
        Number(branch?.branch_id),
        branch?.branch_name || `Branch ${branch?.branch_id}`
      ])
    );
  }, [branchesQuery.data]);

  const allCustomerCargo = useMemo(() => {
    const rows = getCollection(customerCargoQuery.data);
    return buildCustomerCargo(rows, id, branchMap);
  }, [branchMap, customerCargoQuery.data, id]);

  const filteredCargo = useMemo(() => {
    if (statusFilter === 'all') {
      return allCustomerCargo;
    }

    return allCustomerCargo.filter((item) => String(item?.status_name || '').toLowerCase() === statusFilter);
  }, [allCustomerCargo, statusFilter]);

  const paginatedCargo = useMemo(() => paginateRows(filteredCargo, page, PAGE_LIMIT), [filteredCargo, page]);
  const cargoMeta = getMeta(customerCargoQuery.data);

  const customerState = resolveCustomerState(directoryCustomer || customer);
  const totalAmountPaid = allCustomerCargo.reduce((sum, item) => {
    const freight = Number(item?.total_amount);
    const extra = Number(item?.extra_charges) || 0;
    const balance = Number(item?.balance_mgq);

    if (Number.isFinite(freight) && Number.isFinite(balance)) {
      return sum + Math.max(0, freight + extra - balance);
    }

    return sum + (Number(item?.payment_received_amount) || 0);
  }, 0);
  const totalSent = allCustomerCargo.filter((item) => item.type === 'sender').length;
  const totalReceived = allCustomerCargo.filter((item) => item.type === 'receiver').length;
  const lastShipmentDate = allCustomerCargo[0]?.created_at || null;

  const columns = [
    { key: 'tracking_number', label: 'Tracking No' },
    { key: 'type', label: 'Type' },
    { key: 'from', label: 'From' },
    { key: 'to', label: 'To' },
    { key: 'status', label: 'Status' },
    { key: 'payment', label: 'Payment' },
    { key: 'date', label: 'Date' }
  ];

  const rows = useMemo(() => {
    return paginatedCargo.map((item) => ({
      id: item.cargo_id,
      tracking_number: (
        <button
          type="button"
          onClick={() => navigate(`/cargo/${item.cargo_id}`)}
          className="font-semibold text-slate-900 hover:text-cyan-600 dark:text-slate-100 dark:hover:text-cyan-300"
        >
          {item.tracking_number || `Cargo ${item.cargo_id}`}
        </button>
      ),
      type: item.type,
      from: item.fromLabel,
      to: item.toLabel,
      status: <Badge label={formatStatusLabel(item.status_name)} status={getStatusTone(item.status_name)} />,
      payment: (() => {
        const paymentStatus = resolvePaymentStatus(item);

        return (
          <span className={paymentStatusClass(paymentStatus)}>
            {paymentStatus}
          </span>
        );
      })(),
      date: formatDate(item.created_at)
    }));
  }, [navigate, paginatedCargo]);

  if (
    customerQuery.isLoading
    || customerDirectoryQuery.isLoading
    || customerCargoQuery.isLoading
    || branchesQuery.isLoading
    || addressesQuery.isLoading
  ) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-14 shadow-sm transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Profile"
        subtitle="View customer details and shipment history"
        actions={(
          <button
            type="button"
            onClick={() => navigate('/customers')}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Back to Customers
          </button>
        )}
      />

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-900 text-2xl font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
                {getInitials(customer?.full_name)}
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{customer?.full_name || 'Unknown customer'}</h2>
                <div className="mt-3">
                  <Badge label={customerState} status={customerState === 'active' ? 'active' : 'danger'} />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setEditCityId(resolvedAddress?.city_id ? String(resolvedAddress.city_id) : '');
                setIsEditOpen(true);
              }}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Edit
            </button>
          </div>

          <div className="mt-6 space-y-4 text-sm text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-slate-400" />
              <span>{customer?.phone || '--'}</span>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
              <div>
                <p>{resolvedAddress?.city_name || customer?.branch_name || 'Unknown city'}</p>
                <p className="mt-1 text-slate-500 dark:text-slate-400">{resolvedAddress?.location_name || customer?.address_location || 'No address'}</p>
              </div>
            </div>
            <p>Member since {formatDate(customer?.created_at)}</p>
          </div>
        </article>

        <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Customer Stats</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl bg-slate-50 p-4 dark:bg-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Total Shipments sent</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{totalSent}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4 dark:bg-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Total Shipments received</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{totalReceived}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4 dark:bg-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Total amount paid</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(totalAmountPaid)}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4 dark:bg-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">Last shipment date</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{formatDate(lastShipmentDate)}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Shipment History</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Real cargo history linked to this customer</p>
          </div>

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
              {Array.from(new Set(allCustomerCargo.map((item) => item.status_name).filter(Boolean))).map((status) => (
                <option key={status} value={String(status).toLowerCase()}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Table columns={columns} data={rows} />
        <Pagination page={page} limit={PAGE_LIMIT} total={filteredCargo.length || cargoMeta.total || 0} onPageChange={setPage} />
      </section>

      <section className="grid gap-3 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition-colors duration-300 md:grid-cols-3 dark:border-slate-700 dark:bg-slate-900">
        <Button type="button" className="sm:w-auto" onClick={() => navigate(`/cargo/new?customer_id=${id}`)}>
          New Shipment for this customer
        </Button>
        <button
          type="button"
          onClick={() => {
            setEditCityId(resolvedAddress?.city_id ? String(resolvedAddress.city_id) : '');
            setIsEditOpen(true);
          }}
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Edit Customer
        </button>
        <button
          type="button"
          onClick={() => setIsDeleteOpen(true)}
          className="rounded-2xl border border-rose-200 px-4 py-3 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/30"
        >
          Delete Customer
        </button>
      </section>

      <CustomerFormModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Customer"
        customer={{
          ...customer,
          address_id: directoryCustomer?.address_id,
          state: customerState
        }}
        addresses={addresses}
        selectedCityId={editCityId}
        onCityChange={setEditCityId}
        showStateField
        onSubmit={(payload) => {
          updateMutation.mutate({
            full_name: payload.full_name,
            phone: payload.phone,
            address_id: payload.address_id
          });
        }}
        isSubmitting={updateMutation.isPending}
      />

      <ConfirmDeleteModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        isSubmitting={deleteMutation.isPending}
        customerName={customer?.full_name}
      />
    </div>
  );
}

export default CustomerDetailPage;
