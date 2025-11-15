import { REST, Routes } from 'discord.js';
import { CONFIG } from '../config/config.js';
import { helpCommand } from './help-command.js';
import { sendCommand } from './proposal-commands.js';
import { meetingCommands } from './meeting-commands.js';
import logger from '../utils/logger.js';

const commands = [
  {
    name: 'help',
    description: 'Показать справку по использованию бота'
  },
  {
    name: 'send',
    description: 'Открыть форму регистрации законопроекта'
  },
  {
    name: 'create_meeting',
    description: 'Создать заседание (только для председателей)',
    options: [
      {
        name: 'title',
        type: 3, // STRING
        description: 'Наименование заседания',
        required: true
      },
      {
        name: 'date',
        type: 3, // STRING
        description: 'Дата и время заседания',
        required: true
      }
    ]
  },
  {
    name: 'res_meeting',
    description: 'Снять роль голосующего у всех (админы)'
  }
];

const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);

export async  function registerCommands() {
  try {
    logger.info('🔄 Registering commands...');
    await rest.put(
      Routes.applicationGuildCommands(CONFIG.CLIENT_ID, CONFIG.GUILD_ID),
      { body: commands }
    );
    logger.info('✅ Commands registered.');
  } catch (error) {
    logger.error('Error registering commands:', error);
  }
}

export async function handleSlashCommand(interaction) {
  const { commandName } = interaction;

  switch (commandName) {
    case 'help':
      await helpCommand(interaction);
      break;
    case 'send':
      await sendCommand(interaction);
      break;
    case 'create_meeting':
      await meetingCommands.createMeeting(interaction);
      break;
    case 'res_meeting':
      await meetingCommands.resetMeetingRoles(interaction);
      break;
    default:
      await interactionOptimizer.safeReply(interaction, '❌ Неизвестная команда.');
  }
}