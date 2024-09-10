const axios = require('axios');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const logger = require('../logger');
const { Groq } = require("groq-sdk");
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

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

// Function to compress MP3 file
async function compressMp3(inputPath, outputPath) {
    try {
        await execPromise(`ffmpeg -i ${inputPath} -codec:a libmp3lame -b:a 32k -ar 22050 -ac 1 ${outputPath}`);
      
        logger.info(`Compressed MP3 file saved to ${outputPath}`);
    } catch (error) {
        logger.error(`Error compressing MP3 file: ${error}`);
        throw error;
    }
}

// Function to split audio file into 5-minute chunks
async function splitAudio(inputPath, outputPrefix) {
    try {
        await execPromise(`ffmpeg -i ${inputPath} -f segment -segment_time 300 -c copy ${outputPrefix}_%03d.mp3`);
        logger.info(`Split audio files saved with prefix ${outputPrefix}`);
    } catch (error) {
        logger.error(`Error splitting audio file: ${error}`);
        throw error;
    }
}

// Function to transcribe MP3 using OpenAI Whisper
async function transcribeMp3(filePath) {
    const model = 'whisper-large-v3';
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

        // Check if formats array exists and has elements
        if (!videoDetails.formats || videoDetails.formats.length === 0) {
            throw new Error('No video formats available');
        }

        // Find the first audio-only format, or fallback to the first available format
        const audioFormat = videoDetails.formats.find(format => format.mimeType.startsWith('audio/')) || videoDetails.formats[0];
        
        if (!audioFormat || !audioFormat.url) {
            throw new Error('No valid audio URL found');
        }

        const videoDownloadUrl = audioFormat.url;

        // Download the audio file
        const originalAudioFilePath = path.join(AUDIO_DIR, `${videoId}_original.mp3`);
        await downloadFile(videoDownloadUrl, originalAudioFilePath);

        // Compress the audio file
        const compressedAudioFilePath = path.join(AUDIO_DIR, `${videoId}_compressed.mp3`);
        await compressMp3(originalAudioFilePath, compressedAudioFilePath);

        let transcription = '';

        // If video is longer than 10 minutes, split and process in batches
        if (videoLength > 600) {
            const splitAudioPrefix = path.join(AUDIO_DIR, `${videoId}_split`);
            await splitAudio(compressedAudioFilePath, splitAudioPrefix);

            const splitFiles = fs.readdirSync(AUDIO_DIR).filter(file => file.startsWith(`${videoId}_split`));
            for (const file of splitFiles) {
                const filePath = path.join(AUDIO_DIR, file);
                const partialTranscription = await transcribeMp3(filePath);
                transcription += partialTranscription + ' ';
                fs.unlinkSync(filePath);
            }
        } else {
            transcription = await transcribeMp3(compressedAudioFilePath);
        }

        // Delete the downloaded and compressed audio files
        fs.unlinkSync(originalAudioFilePath);
        fs.unlinkSync(compressedAudioFilePath);
        
        // Save transcription to a text file
        const transcriptionFilePath = path.join(AUDIO_DIR, `${videoId}_transcription.txt`);
        fs.writeFileSync(transcriptionFilePath, transcription.trim());
        logger.info(`Transcription saved to ${transcriptionFilePath}`);

        return { videoTitle, videoLength, transcription: transcription.trim() };
    } catch (error) {
        logger.error(`Error fetching video details and transcribing: ${error}`);
        throw error;
    }
}

module.exports = { downloadFile, compressMp3, transcribeMp3, fetchYoutubeDetailsAndTranscribe };
