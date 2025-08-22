import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();
console.log('[Worker] Attempting to connect to Redis at:', process.env.REDIS_URL);

// --- AI and Redis Connection ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

// --- Worker for Generating Suggestions ---
const suggestionWorker = new Worker('suggestionQueue', async job => {
  console.log(`Processing suggestion job ${job.id}`);
  const { files } = job.data;
  const fileContents = files.map(file => `--- File: ${file.name} ---\n\n${file.content}`).join('\n\n');
  const prompt = `As an expert software tester, analyze the following code file(s) and provide a concise list of suggested test cases. Format the output as a valid JSON array of objects. Each object must have a "title" and a "description" property. Do not include any other text or formatting. --- Code for Analysis ---\n\n${fileContents}`;
  
  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const jsonResponse = response.text().trim().replace(/^```json\n/, '').replace(/\n```$/, '');
    const suggestions = JSON.parse(jsonResponse);
    return { suggestions }; // The return value is automatically stored as the job result
  } catch (error) {
    console.error(`Suggestion Job ${job.id} failed:`, error);
    throw error; // Throwing an error will mark the job as failed
  }
}, { connection });

// --- Worker for Generating Code ---
const codeGenerationWorker = new Worker('codeGenerationQueue', async job => {
  const { files, suggestion } = job.data;
  const fileContents = files.map(file => `--- File: ${file.name} ---\n\n${file.content}`).join('\n\n');
  const prompt = `As an expert test engineer, write a complete, runnable test file based on the provided code and the specific test case description. Framework: Use Jest and React Testing Library for React components. For Python files, use pytest. Test Case to Implement: - Title: "${suggestion.title}" - Description: "${suggestion.description}". Instructions: Write only the code. Wrap the final code in a single markdown code block. Do not add any other text or explanation. --- Provided Code ---\n${fileContents}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const codeBlock = response.text();
    const code = codeBlock.replace(/^```(?:\w+\n)?/, '').replace(/\n```$/, '');
    return { code };
  } catch (error) {
    console.error(`Code Generation Job ${job.id} failed:`, error);
    throw error;
  }
}, { connection });

console.log('Worker is listening for jobs...');