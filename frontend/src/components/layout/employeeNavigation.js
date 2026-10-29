import {
  BarChart3,
  Bell,
  CreditCard,
  FileText,
  LayoutDashboard,
  Package,
  Route,
  Search,
  UserCheck,
  UserCircle
} from 'lucide-react';

export const employeeNavigationSections = [
  {
    label: 'Workspace',
    flat: true,
    items: [
      { label: 'Dashboard',   path: '/employee/dashboard', icon: LayoutDashboard },
      { label: 'My Profile',  path: '/employee/profile',   icon: UserCircle }
    ]
  },
  {
    label: 'Cargo',
    icon: Package,
    items: [
      { label: 'All Cargo',       path: '/cargo',       icon: Package,  privilege: 'shipments.view' },
      { label: 'Track Shipment',  path: '/cargo/track', icon: Search,   privilege: 'tracking.view' }
    ]
  },
  {
    label: 'Clients',
    icon: UserCheck,
    items: [
      { label: 'Customers', path: '/customers', icon: UserCheck, privilege: 'customers.view' }
    ]
  },
  {
    label: 'Finance',
    icon: CreditCard,
    items: [
      { label: 'Payments', path: '/payments', icon: CreditCard, privilege: 'payments.view' },
      { label: 'Invoices', path: '/invoices', icon: FileText,   privilege: 'invoices.view' }
    ]
  },
  {
    label: 'Operations',
    icon: Route,
    items: [
      { label: 'Trips', path: '/trips', icon: Route, privilege: 'trips.view' }
    ]
  },
  {
    label: 'More',
    flat: true,
    items: [
      { label: 'Notifications', path: '/notifications', icon: Bell,     privilege: 'dashboard.view' },
      { label: 'Reports',       path: '/reports',       icon: BarChart3, privilege: 'reports.view' }
    ]
  }
];

export const employeeNavigationItems = employeeNavigationSections.flatMap((s) => s.items);

export function getEmployeePageTitle(pathname) {
  if (pathname === '/employee/dashboard') return 'Dashboard';
  if (pathname === '/employee/profile')   return 'My Profile';
  if (pathname.startsWith('/cargo/track')) return 'Track Shipment';
  if (pathname === '/cargo/new')           return 'New Cargo';
  if (pathname.startsWith('/cargo/'))      return 'Cargo Details';
  if (pathname === '/customers/new')       return 'New Customer';
  if (pathname.startsWith('/customers/'))  return 'Customer Details';
  return employeeNavigationItems.find((item) => item.path === pathname)?.label ?? 'Portal';
}
