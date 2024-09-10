
const axios = require('axios');
const { OWNER_ID, CLIENT_ID } = process.env;
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const logger = require('../logger');
const { getAIResponse } = require('../utils/llmRequests');
const PLOTS_DIR = path.resolve(__dirname, '../plots');
const IMAGES_DIR = path.resolve(__dirname, '../images');
const LATEX_DIR = path.resolve(__dirname, '../latex');
const SYSTEM_PROMPT_FILE = path.resolve(__dirname, '../utils/system_prompt.txt');
const AUDIO_DIR = path.resolve(__dirname, '../audio');
const PYTHON_DIR = path.resolve(__dirname, '../python');
const MAX_MESSAGES = require('../config.json') 

if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR);
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR);
if (!fs.existsSync(PYTHON_DIR)) fs.mkdirSync(PYTHON_DIR);
if (!fs.existsSync(LATEX_DIR)) fs.mkdirSync(LATEX_DIR);

async function buildMessageChain(message) {
    logger.info('Building message chain...');
    const messages = [];
    let msg = message;
    const MAX_MESSAGES = 6;

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

    const processMessage = async (msg) => {
        let embedText = await Promise.all(msg.embeds.map(embedToMarkdown));
        embedText = embedText.join('');
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
                if (attachment.contentType?.includes('audio')) {
                    fileText += `\n\n---Audio File: ${attachment.name}--URL For Transcription: \n${attachment.url}---\n`;
                }
            }
        }
        return [{ type: "text", text: `${msg.content}${embedText}${fileText}${transcribedText}` }, ...imageContent];
    };

    while (msg) {
        let role = msg.author.bot ? 'assistant' : 'user';

        
        let content = await processMessage(msg);
        
        if (messages.length > 0 && messages[0].role === role) {
            messages[0].content = [...content, ...messages[0].content];
        } else {
            messages.unshift({ role, content });
        }
        
        logger.debug(`Message ID ${msg.id} processed.`);
        msg = msg.reference?.messageId ? await msg.channel.messages.fetch(msg.reference.messageId).catch(() => null) : null;
    }

    // Insert system and assistant prompt at the beginning of the messages array
    messages.unshift(
        { role: 'system', content: systemPrompt },
    );

    // Truncate to MAX_MESSAGES, keeping the most recent ones
    if (messages.length > MAX_MESSAGES + 1) {  // +1 for system message
        messages.splice(1, messages.length - (MAX_MESSAGES + 1));
    }

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
        // if (message.author.id !== OWNER_ID)
            // return await message.reply("Contact @tfw_e for access. \nhttps://paypal.me/CarloFlores");

        const messages = await buildMessageChain(message);
        await message.channel.sendTyping();
        const aiResponse = await getAIResponse(messages);

        let msgObj = { content: aiResponse, files: [] };

        // Move plot files
        fs.readdirSync('.')
          .filter(f => f.endsWith('.png') || f.endsWith('.gif'))
          .forEach(f => fs.renameSync(f, path.join(PLOTS_DIR, f)));

        // Add plot files to message
        const plotFiles = fs.readdirSync(PLOTS_DIR)
          .filter(f => f.endsWith('.png') || f.endsWith('.gif'))
          .map(f => path.join(PLOTS_DIR, f));
        plotFiles.forEach(f => msgObj.files.push(f));        // Add generated images to the message

        const imageFiles = fs.readdirSync(IMAGES_DIR).filter(f => f.endsWith('.png')).map(f => path.join(IMAGES_DIR, f));
        imageFiles.forEach(f => msgObj.files.push(f));

        // Add rendered LaTeX files to the message
        const latexFiles = fs.readdirSync(LATEX_DIR).filter(f => f.endsWith('.png')).map(f => path.join(LATEX_DIR, f));
        latexFiles.forEach(f => msgObj.files.push(f));

        // Add python files to the message
        const pythonFiles = fs.readdirSync(PYTHON_DIR).filter(f => f.endsWith('.py')).map(f => path.join(PYTHON_DIR, f));
        pythonFiles.forEach(f => msgObj.files.push(f));
        const audioFiles = fs.readdirSync(AUDIO_DIR).filter(f => f.endsWith('.mp3')).map(f => path.join(AUDIO_DIR, f));
        const AudioFilesText = fs.readdirSync(AUDIO_DIR).filter(f => f.endsWith('.txt')).map(f => path.join(AUDIO_DIR, f));
        AudioFilesText.forEach(f => msgObj.files.push(f));
        if (aiResponse.length > 2000) {
            const filename = 'output.txt';
            fs.writeFileSync(filename, aiResponse);
            msgObj.files.push(filename);
            msgObj.content = "";
            logger.info(`Output text too long. Saved to file: ${filename}`);
        }

        try {
            logger.info(JSON.stringify(msgObj));
            await message.reply(msgObj);
            logger.info('Response sent to the message channel.');

            // Clean up files
            plotFiles.forEach(f => fs.unlinkSync(f));
            imageFiles.forEach(f => fs.unlinkSync(f));
            latexFiles.forEach(f => fs.unlinkSync(f));
            pythonFiles.forEach(f => fs.unlinkSync(f));
            audioFiles.forEach(f => fs.unlinkSync(f));
            AudioFilesText.forEach(f => fs.unlinkSync(f));
            if (fs.existsSync('output.txt')) fs.unlinkSync('output.txt');
        } catch (error) {
            // Clean up files
            plotFiles.forEach(f => fs.unlinkSync(f));
            imageFiles.forEach(f => fs.unlinkSync(f));
            latexFiles.forEach(f => fs.unlinkSync(f));
            pythonFiles.forEach(f => fs.unlinkSync(f));
            audioFiles.forEach(f => fs.unlinkSync(f));
            if (fs.existsSync('output.txt')) fs.unlinkSync('output.txt');
            logger.error(`Unexpected error occurred while sending response: ${error}`);
            await message.reply(`Unexpected error occurred:\n\`\`\`${error}\`\`\``);
        }
    }
};
