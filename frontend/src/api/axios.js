import axios from 'axios';
import useAuthStore from '../store/authStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || ''
});

api.interceptors.request.use((config) => {
  const state = useAuthStore.getState();
  const branchId = state.branchId || localStorage.getItem('wc_branch_id');
  const userBranchId = state.uBrId || localStorage.getItem('wc_u_br_id');
  const token = localStorage.getItem('wc_token');

  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (branchId && config.headers) {
    config.headers['x-branch-id'] = branchId;
  }

  if (userBranchId && config.headers) {
    config.headers['x-u-branch-id'] = userBranchId;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url || '';

    // Do not perform global logout redirect for auth endpoints (login/refresh)
    const isAuthEndpoint = url.includes('/api/auth/login') || url.includes('/api/auth/refresh');

    if (status === 401 && !isAuthEndpoint) {
      localStorage.removeItem('wc_token');
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export default api;
