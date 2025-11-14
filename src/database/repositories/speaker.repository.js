// src/database/repositories/speaker.repository.js
import { query } from '../query.js';

export class SpeakerRepository {
  /**
   * Adds or updates a speaker for a proposal.
   * @param {object} speaker The speaker object.
   */
  static async upsert(speaker) {
    await query(`
      INSERT INTO speakers (proposalId, userId, type, displayName, registeredAt)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (proposalId, userId) DO UPDATE SET
        type = EXCLUDED.type,
        displayName = EXCLUDED.displayName,
        registeredAt = EXCLUDED.registeredAt
    `, [
      speaker.proposalId, speaker.userId, speaker.type,
      speaker.displayName, speaker.registeredAt
    ]);
  }

  /**
   * Gets all speakers for a proposal.
   * @param {string} proposalId The proposal ID.
   * @returns {Promise<Array<object>>}
   */
  static async findByProposalId(proposalId) {
    const result = await query(
      'SELECT * FROM speakers WHERE proposalId = $1 ORDER BY registeredAt ASC',
      [proposalId]
    );
    return result.rows;
  }

  /**
   * Removes a speaker from a proposal.
   * @param {string} proposalId The proposal ID.
   * @param {string} userId The user ID.
   */
  static async remove(proposalId, userId) {
    await query(
      'DELETE FROM speakers WHERE proposalId = $1 AND userId = $2',
      [proposalId, userId]
    );
  }
}
