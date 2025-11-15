class Logger {
  constructor() {
    this.colors = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m'
    };
  }

  getTimestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
  }

  info(message, ...args) {
    console.log(`${this.colors.blue}${this.getTimestamp()} ℹ️ INFO${this.colors.reset}:`, message, ...args);
  }

  error(message, ...args) {
    console.error(`${this.colors.red}${this.getTimestamp()} ❌ ERROR${this.colors.reset}:`, message, ...args);
  }

  warn(message, ...args) {
    console.warn(`${this.colors.yellow}${this.getTimestamp()} ⚠️ WARN${this.colors.reset}:`, message, ...args);
  }

  success(message, ...args) {
    console.log(`${this.colors.green}${this.getTimestamp()} ✅ SUCCESS${this.colors.reset}:`, message, ...args);
  }

  debug(message, ...args) {
    if (process.env.DEBUG) {
      console.log(`${this.colors.cyan}${this.getTimestamp()} 🐛 DEBUG${this.colors.reset}:`, message, ...args);
    }
  }
}

export default new Logger();