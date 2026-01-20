import Redis from 'ioredis';
import { logger } from '../../utils/logger.js';
import dotenv from 'dotenv';
dotenv.config();
export class CacheConnector {
  private client: Redis | null = null;

  constructor() {
    const url: string | undefined = process.env.REDIS_URL || process.env.REDIS_CONNECTION_URL;
    if (!url) {
      return;
    }

    const useTls = process.env.REDIS_USE_TLS === 'true' || url.startsWith('rediss://');
    const client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      tls: useTls ? {} : undefined
    });
    client.on('error', (err: unknown) => {
      // Avoid throwing to not crash the process; health checks will report status
      logger.error(err, ` Redis error `);
    });

    this.client = client;
  }

  public async connect(): Promise<void> {
    if (!this.client) return;
    if (this.client.status === 'wait') {
      await this.client.connect();
      logger.info('💾 Redis connected');
    }
  }

  public isConnected(): boolean {
    return this.client !== null && this.client.status === 'ready';
  }

  public async disconnect(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
    this.client = null;
  }

  public async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const res = await this.client.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }

  public async getNumber(key: string): Promise<number | null> {
    if (!this.client) return null;
    const value = await this.client.get(key);
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  /**
   * Incrementa un contador de forma atómica. Si la clave no existe, la inicializa.
   * @param key - Clave de Redis
   * @param increment - Cantidad a incrementar (puede ser negativo para decrementar)
   * @param expirationSeconds - Tiempo de expiración en segundos (solo se aplica si la clave no existía)
   * @returns El nuevo valor después del incremento
   */
  public async incrementNumber(key: string, increment: number, expirationSeconds?: number): Promise<number> {
    if (!this.client) return 0;
    const newValue = await this.client.incrby(key, Math.floor(increment));
    if (expirationSeconds && expirationSeconds > 0) {
      const ttl = await this.client.ttl(key);
      // ttl = -1 significa que la clave existe pero no tiene expiración
      if (ttl === -1) {
        await this.client.expire(key, expirationSeconds);
      }
    }

    return newValue;
  }

  /**
   * Incrementa un contador hasta el final del mes actual.
   * Útil para trackear consumo mensual de tokens.
   * @param key - Clave de Redis (ej: "user:123:tokens")
   * @param increment - Cantidad de tokens a sumar
   * @returns El nuevo total de tokens
   */
  public async incrementNumberUntilEndOfMonth(key: string, increment: number): Promise<number> {
    const ttlSeconds = this.secondsUntilEndOfCurrentMonth();
    return await this.incrementNumber(key, increment, ttlSeconds);
  }

  private secondsUntilEndOfCurrentMonth(): number {
    // Expire at the last minute (23:59:59) of the current month
    const now = new Date();
    const startNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(startNextMonth.getTime() - 1000);
    const diffMs = endOfMonth.getTime() - now.getTime();
    return Math.max(1, Math.floor(diffMs / 1000));
  }
}

export const CacheClient = new CacheConnector();
