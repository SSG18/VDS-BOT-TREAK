// config.js
import 'dotenv/config';

export const TOKEN = process.env.DISCORD_TOKEN;
export const CLIENT_ID = process.env.CLIENT_ID;
export const GUILD_ID = process.env.GUILD_ID;

// ID каналов для разных палат
export const CHAMBER_CHANNELS = {
  'sf': process.env.SF_CHANNEL_ID,
  'gd_rublevka': process.env.GD_RUBLEVKA_CHANNEL_ID,
  'gd_arbat': process.env.GD_ARBAT_CHANNEL_ID,
  'gd_patricki': process.env.GD_PATRICKI_CHANNEL_ID,
  'gd_tverskoy': process.env.GD_TVERSKOY_CHANNEL_ID
};

// ID каналов для заседаний
export const MEETING_CHANNELS = {
  'sf': process.env.SF_MEETING_CHANNEL_ID,
  'gd_rublevka': process.env.GD_RUBLEVKA_MEETING_CHANNEL_ID,
  'gd_arbat': process.env.GD_ARBAT_MEETING_CHANNEL_ID,
  'gd_patricki': process.env.GD_PATRICKI_MEETING_CHANNEL_ID,
  'gd_tverskoy': process.env.GD_TVERSKOY_MEETING_CHANNEL_ID
};

// ID ролей для упоминаний
export const MEETING_MENTION_ROLES = {
  'sf': process.env.SF_MENTION_ROLE_ID,
  'gd_rublevka': process.env.GD_RUBLEVKA_MENTION_ROLE_ID,
  'gd_arbat': process.env.GD_ARBAT_MENTION_ROLE_ID,
  'gd_patricki': process.env.GD_PATRICKI_MENTION_ROLE_ID,
  'gd_tverskoy': process.env.GD_TVERSKOY_MENTION_ROLE_ID
};

// ID ролей для голосования
export const VOTER_ROLES_BY_CHAMBER = {
  'sf': process.env.SF_VOTER_ROLE_ID,
  'gd_rublevka': process.env.GD_RUBLEVKA_VOTER_ROLE_ID,
  'gd_arbat': process.env.GD_ARBAT_VOTER_ROLE_ID,
  'gd_patricki': process.env.GD_PATRICKI_VOTER_ROLE_ID,
  'gd_tverskoy': process.env.GD_TVERSKOY_VOTER_ROLE_ID
};

// ID ролей
export const ROLES = {
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
  TVERSKOY: process.env.TVERSKOY_ROLE_ID
};

// ID тегов форума
export const FORUM_TAGS = {
  ON_REVIEW: process.env.FORUM_TAG_ON_REVIEW,
  APPROVED: process.env.FORUM_TAG_APPROVED,
  REJECTED: process.env.FORUM_TAG_REJECTED,
  NOT_APPROVED: process.env.FORUM_TAG_NOT_APPROVED,
  SIGNED: process.env.FORUM_TAG_SIGNED,
  VETOED: process.env.FORUM_TAG_VETOED
};

export const ADMIN_ROLE_SEND_ID = process.env.ADMIN_ROLE_SEND_ID;
export const SYSADMIN_ROLE_ID = process.env.SYSADMIN_ROLE_ID;

export const FOOTER = "РЕАЛИЗОВАНО ПРИ ПОДДЕРЖКЕ ВСЕРОССИЙСКОЙ ПОЛИТИЧЕСКОЙ ПАРТИИ «ДОБРОДЕТЕЛИ РОССИИ»";

export const COLORS = {
  PRIMARY: 0x3498db,
  SUCCESS: 0x2ecc71,
  DANGER: 0xe74c3c,
  WARNING: 0xf39c12,
  SECONDARY: 0x95a5a6,
  INFO: 0x9b59b6,
  GOLD: 0xf1c40f
};

// Маппинг палат на названия
export const CHAMBER_NAMES = {
  'sf': 'Совет Федерации',
  'gd_rublevka': 'Государственная дума | Рублевка',
  'gd_arbat': 'Государственная дума | Арбат', 
  'gd_patricki': 'Государственная дума | Патрики',
  'gd_tverskoy': 'Государственная дума | Тверской'
};

// Маппинг палат на роли председателей
export const CHAMBER_CHAIRMAN_ROLES = {
  'sf': [ROLES.CHAIRMAN, ROLES.VICE_CHAIRMAN],
  'gd_rublevka': [ROLES.CHAIRMAN, ROLES.VICE_CHAIRMAN, ROLES.RUBLEVKA],
  'gd_arbat': [ROLES.CHAIRMAN, ROLES.VICE_CHAIRMAN, ROLES.ARBAT],
  'gd_patricki': [ROLES.CHAIRMAN, ROLES.VICE_CHAIRMAN, ROLES.PATRICKI],
  'gd_tverskoy': [ROLES.CHAIRMAN, ROLES.VICE_CHAIRMAN, ROLES.TVERSKOY]
};

// Маппинг ID каналов заседаний на палаты
export const CHANNEL_TO_CHAMBER = Object.fromEntries(
  Object.entries(MEETING_CHANNELS).map(([chamber, channelId]) => [channelId, chamber])
);

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
