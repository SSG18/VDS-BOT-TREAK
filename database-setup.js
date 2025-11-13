// database-setup.js
import db from './database.js';

async function setupDatabase() {
  try {
    console.log('🔄 Setting up database...');
    // Таблицы создаются автоматически при инициализации
    console.log('✅ Database setup completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

setupDatabase();