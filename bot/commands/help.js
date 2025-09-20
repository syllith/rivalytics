import { getHelpText } from '../index.js';

// * Handle the !help command: reply with aggregated help text (truncate near Discord limit)
export async function handleHelpCommand(message, args) {
  const text = getHelpText();
  // Discord hard limit ~2000 chars; use a safe margin for potential formatting characters
  await message.reply(text.length > 1900 ? text.slice(0, 1990) + '…' : text);
}
