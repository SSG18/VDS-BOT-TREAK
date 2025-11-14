// src/database/repositories/vote.repository.js
import { query } from '../query.js';

export class VoteRepository {
  /**
   * Adds or updates a user's vote for a proposal.
   * @param {object} vote The vote object.
   */
  static async upsert(vote) {
    await query(`
      INSERT INTO votes (proposalId, userId, voteType, createdAt, stage)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (proposalId, userId, stage) DO UPDATE SET
        voteType = EXCLUDED.voteType,
        createdAt = EXCLUDED.createdAt
    `, [vote.proposalId, vote.userId, vote.voteType, vote.createdAt, vote.stage || 1]);
  }

  /**
   * Gets the counts of each vote type for a proposal stage.
   * @param {string} proposalId The proposal ID.
   * @param {number} [stage=1] The voting stage.
   * @returns {Promise<Array<{voteType: string, count: string}>>}
   */
  static async getVoteCounts(proposalId, stage = 1) {
    const result = await query(`
      SELECT voteType, COUNT(*) as count 
      FROM votes 
      WHERE proposalId = $1 AND stage = $2
      GROUP BY voteType
    `, [proposalId, stage]);
    return result.rows;
  }

  /**
   * Gets the number of unique voters for a proposal stage.
   * @param {string} proposalId The proposal ID.
   * @param {number} [stage=1] The voting stage.
   * @returns {Promise<number>}
   */
  static async getUniqueVotersCount(proposalId, stage = 1) {
    const result = await query(
      `SELECT COUNT(DISTINCT userId) as count 
       FROM votes 
       WHERE proposalId = $1 AND stage = $2`,
      [proposalId, stage]
    );
    return parseInt(result.rows[0].count, 10) || 0;
  }

  /**
   * Gets all votes for a proposal stage.
   * @param {string} proposalId The proposal ID.
   * @param {number} [stage=1] The voting stage.
   * @param {number} [limit=1000] The maximum number of votes to return.
   * @returns {Promise<Array<object>>}
   */
  static async getVotes(proposalId, stage = 1, limit = 1000) {
    const result = await query(
      'SELECT * FROM votes WHERE proposalId = $1 AND stage = $2 ORDER BY createdAt ASC LIMIT $3',
      [proposalId, stage, limit]
    );
    return result.rows;
  }
}
