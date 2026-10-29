import axios from './axios';

async function fetchAllCargoPages(params = {}) {
  const limit = Number(params.limit) > 0 ? Number(params.limit) : 100;
  let page = 1;
  let pages = 1;
  const rows = [];

  while (page <= pages) {
    const response = await axios.get('/api/cargo', {
      params: {
        ...params,
        page,
        limit
      }
    });
    const payload = response?.data ?? {};
    const data = Array.isArray(payload?.data) ? payload.data : [];
    const meta = payload?.meta ?? {};

    rows.push(...data);
    pages = Number(meta.pages) > 0 ? Number(meta.pages) : 1;
    page += 1;
  }

  return {
    data: {
      success: true,
      data: rows,
      meta: {
        page: 1,
        limit,
        total: rows.length,
        pages: 1
      }
    }
  };
}

export const getAllCustomers = (params) => axios.get('/api/customers', { params });
export const getCustomerById = (id) => axios.get(`/api/customers/${id}`);
export const createCustomer = (data) => axios.post('/api/customers', data);
export const updateCustomer = (id, data) => axios.put(`/api/customers/${id}`, data);
export const deleteCustomer = (id) => axios.delete(`/api/customers/${id}`);
export const getCustomerCargo = async (id, params) => {
  try {
    return await axios.get(`/api/v1/customers/${id}/cargo`, { params });
  } catch (error) {
    if (error?.response?.status && error.response.status !== 404) {
      throw error;
    }

    return fetchAllCargoPages(params);
  }
};
