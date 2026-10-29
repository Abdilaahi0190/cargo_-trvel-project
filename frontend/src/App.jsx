import { Navigate, Route, Routes } from 'react-router-dom';
import AuthLayout from './layouts/AuthLayout';
import DashboardLayout from './layouts/DashboardLayout';
import EmployeePortalLayout from './layouts/EmployeePortalLayout';
import LoginPage from './pages/auth/LoginPage';
import EmployeeDashboardPage from './pages/employee-portal/EmployeeDashboardPage';
import EmployeeProfilePage from './pages/employee-portal/EmployeeProfilePage';
import { ProtectedRoute, RbacGuard, AdminOnlyRoute, EmployeeOnlyRoute } from './hooks/useAuth';
import { getDefaultRoute, ROLES } from './config/rbac';
import useAuthStore from './store/authStore';
import DashboardPage from './pages/dashboard/DashboardPage';
import CargoCreatePage from './pages/cargo/CargoCreatePage';
import CargoDetailPage from './pages/cargo/CargoDetailPage';
import CargoListPage from './pages/cargo/CargoListPage';
import CargoTrackingPage from './pages/cargo/CargoTrackingPage';
import LiveMapPage from './pages/cargo/LiveMapPage';
import CustomerListPage from './pages/customers/CustomerListPage';
import CustomerCreatePage from './pages/customers/CustomerCreatePage';
import CustomerDetailPage from './pages/customers/CustomerDetailPage';
import UsersPage from './pages/users/UsersPage';
import InsurancePage from './pages/insurance/InsurancePage';
import AccountsPage from './pages/accounts/AccountsPage';
import ExpensesPage from './pages/expenses/ExpensesPage';
import TripsPage from './pages/trips/TripsPage';
import DisputesPage from './pages/disputes/DisputesPage';
import ReportsPage from './pages/reports/ReportsPage';
import EmployeesPage from './pages/employees/EmployeesPage';
import SchedulePage from './pages/employees/SchedulePage';
import AttendancePage from './pages/employees/AttendancePage';
import SalaryPage from './pages/salary/SalaryPage';
import TransportPage from './pages/transport/TransportPage';
import InvoicesPage from './pages/invoices/InvoicesPage';
import PaymentsPage from './pages/payments/PaymentsPage';
import SetupPage from './pages/setup/SetupPage';
import NotificationsPage from './pages/notifications/NotificationsPage';

const RootRedirect = () => {
  const user = useAuthStore((state) => state.user);
  return <Navigate to={getDefaultRoute(user?.role_id)} replace />;
};

/** Renders DashboardLayout for Admin, EmployeePortalLayout for Employee. */
function ConditionalLayout() {
  const roleId = useAuthStore((state) => state.user?.role_id ?? null);
  if (roleId === ROLES.ADMIN) return <DashboardLayout />;
  return <EmployeePortalLayout />;
}

function App() {
  return (
    <Routes>
      {/* ── Public auth routes ─────────────────────────────────────────── */}
      <Route path="/login" element={<AuthLayout><LoginPage /></AuthLayout>} />

      {/* ── Admin-only routes ──────────────────────────────────────────── */}
      <Route element={<AdminOnlyRoute />}>
        <Route element={<DashboardLayout />}>
          <Route element={<RbacGuard />}>
            <Route path="/dashboard"   element={<DashboardPage />} />
            <Route path="/users"       element={<UsersPage />} />
            <Route path="/setup"       element={<SetupPage />} />
            <Route path="/live-map"    element={<LiveMapPage />} />
            <Route path="/insurance"   element={<InsurancePage />} />
            <Route path="/disputes"    element={<DisputesPage />} />
            <Route path="/reports"     element={<ReportsPage />} />
            <Route path="/employees"   element={<EmployeesPage />} />
            <Route path="/schedule"    element={<SchedulePage />} />
            <Route path="/attendance"  element={<AttendancePage />} />
            <Route path="/salary"      element={<SalaryPage />} />
            <Route path="/accounts"    element={<AccountsPage />} />
            <Route path="/expenses"    element={<ExpensesPage />} />
            <Route path="/transport"   element={<TransportPage />} />
            <Route path="/transport/new" element={<TransportPage />} />
          </Route>
        </Route>
      </Route>

      {/* ── Employee-only routes ───────────────────────────────────────── */}
      <Route element={<EmployeeOnlyRoute />}>
        <Route element={<EmployeePortalLayout />}>
          <Route element={<RbacGuard />}>
            <Route path="/employee/dashboard" element={<EmployeeDashboardPage />} />
            <Route path="/employee/profile"   element={<EmployeeProfilePage />} />
          </Route>
        </Route>
      </Route>

      {/* ── Shared operational routes — layout chosen by role ─────────── */}
      <Route element={<ProtectedRoute />}>
        <Route element={<ConditionalLayout />}>
          <Route element={<RbacGuard />}>
            <Route path="/cargo"          element={<CargoListPage />} />
            <Route path="/cargo/new"      element={<CargoCreatePage />} />
            <Route path="/cargo/track"    element={<CargoTrackingPage />} />
            <Route path="/cargo/:id"      element={<CargoDetailPage />} />
            <Route path="/customers"      element={<CustomerListPage />} />
            <Route path="/customers/new"  element={<CustomerCreatePage />} />
            <Route path="/customers/:id"  element={<CustomerDetailPage />} />
            <Route path="/payments"       element={<PaymentsPage />} />
            <Route path="/trips"          element={<TripsPage />} />
            <Route path="/invoices"       element={<InvoicesPage />} />
            <Route path="/notifications"  element={<NotificationsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/"  element={<RootRedirect />} />
      <Route path="*"  element={<RootRedirect />} />
    </Routes>
  );
}

export default App;
