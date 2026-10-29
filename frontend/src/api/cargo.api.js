import axios from './axios';
import rawAxios from 'axios';

export const getAllCargo = (params) => axios.get('/api/cargo', { params });
export const getCargoById = (id) => axios.get(`/api/cargo/${id}`);
export const createCargo = (data) => axios.post('/api/cargo', data);
export const updateCargo       = (id, data) => axios.put(`/api/cargo/${id}`, data);
export const updateCargoStatus = (id, data) => axios.put(`/api/cargo/${id}/status`, data);
export const getCargoTracking = (id) => axios.get(`/api/cargo/${id}/timeline`);
export const getCargoItems = (id) => axios.get(`/api/cargo/${id}/items`);
export const getCargoByTrackingNumber = (trackingNumber) =>
  rawAxios.get(`${import.meta.env.VITE_API_URL || ''}/api/cargo/track/${trackingNumber}`);
