const assert = require('node:assert');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { Groq } = require('groq-sdk');
const logger = require('../logger');
const { executePython } = require('../utils/pythonExecutor');
const { downloadFile, transcribeMp3, fetchVideoDetailsAndTranscribe } = require('../utils/transcription');
const { model } = require("../config.json");
// Initialize AI models
let openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const anthro = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

if (model === 'meta-llama/Meta-Llama-3.1-405B-Instruct') {
  openai = new OpenAI({ apiKey: process.env.DEEPINFRA_API_KEY,
  base_url: "https://api.deepinfra.com/v1/openai"});
}
// Define anthropic tools
const anthropicTools = [
  {
    name: 'execute_python',
    description: 'Execute Python code from file',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string' }
      },
      required: ['code']
    },
  },
  {
    name: 'transcribe_youtube',
    description: 'Convert YouTube video to MP3, Transcribe and return text',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string' }
      },
      required: ['url']
    },
  },
];

// Define common tools
const commonTools = [
  {
    type: "function",
    function: {
      name: "execute_python",
      description: "Execute Python code from file...",
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
];

/**
 * Get AI response from the given messages and model.
 * @param {Array} messages - Array of message objects with role and content.
 * @param {string} model - The AI model to use.
 * @returns {string} The AI response.
 */
async function getAIResponse(messages) {
  try {
    logger.info('Fetching AI response...');

    // Format messages for AI model
    const content = messages.map(m => ({ role: m.role, content: m.content }));
    const payload = { model, messages: content, max_tokens: 4096 };

    let completion;
    if (model.startsWith('claude')) {
      // Use Anthropic model
      completion = await createAnthropicResponse(messages, model);
      return completion;
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
    logger.error('Error getting AI response:', error);
    return `Sorry, I encountered an error while trying to respond.\n\n\`\`\`${error}\`\`\``;
  }
}

/**
 * Create Anthropic response from the given messages and model.
 * @param {Array} messages - Array of message objects with role and content.
 * @param {string} model - The Anthropic model to use.
 * @returns {string} The Anthropic response.
 */
async function createAnthropicResponse(messages, model) {
  // Format messages for Anthropic model
  let formattedMessages = messages.map(m => ({
    role: (m.role === 'system') ? 'user' : m.role,
    content: m.content
  }));

  // Create Anthropic completion
  const completion = await anthro.messages.create({
    model,
    max_tokens: 4096,
    messages: formattedMessages,
    tools: anthropicTools,
  });


  if (completion.stop_reason === 'tool_use') {
    // Handle tool calls
    finalResponse = await handleToolCalls(completion, formattedMessages,{}, model);
    return finalResponse
  }

  // Return Anthropic response
  return completion.content[0].text;
}
/**
 * Handle tool calls from the given completion and messages.
 * @param {Object} completion - The completion object from the AI model.
 * @param {Array} messages - Array of message objects with role and content.
 * @param {Object} payload - The payload object for the AI model.
 * @param {string} model - The AI model to use.
 * @returns {string} The final AI response.
 */
async function handleToolCalls(completion, messages, payload, model) {
  let toolCalls;
  if (model.startsWith('claude')) {
    // Get tool calls from Anthropic completion
    toolCalls = completion.content.filter(content => content.type === 'tool_use');
  } else {
    // Get tool calls from OpenAI or Groq completion
    toolCalls = completion.choices[0].message.tool_calls;
  }

  if (toolCalls && toolCalls.length > 0) {
    // Handle each tool call
    const results = await Promise.all(toolCalls.map(async (toolCall) => {
      const toolResult = await handleToolCall(toolCall, model);
      if (model.startsWith('claude')) {
        return {
          role: 'user', 
          content: JSON.stringify({ toolResult }),
          tool_use_id: toolCall.id
        }
      };
      return {
        role: 'tool',
        content: JSON.stringify({ result: toolResult }),
        tool_call_id: toolCall.id
      };
    }));

    // Filter out undefined results
    const functionCallResultMessages = results.filter(result => result !== undefined);
    logger.info(`Tool execution results: ${JSON.stringify(functionCallResultMessages)}`);

    // Create a new completion with the tool results
    if (model.startsWith('claude')) {
      // Use Anthropic model
      logger.info(toolCalls)
      const result = await anthro.messages.create({
        model,
        max_tokens: 4096,
        messages: [
          ...messages,
          {
            role: 'assistant', 
            content: toolCalls,  
          },
          ...functionCallResultMessages.map(m => ({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: m.tool_use_id,
              content: [{ type: 'text', text: m.content }],
            }],
          }))
        ],
        tools: anthropicTools,
      });
      return result.content[0].text;
    } else {
      // Use OpenAI or Groq model
      const completionPayload = {
        model: model,
        messages: [...messages, completion.choices[0].message, ...functionCallResultMessages],
        tools: commonTools
      };
      const finalResponse = await (model !== 'gpt-4o' && model !== 'gpt-4o-mini' ? groq.chat.completions.create(completionPayload) : openai.chat.completions.create(completionPayload));
      logger.info('Final AI response ready to be returned.');
      return finalResponse.choices[0].message.content;
    }
  }

  // Return the original completion content
  return model.startsWith('claude') ? completion.content[0].text : completion.choices[0].message.content;
}

/**
 * Handle a single tool call.
 * @param {Object} toolCall - The tool call object.
 * @returns {string} The result of the tool call.
 */
async function handleToolCall(toolCall, model) {
  let functionName, functionArguments;
  if (model.startsWith('claude')) {
    // Get function name and arguments from Anthropic tool call
    functionName = toolCall.name;
    functionArguments = toolCall.input;
  } else {
    // Get function name and arguments from OpenAI or Groq tool call
    functionName = toolCall.function.name;
    functionArguments = JSON.parse(toolCall.function.arguments);
  }

  // Handle different tool calls
  if (functionName === 'transcribe_youtube') {
    // Transcribe YouTube video
    logger.info(`Transcribing YouTube: ${JSON.stringify(toolCall)}`);
    const { url } = functionArguments;
    const urlParams = new URLSearchParams(new URL(url).search);
    const videoId = urlParams.get('v');
    if (!videoId) throw new Error('Invalid YouTube URL');
    const videoDetails = await fetchVideoDetailsAndTranscribe(videoId);
    return { result: videoDetails };
  }
  if (functionName === 'execute_python') {
    // Execute Python code
    logger.info(`Executing Python tool: ${JSON.stringify(functionArguments)}`);
    return { result: await executePython(functionArguments.code) };
  }
}

module.exports = { getAIResponse };
