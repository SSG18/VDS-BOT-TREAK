// src/database/repositories/meeting.repository.js
import { query } from '../query.js';
import { client as redisClient } from '../redis.js';

const CACHE_TTL_SECONDS = 3600; // 1 hour

/**
 * Generates a consistent cache key for a meeting.
 * @param {string} id The meeting ID.
 * @returns {string} The Redis cache key.
 */
const getCacheKey = (id) => `meeting:${id}`;

export class MeetingRepository {
  /**
   * Creates a new meeting.
   * @param {object} meeting The meeting object.
   */
  static async create(meeting) {
    await query(`
      INSERT INTO meetings 
      (id, title, chamber, meetingDate, channelId, messageId, threadId, createdAt, durationMs, expiresAt, open, quorum, totalMembers, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      meeting.id, meeting.title, meeting.chamber, meeting.meetingDate,
      meeting.channelId, meeting.messageId, meeting.threadId, meeting.createdAt, meeting.durationMs,
      meeting.expiresAt, meeting.open, meeting.quorum, meeting.totalMembers, meeting.status
    ]);
  }

  /**
   * Updates a meeting with the given data and invalidates cache.
   * @param {string} id The meeting ID.
   * @param {object} updates An object containing the fields to update.
   */
  static async update(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      // A simple whitelist to prevent arbitrary field updates
      const allowedFields = ['title', 'meetingDate', 'channelId', 'messageId', 'threadId', 'durationMs', 'expiresAt', 'open', 'quorum', 'totalMembers', 'status'];
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (fields.length === 0) {
      throw new Error('No valid fields to update.');
    }

    values.push(id);
    await query(
      `UPDATE meetings SET ${fields.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    try {
      await redisClient.del(getCacheKey(id));
    } catch (e) {
      console.error("❌ Redis DEL error:", e);
    }
  }

  /**
   * Finds a meeting by its ID, with caching.
   * @param {string} id The meeting ID.
   * @returns {Promise<object|null>}
   */
  static async findById(id) {
    const cacheKey = getCacheKey(id);
    try {
      const cachedMeeting = await redisClient.get(cacheKey);
      if (cachedMeeting) {
        return JSON.parse(cachedMeeting);
      }
    } catch (e) {
      console.error("❌ Redis GET error:", e);
    }

    const result = await query('SELECT * FROM meetings WHERE id = $1', [id]);
    const meeting = result.rows[0] || null;

    if (meeting) {
      try {
        await redisClient.set(cacheKey, JSON.stringify(meeting), { EX: CACHE_TTL_SECONDS });
      } catch (e) {
        console.error("❌ Redis SET error:", e);
      }
    }

    return meeting;
  }

  /**
   * Gets all meetings.
   * @returns {Promise<Array<object>>}
   */
  static async getAll() {
    const result = await query('SELECT * FROM meetings ORDER BY createdAt DESC');
    return result.rows;
  }

  /**
   * Gets all open meetings.
   * @returns {Promise<Array<object>>}
   */
  static async getOpenMeetings() {
    const result = await query('SELECT * FROM meetings WHERE open = TRUE');
    return result.rows;
  }
  
  /**
   * Gets all active (open or in voting) meetings.
   * @returns {Promise<Array<object>>}
   */
  static async getActiveMeetings() {
    const result = await query(`SELECT * FROM meetings WHERE open = TRUE OR status = 'voting'`);
    return result.rows;
  }

  /**
   * Gets the last meeting for a specific chamber.
   * @param {string} chamber The chamber ID.
   * @returns {Promise<object|null>}
   */
  static async getLastByChamber(chamber) {
    const result = await query('SELECT * FROM meetings WHERE chamber = $1 ORDER BY createdAt DESC LIMIT 1', [chamber]);
    return result.rows[0] || null;
  }

  /**
   * Closes a meeting and invalidates cache.
   * @param {string} id The meeting ID.
   */
  static async close(id) {
    await this.update(id, { open: false });
    // Invalidation is handled by update()
  }

  // --- Meeting Registrations ---

  /**
   * Registers a user for a meeting.
   * @param {string} meetingId The meeting ID.
   * @param {string} userId The user ID.
   */
  static async registerUser(meetingId, userId) {
    await query(`
      INSERT INTO meeting_registrations (meetingId, userId, registeredAt)
      VALUES ($1, $2, $3)
      ON CONFLICT (meetingId, userId) DO NOTHING
    `, [meetingId, userId, Date.now()]);
  }

  /**
   * Gets all user IDs registered for a meeting.
   * @param {string} meetingId The meeting ID.
   * @returns {Promise<Array<{userId: string}>>}
   */
  static async getRegistrations(meetingId) {
    const result = await query('SELECT userId FROM meeting_registrations WHERE meetingId = $1', [meetingId]);
    return result.rows;
  }

  /**
   * Checks if a user is registered for a meeting.
   * @param {string} meetingId The meeting ID.
   * @param {string} userId The user ID.
   * @returns {Promise<boolean>}
   */
  static async isUserRegistered(meetingId, userId) {
    const result = await query('SELECT 1 FROM meeting_registrations WHERE meetingId = $1 AND userId = $2', [meetingId, userId]);
    return result.rows.length > 0;
  }

  /**
   * Gets the registration count for a meeting.
   * @param {string} meetingId The meeting ID.
   * @returns {Promise<number>}
   */
  static async getRegistrationCount(meetingId) {
    const result = await query('SELECT COUNT(*) as count FROM meeting_registrations WHERE meetingId = $1', [meetingId]);
    return parseInt(result.rows[0].count, 10) || 0;
  }

  /**
   * Gets the registration time for a user at a meeting.
   * @param {string} meetingId The meeting ID.
   * @param {string} userId The user ID.
   * @returns {Promise<bigint|null>}
   */
  static async getRegistrationTime(meetingId, userId) {
    const result = await query('SELECT registeredAt FROM meeting_registrations WHERE meetingId = $1 AND userId = $2', [meetingId, userId]);
    return result.rows[0]?.registeredat || null;
  }
}
