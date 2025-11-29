import pkg from 'pg';
const { Pool } = pkg;

class CongressDatabase {
  constructor() {
    this.pool = new Pool({
      user: process.env.DB_USER || 'bot_user',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'congress_bot',
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT || 5432,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.initialized = false;
    this.init().catch(err => {
      console.error('❌ DB init failed:', err);
    });
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    try {
      await this.createTables();
      console.log('✅ Database initialized successfully');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
    }
  }

  async query(text, params) {
    if (!this.initialized) {
      await this.init();
    }

    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      if (duration > 1000) {
        console.log(`🐌 Slow query (${duration}ms):`, text.substring(0, 100));
      }
      return res;
    } catch (error) {
      console.error('❌ Query error:', error.message, text.substring(0, 120), params);
      if (error.code === '42P01') {
        console.log('🔄 Table missing, attempting to reinitialize.');
        try {
          await this.createTables();
          const res = await this.pool.query(text, params);
          return res;
        } catch (reinitError) {
          console.error('❌ Reinitialization failed:', reinitError);
        }
      }
      throw error;
    }
  }

  async createTables() {
    console.log('🔄 Creating database tables (DDL via pool.query)...');

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chamber_counters (
        chamberId TEXT PRIMARY KEY,
        value INTEGER NOT NULL DEFAULT 1
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        number TEXT NOT NULL,
        name TEXT NOT NULL,
        party TEXT NOT NULL,
        link TEXT NOT NULL,
        chamber TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'На рассмотрении',
        createdAt BIGINT NOT NULL,
        authorId TEXT NOT NULL,
        threadId TEXT,
        channelId TEXT,
        speakersMessageId TEXT,
        historyMessageId TEXT,
        initialMessageId TEXT,
        isQuantitative BOOLEAN DEFAULT FALSE,
        parentProposalId TEXT,
        events JSONB DEFAULT '[]'::JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS quantitative_items (
        id SERIAL PRIMARY KEY,
        proposalId TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
        itemIndex INTEGER NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS votings (
        proposalId TEXT PRIMARY KEY REFERENCES proposals(id) ON DELETE CASCADE,
        open BOOLEAN NOT NULL DEFAULT FALSE,
        startedAt BIGINT,
        endedAt BIGINT,
        durationMs BIGINT,
        expiresAt BIGINT,
        messageId TEXT,
        isSecret BOOLEAN DEFAULT FALSE,
        formula TEXT DEFAULT '0',
        stage INTEGER DEFAULT 1,
        runoffMessageId TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS votes (
        id SERIAL PRIMARY KEY,
        proposalId TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
        userId TEXT NOT NULL,
        voteType TEXT NOT NULL,
        createdAt BIGINT NOT NULL,
        stage INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(proposalId, userId, stage)
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        chamber TEXT NOT NULL,
        meetingDate TEXT NOT NULL,
        channelId TEXT NOT NULL,
        messageId TEXT,
        threadId TEXT,
        createdAt BIGINT NOT NULL,
        durationMs BIGINT NOT NULL DEFAULT 0,
        expiresAt BIGINT NOT NULL DEFAULT 0,
        open BOOLEAN NOT NULL DEFAULT FALSE,
        quorum INTEGER DEFAULT 0,
        totalMembers INTEGER DEFAULT 0,
        status TEXT DEFAULT 'planned',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS meeting_registrations (
        meetingId TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        userId TEXT NOT NULL,
        registeredAt BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (meetingId, userId)
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS bot_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS meeting_agendas (
        id SERIAL PRIMARY KEY,
        meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(meeting_id, proposal_id)
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS proposal_registrations (
        id SERIAL PRIMARY KEY,
        proposalId TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
        userId TEXT NOT NULL,
        registeredAt BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(proposalId, userId)
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chamber_settings (
        chamberId TEXT PRIMARY KEY,
        totalMembers INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const chambers = ['sf', 'gd_rublevka', 'gd_arbat', 'gd_patricki', 'gd_tverskoy'];
    for (const chamber of chambers) {
      await this.pool.query(
        `INSERT INTO chamber_counters (chamberId, value) VALUES ($1, 1) ON CONFLICT (chamberId) DO NOTHING;`,
        [chamber]
      );
      
      let defaultMembers = 56;
      if (chamber !== 'sf') {
        defaultMembers = 20;
      }
      
      await this.pool.query(
        `INSERT INTO chamber_settings (chamberId, totalMembers) VALUES ($1, $2) ON CONFLICT (chamberId) DO UPDATE SET totalMembers = EXCLUDED.totalMembers;`,
        [chamber, defaultMembers]
      );
    }

    await this.createIndexes();
    console.log('✅ All tables created successfully');
  }

  async createIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_proposals_chamber ON proposals(chamber);',
      'CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);',
      'CREATE INDEX IF NOT EXISTS idx_proposals_created_at ON proposals(created_at);',
      'CREATE INDEX IF NOT EXISTS idx_votes_proposal_stage ON votes(proposalid, stage);',
      'CREATE INDEX IF NOT EXISTS idx_votes_user ON votes(userid);',
      'CREATE INDEX IF NOT EXISTS idx_meetings_chamber ON meetings(chamber);',
      'CREATE INDEX IF NOT EXISTS idx_meetings_open ON meetings(open);',
      'CREATE INDEX IF NOT EXISTS idx_quantitative_items_proposal ON quantitative_items(proposalid);',
      'CREATE INDEX IF NOT EXISTS idx_meeting_registrations_meeting ON meeting_registrations(meetingid);',
      'CREATE INDEX IF NOT EXISTS idx_meeting_agendas_meeting ON meeting_agendas(meeting_id);',
      'CREATE INDEX IF NOT EXISTS idx_meeting_agendas_proposal ON meeting_agendas(proposal_id);',
      'CREATE INDEX IF NOT EXISTS idx_proposal_registrations_proposal ON proposal_registrations(proposalid);',
      'CREATE INDEX IF NOT EXISTS idx_proposal_registrations_user ON proposal_registrations(userid);'
    ];

    for (const idx of indexes) {
      try {
        await this.pool.query(idx);
      } catch (err) {
        console.warn('⚠️ Could not create index:', idx, err?.message || err);
      }
    }
    console.log('✅ Database indexes created');
  }
  
  async getNextProposalNumber(chamber) {
    try {
      let result = await this.query(
        'UPDATE chamber_counters SET value = value + 1 WHERE chamberId = $1 RETURNING value',
        [chamber]
      );
      
      if (result.rows.length === 0) {
        await this.query(
          'INSERT INTO chamber_counters (chamberId, value) VALUES ($1, 1) ON CONFLICT (chamberId) DO NOTHING',
          [chamber]
        );
        result = await this.query(
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

  async getVotes(proposalId, stage = 1, limit = 1000) {
    const result = await this.query(
      'SELECT * FROM votes WHERE proposalId = $1 AND stage = $2 ORDER BY createdAt ASC LIMIT $3',
      [proposalId, stage, limit]
    );
    return result.rows;
  }

  async proposalExists(proposalId) {
    const result = await this.query(
      'SELECT 1 FROM proposals WHERE id = $1 LIMIT 1',
      [proposalId]
    );
    return result.rows.length > 0;
  }

  async hasUserVoted(proposalId, userId, stage = 1) {
    const result = await this.query(
      'SELECT 1 FROM votes WHERE proposalId = $1 AND userId = $2 AND stage = $3 LIMIT 1',
      [proposalId, userId, stage]
    );
    return result.rows.length > 0;
  }

  async createProposal(proposal) {
    const eventsString = JSON.stringify(proposal.events || []);
    
    await this.query(`
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

  async getProposal(id) {
    const result = await this.query('SELECT * FROM proposals WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    
    const proposal = result.rows[0];
    if (proposal.events) {
      proposal.events = typeof proposal.events === 'string' 
        ? JSON.parse(proposal.events) 
        : proposal.events;
    } else {
      proposal.events = [];
    }
    return proposal;
  }

  async getProposalByNumber(number) {
    const result = await this.query('SELECT * FROM proposals WHERE number = $1', [number]);
    if (result.rows.length === 0) return null;
    
    const proposal = result.rows[0];
    if (proposal.events) {
      proposal.events = typeof proposal.events === 'string' 
        ? JSON.parse(proposal.events) 
        : proposal.events;
    } else {
      proposal.events = [];
    }
    return proposal;
  }

  async updateProposalEvents(id, events) {
    await this.query(
      'UPDATE proposals SET events = $1::JSONB WHERE id = $2',
      [JSON.stringify(events), id]
    );
  }

  async updateProposalStatus(id, status) {
    await this.query('UPDATE proposals SET status = $1 WHERE id = $2', [status, id]);
  }

  async updateProposalThread(id, threadId) {
    await this.query('UPDATE proposals SET threadId = $1 WHERE id = $2', [threadId, id]);
  }

  async updateProposalHistoryMessage(id, messageId) {
    await this.query('UPDATE proposals SET historyMessageId = $1 WHERE id = $2', [messageId, id]);
  }

  async updateProposalInitialMessage(id, messageId) {
    await this.query('UPDATE proposals SET initialMessageId = $1 WHERE id = $2', [messageId, id]);
  }

  async updateProposalChannel(id, channelId) {
    await this.query('UPDATE proposals SET channelId = $1 WHERE id = $2', [channelId, id]);
  }

  async getAllProposals() {
    const result = await this.query('SELECT * FROM proposals ORDER BY createdAt DESC');
    return result.rows.map(proposal => ({
      ...proposal,
      events: typeof proposal.events === 'string' ? JSON.parse(proposal.events) : proposal.events
    }));
  }

  async getProposalsByChamber(chamber) {
    const result = await this.query(
      'SELECT * FROM proposals WHERE chamber = $1 ORDER BY createdAt DESC',
      [chamber]
    );
    return result.rows.map(proposal => ({
      ...proposal,
      events: typeof proposal.events === 'string' ? JSON.parse(proposal.events) : proposal.events
    }));
  }

  async getPendingProposalsByChamber(chamber) {
    const result = await this.query(
      `SELECT * FROM proposals 
       WHERE chamber = $1 
       AND status IN ('На рассмотрении', 'На рассмотрении в палате')
       ORDER BY createdAt DESC`,
      [chamber]
    );
    return result.rows.map(proposal => ({
      ...proposal,
      events: typeof proposal.events === 'string' ? JSON.parse(proposal.events) : proposal.events
    }));
  }

  async deleteProposal(id) {
    await this.query('DELETE FROM proposals WHERE id = $1', [id]);
  }

  async addQuantitativeItem(item) {
    await this.query(
      'INSERT INTO quantitative_items (proposalId, itemIndex, text) VALUES ($1, $2, $3)',
      [item.proposalId, item.itemIndex, item.text]
    );
  }

  async getQuantitativeItems(proposalId) {
    const result = await this.query(
      'SELECT * FROM quantitative_items WHERE proposalId = $1 ORDER BY itemIndex',
      [proposalId]
    );
    return result.rows;
  }

  async startVoting(voting) {
    await this.query(`
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

  async endVoting(proposalId, endedAt) {
    await this.query(
      'UPDATE votings SET open = FALSE, endedAt = $1 WHERE proposalId = $2',
      [endedAt, proposalId]
    );
  }

  async getVoting(proposalId) {
    const result = await this.query('SELECT * FROM votings WHERE proposalId = $1', [proposalId]);
    return result.rows[0] || null;
  }

  async getOpenVotings() {
    const result = await this.query(`
      SELECT p.*, v.open, v.startedAt, v.endedAt, v.durationMs, v.expiresAt, 
             v.messageId, v.isSecret, v.formula, v.stage, v.runoffMessageId
      FROM proposals p 
      JOIN votings v ON p.id = v.proposalId 
      WHERE v.open = TRUE
    `);
    return result.rows;
  }

  async addVote(vote) {
    const hasVoted = await this.hasUserVoted(vote.proposalId, vote.userId, vote.stage || 1);
    if (hasVoted) {
      return false;
    }
    
    await this.query(`
      INSERT INTO votes (proposalId, userId, voteType, createdAt, stage)
      VALUES ($1, $2, $3, $4, $5)
    `, [vote.proposalId, vote.userId, vote.voteType, vote.createdAt, vote.stage || 1]);
    
    return true;
  }

  async getVoteCounts(proposalId, stage = 1) {
    const result = await this.query(`
      SELECT voteType, COUNT(*) as count 
      FROM votes 
      WHERE proposalId = $1 AND stage = $2
      GROUP BY voteType
    `, [proposalId, stage]);
    return result.rows;
  }

  async createMeeting(meeting) {
    await this.query(`
      INSERT INTO meetings 
      (id, title, chamber, meetingDate, channelId, messageId, threadId, createdAt, durationMs, expiresAt, open, quorum, totalMembers, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      meeting.id, meeting.title, meeting.chamber, meeting.meetingDate,
      meeting.channelId, meeting.messageId, meeting.threadId, meeting.createdAt, meeting.durationMs,
      meeting.expiresAt, meeting.open, meeting.quorum, meeting.totalMembers, meeting.status
    ]);
  }

  async updateMeeting(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    }

    values.push(id);
    await this.query(
      `UPDATE meetings SET ${fields.join(', ')} WHERE id = $${paramCount}`,
      values
    );
  }

  async getMeeting(id) {
    const result = await this.query('SELECT * FROM meetings WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async getAllMeetings() {
    const result = await this.query('SELECT * FROM meetings ORDER BY createdAt DESC');
    return result.rows;
  }

  async getOpenMeetings() {
    const result = await this.query('SELECT * FROM meetings WHERE open = TRUE');
    return result.rows;
  }

  async getActiveMeetings() {
    const result = await this.query(`
      SELECT * FROM meetings 
      WHERE open = TRUE OR status = 'voting'
    `);
    return result.rows;
  }

  async getLastMeetingByChamber(chamber) {
    const result = await this.query(`
      SELECT * FROM meetings 
      WHERE chamber = $1 
      ORDER BY createdAt DESC 
      LIMIT 1
    `, [chamber]);
    return result.rows[0] || null;
  }

  async updateMeetingMessage(id, messageId) {
    await this.query('UPDATE meetings SET messageId = $1 WHERE id = $2', [messageId, id]);
  }

  async updateMeetingThread(id, threadId) {
    await this.query('UPDATE meetings SET threadId = $1 WHERE id = $2', [threadId, id]);
  }

  async closeMeeting(id) {
    await this.query('UPDATE meetings SET open = FALSE WHERE id = $1', [id]);
  }

  async registerForMeeting(meetingId, userId) {
    await this.query(`
      INSERT INTO meeting_registrations (meetingId, userId, registeredAt)
      VALUES ($1, $2, $3)
      ON CONFLICT (meetingId, userId) DO NOTHING
    `, [meetingId, userId, Date.now()]);
  }

  async getMeetingRegistrations(meetingId) {
    const result = await this.query(
      'SELECT userId FROM meeting_registrations WHERE meetingId = $1',
      [meetingId]
    );
    return result.rows;
  }

  async isUserRegistered(meetingId, userId) {
    const result = await this.query(
      'SELECT 1 FROM meeting_registrations WHERE meetingId = $1 AND userId = $2',
      [meetingId, userId]
    );
    return result.rows.length > 0;
  }

  async getRegistrationCount(meetingId) {
    const result = await this.query(
      'SELECT COUNT(*) as count FROM meeting_registrations WHERE meetingId = $1',
      [meetingId]
    );
    return parseInt(result.rows[0].count);
  }

  async getRegistrationTime(meetingId, userId) {
    const result = await this.query(
      'SELECT registeredAt FROM meeting_registrations WHERE meetingId = $1 AND userId = $2',
      [meetingId, userId]
    );
    return result.rows[0]?.registeredat || null;
  }

  async getBotSetting(key) {
    const result = await this.query('SELECT value FROM bot_settings WHERE key = $1', [key]);
    return result.rows[0]?.value || null;
  }

  async setBotSetting(key, value) {
    await this.query(`
      INSERT INTO bot_settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value
    `, [key, value]);
  }

  async getChamberSettings(chamberId) {
    const result = await this.query('SELECT * FROM chamber_settings WHERE chamberId = $1', [chamberId]);
    return result.rows[0] || null;
  }

  async setChamberTotalMembers(chamberId, totalMembers) {
    await this.query(`
      INSERT INTO chamber_settings (chamberId, totalMembers)
      VALUES ($1, $2)
      ON CONFLICT (chamberId) DO UPDATE SET
        totalMembers = EXCLUDED.totalMembers
    `, [chamberId, totalMembers]);
  }

  async addToAgenda(meetingId, proposalId) {
    await this.query(`
      INSERT INTO meeting_agendas (meeting_id, proposal_id)
      VALUES ($1, $2)
      ON CONFLICT (meeting_id, proposal_id) DO NOTHING
    `, [meetingId, proposalId]);
  }

  async getAgenda(meetingId) {
    const result = await this.query(`
      SELECT p.* 
      FROM meeting_agendas ma
      JOIN proposals p ON ma.proposal_id = p.id
      WHERE ma.meeting_id = $1
      ORDER BY p.createdAt ASC
    `, [meetingId]);
    return result.rows;
  }

  async isProposalInAgenda(meetingId, proposalId) {
    const result = await this.query(`
      SELECT 1 FROM meeting_agendas 
      WHERE meeting_id = $1 AND proposal_id = $2
      LIMIT 1
    `, [meetingId, proposalId]);
    return result.rows.length > 0;
  }

  async getMeetingsByProposal(proposalId) {
    const result = await this.query(`
      SELECT m.* 
      FROM meeting_agendas ma
      JOIN meetings m ON ma.meeting_id = m.id
      WHERE ma.proposal_id = $1
      ORDER BY m.createdAt DESC
    `, [proposalId]);
    return result.rows;
  }

  async registerForProposalVoting(proposalId, userId) {
    await this.query(`
      INSERT INTO proposal_registrations (proposalId, userId, registeredAt)
      VALUES ($1, $2, $3)
      ON CONFLICT (proposalId, userId) DO NOTHING
    `, [proposalId, userId, Date.now()]);
  }

  async getProposalRegistrations(proposalId) {
    const result = await this.query(
      'SELECT userId FROM proposal_registrations WHERE proposalId = $1',
      [proposalId]
    );
    return result.rows;
  }

  async isUserRegisteredForProposal(proposalId, userId) {
    const result = await this.query(
      'SELECT 1 FROM proposal_registrations WHERE proposalId = $1 AND userId = $2',
      [proposalId, userId]
    );
    return result.rows.length > 0;
  }

  async getProposalRegistrationCount(proposalId) {
    const result = await this.query(
      'SELECT COUNT(*) as count FROM proposal_registrations WHERE proposalId = $1',
      [proposalId]
    );
    return parseInt(result.rows[0].count);
  }

  async close() {
    await this.pool.end();
  }
}

export default new CongressDatabase();
