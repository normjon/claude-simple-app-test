import request from 'supertest';
import app from './app';
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('POST /user-app/users', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it('should create a user and return 201 with userId', async () => {
    ddbMock.on(PutCommand).resolves({});

    const response = await request(app)
      .post('/user-app/users')
      .send({ email: 'test@example.com', name: 'Test User' });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('userId');
    expect(response.body.email).toBe('test@example.com');
    expect(response.body.name).toBe('Test User');
  });

  it('should return 400 for invalid email format', async () => {
    const response = await request(app)
      .post('/user-app/users')
      .send({ email: 'invalid-email', name: 'Test User' });

    expect(response.status).toBe(400);
  });

  it('should return 400 when email is missing', async () => {
    const response = await request(app)
      .post('/user-app/users')
      .send({ name: 'Test User' });

    expect(response.status).toBe(400);
  });

  it('should return 400 when name is missing', async () => {
    const response = await request(app)
      .post('/user-app/users')
      .send({ email: 'test@example.com' });

    expect(response.status).toBe(400);
  });
});

describe('GET /user-app/users/:id', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it('should return 200 with user details when user exists', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User'
      }
    });

    const response = await request(app).get('/user-app/users/user-123');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      userId: 'user-123',
      email: 'test@example.com',
      name: 'Test User'
    });
  });

  it('should return 404 when user does not exist', async () => {
    ddbMock.on(GetCommand).resolves({});

    const response = await request(app).get('/user-app/users/nonexistent-id');

    expect(response.status).toBe(404);
  });
});

describe('GET /user-app/users (search)', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it('should return matching users when filtering by email', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { userId: 'user-123', email: 'test@example.com', name: 'Test User' }
      ]
    });

    const response = await request(app).get('/user-app/users?email=test@example.com');

    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(1);
    expect(response.body.users[0].email).toBe('test@example.com');
  });

  it('should return matching users when filtering by name', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { userId: 'user-456', email: 'john@example.com', name: 'John Doe' }
      ]
    });

    const response = await request(app).get('/user-app/users?name=John%20Doe');

    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(1);
    expect(response.body.users[0].name).toBe('John Doe');
  });

  it('should return empty array when no users match', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: []
    });

    const response = await request(app).get('/user-app/users?email=nobody@example.com');

    expect(response.status).toBe(200);
    expect(response.body.users).toEqual([]);
  });

  it('should return 400 for unsupported query parameter', async () => {
    const response = await request(app).get('/user-app/users?unknownAttr=value');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Unsupported');
  });

  it('should return 400 when a query parameter value is not a single string', async () => {
    const response = await request(app).get('/user-app/users?email=a&email=b');

    expect(response.status).toBe(400);
  });

  it('should apply a scan limit to prevent unbounded reads', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });

    await request(app).get('/user-app/users');

    const calls = ddbMock.commandCalls(ScanCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.Limit).toBeDefined();
  });

  it('should return matching users when filtering by userId', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { userId: 'user-123', email: 'test@example.com', name: 'Test User' }
      ]
    });

    const response = await request(app).get('/user-app/users?userId=user-123');

    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(1);
    expect(response.body.users[0].userId).toBe('user-123');
  });

  it('should return all users when no query params provided', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { userId: 'user-1', email: 'a@example.com', name: 'User A' },
        { userId: 'user-2', email: 'b@example.com', name: 'User B' }
      ]
    });

    const response = await request(app).get('/user-app/users');

    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(2);
  });
});
