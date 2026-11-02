import request from 'supertest';
import { app } from '../app';

describe('Black Box Testing: REST API Endpoints (Testing via HTTP Contract without inspecting internal code)', () => {
  describe('Endpoint: GET /api/v1/health', () => {
    it('should return 200 OK and expected JSON structure', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'online');
      expect(response.body).toHaveProperty('system');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('time');
    });
  });

  describe('Endpoint: GET /api/v1/public/tenant-meta/dimsum-intan', () => {
    it('should return 200 OK and tenant metadata', async () => {
      const response = await request(app)
        .get('/api/v1/public/tenant-meta/dimsum-intan')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.tenant).toBeDefined();
      expect(response.body.tenant.slug).toBe('dimsum-intan');
    });
  });

  describe('Endpoint: POST /api/v1/auth/login (Input Validation)', () => {
    it('should return 400 Bad Request when username or password is missing', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({}) // Empty payload
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Username dan password wajib diisi');
    });

    it('should return 401 Unauthorized for incorrect credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'nonexistent_user_123', password: 'wrongpassword' })
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('salah');
    });
  });

  describe('Endpoint: Protected Routes Authentication Guard', () => {
    it('should return 401 Unauthorized when accessing /api/v1/pos/orders without token', async () => {
      const response = await request(app)
        .get('/api/v1/pos/orders')
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Token otentikasi tidak ditemukan');
    });

    it('should return 401 Unauthorized when accessing /api/v1/superadmin/tenants without token', async () => {
      const response = await request(app)
        .get('/api/v1/superadmin/tenants')
        .expect('Content-Type', /json/)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});
