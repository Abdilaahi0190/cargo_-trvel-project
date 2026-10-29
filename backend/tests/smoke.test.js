/**
 * Minimal regression smoke suite for the core operational path: login -> cargo ->
 * payments -> reports. Deliberately read-only (GET requests only) so it is safe to run
 * against the real database — there is no separate test database in this project.
 *
 * Run with: npm test
 */
const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');

const ADMIN_CREDENTIALS = { username: 'admin', password: 'admin123' };

let token;
let branchId;

afterAll(async () => {
  await pool.end();
});

describe('Auth', () => {
  test('POST /api/auth/login succeeds with valid admin credentials', async () => {
    const res = await request(app).post('/api/auth/login').send(ADMIN_CREDENTIALS);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user.role_id).toBe(1);

    token = res.body.data.token;
    branchId = res.body.data.branch_id;
  });

  test('POST /api/auth/login rejects invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('protected route rejects requests without a token', async () => {
    const res = await request(app).get('/api/cargo');
    expect(res.status).toBe(401);
  });
});

describe('Core workflow (authenticated)', () => {
  test('GET /api/cargo lists shipments', async () => {
    const res = await request(app)
      .get('/api/cargo')
      .set('Authorization', `Bearer ${token}`)
      .set('x-branch-id', String(branchId));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('GET /api/customers lists customers', async () => {
    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .set('x-branch-id', String(branchId));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('GET /api/payments lists payments', async () => {
    const res = await request(app)
      .get('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .set('x-branch-id', String(branchId));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('GET /api/v1/transport/providers lists transport providers with entity_type', async () => {
    const res = await request(app)
      .get('/api/v1/transport/providers')
      .set('Authorization', `Bearer ${token}`)
      .set('x-branch-id', String(branchId));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('GET /api/reports/summary returns revenue/expense/profit figures', async () => {
    const res = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${token}`)
      .set('x-branch-id', String(branchId));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('GET /api/reports/outstanding-balances returns data', async () => {
    const res = await request(app)
      .get('/api/reports/outstanding-balances')
      .set('Authorization', `Bearer ${token}`)
      .set('x-branch-id', String(branchId));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('GET /api/reports/revenue/by-provider returns transport-provider revenue breakdown', async () => {
    const res = await request(app)
      .get('/api/reports/revenue/by-provider')
      .set('Authorization', `Bearer ${token}`)
      .set('x-branch-id', String(branchId));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Removed privilege subsystem stays removed', () => {
  test('GET /api/v1/users/privileges/branch/1 no longer exists', async () => {
    const res = await request(app)
      .get('/api/v1/users/privileges/branch/1')
      .set('Authorization', `Bearer ${token}`)
      .set('x-branch-id', String(branchId));

    expect(res.status).toBe(404);
  });
});

describe('User creation (regression for the users.email column bug)', () => {
  let createdUserId;

  afterAll(async () => {
    if (createdUserId) {
      await request(app)
        .delete(`/api/v1/users/${createdUserId}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-branch-id', String(branchId));
    }
  });

  test('POST /api/v1/users creates an employee without a schema error', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .set('x-branch-id', String(branchId))
      .send({
        name: 'Smoke Test User',
        username: `smoke_test_${Date.now()}`,
        password: 'SmokeTest#2026!',
        role_id: 2,
        state: 'active',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user_id).toEqual(expect.any(Number));

    createdUserId = res.body.data.user_id;
  });
});
