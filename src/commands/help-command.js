import { EmbedBuilder } from 'discord.js';
import { CONFIG, COLORS, FOOTER } from '../config/config.js';
import { isAdmin, isChamberChairman } from '../utils/permissions.js';
import interactionOptimizer from '../events/interaction-optimizer.js';

export async function helpCommand(interaction) {
  await interaction.deferReply({ flags: 64 }); // Ephemeral

  const member = interaction.member;
  let description = '';

  // Раздел для депутатов
  if (member.roles.cache.has(CONFIG.ROLES.DEPUTY) || member.roles.cache.has(CONFIG.ROLES.DEPUTY_NO_VOTE)) {
    description += `**👥 Для депутатов:**\n`;
    description += `• Используйте команду \`/send\` для внесения законопроекта\n`;
    description += `• Выберите палату и тип голосования\n`;
    description += `• Заполните информацию о законопроекте\n`;
    description += `• Регистрируйтесь для выступлений в обсуждениях\n`;
    description += `• Участвуйте в голосованиях в соответствующих ветках\n`;
    description += `• Следите за ходом рассмотрения в хронологии\n\n`;
  }

  // Раздел для сенаторов
  if (member.roles.cache.has(CONFIG.ROLES.SENATOR) || member.roles.cache.has(CONFIG.ROLES.SENATOR_NO_VOTE)) {
    description += `**🏛️ Для членов Совета Федерации:**\n`;
    description += `• Используйте команду \`/send\` для внесения законопроекта\n`;
    description += `• Рассматривайте законопроекты, переданные из ГосДумы\n`;
    description += `• Участвуйте в окончательном голосовании\n`;
    description += `• Следите за подписанием Президентом\n\n`;
  }

  // Раздел для председателей
  if (isChamberChairman(member, 'sf') || isChamberChairman(member, 'gd_rublevka') || 
      isChamberChairman(member, 'gd_arbat') || isChamberChairman(member, 'gd_patricki') || 
      isChamberChairman(member, 'gd_tverskoy') || isAdmin(member)) {
    description += `**🎯 Для председателей и администраторов:**\n`;
    description += `• Используйте \`/create_meeting\` для создания заседаний\n`;
    description += `• Начинайте регистрацию с установкой кворума\n`;
    description += `• Запускайте голосования по законопроектам\n`;
    description += `• Управляйте списком выступающих\n`;
    description += `• Одобряйте/возвращайте законопроекты (Правительство)\n`;
    description += `• Подписывайте/отклоняйте законопроекты (Президент)\n`;
    description += `• Используйте \`/res_meeting\` для снятия ролей голосования\n\n`;
  }

  // Общая информация
  description += `**📋 Общие сведения:**\n`;
  description += `• Каждая палата имеет свой канал для обсуждений\n`;
  description += `• Голосования могут быть открытыми или тайными\n`;
  description += `• Поддерживаются разные формулы подсчета голосов\n`;
  description += `• Ведется полная хронология рассмотрения\n`;
  description += `• Автоматическая выдача ролей для голосования\n`;

  const helpEmbed = new EmbedBuilder()
    .setTitle('📖 Справка по использованию бота')
    .setDescription(description)
    .setColor(COLORS.PRIMARY)
    .setFooter({ text: FOOTER })
    .setTimestamp();

  await interactionOptimizer.safeEditReply(interaction, { embeds: [helpEmbed] });
}