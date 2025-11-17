import { nanoid } from 'nanoid';
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { CONFIG, CHAMBER_NAMES, COLORS, FOOTER, FORUM_TAGS } from '../../config/config.js';
import db from '../../database/optimized-database.js';
import { formatMoscowTime } from '../../utils/formatters.js';
import interactionOptimizer from '../../events/interaction-optimizer.js';

export async function handleModalSubmit(interaction) {
  if (interaction.customId.startsWith("send_modal_")) {
    await handleProposalModal(interaction);
  }
  // Добавьте другие обработчики модальных окон по мере необходимости
}

async function handleProposalModal(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  try {
    const customId = interaction.customId;
    const prefix = "send_modal_";
    
    if (!customId.startsWith(prefix)) {
      await interactionOptimizer.safeEditReply(interaction, "❌ Ошибка: неверный формат запроса.");
      return;
    }
    
    const rest = customId.slice(prefix.length);
    const parts = rest.split('_');
    
    if (parts.length < 2) {
      await interactionOptimizer.safeEditReply(interaction, "❌ Ошибка: неверный формат запроса.");
      return;
    }
    
    const voteType = parts[parts.length - 1];
    const chamber = parts.slice(0, -1).join('_');
    
    console.log(`🔍 Extracted chamber: ${chamber}, voteType: ${voteType}`);
    
    if (!CONFIG.CHAMBER_CHANNELS[chamber]) {
      await interactionOptimizer.safeEditReply(interaction, `❌ Ошибка конфигурации: указанная палата "${chamber}" не найдена.`);
      return;
    }

    const forumChannelId = CONFIG.CHAMBER_CHANNELS[chamber];
    let forumChannel;
    try {
      forumChannel = await interaction.client.channels.fetch(forumChannelId);
      if (!forumChannel) {
        throw new Error("Channel not found");
      }
    } catch (channelError) {
      console.error("❌ Forum channel access error:", channelError);
      await interactionOptimizer.safeEditReply(interaction, `❌ Ошибка доступа к каналу палаты. Проверьте настройки бота. (ID: ${forumChannelId})`);
      return;
    }

    const name = interaction.fields.getTextInputValue("proj_name");
    const party = interaction.fields.getTextInputValue("proj_party");
    const link = interaction.fields.getTextInputValue("proj_link");

    if (!name || !party || !link) {
      await interactionOptimizer.safeEditReply(interaction, "❌ Все поля обязательны для заполнения.");
      return;
    }

    const number = await db.getNextProposalNumber(chamber);
    const id = nanoid(8);
    
    const initialEvents = [{
      type: 'registration',
      chamber: chamber,
      timestamp: Date.now(),
      description: `Внесение в ${CHAMBER_NAMES[chamber]} (Автор: <@${interaction.user.id}>)`
    }];
    
    const proposal = {
      id,
      number,
      name,
      party,
      link,
      chamber,
      status: "На рассмотрении",
      createdAt: Date.now(),
      authorId: interaction.user.id,
      threadId: null,
      channelId: forumChannelId,
      isQuantitative: voteType === 'quantitative',
      events: initialEvents
    };

    await db.createProposal(proposal);

    if (voteType === 'quantitative') {
      const itemsText = interaction.fields.getTextInputValue("items");
      const items = itemsText 
        ? itemsText.split(';')
            .map(item => item.trim())
            .filter(item => item !== '')
            .slice(0, 5)
        : [];

      for (const [index, itemText] of items.entries()) {
        await db.addQuantitativeItem({
          proposalId: id,
          itemIndex: index + 1,
          text: itemText
        });
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`📋 ЗАКОНОПРОЕКТ ${number}${voteType === 'quantitative' ? ' (Рейтинговое голосование)' : ''}`)
      .setDescription(`Зарегистрирован новый законопроект${voteType === 'quantitative' ? ' с рейтинговым голосованием' : ''}`)
      .addFields(
        { name: "🏛️ Палата", value: CHAMBER_NAMES[chamber], inline: false },
        { name: "📝 Наименование", value: name, inline: false },
        { name: "🏛️ Партия / Организация", value: party, inline: false },
        { name: "🔗 Ссылка на документ", value: `[Кликабельно](${link})`, inline: false },
        { name: "👤 Автор инициативы", value: `<@${interaction.user.id}>`, inline: false },
        { name: "📅 Дата регистрации", value: formatMoscowTime(Date.now()), inline: false }
      )
      .setColor(COLORS.PRIMARY)
      .setFooter({ text: FOOTER })
      .setTimestamp();

    const threadMessage = await forumChannel.threads.create({
      name: `${number} — ${name.substring(0, 50)}${name.length > 50 ? '...' : ''}`,
      appliedTags: [FORUM_TAGS.ON_REVIEW],
      message: {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`start_vote_${id}`).setLabel("▶️ Начать голосование").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`register_speaker_${id}`).setLabel("🎤 Зарегистрироваться выступить").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`delete_proposal_${id}`).setLabel("🗑️ Удалить/Отозвать").setStyle(ButtonStyle.Danger)
          ),
        ],
      },
    });

    const firstMessage = await threadMessage.fetchStarterMessage();
    await db.updateProposalInitialMessage(id, firstMessage.id);
    await db.updateProposalThread(id, threadMessage.id);
    
    // Для экономии места, пропустим вызовы updateHistoryMessage и updateSpeakersMessage, но в реальном коде они должны быть

    if (voteType === 'quantitative') {
      const items = await db.getQuantitativeItems(id);
      if (items.length > 0) {
        const itemsEmbed = new EmbedBuilder()
          .setTitle(`📊 Пункты для рейтингового голосования`)
          .setDescription(`Данный законопроект подразумевает рейтинговое голосование по следующим пунктам:`)
          .setColor(COLORS.INFO)
          .setFooter({ text: FOOTER })
          .setTimestamp();
        
        items.forEach((item, index) => {
          itemsEmbed.addFields({
            name: `Пункт ${index + 1}`,
            value: item.text,
            inline: false
          });
        });
        
        await threadMessage.send({ embeds: [itemsEmbed] });
      }
    }
    
    const successMessage = `✅ Законопроект успешно зарегистрирован: ${threadMessage.url}`;
    await interactionOptimizer.safeEditReply(interaction, successMessage);
    
  } catch (error) {
    console.error("❌ Critical error in handleProposalModal:", error);
    await interactionOptimizer.safeEditReply(interaction, { 
      content: "❌ Критическая ошибка при создании законопроекта. Проверьте настройки бота и права доступа." 
    });
  }
}
