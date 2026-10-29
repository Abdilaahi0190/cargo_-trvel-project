import { create } from 'zustand';

const storedToken = typeof window !== 'undefined' ? localStorage.getItem('wc_token') : null;
const storedBranchId = typeof window !== 'undefined' ? localStorage.getItem('wc_branch_id') : null;
const storedBranchName = typeof window !== 'undefined' ? localStorage.getItem('wc_branch_name') : null;
const storedUserBranchId = typeof window !== 'undefined' ? localStorage.getItem('wc_u_br_id') : null;
const storedUser = typeof window !== 'undefined' ? localStorage.getItem('wc_user') : null;

const useAuthStore = create((set) => ({
  user: storedUser ? JSON.parse(storedUser) : null,
  token: storedToken,
  branchId: storedBranchId ? Number(storedBranchId) : null,
  branchName: storedBranchName || null,
  uBrId: storedUserBranchId ? Number(storedUserBranchId) : null,
  isAuthenticated: !!storedToken,
  setAuth: (user, token, branchId, branchName, uBrId) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('wc_user', JSON.stringify(user || null));
      localStorage.setItem('wc_token', token);
      localStorage.setItem('wc_branch_id', String(branchId));
      if (uBrId != null) {
        localStorage.setItem('wc_u_br_id', String(uBrId));
      } else {
        localStorage.removeItem('wc_u_br_id');
      }
      if (branchName) {
        localStorage.setItem('wc_branch_name', branchName);
      } else {
        localStorage.removeItem('wc_branch_name');
      }
    }

    set({ user, token, branchId, branchName: branchName || null, uBrId: uBrId ?? null, isAuthenticated: true });
  },
  clearAuth: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('wc_user');
      localStorage.removeItem('wc_token');
      localStorage.removeItem('wc_branch_id');
      localStorage.removeItem('wc_branch_name');
      localStorage.removeItem('wc_u_br_id');
    }

    set({ user: null, token: null, branchId: null, branchName: null, uBrId: null, isAuthenticated: false });
  }
}));

export default useAuthStore;
