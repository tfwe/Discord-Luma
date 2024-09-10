const path = require('path');
const OpenAI = require('openai');
const { Groq } = require('groq-sdk');
const logger = require('../logger');
const { model } = require("../config.json");
const { executePython } = require('../utils/pythonExecutor');
const { fetchYoutubeDetailsAndTranscribe, downloadFile, transcribeMp3 } = require('../utils/transcription');
const { createAnthropicResponse } = require('./anthropicHandler');
const { generateImage } = require('../utils/imageGenerator');
const { renderLatex } = require('../utils/renderLatex'); // Import the LaTeX rendering utility

// Initialize AI models
let openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
if (model === 'meta-llama/Meta-Llama-3.1-405B-Instruct') {
  openai = new OpenAI({
    apiKey: process.env.DEEPINFRA_API_KEY,
    baseURL: 'https://api.deepinfra.com/v1/openai',
  });
}
const AUDIO_DIR = path.resolve(__dirname, '../audio');

// Define common tools
const commonTools = [
  {
    type: "function",
    function: {
      name: "execute_python",
      description: "Execute Python code from file. All code must include print statements. Code using matplotlib must contain `.savefig()`.",
      parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"], additionalProperties: false },
      strict: true
    },
    strict: true,
  },
  {
    type: "function",
    function: {
      name: "transcribe_youtube",
      description: "Convert YouTube video to MP3, Transcribe and return text",
      parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false },
      strict: true
    },
    strict: true,
  },
  {
    type: "function",
    function: {
      name: "transcribe_audio",
      description: "MP3 from discord attachment URL and returns string transcription",
      parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false },
      strict: true
    },
    strict: true,
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "Generate an image from text prompt. Leave the URL field empty unless you are specifically provided with an image url to use. Max 2000 characters.",
      parameters: { type: "object", properties: { prompt: { type: "string" }, }, required: ["prompt"], additionalProperties: false },
      strict: true
    },
    strict: true,
  },
  {
    type: "function",
    function: {
      name: "render_latex",
      description: "Render a LaTeX snippet to png image and save it",
      parameters: { type: "object", properties: { latexSnippet: { type: "string" } }, required: ["latexSnippet"], additionalProperties: false },
      strict: true
    },
    strict: true,
  }
];

async function getAIResponse(messages) {
  try {
    logger.info('Fetching AI response...');
    const content = messages.map(m => ({ role: m.role, content: m.content }));
    const payload = { model, messages: content, max_tokens: 4096 };
    logger.info(model);
    if (model.startsWith('claude')) {
      // Use Anthropic model
      return await createAnthropicResponse(messages, model);
    } else {
      // Use OpenAI or Groq model
      payload.tools = commonTools;
      if (model !== 'gpt-4o' && model !== 'gpt-4o-mini') {
        // Handle Groq models
        completion = await groq.chat.completions.create(payload);
      } else {
        // Handle OpenAI models
        completion = await openai.chat.completions.create(payload);
      }
      return await handleToolCalls(completion, messages, payload, model);
    }
  } catch (error) {
    const detailedError = `
Stack: \`\`\`${error.stack}\`\`\`

Code Snippet: 
\`\`\`
${error.stack}
\`\`\`
`;
    logger.error(detailedError);
    return `Sorry, I encountered an error while trying to respond.\n\n${detailedError}`;
  }
}

async function handleToolCalls(completion, messages, payload, model) {
  const toolCalls = completion.choices[0].message.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    const results = await Promise.all(toolCalls.map(async (toolCall) => {
      const toolResult = await handleToolCall(toolCall);
      return {
        role: 'tool',
        content: JSON.stringify({ result: toolResult }),
        tool_call_id: toolCall.id
      };
    }));
    const functionCallResultMessages = results.filter(result => result !== undefined);
    logger.info(`Tool execution results: ${JSON.stringify(functionCallResultMessages)}`);
    const completionPayload = {
      model: model,
      messages: [...messages, completion.choices[0].message, ...functionCallResultMessages],
      tools: commonTools
    };
    const finalResponse = await (model !== 'gpt-4o' && model !== 'gpt-4o-mini'
      ? groq.chat.completions.create(completionPayload)
      : openai.chat.completions.create(completionPayload));
    logger.info('Final AI response ready to be returned.');
    // Add generated images to final response
    const finalContent = finalResponse.choices[0].message.content;
    return finalContent;
  }
  return completion.choices[0].message.content;
}

async function handleToolCall(toolCall) {
  const functionName = toolCall.function.name;
  const functionArguments = JSON.parse(toolCall.function.arguments);
  if (functionName === 'transcribe_youtube') {
    logger.info(`Transcribing YouTube: ${JSON.stringify(toolCall)}`);
    const { url } = functionArguments;
    const videoId = new URLSearchParams(new URL(url).search).get('v');
    if (!videoId) throw new Error('Invalid YouTube URL');
    const videoDetails = await fetchYoutubeDetailsAndTranscribe(videoId);
    return { result: videoDetails };
  }
  if (functionName === 'transcribe_audio') {
    logger.info(`Transcribing Audio: ${JSON.stringify(toolCall)}`);
    const { url } = functionArguments;
    const filePath = await downloadFile(url)
    const transcriptionText = await transcribeMp3(path.join(AUDIO_DIR, `audio.mp3`));
    return { result: transcriptionText };
  }
  if (functionName === 'execute_python') {
    logger.info(`Executing Python tool: ${JSON.stringify(functionArguments)}`);
    return { result: await executePython(functionArguments.code) };
  }
  if (functionName === 'generate_image') {
    logger.info(`Generating image: ${JSON.stringify(functionArguments)}`);
    const { prompt, url } = functionArguments;
    const imageResult = await generateImage(prompt, url);
    return { result: imageResult };
  }
  if (functionName === 'render_latex') {
    logger.info(`Rendering LaTeX: ${JSON.stringify(functionArguments)}`);
    const { latexSnippet } = functionArguments;
    const latexResult = await renderLatex(latexSnippet);
    return { result: latexResult };
  }
}

module.exports = { getAIResponse };
