import logger from '../utils/logger.js';

export const CONFIG = {
  // Discord
  TOKEN: process.env.DISCORD_TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
  GUILD_ID: process.env.GUILD_ID,
  
  // Каналы палат
  CHAMBER_CHANNELS: {
    'sf': process.env.SF_CHANNEL_ID,
    'gd_rublevka': process.env.GD_RUBLEVKA_CHANNEL_ID,
    'gd_arbat': process.env.GD_ARBAT_CHANNEL_ID,
    'gd_patricki': process.env.GD_PATRICKI_CHANNEL_ID,
    'gd_tverskoy': process.env.GD_TVERSKOY_CHANNEL_ID
  },
  
  // Каналы заседаний
  MEETING_CHANNELS: {
    'sf': process.env.SF_MEETING_CHANNEL_ID,
    'gd_rublevka': process.env.GD_RUBLEVKA_MEETING_CHANNEL_ID,
    'gd_arbat': process.env.GD_ARBAT_MEETING_CHANNEL_ID,
    'gd_patricki': process.env.GD_PATRICKI_MEETING_CHANNEL_ID,
    'gd_tverskoy': process.env.GD_TVERSKOY_MEETING_CHANNEL_ID
  },
  
  // Роли для упоминаний
  MEETING_MENTION_ROLES: {
    'sf': process.env.SF_MENTION_ROLE_ID,
    'gd_rublevka': process.env.GD_RUBLEVKA_MENTION_ROLE_ID,
    'gd_arbat': process.env.GD_ARBAT_MENTION_ROLE_ID,
    'gd_patricki': process.env.GD_PATRICKI_MENTION_ROLE_ID,
    'gd_tverskoy': process.env.GD_TVERSKOY_MENTION_ROLE_ID
  },
  
  // Роли для голосования
  VOTER_ROLES_BY_CHAMBER: {
    'sf': process.env.SF_VOTER_ROLE_ID,
    'gd_rublevka': process.env.GD_RUBLEVKA_VOTER_ROLE_ID,
    'gd_arbat': process.env.GD_ARBAT_VOTER_ROLE_ID,
    'gd_patricki': process.env.GD_PATRICKI_VOTER_ROLE_ID,
    'gd_tverskoy': process.env.GD_TVERSKOY_VOTER_ROLE_ID
  },
  
  // Роли
  ROLES: {
    SENATOR: process.env.SENATOR_ROLE_ID,
    SENATOR_NO_VOTE: process.env.SENATOR_NO_VOTE_ROLE_ID,
    DEPUTY: process.env.DEPUTY_ROLE_ID,
    DEPUTY_NO_VOTE: process.env.DEPUTY_NO_VOTE_ROLE_ID,
    CHAIRMAN: process.env.CHAIRMAN_ROLE_ID,
    VICE_CHAIRMAN: process.env.VICE_CHAIRMAN_ROLE_ID,
    GOVERNMENT_CHAIRMAN: process.env.GOVERNMENT_CHAIRMAN_ROLE_ID,
    PRESIDENT: process.env.PRESIDENT_USER_ID,
    RUBLEVKA: process.env.RUBLEVKA_ROLE_ID,
    ARBAT: process.env.ARBAT_ROLE_ID,
    PATRICKI: process.env.PATRICKI_ROLE_ID,
    TVERSKOY: process.env.TVERSKOY_ROLE_ID,
    ADMIN: process.env.ADMIN_ROLE_SEND_ID,
    SYSADMIN: process.env.SYSADMIN_ROLE_ID
  },
  
  // Теги форума
  FORUM_TAGS: {
    ON_REVIEW: process.env.FORUM_TAG_ON_REVIEW,
    APPROVED: process.env.FORUM_TAG_APPROVED,
    REJECTED: process.env.FORUM_TAG_REJECTED,
    NOT_APPROVED: process.env.FORUM_TAG_NOT_APPROVED,
    SIGNED: process.env.FORUM_TAG_SIGNED,
    VETOED: process.env.FORUM_TAG_VETOED
  }
};

// Названия палат
export const CHAMBER_NAMES = {
  'sf': 'Совет Федерации',
  'gd_rublevka': 'Государственная дума | Рублевка',
  'gd_arbat': 'Государственная дума | Арбат', 
  'gd_patricki': 'Государственная дума | Патрики',
  'gd_tverskoy': 'Государственная дума | Тверской'
};

// Функция для получения ролей председателей (исправляет циклическую зависимость)
export function getChamberChairmanRoles() {
  return {
    'sf': [CONFIG.ROLES.CHAIRMAN, CONFIG.ROLES.VICE_CHAIRMAN],
    'gd_rublevka': [CONFIG.ROLES.CHAIRMAN, CONFIG.ROLES.VICE_CHAIRMAN, CONFIG.ROLES.RUBLEVKA],
    'gd_arbat': [CONFIG.ROLES.CHAIRMAN, CONFIG.ROLES.VICE_CHAIRMAN, CONFIG.ROLES.ARBAT],
    'gd_patricki': [CONFIG.ROLES.CHAIRMAN, CONFIG.ROLES.VICE_CHAIRMAN, CONFIG.ROLES.PATRICKI],
    'gd_tverskoy': [CONFIG.ROLES.CHAIRMAN, CONFIG.ROLES.VICE_CHAIRMAN, CONFIG.ROLES.TVERSKOY]
  };
}

// Маппинг ID каналов заседаний на палаты
export const CHANNEL_TO_CHAMBER = Object.fromEntries(
  Object.entries(CONFIG.MEETING_CHANNELS).map(([chamber, channelId]) => [channelId, chamber])
);

// Цвета для embed сообщений
export const COLORS = {
  PRIMARY: 0x3498db,
  SUCCESS: 0x2ecc71,
  DANGER: 0xe74c3c,
  WARNING: 0xf39c12,
  SECONDARY: 0x95a5a6,
  INFO: 0x9b59b6,
  GOLD: 0xf1c40f
};

export const FOOTER = "РЕАЛИЗОВАНО ПРИ ПОДДЕРЖКЕ ВСЕРОССИЙСКОЙ ПОЛИТИЧЕСКОЙ ПАРТИИ «ДОБРОДЕТЕЛИ РОССИИ»";

// Эмодзи для событий хронологии
export const EVENT_EMOJIS = {
  'registration': '📥',
  'vote_result': '🗳️',
  'government_approval': '✅',
  'government_return': '↩️',
  'president_sign': '🖊️',
  'president_veto': '❌',
  'transfer': '🔄',
  'default': '📌'
};

export const FORUM_TAGS = CONFIG.FORUM_TAGS;

// Валидация конфигурации
export function validateConfig() {
  const requiredEnvVars = [
    'DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID',
    'SF_CHANNEL_ID', 'GD_RUBLEVKA_CHANNEL_ID', 'GD_ARBAT_CHANNEL_ID', 
    'GD_PATRICKI_CHANNEL_ID', 'GD_TVERSKOY_CHANNEL_ID',
    'SF_MEETING_CHANNEL_ID', 'GD_RUBLEVKA_MEETING_CHANNEL_ID',
    'GD_ARBAT_MEETING_CHANNEL_ID', 'GD_PATRICKI_MEETING_CHANNEL_ID', 
    'GD_TVERSKOY_MEETING_CHANNEL_ID',
    'FORUM_TAG_ON_REVIEW', 'FORUM_TAG_APPROVED', 'FORUM_TAG_REJECTED',
    'FORUM_TAG_NOT_APPROVED', 'FORUM_TAG_SIGNED', 'FORUM_TAG_VETOED',
    'SENATOR_ROLE_ID', 'SENATOR_NO_VOTE_ROLE_ID', 'DEPUTY_ROLE_ID',
    'DEPUTY_NO_VOTE_ROLE_ID', 'CHAIRMAN_ROLE_ID', 'VICE_CHAIRMAN_ROLE_ID',
    'GOVERNMENT_CHAIRMAN_ROLE_ID', 'PRESIDENT_USER_ID',
    'RUBLEVKA_ROLE_ID', 'ARBAT_ROLE_ID', 'PATRICKI_ROLE_ID', 'TVERSKOY_ROLE_ID',
    'ADMIN_ROLE_SEND_ID', 'SYSADMIN_ROLE_ID'
  ];

  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    logger.error("Missing required environment variables:", missing);
    return false;
  }
  
  // Проверка каналов
  for (const [chamber, channelId] of Object.entries(CONFIG.CHAMBER_CHANNELS)) {
    if (!channelId) {
      logger.error(`Missing channel ID for chamber: ${chamber}`);
      return false;
    }
  }

  logger.info("✅ All configuration validated successfully");
  return true;
}
