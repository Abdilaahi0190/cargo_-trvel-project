import axios from './axios';

export const getProviders = (params) => axios.get('/api/v1/transport/providers', { params });
export const getProvider = (id) => axios.get(`/api/v1/transport/providers/${id}`);
export const createProvider = (data) => axios.post('/api/v1/transport/providers', data);
export const updateProvider = (id, data) => axios.put(`/api/v1/transport/providers/${id}`, data);
export const deleteProvider = (id) => axios.delete(`/api/v1/transport/providers/${id}`);
