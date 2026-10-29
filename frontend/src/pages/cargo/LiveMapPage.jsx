import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  Activity,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Package2,
  Plane,
  RefreshCw,
  Search,
  Ship,
  Train,
  Truck
} from 'lucide-react';
import api from '../../api/axios';
import { getApiErrorMessage } from '../../api/listUtils';
import { getAllCargo, getCargoById } from '../../api/cargo.api';

const DEFAULT_MAP_CENTER = [20, 10];
const DEFAULT_MAP_ZOOM = 2;
const DEFAULT_PROVIDER_NAME = 'Waafi Cargo';

const transportOptions = ['Air Freight', 'Sea Freight', 'Road Freight', 'Rail Freight'];
const statusOptions = ['In Transit', 'Delivered', 'Delayed', 'Pending', 'Returned'];
const priorityOptions = ['Express', 'Normal', 'Economy'];
const mapViewOptions = [
  { id: 'all', label: 'All', icon: Package2 },
  { id: 'clusters', label: 'Clusters', icon: Activity },
  { id: 'routes', label: 'Routes', icon: Truck }
];

const cityCoords = {
  mogadishu: [2.0469, 45.3182],
  nairobi: [-1.2921, 36.8219],
  dubai: [25.2048, 55.2708]
};

function unwrapPayload(payload) {
  return payload?.data ?? payload ?? null;
}

function getCollection(payload) {
  const source = unwrapPayload(payload);

  if (Array.isArray(source)) {
    return source;
  }

  if (!source || typeof source !== 'object') {
    return [];
  }

  return [source.data, source.items, source.results, source.rows, source.records, source.list].find(Array.isArray) || [];
}

function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function normalizeLabel(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function formatStatusLabel(status) {
  return String(status || 'Unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function formatWeight(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)} kg` : '--';
}

function formatPrice(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(number)
    : '--';
}

function getTrackingNumber(item) {
  return item?.tracking_number || item?.trackingNo || item?.tracking_number || 'Unknown';
}

function getStatusValue(item) {
  return item?.status_name || item?.status || item?.current_status || 'pending';
}

function inferTransportType(item) {
  const explicitType = item?.transport_type || item?.transportType || item?.provider_type || item?.providerType || item?.mode;

  if (explicitType) {
    const normalized = normalizeLabel(explicitType);

    if (normalized.includes('air') || normalized.includes('plane')) {
      return 'Air Freight';
    }

    if (normalized.includes('sea') || normalized.includes('ship')) {
      return 'Sea Freight';
    }

    if (normalized.includes('rail') || normalized.includes('train')) {
      return 'Rail Freight';
    }
  }

  return 'Road Freight';
}

function inferPriority(item) {
  const explicitPriority = item?.priority || item?.priority_level || item?.service_level;

  if (explicitPriority) {
    const normalized = normalizeLabel(explicitPriority);

    if (normalized.includes('express')) {
      return 'Express';
    }

    if (normalized.includes('economy')) {
      return 'Economy';
    }
  }

  const price = Number(item?.price);

  if (Number.isFinite(price) && price >= 500) {
    return 'Express';
  }

  if (Number.isFinite(price) && price <= 120) {
    return 'Economy';
  }

  return 'Normal';
}

function getProviderName(item) {
  return item?.provider_name || item?.company_name || item?.carrier_name || item?.company || DEFAULT_PROVIDER_NAME;
}

function estimateEtaDate(item) {
  const explicitEta = item?.eta || item?.eta_date || item?.expected_delivery_date || item?.arrival_date;

  if (explicitEta) {
    return explicitEta;
  }

  const baseDate = new Date(item?.updated_at || item?.created_at || Date.now());

  if (Number.isNaN(baseDate.getTime())) {
    return null;
  }

  const status = normalizeStatus(getStatusValue(item));
  const daysToAdd = {
    delivered: 0,
    returned: 0,
    delayed: 7,
    pending: 5,
    in_transit: 3
  }[status] ?? 4;

  baseDate.setDate(baseDate.getDate() + daysToAdd);
  return baseDate.toISOString();
}

function getStatusClasses(status) {
  switch (normalizeStatus(status)) {
    case 'in_transit':
      return 'border-sky-400/25 bg-sky-500/15 text-sky-200';
    case 'delivered':
      return 'border-emerald-400/25 bg-emerald-500/15 text-emerald-200';
    case 'delayed':
      return 'border-amber-400/25 bg-amber-500/15 text-amber-100';
    case 'pending':
      return 'border-violet-400/25 bg-violet-500/15 text-violet-200';
    case 'returned':
      return 'border-rose-400/25 bg-rose-500/15 text-rose-200';
    default:
      return 'border-slate-500/25 bg-slate-500/15 text-slate-200';
  }
}

function getStatusColor(status) {
  switch (normalizeStatus(status)) {
    case 'in_transit':
      return '#38bdf8';
    case 'delivered':
      return '#34d399';
    case 'delayed':
      return '#f59e0b';
    case 'pending':
      return '#a78bfa';
    case 'returned':
      return '#fb7185';
    default:
      return '#94a3b8';
  }
}

function getTransportIcon(transportType) {
  switch (transportType) {
    case 'Air Freight':
      return Plane;
    case 'Sea Freight':
      return Ship;
    case 'Rail Freight':
      return Train;
    default:
      return Truck;
  }
}

function getTransportEmoji(transportType) {
  switch (transportType) {
    case 'Air Freight':
      return 'A';
    case 'Sea Freight':
      return 'S';
    case 'Rail Freight':
      return 'L';
    default:
      return 'R';
  }
}

function getBranchName(branchMap, branchId, fallback) {
  const branch = branchMap.get(Number(branchId));
  return branch?.branch_name || fallback || `Branch ${branchId}`;
}

function coordsFromCityName(cityName) {
  const key = String(cityName || '').trim().toLowerCase();
  const match = Object.entries(cityCoords).find(([city]) => key.includes(city));
  return match ? match[1] : null;
}

function getBranchCoordinates(branchMap, branchId, branchName) {
  const numericBranchId = Number(branchId);
  const branch = branchMap.get(numericBranchId);
  const latitude = Number(branch?.latitude ?? branch?.lat ?? branch?.branch_latitude);
  const longitude = Number(branch?.longitude ?? branch?.lng ?? branch?.branch_longitude);

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return [Number(latitude.toFixed(4)), Number(longitude.toFixed(4))];
  }

  const cityCoordsMatch = coordsFromCityName(branch?.city_name || branchName);
  if (cityCoordsMatch) {
    return cityCoordsMatch;
  }

  return DEFAULT_MAP_CENTER;
}

function findBranchByName(branchMap, branchName) {
  const normalized = String(branchName || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  for (const branch of branchMap.values()) {
    if (String(branch.branch_name || '').trim().toLowerCase() === normalized) {
      return branch;
    }
  }

  return null;
}

function getTripPosition(trip, branchMap) {
  const routeParts = String(trip.route || '').split('→').map((part) => part.trim());
  const fromBranch = findBranchByName(branchMap, routeParts[0]);
  const toBranch = findBranchByName(branchMap, routeParts[1]);
  const originCoords = getBranchCoordinates(branchMap, fromBranch?.branch_id, routeParts[0]);
  const destinationCoords = getBranchCoordinates(branchMap, toBranch?.branch_id, routeParts[1]);
  return getMidpoint(originCoords, destinationCoords);
}

function getTripMarkerIcon(cargoCount, isSelected) {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        display:flex;align-items:center;justify-content:center;
        width:${isSelected ? 44 : 38}px;height:${isSelected ? 44 : 38}px;
        border-radius:9999px;border:2px solid ${isSelected ? '#22d3ee' : '#0ea5e9'};
        background:rgba(8,14,26,0.92);color:#e2e8f0;font-weight:700;font-size:12px;
        box-shadow:0 8px 24px rgba(14,165,233,0.35);
      ">${cargoCount}</div>
    `,
    iconSize: [isSelected ? 44 : 38, isSelected ? 44 : 38],
    iconAnchor: [isSelected ? 22 : 19, isSelected ? 22 : 19]
  });
}

function getMidpoint(originCoords, destinationCoords) {
  return [
    Number(((originCoords[0] + destinationCoords[0]) / 2).toFixed(4)),
    Number(((originCoords[1] + destinationCoords[1]) / 2).toFixed(4))
  ];
}

function getMarkerIcon(shipment, isSelected) {
  const color = getStatusColor(shipment.displayStatus);
  const emoji = getTransportEmoji(shipment.transportType);
  const size = isSelected ? 38 : 32;
  const border = isSelected ? '3px solid rgba(186,230,253,0.95)' : '2px solid rgba(255,255,255,0.28)';

  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:${size}px;
        height:${size}px;
        border-radius:999px;
        background:${color};
        border:${border};
        display:flex;
        align-items:center;
        justify-content:center;
        box-shadow:0 14px 34px rgba(2,8,23,0.45);
        font-size:${isSelected ? 18 : 16}px;
      ">${emoji}</div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

function MapViewport({ positions, selectedPosition }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(positions, { padding: [50, 50], maxZoom: 5 });
      return;
    }

    if (selectedPosition) {
      map.setView(selectedPosition, 5);
      return;
    }

    map.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
  }, [map, positions, selectedPosition]);

  return null;
}

function FilterPill({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'border-sky-400/60 bg-sky-500/20 text-sky-300'
          : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

function FilterSection({ title, open, onToggle, children }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-md">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-slate-100">{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {open ? <div className="flex flex-wrap gap-2 border-t border-white/[0.08] px-4 py-4">{children}</div> : null}
    </section>
  );
}

function LegendPill({ color, label }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-300">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusClasses(status)}`}>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getStatusColor(status) }} />
      {formatStatusLabel(status)}
    </span>
  );
}

function StatCard({ label, value, valueClassName }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold tracking-tight ${valueClassName}`}>{value}</p>
    </div>
  );
}

function LiveMapPage() {
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState('');
  const [activeTab, setActiveTab] = useState('list');
  const [mapView, setMapView] = useState('all');
  const [selectedCargoId, setSelectedCargoId] = useState(null);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [statusFilters, setStatusFilters] = useState([]);
  const [transportFilters, setTransportFilters] = useState([]);
  const [priorityFilters, setPriorityFilters] = useState([]);
  const [openSections, setOpenSections] = useState({
    status: true,
    transport: true,
    priority: true
  });

  const cargoQuery = useQuery({
    queryKey: ['cargo-live-map-list'],
    queryFn: async () => (await getAllCargo({ limit: 100 })).data,
    retry: 0,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false
  });

  const branchesQuery = useQuery({
    queryKey: ['cargo-live-map-branches'],
    queryFn: async () => (await api.get('/api/v1/setup/branches?limit=200')).data,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const tripsQuery = useQuery({
    queryKey: ['live-map-ongoing-trips'],
    queryFn: async () => (await api.get('/api/trips', { params: { status: 'ongoing', limit: 100 } })).data,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false
  });

  const apiCargo = useMemo(() => getCollection(cargoQuery.data), [cargoQuery.data]);
  const cargoList = useMemo(() => apiCargo, [apiCargo]);

  const branches = useMemo(() => {
    const apiBranches = getCollection(branchesQuery.data);
    const mergedBranches = new Map();

    apiBranches.forEach((branch) => {
      mergedBranches.set(Number(branch.branch_id), branch);
    });

    return Array.from(mergedBranches.values());
  }, [branchesQuery.data]);

  const branchMap = useMemo(() => {
    return new Map(branches.map((branch) => [Number(branch.branch_id), branch]));
  }, [branches]);

  const ongoingTrips = useMemo(() => getCollection(tripsQuery.data), [tripsQuery.data]);

  const tripMarkers = useMemo(() => {
    return ongoingTrips.map((trip) => ({
      ...trip,
      tripLabel: trip.trip_no || `TRP${trip.trip_id}`,
      position: getTripPosition(trip, branchMap),
      icon: getTripMarkerIcon(trip.cargo_count ?? 0, Number(trip.trip_id) === Number(selectedTripId))
    }));
  }, [branchMap, ongoingTrips, selectedTripId]);

  const selectedTrip = useMemo(
    () => ongoingTrips.find((trip) => Number(trip.trip_id) === Number(selectedTripId)) || null,
    [ongoingTrips, selectedTripId]
  );

  const enrichedCargo = useMemo(() => {
    return cargoList.map((item) => {
      const trackingNumber = getTrackingNumber(item);
      const fromBranchName = getBranchName(branchMap, item?.from_branch_id, item?.from_branch_name);
      const toBranchName = getBranchName(branchMap, item?.to_branch_id, item?.to_branch_name);
      const originCoords = getBranchCoordinates(branchMap, item?.from_branch_id);
      const destinationCoords = getBranchCoordinates(branchMap, item?.to_branch_id);
      const currentPosition = getMidpoint(originCoords, destinationCoords);

      return {
        ...item,
        trackingNumber,
        displayStatus: getStatusValue(item),
        transportType: inferTransportType(item),
        priority: inferPriority(item),
        providerName: getProviderName(item),
        etaDate: estimateEtaDate(item),
        fromBranchName,
        toBranchName,
        routeLabel: `${fromBranchName} -> ${toBranchName}`,
        originCoords,
        destinationCoords,
        currentPosition,
        routePoints: [originCoords, currentPosition, destinationCoords]
      };
    });
  }, [branchMap, cargoList]);

  const filteredCargo = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    return enrichedCargo.filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        item.trackingNumber.toLowerCase().includes(normalizedSearch) ||
        item.routeLabel.toLowerCase().includes(normalizedSearch);

      const matchesStatus = !statusFilters.length || statusFilters.includes(normalizeStatus(item.displayStatus));
      const matchesTransport = !transportFilters.length || transportFilters.includes(normalizeLabel(item.transportType));
      const matchesPriority = !priorityFilters.length || priorityFilters.includes(normalizeLabel(item.priority));

      return matchesSearch && matchesStatus && matchesTransport && matchesPriority;
    });
  }, [enrichedCargo, priorityFilters, searchValue, statusFilters, transportFilters]);

  useEffect(() => {
    if (!filteredCargo.length) {
      setSelectedCargoId(null);
      return;
    }

    const selectedStillVisible = filteredCargo.some((item) => Number(item.cargo_id) === Number(selectedCargoId));

    if (!selectedStillVisible) {
      setSelectedCargoId(filteredCargo[0].cargo_id);
    }
  }, [filteredCargo, selectedCargoId]);

  const selectedShipment = useMemo(() => {
    return filteredCargo.find((item) => Number(item.cargo_id) === Number(selectedCargoId))
      || enrichedCargo.find((item) => Number(item.cargo_id) === Number(selectedCargoId))
      || null;
  }, [enrichedCargo, filteredCargo, selectedCargoId]);

  const selectedCargoQuery = useQuery({
    queryKey: ['cargo-live-map-detail', selectedCargoId],
    enabled: Number(selectedCargoId) > 0,
    queryFn: async () => {
      try {
        const [detailResponse, itemsResponse] = await Promise.all([
          getCargoById(selectedCargoId),
          api.get(`/api/cargo/${selectedCargoId}/items`)
        ]);

        return {
          detail: unwrapPayload(detailResponse.data),
          items: getCollection(itemsResponse.data)
        };
      } catch (error) {
        console.error('Selected cargo API error:', error?.response?.status, error?.response?.data, error?.message);
        return null;
      }
    },
    retry: 0,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false
  });

  const detailSource = selectedCargoQuery.data?.detail || selectedShipment;
  const detailItems = selectedCargoQuery.data?.items || selectedShipment?.items || [];
  const detailFromBranchName = detailSource?.from_branch_name || selectedShipment?.fromBranchName || '--';
  const detailToBranchName = detailSource?.to_branch_name || selectedShipment?.toBranchName || '--';

  const shipmentStats = useMemo(() => {
    return enrichedCargo.reduce((accumulator, item) => {
      const normalizedStatus = normalizeStatus(item.displayStatus);
      accumulator.total += 1;

      if (normalizedStatus === 'in_transit') {
        accumulator.inTransit += 1;
      }

      if (normalizedStatus === 'delayed') {
        accumulator.delayed += 1;
      }

      if (normalizedStatus === 'pending') {
        accumulator.pending += 1;
      }

      return accumulator;
    }, {
      total: 0,
      inTransit: 0,
      delayed: 0,
      pending: 0
    });
  }, [enrichedCargo]);

  const markers = useMemo(() => {
    return filteredCargo.map((shipment) => ({
      ...shipment,
      icon: getMarkerIcon(shipment, Number(shipment.cargo_id) === Number(selectedCargoId))
    }));
  }, [filteredCargo, selectedCargoId]);

  const mapPositions = useMemo(() => {
    if (mapView === 'routes') {
      return filteredCargo.flatMap((shipment) => shipment.routePoints);
    }

    return filteredCargo.map((shipment) => shipment.currentPosition);
  }, [filteredCargo, mapView]);

  const selectedPosition = selectedShipment?.currentPosition || null;

  const refreshAll = async () => {
    await Promise.all([
      cargoQuery.refetch(),
      branchesQuery.refetch(),
      tripsQuery.refetch(),
      selectedCargoQuery.refetch()
    ]);
  };

  const toggleFilter = (setter, value) => {
    setter((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-4 bg-[#080e1a] p-3 text-slate-100 md:p-4"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&display=swap');`}</style>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-5 py-5 shadow-[0_24px_70px_rgba(2,8,23,0.35)] backdrop-blur-md">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-3xl font-bold tracking-tight text-slate-50">Live Shipment Map</p>
            <p className="mt-2 max-w-3xl text-sm text-slate-400 md:text-base">
              Track all active shipments in real-time across global logistics networks
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => navigate('/transport/new')}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.06]"
            >
              + Add Transport Provider
            </button>
            <button
              type="button"
              onClick={() => navigate('/cargo/new')}
              className="rounded-2xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
            >
              + New Shipment
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 border-t border-white/[0.08] pt-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total" value={shipmentStats.total} valueClassName="text-slate-50" />
          <StatCard label="In Transit" value={shipmentStats.inTransit} valueClassName="text-sky-300" />
          <StatCard label="Delayed" value={shipmentStats.delayed} valueClassName="text-amber-300" />
          <StatCard label="Pending" value={shipmentStats.pending} valueClassName="text-violet-300" />
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-white/[0.08] pt-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {mapViewOptions.map((option) => {
              const Icon = option.icon;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setMapView(option.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                    mapView === option.id
                      ? 'border-sky-400/60 bg-sky-500/20 text-sky-300'
                      : 'border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-300">
              {filteredCargo.length} shipments
            </span>
            <button
              type="button"
              onClick={refreshAll}
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/[0.06]"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] shadow-[0_20px_60px_rgba(2,8,23,0.25)] backdrop-blur-md">
          <div className="border-b border-white/[0.08] px-4 py-4">
            <label className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#0b1324] px-3 py-3 text-slate-400">
              <Search className="h-4 w-4" />
              <input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search shipments..."
                className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
            </label>
          </div>

          <div className="space-y-3 border-b border-white/[0.08] px-4 py-4">
            <FilterSection
              title="Status"
              open={openSections.status}
              onToggle={() => setOpenSections((current) => ({ ...current, status: !current.status }))}
            >
              {statusOptions.map((option) => (
                <FilterPill
                  key={option}
                  label={option}
                  active={statusFilters.includes(normalizeLabel(option))}
                  onClick={() => toggleFilter(setStatusFilters, normalizeLabel(option))}
                />
              ))}
            </FilterSection>

            <FilterSection
              title="Transport Type"
              open={openSections.transport}
              onToggle={() => setOpenSections((current) => ({ ...current, transport: !current.transport }))}
            >
              {transportOptions.map((option) => (
                <FilterPill
                  key={option}
                  label={option}
                  active={transportFilters.includes(normalizeLabel(option))}
                  onClick={() => toggleFilter(setTransportFilters, normalizeLabel(option))}
                />
              ))}
            </FilterSection>

            <FilterSection
              title="Priority"
              open={openSections.priority}
              onToggle={() => setOpenSections((current) => ({ ...current, priority: !current.priority }))}
            >
              {priorityOptions.map((option) => (
                <FilterPill
                  key={option}
                  label={option}
                  active={priorityFilters.includes(normalizeLabel(option))}
                  onClick={() => toggleFilter(setPriorityFilters, normalizeLabel(option))}
                />
              ))}
            </FilterSection>
          </div>

          <div className="flex border-b border-white/[0.08] px-2 py-2">
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                activeTab === 'list'
                  ? 'bg-sky-500/20 text-sky-300 shadow-[0_0_0_1px_rgba(56,189,248,0.3)]'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Shipment List
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                activeTab === 'details'
                  ? 'bg-sky-500/20 text-sky-300 shadow-[0_0_0_1px_rgba(56,189,248,0.3)]'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Details
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {activeTab === 'list' ? (
              <div className="space-y-3">
                {cargoQuery.isLoading ? (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-sm text-slate-400">
                    Loading shipments...
                  </div>
                ) : null}

                {cargoQuery.isError ? (
                  <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100">
                    {getApiErrorMessage(cargoQuery.error, 'Unable to load shipments.')}
                  </div>
                ) : null}

                {!cargoQuery.isLoading && !cargoQuery.isError && !filteredCargo.length ? (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-sm text-slate-400">
                    No shipments match the active filters.
                  </div>
                ) : null}

                {filteredCargo.map((shipment) => {
                  const TransportIcon = getTransportIcon(shipment.transportType);
                  const isSelected = Number(shipment.cargo_id) === Number(selectedCargoId);

                  return (
                    <button
                      key={shipment.cargo_id}
                      type="button"
                      onClick={() => {
                        setSelectedCargoId(shipment.cargo_id);
                        setActiveTab('details');
                      }}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        isSelected
                          ? 'border-sky-400/60 bg-white/[0.06] shadow-[0_0_0_1px_rgba(56,189,248,0.3),0_20px_50px_rgba(14,165,233,0.14)]'
                          : 'border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                          isSelected ? 'bg-sky-500/15 text-sky-200' : 'bg-[#0b1324] text-sky-300'
                        }`}>
                          <TransportIcon className="h-4 w-4" />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-base font-bold tracking-tight text-slate-50">{shipment.trackingNumber}</p>
                            <StatusBadge status={shipment.displayStatus} />
                          </div>

                          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                            <span>{shipment.transportType}</span>
                            <span className="text-slate-600">•</span>
                            <span>{shipment.priority}</span>
                          </div>
                        </div>
                      </div>

                      <p className="mt-3 break-words text-sm font-medium text-slate-100">
                        {shipment.fromBranchName} <span className="px-1 text-slate-500">-&gt;</span> {shipment.toBranchName}
                      </p>

                      <div className="mt-3 grid grid-cols-[1fr_auto] gap-3 text-xs text-slate-300">
                        <span className="truncate rounded-xl bg-[#0b1324] px-2.5 py-2 text-left">{shipment.providerName}</span>
                        <span className="rounded-xl bg-[#0b1324] px-2.5 py-2 text-right">ETA {formatDate(shipment.etaDate)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4">
                {!selectedShipment ? (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-sm text-slate-400">
                    Select a shipment to view details.
                  </div>
                ) : null}

                {selectedShipment ? (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 shadow-[0_20px_60px_rgba(2,8,23,0.3)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Tracking Number</p>
                        <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-50">{selectedShipment.trackingNumber}</h2>
                        <p className="mt-2 text-sm text-slate-300">
                          {selectedShipment.transportType} • {selectedShipment.priority}
                        </p>
                      </div>
                      <StatusBadge status={detailSource?.status_name || selectedShipment.displayStatus} />
                    </div>

                    <div className="mt-5 grid gap-3 text-sm text-slate-300">
                      <div className="rounded-2xl border border-white/[0.08] bg-[#0b1324] p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Route</p>
                        <p className="mt-2 break-words text-base font-semibold text-slate-50">
                          {detailFromBranchName} <span className="px-1 text-slate-500">-&gt;</span> {detailToBranchName}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/[0.08] bg-[#0b1324] p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Weight</p>
                          <p className="mt-2 text-base font-semibold text-slate-50">{formatWeight(detailSource?.weight || selectedShipment.weight)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/[0.08] bg-[#0b1324] p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Price</p>
                          <p className="mt-2 text-base font-semibold text-slate-50">{formatPrice(detailSource?.price || selectedShipment.price)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/[0.08] bg-[#0b1324] p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Created Date</p>
                          <p className="mt-2 text-base font-semibold text-slate-50">{formatDate(detailSource?.created_at || selectedShipment.created_at)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/[0.08] bg-[#0b1324] p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Provider</p>
                          <p className="mt-2 text-base font-semibold text-slate-50">{selectedShipment.providerName}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5">
                      <div className="mb-3 flex items-center gap-2">
                        <Package2 className="h-4 w-4 text-sky-300" />
                        <h3 className="text-sm font-semibold text-slate-50">Cargo Items</h3>
                      </div>

                      {selectedCargoQuery.isLoading ? (
                        <div className="rounded-2xl border border-white/[0.08] bg-[#0b1324] p-3 text-sm text-slate-400">
                          Loading item details...
                        </div>
                      ) : null}

                      {!selectedCargoQuery.isLoading && !detailItems.length ? (
                        <div className="rounded-2xl border border-white/[0.08] bg-[#0b1324] p-3 text-sm text-slate-400">
                          No cargo items available for this shipment.
                        </div>
                      ) : null}

                      <div className="space-y-3">
                        {detailItems.map((item) => (
                          <div
                            key={item.item_id || `${item.item_name}-${item.quantity}`}
                            className="rounded-2xl border border-white/[0.08] bg-[#0b1324] p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-slate-100">{item.item_name || 'Unnamed item'}</p>
                              <span className="text-xs text-slate-400">Qty {item.quantity || 1}</span>
                            </div>
                            <p className="mt-2 text-sm text-slate-300">{formatWeight(item.weight)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </aside>

        <section className="relative min-h-[460px] overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] shadow-[0_30px_80px_rgba(2,8,23,0.45)]">
          <MapContainer
            center={DEFAULT_MAP_CENTER}
            zoom={DEFAULT_MAP_ZOOM}
            scrollWheelZoom
            className="h-full w-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            <MapViewport positions={mapPositions} selectedPosition={selectedPosition} />

            {mapView === 'routes'
              ? filteredCargo.map((shipment) => (
                  <Polyline
                    key={`route-${shipment.cargo_id}`}
                    positions={shipment.routePoints}
                    pathOptions={{
                      color: getStatusColor(shipment.displayStatus),
                      weight: Number(shipment.cargo_id) === Number(selectedCargoId) ? 5 : 3,
                      dashArray: '6 4',
                      opacity: Number(shipment.cargo_id) === Number(selectedCargoId) ? 0.92 : 0.58
                    }}
                  />
                ))
              : null}

            {markers.map((shipment) => (
              <Marker
                key={shipment.cargo_id}
                position={shipment.currentPosition}
                icon={shipment.icon}
                eventHandlers={{
                  click: () => {
                    setSelectedTripId(null);
                    setSelectedCargoId(shipment.cargo_id);
                    setActiveTab('details');
                  }
                }}
              />
            ))}

            {tripMarkers.map((trip) => (
              <Marker
                key={`trip-${trip.trip_id}`}
                position={trip.position}
                icon={trip.icon}
                eventHandlers={{
                  click: () => {
                    setSelectedCargoId(null);
                    setSelectedTripId(trip.trip_id);
                  }
                }}
              />
            ))}
          </MapContainer>

          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-3 p-4 md:flex-row md:justify-between">
            <div className="pointer-events-auto max-w-sm rounded-2xl border border-white/[0.08] bg-[#080e1a]/90 p-4 shadow-2xl backdrop-blur-md">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Live Operations Map</p>
              <h2 className="mt-2 text-xl font-bold text-slate-50">
                {selectedTrip
                  ? selectedTrip.trip_no || `TRP${selectedTrip.trip_id}`
                  : selectedShipment
                    ? selectedShipment.trackingNumber
                    : 'No selection'}
              </h2>
              <p className="mt-2 text-sm text-slate-300">
                {selectedTrip
                  ? `${selectedTrip.route || 'Route unavailable'} · ${selectedTrip.cargo_count ?? 0} cargo`
                  : selectedShipment
                    ? `${selectedShipment.fromBranchName} -> ${selectedShipment.toBranchName}`
                    : 'Select a shipment or trip marker on the map.'}
              </p>
              {selectedTrip ? (
                <p className="mt-2 text-xs text-slate-400">
                  Departure: {formatDate(selectedTrip.trip_date)}
                </p>
              ) : null}
            </div>

            <div className="pointer-events-auto self-start rounded-2xl border border-white/[0.08] bg-[#080e1a]/90 p-4 shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500">
                <CalendarDays className="h-4 w-4" />
                ETA
              </div>
              <p className="mt-2 text-lg font-bold text-slate-50">{formatDate(selectedShipment?.etaDate)}</p>
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-300">
                <Activity className="h-4 w-4 text-sky-300" />
                <span>{filteredCargo.length} shipments · {ongoingTrips.length} ongoing trips</span>
              </div>
            </div>
          </div>

          <div className="pointer-events-auto absolute bottom-4 right-4 z-[500] w-[260px] rounded-2xl border border-white/[0.08] bg-[#080e1a]/90 p-4 shadow-2xl backdrop-blur-md">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Legend</p>

            <div className="mt-3 space-y-2">
              <LegendPill color="#38bdf8" label="In Transit" />
              <LegendPill color="#34d399" label="Delivered" />
              <LegendPill color="#f59e0b" label="Delayed" />
              <LegendPill color="#a78bfa" label="Pending" />
              <LegendPill color="#fb7185" label="Returned" />
            </div>

            <div className="mt-4 border-t border-white/[0.08] pt-3">
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                <span>Air</span>
                <span>Sea</span>
                <span>Road</span>
                <span>Rail</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default LiveMapPage;
