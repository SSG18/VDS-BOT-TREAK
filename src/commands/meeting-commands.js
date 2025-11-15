import { nanoid } from 'nanoid';
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { CONFIG, CHAMBER_NAMES, COLORS, FOOTER } from '../config/config.js';
import { getChamberByChannel, isChamberChairman, isAdmin } from '../utils/permissions.js';
import db from '../database/optimized-database.js';
import interactionOptimizer from '../events/interaction-optimizer.js';

export const meetingCommands = {
  async createMeeting(interaction) {
    const member = interaction.member;

    // Определяем палату по каналу
    const chamber = getChamberByChannel(interaction.channelId);
    if (!chamber) {
      await interactionOptimizer.safeReply(interaction, "❌ Эта команда может быть использована только в канале для заседаний.");
      return;
    }

    // Проверяем права председателя для этой палаты
    if (!isChamberChairman(member, chamber) && !isAdmin(member)) {
      await interactionOptimizer.safeReply(interaction, "❌ У вас нет прав для создания заседания в этой палате.");
      return;
    }

    const title = interaction.options.getString("title", true);
    const date = interaction.options.getString("date", true);

    const id = nanoid(8);
    const meeting = {
      id,
      title,
      meetingDate: date,
      chamber: chamber,
      channelId: interaction.channelId,
      messageId: null,
      threadId: null,
      createdAt: Date.now(),
      durationMs: 0,
      expiresAt: 0,
      open: 0,
      quorum: 0,
      totalMembers: 0,
      status: 'planned'
    };

    await db.createMeeting(meeting);

    try {
      // Получаем роль для упоминания
      const mentionRoleId = CONFIG.MEETING_MENTION_ROLES[chamber];

      const embed = new EmbedBuilder()
        .setTitle(`📅 Заседание: ${title}`)
        .setDescription(`Заседание запланировано на **${date}**`)
        .addFields(
          { name: "🏛️ Палата", value: CHAMBER_NAMES[chamber], inline: true },
          { name: "📅 Дата и время", value: date, inline: true },
          { name: "📋 Статус", value: "Запланировано", inline: true }
        )
        .setColor(COLORS.PRIMARY)
        .setFooter({ text: FOOTER })
        .setTimestamp();

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`start_registration_${id}`).setLabel("Начать регистрацию").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`cancel_meeting_${id}`).setLabel("Отменить").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`postpone_meeting_${id}`).setLabel("Перенести").setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ 
        content: mentionRoleId ? `<@&${mentionRoleId}>` : null, 
        embeds: [embed], 
        components: [buttons]
      });
      
      // Получаем сообщение после отправки
      const message = await interaction.fetchReply();
      await db.updateMeetingMessage(id, message.id);
    } catch (e) {
      console.error("❌ Error sending meeting message:", e);
      await interaction.editReply({ content: "❌ Ошибка при создании заседания." });
    }
  },

  async resetMeetingRoles(interaction) {
    const member = interaction.member;
    if (!isAdmin(member)) {
      await interactionOptimizer.safeReply(interaction, "❌ У вас нет прав для этой команды.");
      return;
    }
    
    await interactionOptimizer.safeReply(interaction, "🔄 Запуск снятия роли у всех (начинаю)...");
    
    try {
      const guildMembers = await interaction.guild.members.fetch();
      let count = 0;
      
      // Снимаем все роли для голосования
      for (const [, m] of guildMembers) {
        for (const roleId of Object.values(CONFIG.VOTER_ROLES_BY_CHAMBER)) {
          if (m.roles.cache.has(roleId)) {
            try {
              await m.roles.remove(roleId, "Снято командой /res_meeting");
              count++;
            } catch (e) {
              console.error("❌ Failed to remove role:", m.id, e);
            }
          }
        }
      }
      
      await interactionOptimizer.safeFollowUp(interaction, `✅ Роли сняты у ${count} участников.`);
    } catch (e) {
      console.error("❌ Error in res_meeting:", e);
      await interactionOptimizer.safeFollowUp(interaction, "❌ Ошибка при снятии ролей.");
    }
  }
};