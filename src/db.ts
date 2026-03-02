import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const clientConfig: ConstructorParameters<typeof DynamoDBClient>[0] = {};

if (process.env.DYNAMODB_ENDPOINT) {
  clientConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
  clientConfig.region = process.env.AWS_REGION || 'us-east-1';
  clientConfig.credentials = {
    accessKeyId: 'local',
    secretAccessKey: 'local'
  };
}

const client = new DynamoDBClient(clientConfig);
export const docClient = DynamoDBDocumentClient.from(client);

export const TABLE_NAME = process.env.TABLE_NAME || 'app-users';
