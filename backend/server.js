import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import fetch from 'node-fetch';
import { Octokit } from '@octokit/rest';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Base64 } from 'js-base64';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8000;
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- GitHub Auth Routes ---
app.get('/auth/github', (req, res) => {
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=repo,user`;
  res.redirect(githubAuthUrl);
});

// --- THIS ROUTE WAS MISSING ---
app.get('/auth/github/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ error: 'Authorization failed. No code received.' });
  }
  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: code,
      }),
    });
    const tokenData = await tokenResponse.json();
    if (tokenData.error) {
      return res.status(400).json(tokenData);
    }
    res.redirect(`https://test-case-generator-beta.vercel.app?token=${tokenData.access_token}`);
  } catch (error) {
    console.error('Error in GitHub callback:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- API Routes ---
app.get('/api/repos', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Error: Missing authorization token' });
  try {
    const octokit = new Octokit({ auth: token });
    const reposResponse = await octokit.repos.listForAuthenticatedUser({ sort: 'updated', per_page: 20 });
    res.status(200).json({ repos: reposResponse.data });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching repositories from GitHub' });
  }
});

app.get('/api/repos/:owner/:repo/contents', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  const { owner, repo } = req.params;
  const path = req.query.path || '';
  if (!token) return res.status(401).json({ message: 'Error: Missing authorization token' });
  try {
    const octokit = new Octokit({ auth: token });
    const contentsResponse = await octokit.repos.getContent({ owner, repo, path });
    res.status(200).json({ files: contentsResponse.data });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching repo contents from GitHub' });
  }
});

app.get('/api/repos/:owner/:repo/contents/:sha', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  const { owner, repo, sha } = req.params;
  if (!token) return res.status(401).json({ message: 'Error: Missing authorization token' });
  try {
    const octokit = new Octokit({ auth: token });
    const blobResponse = await octokit.git.getBlob({ owner, repo, file_sha: sha });
    const content = Buffer.from(blobResponse.data.content, 'base64').toString('utf-8');
    res.status(200).json({ content });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching file content from GitHub' });
  }
});

app.post('/api/generate-suggestions', async (req, res) => {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const { files } = req.body;
    if (!files || files.length === 0) {
        return res.status(400).json({ message: 'No files provided for analysis.' });
    }
    const fileContents = files.map(file => `--- File: ${file.name} ---\n\n${file.content}`).join('\n\n');
    const prompt = `As an expert software tester, analyze the following code file(s) and provide a concise list of suggested test cases. For each suggestion, provide a short title and a one-sentence description. Format the output as a valid JSON array of objects. Each object must have a "title" and a "description" property. Do not include any other text or formatting before or after the JSON array. --- Code for Analysis ---\n\n${fileContents}`;
    const result = await model.generateContent(prompt);
    const response = result.response;
    const jsonResponse = response.text().trim().replace(/^```json\n/, '').replace(/\n```$/, '');
    const suggestions = JSON.parse(jsonResponse);
    res.status(200).json({ suggestions });
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    res.status(500).json({ message: "Failed to generate suggestions from AI." });
  }
});

app.post('/api/generate-code', async (req, res) => {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const { files, suggestion } = req.body;
    if (!files || files.length === 0 || !suggestion) {
        return res.status(400).json({ message: 'Missing files or suggestion for code generation.' });
    }
    const fileContents = files.map(file => `--- File: ${file.name} ---\n\n${file.content}`).join('\n\n');
    const prompt = `As an expert test engineer, write a complete, runnable test file based on the provided code and the specific test case description. Framework: Use Jest and React Testing Library for React components. For Python files, use pytest. Test Case to Implement: - Title: "${suggestion.title}" - Description: "${suggestion.description}". Instructions: 1. Write only the code for this single test case. 2. The code must be complete and self-contained in a single file. 3. Include all necessary imports. 4. Assume component files are imported relative to the test file. 5. Wrap the final code in a single markdown code block like \`\`\`javascript ... \`\`\`. Do not add any other text or explanation. --- Provided Code ---\n${fileContents}`;
    const result = await model.generateContent(prompt);
    const response = result.response;
    const codeBlock = response.text();
    const code = codeBlock.replace(/^```(?:\w+\n)?/, '').replace(/\n```$/, '');
    res.status(200).json({ code });
  } catch (error) {
    console.error("Error calling Gemini API for code generation:", error);
    res.status(500).json({ message: "Failed to generate code from AI." });
  }
});

// --- FINAL BONUS ENDPOINT: CREATE PULL REQUEST ---
app.post('/api/create-pr', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const { owner, repo, filePath, fileContent, commitMessage, prTitle, prBody } = req.body;

    if (!token) {
        return res.status(401).json({ message: 'Missing auth token' });
    }

    try {
        const octokit = new Octokit({ auth: token });
        const branchName = `ai-test-${Date.now()}`;

        // Get the latest commit SHA from the main branch
        const { data: mainBranch } = await octokit.repos.getBranch({
            owner,
            repo,
            branch: 'main', // Or your repo's default branch
        });
        const latestCommitSha = mainBranch.commit.sha;

        // Create a new branch from the latest commit
        await octokit.git.createRef({
            owner,
            repo,
            ref: `refs/heads/${branchName}`,
            sha: latestCommitSha,
        });

        // Create the new file on the new branch
        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: filePath,
            message: commitMessage,
            content: Base64.encode(fileContent), // Content must be base64 encoded
            branch: branchName,
        });

        // Create the Pull Request
        const { data: pullRequest } = await octokit.pulls.create({
            owner,
            repo,
            title: prTitle,
            head: branchName,
            base: 'main', // Or your repo's default branch
            body: prBody,
        });

        res.status(201).json({ message: 'Pull Request created successfully!', url: pullRequest.html_url });

    } catch (error) {
        console.error('Error creating Pull Request:', error);
        res.status(500).json({ message: 'Failed to create Pull Request.' });
    }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});