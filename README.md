### AI Test Case Generator 🤖✨

An intelligent web application that integrates with your GitHub account to automatically generate unit test suggestions and code for your repositories using the power of Google's Gemini AI.

This full-stack project allows you to select a repository, browse its files, choose specific code files for analysis, and receive AI-powered test cases in seconds. You can even create a Pull Request with the generated test code directly from the application.

Features
Secure GitHub Integration: Log in safely using the GitHub OAuth2 flow.

Repository Browser: View a list of your GitHub repositories and navigate their file and folder structures.

Intelligent File Viewer: Click on any file to view its content directly in the app. The application automatically identifies code files that are suitable for test generation.

Group File Analysis: Select multiple code files at once to provide the AI with broader context for generating more relevant test cases.

AI-Powered Suggestions: Receive a list of concise, high-level test case suggestions (e.g., "Test component rendering," "Validate user input") based on the selected files.

On-Demand Code Generation: Choose a specific suggestion and the AI will write the complete, runnable test code for it using appropriate frameworks (Jest/React Testing Library for frontend, Pytest for Python).

Create Pull Requests: Automatically create a new branch, commit the generated test file, and open a pull request on GitHub directly from the application's UI.

### Tech Stack

Frontend:

Framework: React (with TypeScript)

Build Tool: Vite

Styling: Tailwind CSS

Backend:

Framework: Node.js with Express

GitHub API Client: @octokit/rest

AI: @google/generative-ai for the Gemini API

Deployment:

Backend: Deployed on Railway

Frontend: Deployed on Vercel

### Getting Started
To run this project locally, you will need to have Node.js installed.

1. Clone the Repository
git clone https://github.com/The-morning-star23/Test-Case-Generator.git
cd test-case-generator

2. Backend Setup
Navigate to the backend directory and install the dependencies.

cd backend
npm install

Create an environment file named .env in the backend directory and add the following keys:

# Port for the local server
PORT=8000

# GitHub OAuth App credentials
GITHUB_CLIENT_ID=YOUR_GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET=YOUR_GITHUB_CLIENT_SECRET

# Google AI API Key
GEMINI_API_KEY=YOUR_GEMINI_API_KEY

3. Frontend Setup
In a separate terminal, navigate to the frontend directory and install the dependencies.

cd frontend
npm install

4. Running the Application
You will need two terminals running simultaneously.

In the backend terminal:

# Starts the server on http://localhost:8000
node server.js

In the frontend terminal:

# Starts the React app on http://localhost:5173
npm run dev

Open your browser and navigate to http://localhost:5173 to use the application.

Usage Workflow
Login: Click the "Login with GitHub" button and authorize the application.

Select Repository: Choose a repository from the list.

Browse Files: Navigate through the repository's folders and view any file by clicking on its name.

Select Files for Testing: Use the checkboxes to select one or more code files (.js, .tsx, .py, etc.).

Get Suggestions: Click the "Suggest Tests" button to get a list of test case ideas from the AI.

Generate Code: Click the "Generate Code" button next to a suggestion to have the AI write the test.

Create Pull Request: Review the code, fill out the PR details in the form, and click "Create Pull Request on GitHub" to automatically add the new test file to your repository.