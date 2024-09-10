const axios = require('axios');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const logger = require('../logger');
const { Groq } = require("groq-sdk");

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
const AUDIO_DIR = path.resolve(__dirname, '../audio');

// Ensure the AUDIO_DIR exists
if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR);
}

// Helper function to download a file
async function downloadFile(url, outputPath=path.join(AUDIO_DIR, `audio.mp3`)) {
    const response = await fetch(url);
    const fileStream = fs.createWriteStream(outputPath);
    await new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on("error", reject);
        fileStream.on("finish", resolve);
    });
}

// Function to transcribe MP3 using OpenAI Whisper
async function transcribeMp3(filePath) {
    const model = 'distil-whisper-large-v3-en';
    const fileStream = fs.createReadStream(filePath);
    const response = await client.audio.transcriptions.create({
        file: fileStream,
        model: model,
    });
    return response.text;
}

// Function to fetch youtube video details and transcribe audio
async function fetchYoutubeDetailsAndTranscribe(videoId) {
    const options = {
        method: 'GET',
        url: 'https://yt-api.p.rapidapi.com/dl',
        params: { id: videoId },
        headers: {
            'x-rapidapi-key': 'c8eaa0a5dcmshbca3c4d531b9aeep1c4574jsnc0538226b189',
            'x-rapidapi-host': 'yt-api.p.rapidapi.com'
        }
    };
    try {
        const response = await axios.request(options);
        const videoDetails = response.data;
        const videoTitle = videoDetails.title;
        const videoLength = videoDetails.lengthSeconds;
        const videoDownloadUrl = videoDetails.formats[0].url;

        // Download the audio file
        const audioFilePath = path.join(AUDIO_DIR, `${videoId}.mp3`);
        await downloadFile(videoDownloadUrl, audioFilePath);

        // Transcribe the audio
        const transcription = await transcribeMp3(audioFilePath);

        // Delete the downloaded audio file
        fs.unlinkSync(audioFilePath);
        return { videoTitle, videoLength, transcription };
    } catch (error) {
        logger.error(`Error fetching video details and transcribing: ${error}`);
        throw error;
    }
}

module.exports = { downloadFile, transcribeMp3, fetchYoutubeDetailsAndTranscribe };
