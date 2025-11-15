import logger from './logger.js';

export class PerformanceOptimizer {
  constructor() {
    this.metrics = new Map();
    this.slowThreshold = 1000; // 1 second
  }

  // Декоратор для измерения производительности методов
  measurePerformance(target, propertyName, descriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args) {
      const start = Date.now();
      try {
        const result = await originalMethod.apply(this, args);
        const duration = Date.now() - start;
        
        if (duration > this.slowThreshold) {
          logger.warn(`Slow operation detected: ${propertyName} took ${duration}ms`);
        }
        
        this.recordMetric(propertyName, duration);
        return result;
      } catch (error) {
        const duration = Date.now() - start;
        logger.error(`Operation failed: ${propertyName} failed after ${duration}ms:`, error);
        throw error;
      }
    };
    
    return descriptor;
  }

  recordMetric(operation, duration) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, {
        count: 0,
        totalTime: 0,
        maxTime: 0
      });
    }
    
    const metric = this.metrics.get(operation);
    metric.count++;
    metric.totalTime += duration;
    metric.maxTime = Math.max(metric.maxTime, duration);
  }

  getMetrics() {
    const results = [];
    for (const [operation, metric] of this.metrics) {
      results.push({
        operation,
        count: metric.count,
        averageTime: metric.totalTime / metric.count,
        maxTime: metric.maxTime
      });
    }
    return results;
  }

  // Пакетная обработка для массовых операций
  async processInBatches(items, batchSize, processFn) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    const results = [];
    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map(item => processFn(item))
      );
      results.push(...batchResults);
    }

    return results;
  }

  // Очистка метрик
  clearMetrics() {
    this.metrics.clear();
  }
}

export const optimizer = new PerformanceOptimizer();