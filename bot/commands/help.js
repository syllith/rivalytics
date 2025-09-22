import { getHelpText, getInfoText, commandMap } from '../index.js';

// * Handle the !help command: reply with aggregated help text (truncate near Discord limit)
export async function handleHelpCommand(message, args) {
  // Determine if original trigger was !info (so we show filtered list)
  const firstToken = (message.content || '').trim().split(/ +/)[0].toLowerCase();
  const isInfo = firstToken === '!info';
  const text = isInfo ? getInfoText() : getHelpText();
  await message.reply(text.length > 1900 ? text.slice(0, 1990) + '…' : text);
}
