import api from './axios';

export const getDashboardOverview = () => api.get('/api/dashboard/overview');
export const getRecentCargo = () => api.get('/api/cargo?limit=5&page=1');
export const getRecentPayments = () => api.get('/api/payments?limit=100&page=1');
export const getEmployeeCount = () => api.get('/api/employees?limit=1&page=1');
export const getRecentDisputes = () => api.get('/api/v1/disputes?limit=5');
export const getNotifications = () => api.get('/api/v1/notifications?limit=25');
export const getCargoTrends = () => api.get('/api/cargo?system_wide=true&limit=1000&page=1');
