const axios = require('axios');
const { OWNER_ID, CLIENT_ID } = process.env;
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const logger = require('../logger');
const { getAIResponse } = require('../utils/llmRequests');
const { model } = require("../config.json");

const PLOTS_DIR = path.resolve(__dirname, '../plots');
const SYSTEM_PROMPT_FILE = path.resolve(__dirname, '../utils/system_prompt.txt'); // specify the file
const AUDIO_DIR = path.resolve(__dirname, '../audio');
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR);

async function buildMessageChain(message) {
    logger.info('Building message chain...');
    const messages = [];
    let msg = message;

    // Read system prompt from file
    let systemPrompt;
    try {
        systemPrompt = fs.readFileSync(SYSTEM_PROMPT_FILE, 'utf-8');
    } catch (error) {
        logger.error('Error reading system prompt file:', error);
        throw new Error('System prompt file could not be read.');
    }

    const embedToMarkdown = async embed => {
        logger.debug(`Converting embed to markdown: "${embed.title || 'No Title'}"`);
        let markdown = "```markdown\n";
        if (embed.title) markdown += `# ${embed.title}\n\n`;
        if (embed.description) markdown += `${embed.description}\n\n`;
        if (embed.fields?.length) {
            embed.fields.forEach(fld => markdown += `## ${fld.name}\n${fld.value}\n\n`);
        }
        if (embed.image) markdown += `![image](${embed.image.url})\n`;
        if (embed.footer) markdown += `---\n${embed.footer.text}`;
        return markdown + "\n```";
    };

    while (msg) {
        let embedText = msg.embeds.map(embedToMarkdown).join('');
        let fileText = "", imageContent = [], transcribedText = "";

        if (msg.attachments.size) {
            logger.debug(`Processing ${msg.attachments.size} attachments.`);
            for (let attachment of msg.attachments.values()) {
                if (attachment.contentType?.includes('text')) {
                    let text = await (await fetch(attachment.attachment)).text();
                    fileText += `\n\n---File: ${attachment.name}---\n${text}\n---EOF---\n`;
                }
                if (attachment.contentType?.includes('image')) {
                    imageContent.push({ type: "image_url", image_url: { "url": attachment.url } });
                }
            }
        }

        let messageContent = { role: 'user', content: [{ type: "text", text: `${msg.content}${embedText}${fileText}${transcribedText}` }, ...imageContent] };
        if (msg.author.bot || !['gpt-4o', 'gpt-4o-mini'].includes(model)) {
            messageContent.content = `${msg.content}${embedText}${fileText}${transcribedText}`;
            if (msg.author.bot) messageContent.role = 'assistant';
        }

        messages.unshift(messageContent);
        logger.debug(`Message ID ${msg.id} added to chain.`);
        msg = msg.reference?.messageId ? await msg.channel.messages.fetch(msg.reference.messageId).catch(() => null) : null;
    }

    // Insert system and assistant prompt at the beginning of the messages array
    messages.unshift(
        { role: 'system', content: systemPrompt },
        { role: 'assistant', content: `Got it. Let's tackle any problem you have step by step, ensuring clarity and correctness. I always show the code that I execute and I always execute the code that I show, when it's safe of course.` }
    );

    logger.info('Message chain built successfully.');
    return messages;
}

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        logger.info(`Message received from ${message.author.username}: "${message.content}"`);
        if (message.author.bot) {
            logger.debug(`Message is from another bot. Ignoring.`);
            return;
        }
        if (!message.mentions.has(CLIENT_ID)) {
            logger.debug(`Message does not mention the bot (ID: ${CLIENT_ID}). Ignoring.`);
            return;
        }
        if (message.author.id !== OWNER_ID) 
            return await message.reply("Contact @tfw_e for access. \nhttps://paypal.me/CarloFlores");

        const messages = await buildMessageChain(message);
        await message.channel.sendTyping();
        const aiResponse = await getAIResponse(messages);
        let msgObj = { content: aiResponse, files: [] };

        fs.readdirSync('.').filter(f => f.endsWith('.png')).forEach(f => fs.renameSync(f, path.join(PLOTS_DIR, f)));
        const plotFiles = fs.readdirSync(PLOTS_DIR).filter(f => f.endsWith('.png')).map(f => path.join(PLOTS_DIR, f));
        plotFiles.forEach(f => msgObj.files.push(f));

        if (aiResponse.length > 2000) {
            const filename = 'output.txt';
            fs.writeFileSync(filename, aiResponse);
            msgObj.files.push(filename);
            msgObj.content = "";
            logger.info(`Output text too long. Saved to file: ${filename}`);
        }

        try {
            await message.reply(msgObj);
            logger.info('Response sent to the message channel.');

            plotFiles.forEach(f => fs.unlinkSync(f));
            if (fs.existsSync('output.txt')) fs.unlinkSync('output.txt');
            fs.readdirSync(AUDIO_DIR).forEach(f => fs.unlinkSync(path.join(AUDIO_DIR, f)));
        } catch (error) {
            logger.error(`Unexpected error occurred while sending response: ${error}`);
            await message.reply(`Unexpected error occurred:\n\`\`\`${error}\`\`\``);
        }
    }
};
