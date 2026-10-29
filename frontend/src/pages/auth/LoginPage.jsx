import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  Eye,
  EyeOff,
  HelpCircle,
  Lock,
  Moon,
  PackageCheck,
  ShieldCheck,
  Sun,
  Truck,
  UserCircle2
} from 'lucide-react';
import { login as loginApi } from '../../api/auth.api';
import useAuth from '../../hooks/useAuth';
import { getDefaultRoute } from '../../config/rbac';

const featureHighlights = [
  { icon: Truck, title: 'Transport network', description: 'Monitor third-party transport providers and shipment activity.' },
  { icon: PackageCheck, title: 'Cargo operations', description: 'Track shipments, payments, and branch transfers in one place.' },
  { icon: ShieldCheck, title: 'Secure access', description: 'Role-based branch access for operational teams.' }
];

function LoginPage() {
  const [formState, setFormState] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  const loginMutation = useMutation({
    mutationFn: loginApi,
    onSuccess: (response) => {
      const payload = response?.data?.data ?? {};
      // eslint-disable-next-line no-console
      console.debug('[LoginPage] login onSuccess response', response);
      const token = payload.token || '';
      const user = payload.user || null;
      const roleId = user?.role_id ?? null;
      const branchId = payload.branch_id ?? payload.branch_id ?? user?.branch_id ?? null;
      const branchName = payload.activeBranchName ?? user?.branch_name ?? null;
      const uBrId = payload.user_branch_id ?? user?.user_branch_id ?? null;
      setAuth(user, token, branchId, branchName, uBrId);
      navigate(getDefaultRoute(roleId));
      toast.success(`Welcome back, ${user?.name || 'User'}!`);
    },
    onError: (error) => {
      // eslint-disable-next-line no-console
      console.error('[LoginPage] login error', error);
      toast.error(error?.response?.data?.message || 'Invalid credentials.');
    }
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      username: formState.username.trim(),
      password: formState.password
    };

    if (!payload.username || !payload.password) {
      toast.error('Please fill in all fields.');
      return;
    }
    loginMutation.mutate(payload);
  };

  const theme = isDarkMode
    ? {
        page: 'bg-[#030b16] text-white',
        overlay:
          'bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(37,99,235,0.18),_transparent_22%),radial-gradient(circle_at_bottom_left,_rgba(8,145,178,0.12),_transparent_26%),linear-gradient(180deg,_#06101d_0%,_#08111f_42%,_#02060d_100%)]',
        orbA: 'bg-cyan-400/12',
        orbB: 'bg-blue-500/12',
        orbC: 'bg-sky-500/12',
        leftCard: 'border-white/10 bg-[linear-gradient(165deg,rgba(13,28,45,0.92)_0%,rgba(9,20,34,0.88)_100%)] shadow-[0_30px_90px_rgba(0,0,0,0.42)]',
        rightCard: 'border-cyan-400/10 bg-[linear-gradient(180deg,rgba(8,18,31,0.96)_0%,rgba(5,12,22,0.98)_100%)] shadow-[0_35px_100px_rgba(0,0,0,0.48)]',
        pill: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200',
        title: 'text-white',
        soft: 'text-slate-400',
        stat: 'border-white/10 bg-white/[0.03]',
        statText: 'text-white',
        panelNote: 'border-white/10 bg-gradient-to-r from-cyan-400/10 to-blue-500/10',
        inputWrap: 'border-white/10 bg-[#0b1727] focus-within:border-cyan-400/60 focus-within:ring-cyan-400/10',
        inputIcon: 'text-slate-500',
        inputText: 'text-white placeholder:text-slate-500',
        help: 'text-cyan-300 hover:text-cyan-200',
        button: 'from-cyan-400 via-sky-400 to-blue-500 text-slate-950 shadow-[0_18px_40px_rgba(34,211,238,0.28)] hover:shadow-[0_24px_50px_rgba(34,211,238,0.34)]',
        footer: 'border-white/10 bg-white/[0.03]',
        footerText: 'text-slate-400',
        toggle: 'border-white/10 bg-white/[0.06] text-slate-100 hover:bg-white/[0.1]'
      }
    : {
        page: 'bg-[#edf4fb] text-slate-900',
        overlay:
          'bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.13),_transparent_22%),radial-gradient(circle_at_bottom_left,_rgba(125,211,252,0.14),_transparent_24%),linear-gradient(180deg,_#f8fbff_0%,_#eef5fb_48%,_#e7eef7_100%)]',
        orbA: 'bg-cyan-200/50',
        orbB: 'bg-blue-200/40',
        orbC: 'bg-sky-200/45',
        leftCard: 'border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] shadow-[0_30px_90px_rgba(15,23,42,0.12)]',
        rightCard: 'border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f9fbfd_100%)] shadow-[0_35px_100px_rgba(15,23,42,0.14)]',
        pill: 'border-sky-200 bg-sky-50 text-sky-700',
        title: 'text-[#173a63]',
        soft: 'text-[#6f86a5]',
        stat: 'border-slate-200 bg-slate-50',
        statText: 'text-[#173a63]',
        panelNote: 'border-slate-200 bg-gradient-to-r from-sky-50 to-blue-50',
        inputWrap: 'border-slate-200 bg-slate-50 focus-within:border-sky-500 focus-within:ring-sky-500/10',
        inputIcon: 'text-slate-400',
        inputText: 'text-slate-900 placeholder:text-slate-400',
        help: 'text-sky-700 hover:text-sky-800',
        button: 'from-cyan-400 via-sky-500 to-blue-600 text-white shadow-[0_18px_40px_rgba(14,165,233,0.22)] hover:shadow-[0_24px_50px_rgba(14,165,233,0.28)]',
        footer: 'border-slate-200 bg-slate-50',
        footerText: 'text-slate-500',
        toggle: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      };

  return (
    <>
      <style>
        {`
          @keyframes loginFadeUp {
            from {
              opacity: 0;
              transform: translateY(22px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes ambientFloat {
            0%, 100% {
              transform: translate3d(0, 0, 0) scale(1);
            }
            50% {
              transform: translate3d(0, -10px, 0) scale(1.04);
            }
          }

          .login-fade-up {
            animation: loginFadeUp 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          .login-fade-delay {
            animation: loginFadeUp 850ms cubic-bezier(0.22, 1, 0.36, 1) both;
            animation-delay: 120ms;
          }

          .ambient-orb {
            animation: ambientFloat 9s ease-in-out infinite;
          }
        `}
      </style>

      <div className={`relative h-screen overflow-hidden transition-colors duration-300 ${theme.page}`}>
        <div className={`absolute inset-0 ${theme.overlay}`} />
        <div className={`ambient-orb absolute left-[-7rem] top-[10%] h-72 w-72 rounded-full blur-3xl ${theme.orbA}`} />
        <div className={`ambient-orb absolute right-[-5rem] top-[18%] h-80 w-80 rounded-full blur-3xl ${theme.orbB}`} />
        <div className={`ambient-orb absolute bottom-[-8rem] left-[25%] h-96 w-96 rounded-full blur-3xl ${theme.orbC}`} />

        <button
          type="button"
          onClick={() => setIsDarkMode((prev) => !prev)}
          className={`absolute right-5 top-5 z-20 flex h-11 w-11 items-center justify-center rounded-full border transition ${theme.toggle}`}
          aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        <main className="relative z-10 flex h-screen w-full overflow-hidden">
          <div className="grid h-full w-full grid-cols-1 lg:grid-cols-2">
            <section className={`login-fade-up h-full overflow-y-auto border-b border-r-0 p-5 backdrop-blur-2xl sm:p-7 lg:border-b-0 lg:border-r lg:p-8 xl:p-10 ${theme.leftCard}`}>
              <div className="flex h-full flex-col justify-between gap-8">
                <div>
                  <div className={`inline-flex items-center gap-3 rounded-full border px-4 py-2 text-sm font-medium ${theme.pill}`}>
                    <span className="h-2 w-2 rounded-full bg-current" />
                    Cargo Management Platform
                  </div>

                  <div className="mt-8 flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/10 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                      <Truck className="h-8 w-8 text-cyan-300" />
                    </div>
                    <div>
                      <h1 className={`text-3xl font-semibold tracking-tight sm:text-4xl ${theme.title}`}>
                        Waafi Cargo
                      </h1>
                      <p className={`mt-1 text-sm ${theme.soft}`}>
                        Enterprise dashboard access for logistics and branch operations.
                      </p>
                    </div>
                  </div>

                  <div className="mt-10 max-w-3xl">
                    <h2 className={`max-w-2xl text-4xl font-semibold leading-tight sm:text-[2.8rem] xl:text-[3.35rem] xl:leading-[1.02] ${theme.title}`}>
                      Built for branch teams that manage cargo at scale.
                    </h2>
                    <p className={`mt-5 max-w-2xl text-base leading-7 ${theme.soft}`}>
                      A cleaner web dashboard for shipment tracking, branch coordination, and secure
                      operational access. The layout is optimized for desktop use while staying
                      responsive on smaller screens.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {featureHighlights.map(({ icon: Icon, title, description }) => (
                    <div key={title} className={`rounded-[22px] border p-5 xl:min-h-[180px] ${theme.stat}`}>
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300">
                        <Icon className="h-5 w-5" />
                      </div>
                      <p className={`mt-5 text-lg font-semibold ${theme.statText}`}>{title}</p>
                      <p className={`mt-2 text-sm leading-6 ${theme.soft}`}>{description}</p>
                    </div>
                  ))}
                </div>

                <div className={`grid gap-4 rounded-[22px] border p-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-end ${theme.panelNote}`}>
                  <div>
                    <p className="text-sm font-medium text-cyan-300">Prepared by Abdulaahi Jimcaale</p>
                    <p className={`mt-2 text-sm leading-6 ${theme.soft}`}>
                      Secure access layer connected for cargo records, branch activity, and live
                      operations management.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/80">Workspace</p>
                      <p className={`mt-2 text-sm font-medium ${theme.title}`}>Desktop-first layout</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/80">Security</p>
                      <p className={`mt-2 text-sm font-medium ${theme.title}`}>Encrypted session control</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="login-fade-delay flex h-full overflow-y-auto">
              <div className={`flex h-full w-full border-l-0 p-5 backdrop-blur-2xl sm:p-7 lg:border-l lg:p-8 xl:p-10 ${theme.rightCard}`}>
                <div className="mx-auto flex h-full w-full max-w-[500px] flex-col justify-center">
                  <div className="mb-8">
                    <div className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] ${theme.soft}`}>
                      Sign In
                    </div>
                    <h3 className={`mt-5 text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem] ${theme.title}`}>
                      Sign in to continue
                    </h3>
                    <p className={`mt-3 max-w-xl text-base leading-7 ${theme.soft}`}>
                      Access your cargo dashboard, customer records, and branch workflows with your
                      authorized account.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className={`rounded-[20px] border px-4 transition duration-200 focus-within:ring-4 ${theme.inputWrap}`}>
                      <div className="flex items-center gap-3">
                        <UserCircle2 className={`h-5 w-5 ${theme.inputIcon}`} />
                        <input
                          id="username"
                          name="username"
                          type="text"
                          value={formState.username}
                          onChange={handleChange}
                          placeholder="Enter username"
                          autoComplete="username"
                          className={`h-14 w-full border-0 bg-transparent text-base outline-none ${theme.inputText}`}
                        />
                      </div>
                    </div>

                    <div className={`rounded-[20px] border px-4 transition duration-200 focus-within:ring-4 ${theme.inputWrap}`}>
                      <div className="flex items-center gap-3">
                        <Lock className={`h-5 w-5 ${theme.inputIcon}`} />
                        <input
                          id="password"
                          name="password"
                          type={showPassword ? 'text' : 'password'}
                          value={formState.password}
                          onChange={handleChange}
                          placeholder="Enter password"
                          autoComplete="current-password"
                          className={`h-14 w-full border-0 bg-transparent text-base outline-none ${theme.inputText}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className={`rounded-xl p-1 transition ${theme.inputIcon} hover:text-cyan-300`}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <label className={`flex items-center gap-3 text-sm ${theme.soft}`}>
                        <input
                          type="checkbox"
                          checked={remember}
                          onChange={(e) => setRemember(e.target.checked)}
                          className="h-4 w-4 rounded border-white/20 bg-transparent text-cyan-400 focus:ring-cyan-400"
                        />
                        Remember me
                      </label>

                      <button
                        type="button"
                        className={`inline-flex items-center gap-2 text-sm font-medium transition ${theme.help}`}
                      >
                        <HelpCircle className="h-4 w-4" />
                        Need help signing in?
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={loginMutation.isPending}
                      className={`group flex h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-gradient-to-r text-base font-semibold transition duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 ${theme.button}`}
                    >
                      {loginMutation.isPending ? 'Signing In...' : 'Sign In'}
                      {!loginMutation.isPending && (
                        <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
                      )}
                    </button>
                  </form>

                  <div className={`mt-6 flex items-center justify-between gap-3 rounded-[18px] border px-4 py-3 ${theme.footer}`}>
                    <span className={`text-sm ${theme.footerText}`}>Encrypted branch and user authentication</span>
                    <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-300">
                      Online
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </>
  );
}

export default LoginPage;
