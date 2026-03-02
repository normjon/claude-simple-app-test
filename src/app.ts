import express, { Application, Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { PutCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from './db';

const app: Application = express();
const router: Router = express.Router();
const BASE_PATH = process.env.APP_BASE_PATH || '';

app.use(express.json());

// Health check endpoint
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Permitted filter attributes — kept explicit to prevent attribute enumeration
const ALLOWED_FILTER_ATTRS = ['userId', 'email', 'name'];

// Cap items evaluated per scan to limit read-capacity consumption
const MAX_SCAN_LIMIT = 100;

// Search users endpoint
router.get('/users', async (req: Request, res: Response) => {
  try {
    const queryParams = req.query;
    const filterKeys = Object.keys(queryParams);

    // Validate query parameters
    for (const key of filterKeys) {
      if (!ALLOWED_FILTER_ATTRS.includes(key)) {
        res.status(400).json({ error: `Unsupported query parameter: ${key}` });
        return;
      }
      if (typeof queryParams[key] !== 'string') {
        res.status(400).json({ error: `Query parameter "${key}" must be a single value` });
        return;
      }
    }

    // Build filter expression for DynamoDB Scan
    const expressionParts: string[] = [];
    const expressionValues: Record<string, string> = {};
    const expressionNames: Record<string, string> = {};

    filterKeys.forEach((key, index) => {
      const placeholder = `:val${index}`;
      const namePlaceholder = `#attr${index}`;
      expressionParts.push(`${namePlaceholder} = ${placeholder}`);
      expressionValues[placeholder] = queryParams[key] as string;
      expressionNames[namePlaceholder] = key;
    });

    const scanParams: {
      TableName: string;
      Limit: number;
      FilterExpression?: string;
      ExpressionAttributeValues?: Record<string, string>;
      ExpressionAttributeNames?: Record<string, string>;
    } = {
      TableName: TABLE_NAME,
      Limit: MAX_SCAN_LIMIT
    };

    if (expressionParts.length > 0) {
      scanParams.FilterExpression = expressionParts.join(' AND ');
      scanParams.ExpressionAttributeValues = expressionValues;
      scanParams.ExpressionAttributeNames = expressionNames;
    }

    const result = await docClient.send(new ScanCommand(scanParams));

    const users = (result.Items || []).map(item => ({
      userId: item.userId,
      email: item.email,
      name: item.name
    }));

    res.json({ users });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'Failed to search users',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }));
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create user endpoint
router.post('/users', async (req: Request, res: Response) => {
  try {
    const { email, name } = req.body;

    // Validate required fields
    if (!email || !name) {
      res.status(400).json({ error: 'Email and name are required' });
      return;
    }

    // Validate email format
    if (!EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    const userId = randomUUID();

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { userId, email, name }
    }));

    res.status(201).json({ userId, email, name });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'Failed to create user',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }));
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user endpoint
router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { userId: id }
    }));

    if (!result.Item) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      userId: result.Item.userId,
      email: result.Item.email,
      name: result.Item.name
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'Failed to get user',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }));
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use(BASE_PATH, router);

export default app;
