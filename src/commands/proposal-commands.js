import { StringSelectMenuBuilder, ActionRowBuilder } from 'discord.js';
import { getAvailableChambers } from '../utils/permissions.js';
import interactionOptimizer from '../events/interaction-optimizer.js'; // Импорт синглтона

export async function sendCommand(interaction) {
  const availableChambers = getAvailableChambers(interaction.member);

  if (availableChambers.length === 0) {
    await interactionOptimizer.safeReply(interaction, "❌ У вас нет доступа ни к одной палате для внесения законопроектов.");
    return;
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`chamber_select_send`)
    .setPlaceholder('Выберите палату для внесения законопроекта')
    .addOptions(
      availableChambers.map(chamber => ({
        label: chamber.label,
        value: chamber.value
      }))
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);

  await interactionOptimizer.safeReply(interaction, {
    content: '📋 Выберите палату для внесения законопроекта:',
    components: [row]
  });
}
