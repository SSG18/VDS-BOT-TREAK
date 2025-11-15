import { Events } from 'discord.js';
import interactionOptimizer from './interaction-optimizer.js';
import { handleSlashCommand } from '../commands/command-registry.js';
import { handleSelectMenu } from '../components/select-menus/select-menu-handler.js';
import { handleModalSubmit } from '../components/modals/modal-handler.js';
import { handleButton } from '../components/buttons/button-handler.js';
import logger from '../utils/logger.js';

export function setupEventHandlers(client) {
  // Обработка взаимодействий (slash commands, buttons, select menus, modals)
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await interactionOptimizer.handleInteraction(interaction, () => handleSlashCommand(interaction));
      } else if (interaction.isStringSelectMenu()) {
        await interactionOptimizer.handleInteraction(interaction, () => handleSelectMenu(interaction));
      } else if (interaction.isModalSubmit()) {
        await interactionOptimizer.handleInteraction(interaction, () => handleModalSubmit(interaction));
      } else if (interaction.isButton()) {
        await interactionOptimizer.handleInteraction(interaction, () => handleButton(interaction));
      }
    } catch (error) {
      logger.error('Interaction handling error:', error);
    }
  });

  // Обработка ошибок
  client.on(Events.Error, (error) => {
    logger.error('Client error:', error);
  });

  // Предупреждения
  client.on(Events.Warn, (warning) => {
    logger.warn('Client warning:', warning);
  });

  // Переподключение
  client.on(Events.ShardReconnecting, () => {
    logger.info('Client reconnecting...');
  });

  // Успешное подключение
  client.on(Events.ShardReady, () => {
    logger.info('Client shard ready');
  });
}