// * Rivalytics Discord Bot entrypoint (modular command router)
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
    handleWatchCommand,
    handleUnwatchCommand,
    handleWatchlistCommand,
    commandMap
} from './index.js';
import { handleScrimsInteraction } from './commands/scrims.js';
import { handleMatchesInteraction } from './commands/matches.js';
import { initWatchlist } from './watchlist.js';

// * Discord client with required intents (guild messages + content for prefix commands)
const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Command handler lookup keyed by exported handler names referenced in commandMap
const handlerLookup = {
    handleHeroesCommand,
    handleMatchesCommand,
    handleScrimsCommand,
    handleScrimHeroesCommand,
    handleTournCommand,
    handleEncountersCommand,
    handleHelpCommand,
    handleGenExampleCommand,
    handleWatchCommand,
    handleUnwatchCommand,
    handleWatchlistCommand
};

// Resolve a handler function by user-entered command trigger
function findHandler(command) {
    const key = commandMap[command];
    return key ? handlerLookup[key] : null;
}

//. Fail fast if no bot token is supplied
if (!process.env.DISCORD_BOT_TOKEN) {
    console.log('❌ Discord bot token not provided. Please set DISCORD_BOT_TOKEN in .env file.');
    process.exit(1);
}

// * Login and attach runtime event listeners
discordClient.login(process.env.DISCORD_BOT_TOKEN);

discordClient.once('clientReady', () => {
    console.log(`🤖 Discord bot logged in as ${discordClient.user.tag}!`);
    // Initialize watchlist scheduler after client is ready
    try {
        initWatchlist(discordClient);
    } catch (e) {
        console.error('❌ Failed to initialize watchlist:', e);
    }
});

discordClient.on('messageCreate', async (message) => {
    if (message.author.bot) return; // ignore other bots/self

    const args = message.content.trim().split(/ +/);
    const command = args[0].toLowerCase();
    const handler = findHandler(command);
    if (!handler) return; // not a recognized command trigger

    try {
        await handler(message, args); // * Delegate to command module
    } catch (e) {
        console.error('Discord command error:', e); // ! Unexpected runtime error
        try { await message.reply('❌ An error occurred while processing your command.'); } catch (_) { /* swallow */ }
    }
});

if (VERBOSE) console.log('🤖 Rivalytics Discord Bot (modular) starting...');

// * Component Interaction handling (replay buttons etc.)
discordClient.on('interactionCreate', async (interaction) => {
    try {
        // Scrims replay buttons
        if (await handleScrimsInteraction(interaction)) return;
        if (await handleMatchesInteraction(interaction)) return;
        // Future: other handlers
    } catch (e) {
        if (VERBOSE) console.error('Interaction handling error:', e);
        if (interaction.isRepliable()) {
            try { await interaction.reply({ content: '❌ Interaction failed.', ephemeral: true }); } catch (_) { }
        }
    }
});
