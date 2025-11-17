// Исправленный логгер с защитой от ошибок
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

class Logger {
  getTimestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
  }

  info(message, ...args) {
    console.log(`${colors.blue}${this.getTimestamp()} ℹ️ INFO${colors.reset}:`, message, ...args);
  }

  error(message, ...args) {
    // Защита от циклических ошибок в логгере
    try {
      console.error(`${colors.red}${this.getTimestamp()} ❌ ERROR${colors.reset}:`, message, ...args);
    } catch (logError) {
      console.error('❌ LOGGER ERROR:', message?.substring?.(0, 100) || 'Unknown error');
    }
  }

  warn(message, ...args) {
    console.warn(`${colors.yellow}${this.getTimestamp()} ⚠️ WARN${colors.reset}:`, message, ...args);
  }

  success(message, ...args) {
    console.log(`${colors.green}${this.getTimestamp()} ✅ SUCCESS${colors.reset}:`, message, ...args);
  }

  debug(message, ...args) {
    if (process.env.DEBUG) {
      console.log(`${colors.cyan}${this.getTimestamp()} 🐛 DEBUG${colors.reset}:`, message, ...args);
    }
  }
}

// Создаем экземпляр с защитой от ошибок инициализации
let loggerInstance;
try {
  loggerInstance = new Logger();
} catch (error) {
  console.error('Failed to initialize logger, using fallback');
  loggerInstance = {
    info: (...args) => console.log('ℹ️ INFO:', ...args),
    error: (...args) => console.error('❌ ERROR:', ...args),
    warn: (...args) => console.warn('⚠️ WARN:', ...args),
    success: (...args) => console.log('✅ SUCCESS:', ...args),
    debug: (...args) => { if (process.env.DEBUG) console.log('🐛 DEBUG:', ...args); }
  };
}

export default loggerInstance;
