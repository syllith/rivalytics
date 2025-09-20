import { getHelpText } from '../index.js';

export async function handleHelpCommand(message, args){
  const text = getHelpText();
  await message.reply(text.length>1900? text.slice(0,1990)+'…' : text);
}
