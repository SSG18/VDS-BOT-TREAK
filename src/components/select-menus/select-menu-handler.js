import { StringSelectMenuBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import interactionOptimizer from '../../events/interaction-optimizer.js';

export async function handleSelectMenu(interaction) {
  if (interaction.customId === 'chamber_select_send') {
    const chamber = interaction.values[0];
    
    // Создаем select menu для выбора типа голосования
    const voteTypeSelect = new StringSelectMenuBuilder()
      .setCustomId(`vote_type_select_${chamber}`)
      .setPlaceholder('Выберите тип голосования')
      .addOptions(
        {
          label: 'Обычное голосование',
          description: 'За/Против/Воздержался',
          value: 'regular'
        },
        {
          label: 'Рейтинговое голосование',
          description: 'Голосование по пунктам',
          value: 'quantitative'
        }
      );
    
    const row = new ActionRowBuilder().addComponents(voteTypeSelect);
    
    await interaction.update({
      content: '🗳️ Выберите тип голосования для законопроекта:',
      components: [row]
    });
    return;
  }
  
  if (interaction.customId.startsWith('vote_type_select_')) {
    const chamber = interaction.customId.split('vote_type_select_')[1];
    const voteType = interaction.values[0];
    
    let modal;
    
    if (voteType === 'regular') {
      modal = new ModalBuilder()
        .setCustomId(`send_modal_${chamber}_regular`)
        .setTitle(`Регистрация законопроекта`);
      
      const nameInput = new TextInputBuilder()
        .setCustomId("proj_name")
        .setLabel("Наименование законопроекта")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      const partyInput = new TextInputBuilder()
        .setCustomId("proj_party")
        .setLabel("Партия/организация")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      const linkInput = new TextInputBuilder()
        .setCustomId("proj_link")
        .setLabel("Ссылка на документ")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(partyInput),
        new ActionRowBuilder().addComponents(linkInput)
      );
    } else if (voteType === 'quantitative') {
      modal = new ModalBuilder()
        .setCustomId(`send_modal_${chamber}_quantitative`)
        .setTitle(`Регистрация (рейтинговое голос.)`);
      
      const nameInput = new TextInputBuilder()
        .setCustomId("proj_name")
        .setLabel("Наименование законопроекта")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      const partyInput = new TextInputBuilder()
        .setCustomId("proj_party")
        .setLabel("Партия/организация")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      const linkInput = new TextInputBuilder()
        .setCustomId("proj_link")
        .setLabel("Ссылка на документ")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      const itemsInput = new TextInputBuilder()
        .setCustomId("items")
        .setLabel("Пункты (через ;)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder("Пункт 1; Пункт 2; Пункт 3");
      
      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(partyInput),
        new ActionRowBuilder().addComponents(linkInput),
        new ActionRowBuilder().addComponents(itemsInput)
      );
    }
    
    await interaction.showModal(modal);
    return;
  }
}