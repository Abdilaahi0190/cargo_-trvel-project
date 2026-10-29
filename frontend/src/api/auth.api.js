import api from './axios';

export function login({ username, password }) {
  // eslint-disable-next-line no-console
  console.debug('[auth.api] login request', { username });
  return api.post('/api/auth/login', {
    username,
    password
  });
}

export function logout() {
  return api.post('/api/auth/logout');
}

export function refreshToken() {
  return api.post('/api/auth/refresh');
}

export function getProfile() {
  return api.get('/api/auth/me');
}
