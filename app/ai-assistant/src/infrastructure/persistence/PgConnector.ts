import { Pool, PoolClient } from 'pg';
import { logger } from '../../utils/logger.js';
import dotenv from 'dotenv';
dotenv.config();

export class PgConnector {
  private static instance: PgConnector;
  private pool: Pool | null = null;

  private constructor() {}

  public static getInstance(): PgConnector {
    if (!PgConnector.instance) {
      PgConnector.instance = new PgConnector();
    }
    return PgConnector.instance;
  }

  public async initialize(): Promise<void> {
    if (this.pool) {
      logger.warn('PostgreSQL pool already initialized');
      return;
    }

    const config = {
      host: process.env.PG_HOST,
      port: parseInt(process.env.PG_PORT || '5432'),
      database: process.env.PG_DATABASE,
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 75,
      min: 1,
      maxUses: 7500,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 10_000
    };

    // Check that all required environment variables are present
    if (!config.host || !config.database || !config.user || !config.password) {
      logger.warn('PostgreSQL environment variables not fully configured. Connection pool not initialized.');
      return;
    }

    this.pool = new Pool(config);

    // Handle pool errors
    this.pool.on('error', (err: Error) => {
      logger.error(err, 'Unexpected error in PostgreSQL pool');
    });

    // Log when a client connects
    // this.pool.on('connect', () => {
    //   logger.debug('New client connected to PostgreSQL');
    // });

    // // Log when a client disconnects
    // this.pool.on('remove', () => {
    //   logger.debug('Client disconnected from PostgreSQL');
    // });

    // Test connection
    try {
      await this.query('SELECT NOW()');
      logger.info('PostgreSQL pool initialized successfully');
    } catch (error) {
      logger.error(error, 'Error initializing PostgreSQL pool');
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.pool) return;

    try {
      await this.pool.end();
      this.pool = null;
      logger.info('PostgreSQL pool disconnected');
    } catch (error) {
      logger.error(error, 'Error disconnecting PostgreSQL pool');
    }
  }

  public async ping(): Promise<boolean> {
    if (!this.pool) return false;

    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch (error) {
      logger.error(error, 'Error in PostgreSQL ping');
      return false;
    }
  }

  public async query(text: string, params?: any[]): Promise<any> {
    if (!this.pool) {
      throw new Error('PostgreSQL pool not initialized');
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  public isConnected(): boolean {
    return this.pool !== null;
  }
}

export const PgClient = PgConnector.getInstance();
