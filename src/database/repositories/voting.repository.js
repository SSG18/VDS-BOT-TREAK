// src/database/repositories/voting.repository.js
import { query } from '../query.js';

export class VotingRepository {
  /**
   * Creates or updates a voting session for a proposal.
   * @param {object} voting The voting object.
   */
  static async upsert(voting) {
    await query(`
      INSERT INTO votings 
      (proposalId, open, startedAt, durationMs, expiresAt, messageId, isSecret, formula, stage, runoffMessageId)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (proposalId) DO UPDATE SET
        open = EXCLUDED.open,
        startedAt = EXCLUDED.startedAt,
        durationMs = EXCLUDED.durationMs,
        expiresAt = EXCLUDED.expiresAt,
        messageId = EXCLUDED.messageId,
        isSecret = EXCLUDED.isSecret,
        formula = EXCLUDED.formula,
        stage = EXCLUDED.stage,
        runoffMessageId = EXCLUDED.runoffMessageId
    `, [
      voting.proposalId, voting.open, voting.startedAt, voting.durationMs,
      voting.expiresAt, voting.messageId, voting.isSecret, voting.formula,
      voting.stage || 1, voting.runoffMessageId || null
    ]);
  }

  /**
   * Ends a voting session.
   * @param {string} proposalId The proposal ID.
   * @param {bigint} endedAt The timestamp when the voting ended.
   */
  static async end(proposalId, endedAt) {
    await query(
      'UPDATE votings SET open = FALSE, endedAt = $1 WHERE proposalId = $2',
      [endedAt, proposalId]
    );
  }

  /**
   * Finds a voting session by proposal ID.
   * @param {string} proposalId The proposal ID.
   * @returns {Promise<object|null>}
   */
  static async findByProposalId(proposalId) {
    const result = await query('SELECT * FROM votings WHERE proposalId = $1', [proposalId]);
    return result.rows[0] || null;
  }

  /**
   * Gets all currently open votings, joined with their proposals.
   * @returns {Promise<Array<object>>}
   */
  static async getOpenVotings() {
    const result = await query(`
      SELECT p.*, v.open, v.startedAt, v.endedAt, v.durationMs, v.expiresAt, 
             v.messageId, v.isSecret, v.formula, v.stage, v.runoffMessageId
      FROM proposals p 
      JOIN votings v ON p.id = v.proposalId 
      WHERE v.open = TRUE
    `);
    return result.rows;
  }
}
