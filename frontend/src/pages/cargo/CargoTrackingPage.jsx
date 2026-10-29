import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getCargoById, getCargoByTrackingNumber, getCargoTracking } from '../../api/cargo.api';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import {
  estimateDeliveryDate,
  formatDate,
  formatDateTime,
  formatStatusLabel,
  getCollection,
  getStatusDotClass,
  getStatusTone
} from './cargo.utils';

export default function CargoTrackingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const trackingNumber = (searchParams.get('tracking') || '').trim();
  const [trackingInput, setTrackingInput] = useState(trackingNumber);

  useEffect(() => {
    setTrackingInput(trackingNumber);
  }, [trackingNumber]);

  const trackingQuery = useQuery({
    queryKey: ['cargo-public-tracking', trackingNumber],
    queryFn: async () => (await getCargoByTrackingNumber(trackingNumber)).data,
    enabled: Boolean(trackingNumber)
  });

  const cargoId = trackingQuery.data?.data?.cargo_id;

  const detailQuery = useQuery({
    queryKey: ['cargo-tracking-detail', cargoId],
    queryFn: async () => (await getCargoById(cargoId)).data,
    enabled: Boolean(cargoId)
  });

  const timelineQuery = useQuery({
    queryKey: ['cargo-tracking-timeline', cargoId],
    queryFn: async () => (await getCargoTracking(cargoId)).data,
    enabled: Boolean(cargoId)
  });

  const tracking = trackingQuery.data?.data || {};
  const detail = detailQuery.data?.data || {};
  const timeline = useMemo(() => {
    const rows = getCollection(timelineQuery.data);
    return [...rows].sort((left, right) => new Date(right?.update_time || 0) - new Date(left?.update_time || 0));
  }, [timelineQuery.data]);
  const eta = estimateDeliveryDate(detail, timeline);

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Public Tracking</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Track Your Cargo</h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Enter a tracking number to view the latest shipment update.</p>
            </div>

            <form
              className="w-full max-w-xl"
              onSubmit={(event) => {
                event.preventDefault();

                if (!trackingInput.trim()) {
                  return;
                }

                navigate(`/cargo/track?tracking=${encodeURIComponent(trackingInput.trim())}`);
              }}
            >
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-100">Enter tracking number</span>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <input
                      type="text"
                      value={trackingInput}
                      onChange={(event) => setTrackingInput(event.target.value)}
                      placeholder="CRG123456"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-300 dark:focus:ring-slate-700"
                    />
                  </div>
                  <Button type="submit" className="w-auto px-5">
                    Track
                  </Button>
                </div>
              </label>
            </form>
          </div>
        </section>

        {trackingQuery.isLoading || detailQuery.isLoading || timelineQuery.isLoading ? (
          <section className="rounded-[32px] border border-slate-200 bg-white px-6 py-14 shadow-sm transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900">
            <Spinner />
          </section>
        ) : null}

        {trackingNumber && trackingQuery.isError ? (
          <section className="rounded-[32px] border border-rose-200 bg-rose-50 px-6 py-8 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/40">
            <h2 className="text-lg font-semibold text-rose-900 dark:text-rose-100">No shipment found with this tracking number</h2>
          </section>
        ) : null}

        {cargoId ? (
          <>
            <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Shipment</p>
                  <h2 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">{tracking?.tracking_number || '--'}</h2>
                </div>
                <Badge label={formatStatusLabel(tracking?.status_name)} status={getStatusTone(tracking?.status_name)} />
              </div>

              <div className="mt-8 flex items-center gap-3 rounded-3xl bg-slate-50 px-5 py-4 dark:bg-slate-800/70">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">From</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {detail?.from_branch_name || tracking?.from_branch_id || '--'}
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">To</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {detail?.to_branch_name || tracking?.to_branch_id || '--'}
                  </p>
                </div>
              </div>

              <div className="mt-8 grid gap-5 sm:grid-cols-3">
                <div className="rounded-3xl border border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/70">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Estimated Delivery</p>
                  <p className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">{formatDate(eta)}</p>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/70">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Current Branch</p>
                  <p className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                    {timeline[0]?.branch_name || timeline[0]?.location || '--'}
                  </p>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/70">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Last Updated</p>
                  <p className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                    {formatDateTime(timeline[0]?.update_time || tracking?.update_time)}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm transition-colors duration-300 dark:border-slate-700 dark:bg-slate-900 sm:p-8">
              <div className="mb-6">
                <p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Shipment Timeline</p>
              </div>

              {timeline.length ? (
                <div className="space-y-6">
                  {timeline.map((step, index) => (
                    <div key={`${step?.tracking_id || index}-${step?.update_time || ''}`} className="relative flex gap-4 pl-2">
                      <div className="relative flex w-6 justify-center">
                        <span className={`mt-1 h-3.5 w-3.5 rounded-full ${getStatusDotClass(step?.status_name)}`} />
                        {index < timeline.length - 1 ? <span className="absolute top-5 h-full w-px bg-slate-200 dark:bg-slate-700" /> : null}
                      </div>
                      <div className="flex-1 rounded-3xl border border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/70">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formatStatusLabel(step?.status_name)}</p>
                          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                            {formatDateTime(step?.update_time)}
                          </p>
                        </div>
                        <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                          {step?.branch_name || step?.location || `Branch ${step?.branch_id || '--'}`}
                        </p>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{step?.note || 'No notes provided'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">No tracking updates found.</p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
