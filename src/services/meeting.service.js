// src/services/meeting.service.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MeetingRepository } from '../database/repositories/meeting.repository.js';
import { VOTER_ROLES_BY_CHAMBER, COLORS, FOOTER } from '../../config.js';
import { formatTimeLeft, formatMoscowTime } from '../../utils.js';

// This map should be managed within the service to avoid global scope pollution
const meetingTimers = new Map();

export class MeetingService {
  /**
   * Starts a ticker for a specific meeting to update its status and handle expiration.
   * @param {import('discord.js').Client} client The Discord client instance.
   * @param {string} meetingId The ID of the meeting.
   */
  static async startTicker(client, meetingId) {
    if (meetingTimers.has(meetingId)) {
      clearInterval(meetingTimers.get(meetingId));
      meetingTimers.delete(meetingId);
    }

    const updateFn = async () => {
      const meeting = await MeetingRepository.findById(meetingId);
      if (!meeting || !meeting.open) {
        if (meetingTimers.has(meetingId)) {
          clearInterval(meetingTimers.get(meetingId));
          meetingTimers.delete(meetingId);
        }
        return;
      }

      const left = meeting.expiresat - Date.now();
      try {
        const channel = await client.channels.fetch(meeting.channelid);
        const message = await channel.messages.fetch(meeting.messageid);

        if (left <= 0) {
          await this.finalizeMeeting(client, meeting, channel, message);
          if (meetingTimers.has(meetingId)) {
            clearInterval(meetingTimers.get(meetingId));
            meetingTimers.delete(meetingId);
          }
        } else {
          await this.updateMeetingMessage(meeting, message, left);
        }
      } catch (e) {
        console.error(`❌ Meeting ticker update failed for meeting ${meetingId}:`, e);
        if (meetingTimers.has(meetingId)) {
          clearInterval(meetingTimers.get(meetingId));
          meetingTimers.delete(meetingId);
        }
      }
    };

    await updateFn();
    const intervalId = setInterval(updateFn, 10000);
    meetingTimers.set(meetingId, intervalId);
  }

  /**
   * Updates the Discord message for an ongoing meeting registration.
   * @private
   */
  static async updateMeetingMessage(meeting, message, timeLeft) {
    const leftStr = formatTimeLeft(timeLeft);
    const registeredCount = await MeetingRepository.getRegistrationCount(meeting.id);
    const quorum = meeting.quorum || 1;

    const embed = new EmbedBuilder()
      .setTitle("🔔 Открыта регистрация")
      .setDescription(`**${meeting.title}**`)
      .addFields(
        { name: "⏳ Время до конца регистрации", value: leftStr, inline: true },
        { name: "👥 Зарегистрировано", value: `${registeredCount}/${quorum}`, inline: true },
        { name: "📊 Статус кворума", value: registeredCount >= quorum ? "✅ Собран" : "❌ Не собран", inline: true }
      )
      .setColor(registeredCount >= quorum ? COLORS.SUCCESS : COLORS.WARNING)
      .setFooter({ text: FOOTER })
      .setTimestamp();

    await message.edit({ content: null, embeds: [embed] });
  }

  /**
   * Finalizes a meeting after the registration period ends.
   * @private
   */
  static async finalizeMeeting(client, meeting, channel, message) {
    await MeetingRepository.close(meeting.id);
    await MeetingRepository.update(meeting.id, { status: 'completed' });

    const registered = await MeetingRepository.getRegistrations(meeting.id);
    const registeredCount = registered.length;
    const isQuorumMet = registeredCount >= (meeting.quorum || 1);

    const listText = registeredCount > 0 ? registered.map(r => `<@${r.userid}>`).join("\n") : "Никто не зарегистрирован";

    const finalEmbed = new EmbedBuilder()
      .setTitle("📋 Регистрация завершена")
      .setDescription(`**${meeting.title}**`)
      .addFields(
        { name: "👥 Количество зарегистрированных", value: String(registeredCount), inline: true },
        { name: "📊 Требуемый кворум", value: String(meeting.quorum || 1), inline: true },
        { name: "📈 Статус кворума", value: isQuorumMet ? "✅ Кворум собран" : "❌ Кворум не собран", inline: true },
        { name: "👥 Общее количество членов", value: String(meeting.totalmembers || 0), inline: true },
        { name: "⏱️ Время регистрации", value: formatTimeLeft(meeting.durationms), inline: true },
        { name: "🕐 Начало регистрации", value: formatMoscowTime(Number(meeting.createdat)), inline: false },
        { name: "📝 Список зарегистрированных", value: listText.substring(0, 1024), inline: false }
      )
      .setColor(isQuorumMet ? COLORS.SUCCESS : COLORS.DANGER)
      .setFooter({ text: FOOTER })
      .setTimestamp();

    const buttonsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`clear_roles_${meeting.id}`).setLabel("🧹 Очистить роли").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`late_registration_${meeting.id}`).setLabel("⏰ Регистрация вне срока").setStyle(ButtonStyle.Secondary)
    );

    await message.edit({ content: null, embeds: [finalEmbed], components: [buttonsRow] });

    const thread = await this.getOrCreateMeetingThread(meeting, message);
    if (!thread) return;

    if (isQuorumMet) {
      await this.assignVoterRoles(thread, meeting, registered);
    } else {
      await thread.send(`❌ **Кворум не собран!** Зарегистрировано ${registeredCount} из ${meeting.quorum || 1} необходимых участников. Роли для голосования не выданы.`);
    }
  }
  
  /**
   * Assigns voter roles to registered members.
   * @private
   */
  static async assignVoterRoles(thread, meeting, registrations) {
    const voterRoleId = VOTER_ROLES_BY_CHAMBER[meeting.chamber];
    if (!voterRoleId) return;

    let rolesGiven = 0;
    let alreadyHadRoles = 0;

    for (const reg of registrations) {
      try {
        const member = await thread.guild.members.fetch(reg.userid);
        if (!member.roles.cache.has(voterRoleId)) {
          await member.roles.add(voterRoleId, `Registered for meeting ${meeting.title}`);
          rolesGiven++;
        } else {
          alreadyHadRoles++;
        }
      } catch (e) {
        console.error(`❌ Ошибка при выдаче роли голосования пользователю ${reg.userid}:`, e);
      }
    }

    if (rolesGiven > 0) {
      await thread.send(`✅ **Роли для голосования выданы!** Успешно выдано ${rolesGiven} ролей из ${registrations.length} зарегистрированных.`);
    } else if (registrations.length > 0) {
      await thread.send(`ℹ️ **Все зарегистрированные уже имеют роли для голосования.** (${alreadyHadRoles} участников)`);
    }
  }

  /**
   * Gets or creates a thread for a meeting message.
   * @private
   */
  static async getOrCreateMeetingThread(meeting, message) {
    try {
      const thread = await message.startThread({
        name: `📊 ${meeting.title} - Обсуждение`,
        autoArchiveDuration: 1440,
        reason: `Обсуждение заседания`
      });
      await MeetingRepository.update(meeting.id, { threadId: thread.id });
      return thread;
    } catch (error) {
      if (error.code === 10008) { // Message has no thread
         const thread = await message.channel.threads.fetch(message.id);
         return thread;
      }
      console.error("❌ Error getting or creating meeting thread:", error);
      return null;
    }
  }

  /**
   * Restores all active meeting tickers on bot startup.
   * @param {import('discord.js').Client} client The Discord client instance.
   */
  static async restoreAll(client) {
    const openMeetings = await MeetingRepository.getOpenMeetings();
    for (const meeting of openMeetings) {
      this.startTicker(client, meeting.id).catch(console.error);
    }
    return openMeetings.length;
  }
}
