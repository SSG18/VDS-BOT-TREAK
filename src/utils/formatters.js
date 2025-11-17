import { CHAMBER_NAMES } from '../config/config.js';

// Функция для безопасного преобразования любого значения в строку
export function safeString(value, defaultValue = 'Не указано') {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  
  if (typeof value === 'string') {
    return value;
  }
  
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return defaultValue;
    }
  }
  
  return defaultValue;
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
