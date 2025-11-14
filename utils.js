// utils.js
import { 
  CHAMBER_CHAIRMAN_ROLES, 
  ROLES, 
  CHANNEL_TO_CHAMBER, 
  CHAMBER_NAMES 
} from './config.js';

// Функция проверки прав администратора
export function isAdmin(member) {
  return member.roles.cache.has(ROLES.ADMIN_ROLE_SEND_ID) || member.roles.cache.has(ROLES.SYSADMIN_ROLE_ID);
}

// Функция проверки прав председателя для палаты
export function isChamberChairman(member, chamber) {
  const requiredRoles = CHAMBER_CHAIRMAN_ROLES[chamber];
  if (!requiredRoles) return false;
  return requiredRoles.some(roleId => member.roles.cache.has(roleId));
}

// Функция проверки прав правительства для палаты
export function isGovernmentChairman(member, chamber) {
  return member.roles.cache.has(ROLES.GOVERNMENT_CHAIRMAN) && 
         member.roles.cache.has(getChamberTerritoryRole(chamber));
}

// Функция получения роли территории для палаты
export function getChamberTerritoryRole(chamber) {
  switch(chamber) {
    case 'gd_rublevka': return ROLES.RUBLEVKA;
    case 'gd_arbat': return ROLES.ARBAT;
    case 'gd_patricki': return ROLES.PATRICKI;
    case 'gd_tverskoy': return ROLES.TVERSKOY;
    default: return null;
  }
}

// Функция для получения палаты по ID канала
export function getChamberByChannel(channelId) {
  return CHANNEL_TO_CHAMBER[channelId];
}

// Функция для парсинга произвольного времени
export function parseCustomDuration(str) {
  const timeUnits = {
    'd': 24 * 60 * 60 * 1000,
    'h': 60 * 60 * 1000, 
    'm': 60 * 1000,
    's': 1000
  };

  let totalMs = 0;
  const regex = /(\d+)([dhms])/g;
  let match;

  while ((match = regex.exec(str)) !== null) {
    const value = parseInt(match[1]);
    const unit = match[2];
    totalMs += value * timeUnits[unit];
  }

  return totalMs || 60000;
}

export function formatTimeLeft(ms) {
  if (ms <= 0) return "0s";
  const sec = Math.ceil(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Функция для форматирования времени с учетом часового пояса Москвы
export function formatMoscowTime(timestamp) {
  try {
    const date = new Date(Number(timestamp));
    if (isNaN(date.getTime())) {
      return "Некорректная дата";
    }
    return date.toLocaleString("ru-RU", {
      timeZone: "Europe/Moscow",
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (error) {
    console.error("❌ Error formatting Moscow time:", error);
    return "Ошибка формата даты";
  }
}

// Функции для работы с формулами голосования
export function getFormulaDescription(formula) {
  switch (formula) {
    case '0': return 'Простое большинство';
    case '1': return '2/3 голосов';
    case '2': return '3/4 голосов';
    case '3': return 'Большинство от общего количества';
    default: return 'Простое большинство';
  }
}

export function calculateVoteResult(forCount, againstCount, abstainCount, formula, totalMembers = 53) {
  const totalVoted = forCount + againstCount + abstainCount;
  
  let requiredFor = 0;
  let requiredTotal = 0;
  
  switch (formula) {
    case '0': // Простое большинство
      requiredFor = Math.floor(totalVoted / 2) + 1;
      requiredTotal = totalVoted;
      break;
    case '1': // 2/3 голосов
      requiredFor = Math.ceil(totalVoted * 2 / 3);
      requiredTotal = totalVoted;
      break;
    case '2': // 3/4 голосов
      requiredFor = Math.ceil(totalVoted * 3 / 4);
      requiredTotal = totalVoted;
      break;
    case '3': // Большинство от общего количества
      requiredFor = Math.ceil(totalMembers / 2);
      requiredTotal = totalMembers;
      break;
    default: // Простое большинство
      requiredFor = Math.floor(totalVoted / 2) + 1;
      requiredTotal = totalVoted;
  }
  
  return { requiredFor, requiredTotal, isPassed: forCount >= requiredFor };
}

// Функция для получения заголовка события
export function getEventTitle(event) {
  switch (event.type) {
    case 'registration':
      return `Внесение в ${CHAMBER_NAMES[event.chamber]}`;
    case 'vote_result':
      return `Результат голосования в ${CHAMBER_NAMES[event.chamber]}`;
    case 'government_approval':
      return 'Одобрено Правительством';
    case 'government_return':
      return 'Возвращено Правительством';
    case 'president_sign':
      return 'Подписано Президентом';
    case 'president_veto':
      return 'Отклонено Президентом';
    case 'transfer':
      return 'Передача в Совет Федерации';
    default:
      return 'Событие';
  }
}

// Функция для получения доступных палат для пользователя
export function getAvailableChambers(member) {
  const available = [];
  
  const chamberRoles = {
    'sf': [ROLES.SENATOR, ROLES.SENATOR_NO_VOTE],
    'gd_rublevka': [ROLES.DEPUTY, ROLES.DEPUTY_NO_VOTE, ROLES.RUBLEVKA],
    'gd_arbat': [ROLES.DEPUTY, ROLES.DEPUTY_NO_VOTE, ROLES.ARBAT],
    'gd_patricki': [ROLES.DEPUTY, ROLES.DEPUTY_NO_VOTE, ROLES.PATRICKI],
    'gd_tverskoy': [ROLES.DEPUTY, ROLES.DEPUTY_NO_VOTE, ROLES.TVERSKOY]
  };
  
  for (const [chamber, requiredRoles] of Object.entries(chamberRoles)) {
    if (requiredRoles.some(roleId => member.roles.cache.has(roleId))) {
      available.push({
        value: chamber,
        label: CHAMBER_NAMES[chamber]
      });
    }
  }
  
  return available;
}

export async function safeReply(interaction, content, options = {}) {
    try {
      if (interaction.replied || interaction.deferred) {
        return null;
      }
  
      const response = await interaction.reply({ 
        content, 
        flags: 64, 
        ...options 
      });
      
      setTimeout(async () => {
        try {
          await response.delete();
        } catch (deleteError) {
          // Игнорируем ошибки удаления
        }
      }, 3500);
      
      return response;
    } catch (error) {
      console.error("❌ Error in safeReply:", error);
      return null;
    }
  }
