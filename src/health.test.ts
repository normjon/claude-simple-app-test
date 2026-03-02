import request from 'supertest';
import app from './app';

describe('GET /user-app/health', () => {
  it('should return 200 with status and timestamp', async () => {
    const response = await request(app).get('/user-app/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('timestamp');
    expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
  });

  it('should return application/json content type', async () => {
    const response = await request(app).get('/user-app/health');

    expect(response.headers['content-type']).toMatch(/application\/json/);
  });
});
