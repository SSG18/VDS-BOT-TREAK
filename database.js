// database.js (PostgreSQL версия - ОБНОВЛЕННАЯ)
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
    
    this.init().catch(console.error);
  }

  async init() {
    try {
      await this.createTables();
      console.log('✅ Database initialized successfully');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  async query(text, params) {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      if (duration > 1000) {
        console.log(`🐌 Slow query (${duration}ms):`, text);
      }
      return res;
    } catch (error) {
      console.error('❌ Query error:', error, text, params);
      throw error;
    }
  }

  async createTables() {
    // Таблица для счетчиков предложений по палатам
    await this.query(`
      CREATE TABLE IF NOT EXISTS chamber_counters (
        chamberId TEXT PRIMARY KEY,
        value INTEGER NOT NULL DEFAULT 1
      )
    `);

    // Таблица для предложений
    await this.query(`
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
      )
    `);

    // Таблица для пунктов количественного голосования
    await this.query(`
      CREATE TABLE IF NOT EXISTS quantitative_items (
        id SERIAL PRIMARY KEY,
        proposalId TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
        itemIndex INTEGER NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица для информации о голосованиях
    await this.query(`
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
      )
    `);

    // Таблица для голосов
    await this.query(`
      CREATE TABLE IF NOT EXISTS votes (
        id SERIAL PRIMARY KEY,
        proposalId TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
        userId TEXT NOT NULL,
        voteType TEXT NOT NULL,
        createdAt BIGINT NOT NULL,
        stage INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(proposalId, userId, stage)
      )
    `);

    // Таблица для встреч
    await this.query(`
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
        totalMembers INTEGER DEFAULT 53,
        status TEXT DEFAULT 'planned',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица для регистраций на встречи
    await this.query(`
      CREATE TABLE IF NOT EXISTS meeting_registrations (
        meetingId TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        userId TEXT NOT NULL,
        registeredAt BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (meetingId, userId)
      )
    `);

    // Таблица для выступающих
    await this.query(`
      CREATE TABLE IF NOT EXISTS speakers (
        id SERIAL PRIMARY KEY,
        proposalId TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
        userId TEXT NOT NULL,
        type TEXT NOT NULL,
        displayName TEXT NOT NULL,
        registeredAt BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица для настроек бота
    await this.query(`
      CREATE TABLE IF NOT EXISTS bot_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица для делегирования голосов
    await this.query(`
      CREATE TABLE IF NOT EXISTS delegations (
        id SERIAL PRIMARY KEY,
        delegator_id TEXT NOT NULL,
        delegate_id TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица для повестки заседания
    await this.query(`
      CREATE TABLE IF NOT EXISTS meeting_agendas (
        id SERIAL PRIMARY KEY,
        meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Инициализация счетчиков для каждой палаты
    const chambers = ['sf', 'gd_rublevka', 'gd_arbat', 'gd_patricki', 'gd_tverskoy'];
    for (const chamber of chambers) {
      await this.query(`
        INSERT INTO chamber_counters (chamberId, value) 
        VALUES ($1, 1) 
        ON CONFLICT (chamberId) DO NOTHING
      `, [chamber]);
    }

    // Создание индексов для оптимизации
    await this.createIndexes();
  }

  async createIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_proposals_chamber ON proposals(chamber)',
      'CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status)',
      'CREATE INDEX IF NOT EXISTS idx_proposals_created_at ON proposals(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_votes_proposal_stage ON votes(proposalId, stage)',
      'CREATE INDEX IF NOT EXISTS idx_votes_user ON votes(userId)',
      'CREATE INDEX IF NOT EXISTS idx_meetings_chamber ON meetings(chamber)',
      'CREATE INDEX IF NOT EXISTS idx_meetings_open ON meetings(open)',
      'CREATE INDEX IF NOT EXISTS idx_quantitative_items_proposal ON quantitative_items(proposalId)',
      'CREATE INDEX IF NOT EXISTS idx_speakers_proposal ON speakers(proposalId)',
      'CREATE INDEX IF NOT EXISTS idx_meeting_registrations_meeting ON meeting_registrations(meetingId)',
      'CREATE INDEX IF NOT EXISTS idx_delegations_delegator ON delegations(delegator_id)',
      'CREATE INDEX IF NOT EXISTS idx_delegations_delegate ON delegations(delegate_id)',
      'CREATE INDEX IF NOT EXISTS idx_delegations_active ON delegations(active)',
      'CREATE INDEX IF NOT EXISTS idx_meeting_agendas_meeting ON meeting_agendas(meeting_id)',
      'CREATE INDEX IF NOT EXISTS idx_meeting_agendas_proposal ON meeting_agendas(proposal_id)'
    ];

    for (const indexSql of indexes) {
      await this.query(indexSql);
    }
  }

  // Методы для работы с предложениями
  async getNextProposalNumber(chamber) {
    try {
      // Сначала пытаемся обновить существующий счетчик
      let result = await this.query(
        'UPDATE chamber_counters SET value = value + 1 WHERE chamberId = $1 RETURNING value',
        [chamber]
      );
      
      // Если счетчика не было, создаем его и снова пытаемся обновить
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
      
      // Если все еще нет результата, используем значение по умолчанию
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
      // Fallback на случай ошибки
      const number = '001';
      const prefix = chamber === 'sf' ? 'СФ' : 'ГД';
      return `${prefix}-${number}`;
    }
  }

  // Оптимизированный метод для получения голосов с пагинацией
  async getVotes(proposalId, stage = 1, limit = 1000) {
    const result = await this.query(
      'SELECT * FROM votes WHERE proposalId = $1 AND stage = $2 ORDER BY createdAt ASC LIMIT $3',
      [proposalId, stage, limit]
    );
    return result.rows;
  }

  // Метод для быстрой проверки существования предложения
  async proposalExists(proposalId) {
    const result = await this.query(
      'SELECT 1 FROM proposals WHERE id = $1 LIMIT 1',
      [proposalId]
    );
    return result.rows.length > 0;
  }

  // Метод для проверки, голосовал ли уже пользователь
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

  async updateProposalSpeakersMessage(id, messageId) {
    await this.query('UPDATE proposals SET speakersMessageId = $1 WHERE id = $2', [messageId, id]);
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

  // Методы для работы с пунктами количественного голосования
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

  // Методы для работы с голосованиями
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

  // Методы для работы с голосами
  async addVote(vote) {
    // Проверяем, не голосовал ли уже пользователь
    const hasVoted = await this.hasUserVoted(vote.proposalId, vote.userId, vote.stage || 1);
    if (hasVoted) {
      return false; // Уже голосовал
    }
    
    await this.query(`
      INSERT INTO votes (proposalId, userId, voteType, createdAt, stage)
      VALUES ($1, $2, $3, $4, $5)
    `, [vote.proposalId, vote.userId, vote.voteType, vote.createdAt, vote.stage || 1]);
    
    return true; // Голос успешно добавлен
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

  // Методы для работы с встречами
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

  // Методы для работы с регистрациями на встречи
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

  // Методы для работы с выступающими
  async addSpeaker(speaker) {
    await this.query(`
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

  async getSpeakers(proposalId) {
    const result = await this.query(
      'SELECT * FROM speakers WHERE proposalId = $1 ORDER BY registeredAt ASC',
      [proposalId]
    );
    return result.rows;
  }

  async removeSpeaker(proposalId, userId) {
    await this.query(
      'DELETE FROM speakers WHERE proposalId = $1 AND userId = $2',
      [proposalId, userId]
    );
  }

  // Методы для работы с настройками
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

  // Методы для работы с делегированием
  async createDelegation(delegatorId, delegateId) {
    // Деактивируем старые делегирования для этого делегатора
    await this.query(
      'UPDATE delegations SET active = FALSE WHERE delegator_id = $1',
      [delegatorId]
    );
    
    // Создаем новое делегирование
    await this.query(`
      INSERT INTO delegations (delegator_id, delegate_id, created_at, active)
      VALUES ($1, $2, $3, TRUE)
    `, [delegatorId, delegateId, Date.now()]);
  }

  async removeDelegation(delegatorId) {
    await this.query(
      'UPDATE delegations SET active = FALSE WHERE delegator_id = $1',
      [delegatorId]
    );
  }

  async getActiveDelegation(delegatorId) {
    const result = await this.query(`
      SELECT * FROM delegations 
      WHERE delegator_id = $1 AND active = TRUE 
      LIMIT 1
    `, [delegatorId]);
    return result.rows[0] || null;
  }

  async getDelegationsByDelegate(delegateId) {
    const result = await this.query(`
      SELECT * FROM delegations 
      WHERE delegate_id = $1 AND active = TRUE
    `, [delegateId]);
    return result.rows;
  }

  async getAllActiveDelegations() {
    const result = await this.query(`
      SELECT d.*, 
             delegator.username as delegator_username,
             delegate.username as delegate_username
      FROM delegations d
      LEFT JOIN bot_settings delegator ON delegator.key = CONCAT('user_', d.delegator_id)
      LEFT JOIN bot_settings delegate ON delegate.key = CONCAT('user_', d.delegate_id)
      WHERE d.active = TRUE
    `);
    return result.rows;
  }

  // Методы для работы с повесткой заседания
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

  // Закрытие соединения
  async close() {
    await this.pool.end();
  }
}

export default new CongressDatabase();
