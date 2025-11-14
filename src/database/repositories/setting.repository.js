// src/database/repositories/setting.repository.js
import { query } from '../query.js';

export class SettingRepository {
  /**
   * Gets a bot setting by its key.
   * @param {string} key The setting key.
   * @returns {Promise<string|null>}
   */
  static async get(key) {
    const result = await query('SELECT value FROM bot_settings WHERE key = $1', [key]);
    return result.rows[0]?.value || null;
  }

  /**
   * Creates or updates a bot setting.
   * @param {string} key The setting key.
   * @param {string} value The setting value.
   */
  static async set(key, value) {
    await query(`
      INSERT INTO bot_settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value
    `, [key, value]);
  }
}
