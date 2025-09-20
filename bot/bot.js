// Modular Discord Bot entry
import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';
import { VERBOSE } from './config.js';
import {
  handleHeroesCommand,
  handleMatchesCommand,
  handleScrimsCommand,
  handleScrimHeroesCommand,
  handleTournCommand,
  handleEncountersCommand,
  handleHelpCommand,
  handleGenExampleCommand,
  commandMap
} from './index.js';

dotenv.config();

const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const handlerLookup = {
  handleHeroesCommand,
  handleMatchesCommand,
  handleScrimsCommand,
  handleScrimHeroesCommand,
  handleTournCommand,
  handleEncountersCommand,
  handleHelpCommand,
  handleGenExampleCommand
};

function findHandler(command){
  const key = commandMap[command];
  return key ? handlerLookup[key] : null;
}

if (!process.env.DISCORD_BOT_TOKEN){
  console.log('❌ Discord bot token not provided. Please set DISCORD_BOT_TOKEN in .env file.');
  process.exit(1);
}

discordClient.login(process.env.DISCORD_BOT_TOKEN);

discordClient.once('clientReady', () => {
  console.log(`🤖 Discord bot logged in as ${discordClient.user.tag}!`);
});

discordClient.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const args = message.content.trim().split(/ +/);
  const command = args[0].toLowerCase();
  const handler = findHandler(command);
  if (!handler) return; // not a bot command
  try {
    await handler(message, args);
  } catch (e){
    console.error('Discord command error:', e);
    await message.reply('❌ An error occurred while processing your command.');
  }
});

console.log('🤖 Rivalytics Discord Bot (modular) starting...');
