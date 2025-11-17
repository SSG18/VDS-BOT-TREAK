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

  // Универсальная функция для безопасного преобразования контента в строку
  #ensureStringContent(content) {
    if (typeof content === 'string') {
      return content;
    }
    
    if (typeof content === 'object' && content !== null) {
      // Если это объект с полем content, используем его
      if (content.content && typeof content.content === 'string') {
        return content.content;
      }
      // Если это embed или другой объект, преобразуем в строку
      return JSON.stringify(content);
    }
    
    // Для других типов (числа, булевы значения и т.д.)
    return String(content);
  }

  // Создание безопасного объекта для ответа
  #createSafeReplyData(content, options = {}) {
    const baseData = { flags: 64, ...options }; // Добавляем ephemeral флаг
    
    if (typeof content === 'object' && content !== null) {
      // Если content - объект с полями для ответа, используем его
      if (content.content || content.embeds || content.components) {
        return { ...baseData, ...content };
      }
    }
    
    // Если content - строка или примитив, используем как content
    return { ...baseData, content: this.#ensureStringContent(content) };
  }

  async safeReply(interaction, content, options = {}) {
    if (interaction.replied || interaction.deferred) {
      return null;
    }

    try {
      const replyData = this.#createSafeReplyData(content, options);
      
      // Гарантируем, что content является строкой
      if (replyData.content) {
        replyData.content = this.#ensureStringContent(replyData.content);
      }

      const response = await interaction.reply(replyData);
      
      // Удаляем сообщение через 7 секунд
      setTimeout(async () => {
        try {
          await response.delete();
        } catch (error) {
          // Игнорируем ошибки удаления (например, если сообщение уже удалено)
        }
      }, 7000);
      
      return response;
    } catch (error) {
      logger.error("Error in safeReply:", error);
      return null;
    }
  }

  async safeFollowUp(interaction, content, options = {}) {
    try {
      const followUpData = this.#createSafeReplyData(content, options);
      
      // Гарантируем, что content является строкой
      if (followUpData.content) {
        followUpData.content = this.#ensureStringContent(followUpData.content);
      }

      const response = await interaction.followUp(followUpData);
      
      // Удаляем сообщение через 7 секунд
      setTimeout(async () => {
        try {
          await response.delete();
        } catch (error) {
          // Игнорируем ошибки удаления
        }
      }, 7000);
      
      return response;
    } catch (error) {
      logger.error("Error in safeFollowUp:", error);
      return null;
    }
  }

  async safeEditReply(interaction, content, options = {}) {
    try {
      let editData;
      
      if (typeof content === 'object' && content !== null) {
        // Если content - объект с полями для редактирования
        editData = { ...content, ...options };
      } else {
        // Если content - строка или примитив
        editData = { content: this.#ensureStringContent(content), ...options };
      }
      
      // Гарантируем, что content является строкой
      if (editData.content) {
        editData.content = this.#ensureStringContent(editData.content);
      }

      const response = await interaction.editReply(editData);
      
      // Если это ephemeral сообщение, удаляем через 7 секунд
      if (interaction.ephemeral) {
        setTimeout(async () => {
          try {
            await response.delete();
          } catch (error) {
            // Игнорируем ошибки удаления
          }
        }, 7000);
      }
      
      return response;
    } catch (error) {
      logger.error("Error in safeEditReply:", error);
      return null;
    }
  }

  async handleError(interaction, error) {
    try {
      const errorMessage = '❌ Произошла ошибка при обработке запроса.';
      
      if (interaction.replied || interaction.deferred) {
        await this.safeFollowUp(interaction, errorMessage);
      } else {
        await this.safeReply(interaction, errorMessage);
      }
    } catch (replyError) {
      logger.error('Could not send error message:', replyError);
    }
  }
}

export default new InteractionOptimizer();
