import { createClient } from 'redis';

const redisClient = createClient({
  // You may need to configure the URL if your Redis server is not on localhost
  // url: 'redis://:password@hostname:port'
});

redisClient.on('error', (err) => console.error('❌ Redis Client Error', err));
redisClient.on('connect', () => console.log('✅ Connected to Redis'));
redisClient.on('reconnecting', () => console.log('🔄 Reconnecting to Redis...'));
redisClient.on('end', () => console.log('🚪 Disconnected from Redis'));

// Connect the client
(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.error('❌ Failed to connect to Redis:', err);
  }
})();

export const client = redisClient;

// A helper function to safely disconnect
export const disconnect = async () => {
  if (redisClient.isOpen) {
    await redisClient.quit();
  }
};
