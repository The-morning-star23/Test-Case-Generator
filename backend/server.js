import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import fetch from 'node-fetch';
import { Octokit } from '@octokit/rest';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { Base64 } from 'js-base64';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8000;
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- Redis and Queue Setup ---
const connection = new Redis(process.env.REDIS_URL, { 
  maxRetriesPerRequest: null,
  enableReadyCheck: false 
});
const suggestionQueue = new Queue('suggestionQueue', { connection });
const codeGenerationQueue = new Queue('codeGenerationQueue', { connection });

// --- GitHub Auth Routes ---
app.get('/auth/github', (req, res) => {
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=repo,user`;
  res.redirect(githubAuthUrl);
});

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
    // Corrected redirect URL from your provided code
    res.redirect(`https://test-case-generator-beta.vercel.app?token=${tokenData.access_token}`);
  } catch (error) {
    console.error('Error in GitHub callback:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- GitHub API Routes ---
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

app.post('/api/create-pr', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const { owner, repo, filePath, fileContent, commitMessage, prTitle, prBody } = req.body;
    if (!token) { return res.status(401).json({ message: 'Missing auth token' }); }
    try {
        const octokit = new Octokit({ auth: token });
        const branchName = `ai-test-${Date.now()}`;
        const { data: mainBranch } = await octokit.repos.getBranch({ owner, repo, branch: 'main' });
        const latestCommitSha = mainBranch.commit.sha;
        await octokit.git.createRef({ owner, repo, ref: `refs/heads/${branchName}`, sha: latestCommitSha });
        await octokit.repos.createOrUpdateFileContents({ owner, repo, path: filePath, message: commitMessage, content: Base64.encode(fileContent), branch: branchName });
        const { data: pullRequest } = await octokit.pulls.create({ owner, repo, title: prTitle, head: branchName, base: 'main', body: prBody });
        res.status(201).json({ message: 'Pull Request created successfully!', url: pullRequest.html_url });
    } catch (error) {
        console.error('Error creating Pull Request:', error);
        res.status(500).json({ message: 'Failed to create Pull Request.' });
    }
});

// --- MODIFIED AI Endpoints that now use the queue ---
app.post('/api/generate-suggestions', async (req, res) => {
  const { files } = req.body;
  if (!files || files.length === 0) {
    return res.status(400).json({ message: 'No files provided.' });
  }
  const job = await suggestionQueue.add('generate', { files });
  res.status(202).json({ jobId: job.id });
});

app.post('/api/generate-code', async (req, res) => {
  const { files, suggestion } = req.body;
  if (!files || files.length === 0 || !suggestion) {
    return res.status(400).json({ message: 'Missing files or suggestion.' });
  }
  const job = await codeGenerationQueue.add('generate', { files, suggestion });
  res.status(202).json({ jobId: job.id });
});

// --- NEW Endpoint to Check Job Status ---
app.get('/api/job-status/:queueName/:jobId', async (req, res) => {
  const { queueName, jobId } = req.params;
  let queue;
  if (queueName === 'suggestions') {
    queue = suggestionQueue;
  } else if (queueName === 'code') {
    queue = codeGenerationQueue;
  } else {
    return res.status(400).json({ message: 'Invalid queue name.' });
  }

  const job = await queue.getJob(jobId);
  if (!job) {
    return res.status(404).json({ message: 'Job not found.' });
  }

  const state = await job.getState();

  if (state === 'completed') {
    res.status(200).json({ status: 'completed', result: job.returnvalue });
  } else if (state === 'failed') {
    res.status(200).json({ status: 'failed', reason: job.failedReason });
  } else {
    res.status(200).json({ status: 'processing' });
  }
});

app.listen(PORT, () => {
  console.log(`API Server is running on http://localhost:${PORT}`);
});
