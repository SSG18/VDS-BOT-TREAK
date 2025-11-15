import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from "discord.js";
import { validateConfig } from './config/config.js';
import { registerCommands } from './commands/command-registry.js';
import { setupEventHandlers } from './events/event-handlers.js';
import { restoreAllTimers } from './timers/timer-manager.js';
import { initializeDatabase } from './database/optimized-database.js';
import logger from './utils/logger.js';

// Валидация конфигурации
if (!validateConfig()) {
  logger.error('Configuration validation failed');
  process.exit(1);
}

// Создание клиента Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMembers, 
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.Reaction],
});

// Инициализация приложения
async function initializeApp() {
  try {
    logger.info('🚀 Initializing Congress Bot...');
    
    // Инициализация базы данных
    await initializeDatabase();
    
    // Регистрация команд
    await registerCommands();
    
    // Настройка обработчиков событий
    setupEventHandlers(client);
    
    // Запуск бота
    await client.login(process.env.DISCORD_TOKEN);
    
    // Восстановление таймеров после готовности
    client.once('ready', async () => {
      logger.info(`✅ Bot ready: ${client.user.tag}`);
      await restoreAllTimers();
    });
    
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    process.exit(1);
  }
}

// Обработка graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('🛑 Received SIGTERM, shutting down gracefully...');
  await client.destroy();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('🛑 Received SIGINT, shutting down gracefully...');
  await client.destroy();
  process.exit(0);
});

// Запуск приложения
initializeApp().catch(error => {
  logger.error('Fatal error during initialization:', error);
  process.exit(1);
});