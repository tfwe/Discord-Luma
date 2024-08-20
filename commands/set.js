const logger = require('../logger');
const { Client, GatewayIntentBits, Collection, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const TOKEN = process.env.TOKEN


const OWNER_ID = process.env.OWNER_ID;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set')
    .setDescription('Changes bot settings')
    .addStringOption(option =>
      option.setName('model')
      .setDescription('Which model to use')
      .addChoices(
        { name: 'gpt-4o', value: 'gpt-4o' },
        { name: 'gpt-4o-mini', value: 'gpt-4o-mini' },
        { name: 'gemma-7b-it', value: 'gemma-7b-it' },
        { name: 'gemma2-9b-it', value: 'gemma2-9b-it' },
        { name: 'meta-llama/Meta-Llama-3.1-405B-Instruct', value: 'meta-llama/Meta-Llama-3.1-405B-Instruct' },        
        { name: 'llama-3.1-70b-versatile', value: 'llama-3.1-70b-versatile' },
        { name: 'llama-3.1-8b-instant', value: 'llama-3.1-8b-instant' },
        { name: 'llama3-groq-70b-8192-tool-use-preview', value: 'llama3-groq-70b-8192-tool-use-preview' },
        { name: 'llama3-groq-8b-8192-tool-use-preview', value: 'llama3-groq-8b-8192-tool-use-preview' },
        { name: 'claude-3-5-sonnet-20240620', value: 'claude-3-5-sonnet-20240620' }
      )),
  async execute(interaction) {
    await interaction.deferReply();
    let model = interaction.options.getString('model')
    if (!model) model = 'gpt-4o-mini'

    // Read the config file
    let configFile = fs.readFileSync('config.json');
    let configData = JSON.parse(configFile);

    // Update the config file with the new options
    configData.model = model;

    // Write the updated config data to the config file
    fs.writeFileSync('config.json', JSON.stringify(configData, null, 2));

    // Log the changes
    logger.info(`Config file updated: model=${model}`);

    // Reply to the interaction
    await interaction.editReply(`Config file updated: model=${model}`);
    process.exit()
  }
}

