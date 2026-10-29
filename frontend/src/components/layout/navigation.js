import {
  AlertCircle,
  BarChart3,
  Bell,
  CalendarCheck,
  CalendarDays,
  CreditCard,
  DollarSign,
  FileText,
  LayoutDashboard,
  Map,
  Package,
  Receipt,
  Route,
  Search,
  Settings,
  Settings2,
  Shield,
  Truck,
  UserCheck,
  UserCog,
  Users,
  Wallet
} from 'lucide-react';

// ─── Role IDs ────────────────────────────────────────────────────────────────
// 1 = Admin | 2 = Employee

export const ROLE_INFO = {
  1: {
    title:    'System Admin',
    short:    'Admin',
    gradient: 'from-cyan-500 to-blue-600',
    dot:      'bg-cyan-400',
    badge:    'bg-cyan-500/20 text-cyan-300 ring-cyan-500/30'
  },
  2: {
    title:    'Employee',
    short:    'Staff',
    gradient: 'from-violet-500 to-purple-600',
    dot:      'bg-violet-400',
    badge:    'bg-violet-500/20 text-violet-300 ring-violet-500/30'
  }
};

// ─── Navigation sections (Admin only — DashboardLayout is role=1 exclusively) ─
export const navigationSections = [
  // ── Dashboard ─────────────────────────────────────────────────────────────
  {
    label: 'Dashboard',
    icon:  LayoutDashboard,
    items: [
      {
        label: 'Overview',
        path: '/dashboard',
        icon: LayoutDashboard,
        roles: [1],
        privilege: 'dashboard.view'
      },
      {
        label: 'Live Shipment Map',
        path: '/live-map',
        icon: Map,
        roles: [1],
        privilege: 'shipments.view'
      }
    ]
  },

  // ── Shipments ─────────────────────────────────────────────────────────────
  {
    label: 'Shipments',
    icon:  Package,
    items: [
      {
        label: 'All Cargo',
        path: '/cargo',
        icon: Package,
        roles: [1],
        privilege: 'shipments.view'
      },
      {
        label: 'Track Shipment',
        path: '/cargo/track',
        icon: Search,
        roles: [1],
        privilege: 'tracking.view'
      },
      {
        label: 'Cargo Insurance',
        path: '/insurance',
        icon: Shield,
        roles: [1],
        privilege: 'settings.manage'
      }
    ]
  },

  // ── Clients ───────────────────────────────────────────────────────────────
  {
    label: 'Clients',
    icon:  Users,
    items: [
      {
        label: 'Customers',
        path: '/customers',
        icon: Users,
        roles: [1],
        privilege: 'customers.view'
      }
    ]
  },

  // ── Operations ────────────────────────────────────────────────────────────
  {
    label: 'Operations',
    icon:  Settings2,
    items: [
      {
        label: 'Employees',
        path: '/employees',
        icon: UserCheck,
        roles: [1],
        privilege: 'employees.view'
      },
      {
        label: 'Work Schedules',
        path: '/schedule',
        icon: CalendarDays,
        roles: [1],
        privilege: 'hr.manage'
      },
      {
        label: 'Attendance',
        path: '/attendance',
        icon: CalendarCheck,
        roles: [1],
        privilege: 'hr.manage'
      },
      {
        label: 'Branches & Setup',
        path: '/setup',
        icon: Settings,
        roles: [1],
        privilege: 'branches.view'
      },
      {
        label: 'Transport',
        path: '/transport',
        icon: Truck,
        roles: [1],
        privilege: 'settings.manage'
      },
      {
        label: 'Trips',
        path: '/trips',
        icon: Route,
        roles: [1],
        privilege: 'trips.view'
      }
    ]
  },

  // ── Finance ───────────────────────────────────────────────────────────────
  {
    label: 'Finance',
    icon:  Wallet,
    items: [
      {
        label: 'Accounts',
        path: '/accounts',
        icon: Wallet,
        roles: [1],
        privilege: 'accounts.manage'
      },
      {
        label: 'Payments',
        path: '/payments',
        icon: CreditCard,
        roles: [1],
        privilege: 'payments.view'
      },
      {
        label: 'Expenses',
        path: '/expenses',
        icon: Receipt,
        roles: [1],
        privilege: 'expenses.manage'
      },
      {
        label: 'Invoices',
        path: '/invoices',
        icon: FileText,
        roles: [1],
        privilege: 'invoices.view'
      },
      {
        label: 'Salary',
        path: '/salary',
        icon: DollarSign,
        roles: [1],
        privilege: 'salary.view'
      }
    ]
  },

  // ── Admin tools — flat (no accordion header) ──────────────────────────────
  {
    label: 'Admin',
    icon:  BarChart3,
    flat:  true,
    items: [
      {
        label: 'Reports',
        path: '/reports',
        icon: BarChart3,
        roles: [1],
        privilege: 'reports.view'
      },
      {
        label: 'User Management',
        path: '/users',
        icon: UserCog,
        roles: [1],
        privilege: 'users.manage'
      },
      {
        label: 'Disputes',
        path: '/disputes',
        icon: AlertCircle,
        roles: [1],
        privilege: 'invoices.view'
      },
      {
        label: 'Notifications',
        path: '/notifications',
        icon: Bell,
        roles: [1],
        privilege: 'dashboard.view'
      }
    ]
  }
];

export const navigationItems = navigationSections.flatMap((s) => s.items);

export function getPageTitle(pathname) {
  if (pathname.startsWith('/cargo/track')) return 'Track Shipment';
  if (pathname === '/cargo/new')           return 'Create Cargo';
  if (pathname.startsWith('/cargo/'))      return 'Cargo Details';
  if (pathname.startsWith('/customers/'))  return 'Customer Details';
  if (pathname === '/schedule')            return 'Work Schedules';
  if (pathname === '/attendance')          return 'Attendance';
  return navigationItems.find((item) => item.path === pathname)?.label ?? 'Dashboard';
}
