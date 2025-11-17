import { CONFIG, CHAMBER_CHAIRMAN_ROLES, CHANNEL_TO_CHAMBER, CHAMBER_NAMES } from '../config/config.js';

// Функция проверки прав администратора
export function isAdmin(member) {
  return member.roles.cache.has(CONFIG.ROLES.ADMIN) || member.roles.cache.has(CONFIG.ROLES.SYSADMIN);
}

// Функция проверки прав председателя для палаты
export function isChamberChairman(member, chamber) {
  const requiredRoles = CHAMBER_CHAIRMAN_ROLES[chamber];
  if (!requiredRoles) return false;
  return requiredRoles.some(roleId => member.roles.cache.has(roleId));
}

// Функция проверки прав правительства для палаты
export function isGovernmentChairman(member, chamber) {
  return member.roles.cache.has(CONFIG.ROLES.GOVERNMENT_CHAIRMAN) && 
         member.roles.cache.has(getChamberTerritoryRole(chamber));
}

// Функция получения роли территории для палаты
export function getChamberTerritoryRole(chamber) {
  switch(chamber) {
    case 'gd_rublevka': return CONFIG.ROLES.RUBLEVKA;
    case 'gd_arbat': return CONFIG.ROLES.ARBAT;
    case 'gd_patricki': return CONFIG.ROLES.PATRICKI;
    case 'gd_tverskoy': return CONFIG.ROLES.TVERSKOY;
    default: return null;
  }
}

// Функция для получения палаты по ID канала
export function getChamberByChannel(channelId) {
  return CHANNEL_TO_CHAMBER[channelId];
}

// Функция для получения доступных палат для пользователя
export function getAvailableChambers(member) {
  const available = [];
  
  const chamberRoles = {
    'sf': [CONFIG.ROLES.SENATOR, CONFIG.ROLES.SENATOR_NO_VOTE],
    'gd_rublevka': [CONFIG.ROLES.DEPUTY, CONFIG.ROLES.DEPUTY_NO_VOTE, CONFIG.ROLES.RUBLEVKA],
    'gd_arbat': [CONFIG.ROLES.DEPUTY, CONFIG.ROLES.DEPUTY_NO_VOTE, CONFIG.ROLES.ARBAT],
    'gd_patricki': [CONFIG.ROLES.DEPUTY, CONFIG.ROLES.DEPUTY_NO_VOTE, CONFIG.ROLES.PATRICKI],
    'gd_tverskoy': [CONFIG.ROLES.DEPUTY, CONFIG.ROLES.DEPUTY_NO_VOTE, CONFIG.ROLES.TVERSKOY]
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
