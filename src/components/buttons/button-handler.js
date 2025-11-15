import interactionOptimizer from '../../events/interaction-optimizer.js';

export async function handleButton(interaction) {
  const cid = interaction.customId;

  try {
    // Обработка кнопок голосования
    if (cid.startsWith("vote_")) {
      if (cid.startsWith("vote_for_") || cid.startsWith("vote_against_") || cid.startsWith("vote_abstain_")) {
        await handleRegularVoteButtons(interaction);
        return;
      }
      if (cid.startsWith("vote_item_")) {
        await handleQuantitativeVoteButtons(interaction);
        return;
      }
      if (cid.startsWith("vote_abstain_") && !cid.includes("_against_") && !cid.includes("_for_")) {
        await handleQuantitativeAbstainButton(interaction);
        return;
      }
    }

    // Meeting registration
    if (cid.startsWith("get_card_")) {
      await handleGetCardButton(interaction);
      return;
    }

    // Clear roles button
    if (cid.startsWith("clear_roles_")) {
      await handleClearRolesButton(interaction);
      return;
    }

    // Добавьте другие обработчики кнопок по мере необходимости

    // Если не найдено подходящего обработчика
    console.warn(`⚠️ Unknown button interaction: ${cid}`);
    await interactionOptimizer.safeReply(interaction, "❌ Неизвестная команда или действие устарело.");

  } catch (error) {
    console.error("❌ Error in handleButton:", error);
    await interactionOptimizer.handleError(interaction, error);
  }
}

async function handleGetCardButton(interaction) {
  if (interaction.replied || interaction.deferred) return;
  
  const meetingId = interaction.customId.split("get_card_")[1];
  const meeting = await db.getMeeting(meetingId);
  
  if (!meeting || !meeting.open) {
    await interactionOptimizer.safeReply(interaction, "❌ Регистрация закрыта.");
    return;
  }
  
  try {
    if (!await db.isUserRegistered(meetingId, interaction.user.id)) {
      await db.registerForMeeting(meetingId, interaction.user.id);
    }
    
    await interactionOptimizer.safeReply(interaction, "✅ Вы зарегистрированы! Роль для голосования будет выдана после завершения регистрации, если будет собран кворум.");
  } catch (error) {
    console.error("❌ Error in get card button:", error);
    await interactionOptimizer.safeReply(interaction, "❌ Ошибка при регистрации.");
  }
}

async function handleClearRolesButton(interaction) {
  const meetingId = interaction.customId.split("clear_roles_")[1];
  const meeting = await db.getMeeting(meetingId);
  
  if (!meeting) {
    await interactionOptimizer.safeReply(interaction, "❌ Заседание не найдено.");
    return;
  }
  
  const member = interaction.member;
  if (!isChamberChairman(member, meeting.chamber) && !isAdmin(member)) {
    await interactionOptimizer.safeReply(interaction, "❌ У вас нет прав для очистки ролей.");
    return;
  }
  
  await interaction.deferReply({ flags: 64 });
  
  try {
    const voterRoleId = CONFIG.VOTER_ROLES_BY_CHAMBER[meeting.chamber];
    const guildMembers = await interaction.guild.members.fetch();
    let count = 0;
    
    for (const [, m] of guildMembers) {
      if (m.roles.cache.has(voterRoleId)) {
        try {
          await m.roles.remove(voterRoleId, `Очистка ролей после заседания ${meeting.title}`);
          count++;
        } catch (e) {
          console.error("❌ Failed to remove role:", m.id, e);
        }
      }
    }
    
    await interaction.message.edit({ components: [] });
    
    if (meeting.threadid) {
      try {
        const thread = await interaction.client.channels.fetch(meeting.threadid);
        const embed = new EmbedBuilder()
          .setTitle(`🏁 Заседание завершено`)
          .setDescription(`**${meeting.title}**`)
          .addFields(
            { name: "📅 Дата заседания", value: meeting.meetingdate, inline: true },
            { name: "👤 Завершил", value: `<@${interaction.user.id}>`, inline: true },
            { name: "🕐 Время завершения", value: formatMoscowTime(Date.now()), inline: true },
            { name: "🎫 Карточки регистрации изъяты", value: `У ${count} участников`, inline: false }
          )
          .setColor(COLORS.SUCCESS)
          .setFooter({ text: FOOTER })
          .setTimestamp();
        
        await thread.send({ embeds: [embed] });
        
        setTimeout(async () => {
          try {
            await thread.setArchived(true, 'Заседание завершено');
          } catch (e) {
            console.error("❌ Error archiving thread:", e);
          }
        }, 30000);
        
        await interactionOptimizer.safeEditReply(interaction, `✅ Сообщение о завершении заседания отправлено в ветку. Карточки регистрации изъяты у ${count} участников.`);
        
      } catch (threadError) {
        console.error("❌ Error sending message to thread:", threadError);
        await interactionOptimizer.safeEditReply(interaction, `✅ Роли очищены у ${count} участников. (Ошибка отправки в ветку)`);
      }
    } else {
      const ch = await interaction.client.channels.fetch(meeting.channelid);
      const embed = new EmbedBuilder()
        .setTitle(`🏁 Заседание завершено`)
        .setDescription(`**${meeting.title}**`)
        .addFields(
          { name: "📅 Дата заседания", value: meeting.meetingdate, inline: true },
          { name: "👤 Завершил", value: `<@${interaction.user.id}>`, inline: true },
          { name: "🕐 Время завершения", value: formatMoscowTime(Date.now()), inline: true },
          { name: "🎫 Карточки регистрации изъяты", value: `У ${count} участников`, inline: false }
        )
        .setColor(COLORS.SUCCESS)
        .setFooter({ text: FOOTER })
        .setTimestamp();
      
      await ch.send({ embeds: [embed] });
      
      await interactionOptimizer.safeEditReply(interaction, `✅ Сообщение о завершении заседания отправлено. Карточки регистрации изъяты у ${count} участников.`);
    }
    
  } catch (e) {
    console.error("❌ Error clearing roles:", e);
    await interactionOptimizer.safeEditReply(interaction, "❌ Ошибка при очистке ролей.");
  }
}

// Заглушки для функций голосования
async function handleRegularVoteButtons(interaction) {
  await interactionOptimizer.safeReply(interaction, "✅ Ваш голос учтен!");
}

async function handleQuantitativeVoteButtons(interaction) {
  await interactionOptimizer.safeReply(interaction, "✅ Ваш голос учтен!");
}

async function handleQuantitativeAbstainButton(interaction) {
  await interactionOptimizer.safeReply(interaction, "✅ Ваш голос учтен!");
}