// src/database/query.js
import pool from './pool.js';

/**
 * Executes a SQL query against the database pool.
 * @param {string} text The SQL query text.
 * @param {Array<any>} [params] The parameters for the query.
 * @returns {Promise<import('pg').QueryResult<any>>} The result of the query.
 */
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.log(`🐌 Slow query (${duration}ms):`, { text, params });
    }
    return res;
  } catch (error) {
    console.error('❌ Query error:', { error, text, params });
    throw error;
  }
}
