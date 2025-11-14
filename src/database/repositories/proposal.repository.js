// src/database/repositories/proposal.repository.js
import { query } from '../query.js';
import { client as redisClient } from '../redis.js';

const CACHE_TTL_SECONDS = 3600; // 1 hour

/**
 * Generates a consistent cache key for a proposal.
 * @param {string} id The proposal ID.
 * @returns {string} The Redis cache key.
 */
const getCacheKey = (id) => `proposal:${id}`;

export class ProposalRepository {
  /**
   * Retrieves the next proposal number for a given chamber and increments the counter.
   * @param {string} chamber The chamber ID.
   * @returns {Promise<string>} The next proposal number.
   */
  static async getNextProposalNumber(chamber) {
    try {
      let result = await query(
        'UPDATE chamber_counters SET value = value + 1 WHERE chamberId = $1 RETURNING value',
        [chamber]
      );
      
      if (result.rows.length === 0) {
        await query(
          'INSERT INTO chamber_counters (chamberId, value) VALUES ($1, 1) ON CONFLICT (chamberId) DO NOTHING',
          [chamber]
        );
        result = await query(
          'UPDATE chamber_counters SET value = value + 1 WHERE chamberId = $1 RETURNING value',
          [chamber]
        );
      }
      
      if (result.rows.length === 0) {
        console.warn(`⚠️ Could not get counter for chamber ${chamber}, using default value`);
        const number = '001';
        const prefix = chamber === 'sf' ? 'СФ' : 'ГД';
        return `${prefix}-${number}`;
      }
      
      const number = String(result.rows[0].value).padStart(3, '0');
      const prefix = chamber === 'sf' ? 'СФ' : 'ГД';
      return `${prefix}-${number}`;
    } catch (error) {
      console.error('❌ Error in getNextProposalNumber:', error);
      const number = '001';
      const prefix = chamber === 'sf' ? 'СФ' : 'ГД';
      return `${prefix}-${number}`;
    }
  }

  /**
   * Checks if a proposal exists.
   * @param {string} proposalId The ID of the proposal.
   * @returns {Promise<boolean>}
   */
  static async proposalExists(proposalId) {
    const result = await query('SELECT 1 FROM proposals WHERE id = $1 LIMIT 1', [proposalId]);
    return result.rows.length > 0;
  }

  /**
   * Creates a new proposal.
   * @param {object} proposal The proposal object.
   */
  static async create(proposal) {
    const eventsString = JSON.stringify(proposal.events || []);
    
    await query(`
      INSERT INTO proposals (
        id, number, name, party, link, chamber, status, createdAt, 
        authorId, threadId, channelId, speakersMessageId, historyMessageId, initialMessageId,
        isQuantitative, parentProposalId, events
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    `, [
      proposal.id, proposal.number, proposal.name, proposal.party, proposal.link,
      proposal.chamber, proposal.status, proposal.createdAt, proposal.authorId,
      proposal.threadId || null, proposal.channelId || null, 
      proposal.speakersMessageId || null, proposal.historyMessageId || null,
      proposal.initialMessageId || null, proposal.isQuantitative || false,
      proposal.parentProposalId || null, eventsString
    ]);
  }

  /**
   * Finds a proposal by its ID, with caching.
   * @param {string} id The proposal ID.
   * @returns {Promise<object|null>}
   */
  static async findById(id) {
    const cacheKey = getCacheKey(id);
    try {
      const cachedProposal = await redisClient.get(cacheKey);
      if (cachedProposal) {
        return JSON.parse(cachedProposal);
      }
    } catch (e) {
      console.error("❌ Redis GET error:", e);
    }

    const result = await query('SELECT * FROM proposals WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    
    const proposal = result.rows[0];
    proposal.events = proposal.events || [];

    try {
      await redisClient.set(cacheKey, JSON.stringify(proposal), { EX: CACHE_TTL_SECONDS });
    } catch (e) {
      console.error("❌ Redis SET error:", e);
    }

    return proposal;
  }

  /**
   * Finds a proposal by its number.
   * @param {string} number The proposal number.
   * @returns {Promise<object|null>}
   */
  static async findByNumber(number) {
    // This method is less frequently used for hot paths, so caching is omitted for now.
    // Caching by number would require an additional lookup key (number -> id).
    const result = await query('SELECT * FROM proposals WHERE number = $1', [number]);
    if (result.rows.length === 0) return null;
    
    const proposal = result.rows[0];
    proposal.events = proposal.events || [];
    return proposal;
  }

  /**
   * Updates a proposal's events and invalidates cache.
   * @param {string} id The proposal ID.
   * @param {Array<object>} events The events array.
   */
  static async updateEvents(id, events) {
    await query('UPDATE proposals SET events = $1::JSONB WHERE id = $2', [JSON.stringify(events), id]);
    try {
      await redisClient.del(getCacheKey(id));
    } catch (e) {
      console.error("❌ Redis DEL error:", e);
    }
  }

  /**
   * Updates a single field for a proposal and invalidates cache.
   * @param {string} id The proposal ID.
   * @param {string} field The name of the field to update.
   * @param {any} value The new value.
   */
  static async updateField(id, field, value) {
    // Basic validation to prevent SQL injection in field name
    const allowedFields = ['status', 'threadId', 'speakersMessageId', 'historyMessageId', 'initialMessageId', 'channelId'];
    if (!allowedFields.includes(field)) {
      throw new Error(`Invalid field name: ${field}`);
    }
    await query(`UPDATE proposals SET ${field} = $1 WHERE id = $2`, [value, id]);
    try {
      await redisClient.del(getCacheKey(id));
    } catch (e) {
      console.error("❌ Redis DEL error:", e);
    }
  }

  /**
   * Gets all proposals.
   * @returns {Promise<Array<object>>}
   */
  static async getAll() {
    const result = await query('SELECT * FROM proposals ORDER BY createdAt DESC');
    return result.rows.map(p => ({ ...p, events: p.events || [] }));
  }

  /**
   * Gets all proposals for a specific chamber.
   * @param {string} chamber The chamber ID.
   * @returns {Promise<Array<object>>}
   */
  static async findByChamber(chamber) {
    const result = await query('SELECT * FROM proposals WHERE chamber = $1 ORDER BY createdAt DESC', [chamber]);
    return result.rows.map(p => ({ ...p, events: p.events || [] }));
  }

  /**
   * Deletes a proposal by its ID and invalidates cache.
   * @param {string} id The proposal ID.
   */
  static async delete(id) {
    await query('DELETE FROM proposals WHERE id = $1', [id]);
    try {
      await redisClient.del(getCacheKey(id));
    } catch (e) {
      console.error("❌ Redis DEL error:", e);
    }
  }

  // --- Quantitative Items ---

  /**
   * Adds a quantitative voting item to a proposal.
   * @param {object} item The item to add.
   */
  static async addQuantitativeItem(item) {
    await query(
      'INSERT INTO quantitative_items (proposalId, itemIndex, text) VALUES ($1, $2, $3)',
      [item.proposalId, item.itemIndex, item.text]
    );
  }

  /**
   * Gets all quantitative items for a proposal.
   * @param {string} proposalId The proposal ID.
   * @returns {Promise<Array<object>>}
   */
  static async getQuantitativeItems(proposalId) {
    const result = await query('SELECT * FROM quantitative_items WHERE proposalId = $1 ORDER BY itemIndex', [proposalId]);
    return result.rows;
  }
}
