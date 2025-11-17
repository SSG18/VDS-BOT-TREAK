import logger from '../utils/logger.js';

export class InteractionOptimizer {
  constructor() {
    this.pendingReplies = new Map();
    this.rateLimits = new Map();
  }

  // Оптимизированная обработка взаимодействий с защитой от дублирования
  async handleInteraction(interaction, handler) {
    const key = `${interaction.user.id}_${interaction.customId || interaction.commandName}`;
    
    // Защита от дублирующих взаимодействий
    if (this.pendingReplies.has(key)) {
      return;
    }

    // Проверка rate limit
    if (this.isRateLimited(key)) {
      await this.safeReply(interaction, '❌ Слишком много запросов. Подождите немного.');
      return;
    }

    this.pendingReplies.set(key, true);
    
    try {
      await handler(interaction);
    } catch (error) {
      logger.error('Interaction error:', error);
      await this.handleError(interaction, error);
    } finally {
      setTimeout(() => this.pendingReplies.delete(key), 3000);
    }
  }

  isRateLimited(key) {
    const now = Date.now();
    const userLimit = this.rateLimits.get(key) || { count: 0, lastReset: now };
    
    // Сбрасываем счетчик каждые 10 секунд
    if (now - userLimit.lastReset > 10000) {
      userLimit.count = 0;
      userLimit.lastReset = now;
    }
    
    userLimit.count++;
    this.rateLimits.set(key, userLimit);
    
    return userLimit.count > 5; // Максимум 5 запросов в 10 секунд
  }

  async safeReply(interaction, content, options = {}) {
    if (interaction.replied || interaction.deferred) {
      return null;
    }

    try {
      let replyData;
      
      // Если content - объект (с content и components), используем его как есть
      if (typeof content === 'object' && content !== null) {
        replyData = { ...content, flags: 64 }; // Добавляем ephemeral флаг
      } else {
        // Если content - строка, создаем объект с content
        replyData = { content, flags: 64, ...options };
      }

      const response = await interaction.reply(replyData);
      
      // Удаляем сообщение через 7 секунд
      setTimeout(async () => {
        try {
          await response.delete();
        } catch (error) {
          // Игнорируем ошибки удаления (например, если сообщение уже удалено)
        }
      }, 15000);
      
      return response;
    } catch (error) {
      logger.error("Error in safeReply:", error);
      return null;
    }
  }

  async safeFollowUp(interaction, content, options = {}) {
    try {
      const response = await interaction.followUp({ 
        content, 
        flags: 64, // Ephemeral
        ...options 
      });
      
      // Удаляем сообщение через 7 секунд
      setTimeout(async () => {
        try {
          await response.delete();
        } catch (error) {
          // Игнорируем ошибки удаления
        }
      }, 15000);
      
      return response;
    } catch (error) {
      logger.error("Error in safeFollowUp:", error);
      return null;
    }
  }

  async safeEditReply(interaction, content, options = {}) {
    try {
      const response = await interaction.editReply({ 
        content, 
        ...options 
      });
      
      // Если это ephemeral сообщение, удаляем через 7 секунд
      if (interaction.ephemeral) {
        setTimeout(async () => {
          try {
            await response.delete();
          } catch (error) {
            // Игнорируем ошибки удаления
          }
        }, 15000);
      }
      
      return response;
    } catch (error) {
      logger.error("Error in safeEditReply:", error);
      return null;
    }
  }

  async handleError(interaction, error) {
    try {
      if (interaction.replied || interaction.deferred) {
        await this.safeFollowUp(interaction, '❌ Произошла ошибка при обработке запроса.');
      } else {
        await this.safeReply(interaction, '❌ Произошла ошибка при обработке запроса.');
      }
    } catch (replyError) {
      logger.error('Could not send error message:', replyError);
    }
  }
}

export default new InteractionOptimizer();

