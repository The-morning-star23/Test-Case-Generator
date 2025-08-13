import { useState, useEffect } from 'react';

// --- Type Definitions ---
interface Repo {
  id: number;
  name: string;
  full_name: string;
}
interface File {
  name: string;
  type: 'file' | 'dir';
  path: string;
  sha: string;
}
interface Suggestion {
  title: string;
  description: string;
}

function App() {
  // --- State Management ---
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [view, setView] = useState<'login' | 'repos' | 'files' | 'suggestions' | 'code' | 'fileViewer'>('login');
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Map<string, string>>(new Map());
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('Loading...');
  const [viewingFileContent, setViewingFileContent] = useState<string>('');
  const [viewingFileName, setViewingFileName] = useState<string>('');

  // --- Effects ---
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (token) {
      setAccessToken(token);
      setView('repos');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (view !== 'repos' || !accessToken) return;
    const fetchRepos = async () => {
      setIsLoading(true);
      setLoadingMessage('Fetching repositories...');
      try {
        const response = await fetch('http://localhost:8000/api/repos', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await response.json();
        setRepos(data.repos || []);
      } catch (error) {
        console.error('Failed to fetch repos:', error);
      }
      setIsLoading(false);
    };
    fetchRepos();
  }, [view, accessToken]);

  useEffect(() => {
    if (!selectedRepo || !accessToken) return;
    const fetchFiles = async () => {
      setIsLoading(true);
      setLoadingMessage('Fetching files...');
      try {
        const [owner, repoName] = selectedRepo.full_name.split('/');
        const response = await fetch(`http://localhost:8000/api/repos/${owner}/${repoName}/contents?path=${encodeURIComponent(currentPath)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await response.json();
        const fileData = Array.isArray(data.files) ? data.files : [data.files];
        const sortedFiles = fileData.sort((a: File, b: File) => {
            if (a.type === 'dir' && b.type !== 'dir') return -1;
            if (a.type !== 'dir' && b.type === 'dir') return 1;
            return a.name.localeCompare(b.name);
        });
        setFiles(sortedFiles);
        setView('files');
      } catch (error) {
        console.error('Failed to fetch files:', error);
      }
      setIsLoading(false);
    };
    fetchFiles();
  }, [selectedRepo, accessToken, currentPath]);

  // --- Event Handlers ---
  const handleFileSelect = (file: File) => {
    const newSelection = new Map(selectedFiles);
    if (newSelection.has(file.sha)) {
      newSelection.delete(file.sha);
    } else {
      newSelection.set(file.sha, file.name);
    }
    setSelectedFiles(newSelection);
  };

  const handleViewFile = async (file: File) => {
    if (file.type === 'dir' || !accessToken || !selectedRepo) return;
    setLoadingMessage(`Loading ${file.name}...`);
    setIsLoading(true);
    try {
      const [owner, repoName] = selectedRepo.full_name.split('/');
      const res = await fetch(`http://localhost:8000/api/repos/${owner}/${repoName}/contents/${file.sha}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      setViewingFileContent(data.content || 'Could not load file content.');
      setViewingFileName(file.name);
      setView('fileViewer');
    } catch (error) {
      console.error("Failed to fetch file content:", error);
      alert("An error occurred while fetching the file content.");
    }
    setIsLoading(false);
  };

  const handleGenerateSuggestions = async () => {
    if (!selectedRepo || !accessToken || selectedFiles.size === 0) return;
    setIsLoading(true);
    setLoadingMessage('Analyzing files...');
    try {
      const fileContentPromises = Array.from(selectedFiles.keys()).map(async (sha) => {
        const [owner, repoName] = selectedRepo.full_name.split('/');
        const res = await fetch(`http://localhost:8000/api/repos/${owner}/${repoName}/contents/${sha}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        return { name: selectedFiles.get(sha)!, content: data.content };
      });
      const filesWithContent = await Promise.all(fileContentPromises);
      const suggestionsResponse = await fetch('http://localhost:8000/api/generate-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filesWithContent }),
      });
      const suggestionsData = await suggestionsResponse.json();
      setSuggestions(suggestionsData.suggestions || []);
      setView('suggestions');
    } catch (error) {
      console.error("Failed to generate suggestions:", error);
      alert("An error occurred while generating suggestions.");
    }
    setIsLoading(false);
  };

  const handleGenerateCode = async (suggestion: Suggestion) => {
    if (!selectedRepo || !accessToken || selectedFiles.size === 0) return;
    setIsLoading(true);
    setLoadingMessage('Generating test code...');
    try {
      const fileContentPromises = Array.from(selectedFiles.keys()).map(async (sha) => {
        const [owner, repoName] = selectedRepo.full_name.split('/');
        const res = await fetch(`http://localhost:8000/api/repos/${owner}/${repoName}/contents/${sha}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        return { name: selectedFiles.get(sha)!, content: data.content };
      });
      const filesWithContent = await Promise.all(fileContentPromises);
      const codeResponse = await fetch('http://localhost:8000/api/generate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filesWithContent, suggestion: suggestion }),
      });
      const codeData = await codeResponse.json();
      setGeneratedCode(codeData.code || 'Could not generate code.');
      setView('code');
    } catch (error) {
      console.error("Failed to generate code:", error);
      alert("An error occurred while generating code.");
    }
    setIsLoading(false);
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(generatedCode);
    alert('Code copied to clipboard!');
  };

  const handleCreatePR = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRepo || !accessToken) return;

    const formData = new FormData(event.currentTarget);
    const prData = {
      filePath: formData.get('filePath') as string,
      commitMessage: formData.get('commitMessage') as string,
      prTitle: formData.get('prTitle') as string,
      prBody: formData.get('prBody') as string,
      fileContent: generatedCode,
      owner: selectedRepo.full_name.split('/')[0],
      repo: selectedRepo.full_name.split('/')[1],
    };

    setIsLoading(true);
    setLoadingMessage('Creating Pull Request...');
    try {
      const response = await fetch('http://localhost:8000/api/create-pr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(prData),
      });

      const result = await response.json();

      if (response.ok) {
        alert(`Success! PR created at: ${result.url}`);
        window.open(result.url, '_blank');
      } else {
        throw new Error(result.message || 'Failed to create PR');
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error("Failed to create PR:", error);
      alert(`Error: ${error.message}`);
    }
    setIsLoading(false);
  };
  
  const handleBackToRepos = () => {
    setCurrentPath('');
    setSelectedRepo(null);
    setView('repos');
  };

  const handleFolderClick = (path: string) => {
    setCurrentPath(path);
  };

  // --- Render Logic ---
  const renderContent = () => {
    if (isLoading) {
      return <p className="text-gray-400 animate-pulse">{loadingMessage}</p>;
    }

    switch (view) {
      case 'repos':
        return (
          <div>
            <h2 className="text-xl font-semibold mb-4 text-white">Select a Repository</h2>
            <ul className="space-y-2">
              {repos.map((repo) => (
                <li key={repo.id}>
                  <button onClick={() => setSelectedRepo(repo)} className="w-full text-left p-3 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors">
                    {repo.full_name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );

      case 'files':
        return (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <button onClick={handleBackToRepos} className="mr-4 px-3 py-1 bg-gray-600 rounded hover:bg-gray-500">&larr; Repos</button>
              <div className="text-sm font-mono text-gray-400 truncate flex-grow min-w-0">
                <span onClick={() => setCurrentPath('')} className="cursor-pointer hover:text-cyan-400">{selectedRepo?.name}</span>
                {currentPath && currentPath.split('/').map((part, i, arr) => (
                  <span key={i}> / <span onClick={() => setCurrentPath(arr.slice(0, i + 1).join('/'))} className="cursor-pointer hover:text-cyan-400">{part}</span></span>
                ))}
              </div>
              <button onClick={handleGenerateSuggestions} disabled={selectedFiles.size === 0} className="px-4 py-2 bg-cyan-500 text-gray-900 font-bold rounded-lg hover:bg-cyan-400 disabled:bg-gray-500 disabled:cursor-not-allowed">
                Suggest Tests ({selectedFiles.size})
              </button>
            </div>
            <ul className="space-y-2">
              {files.map((file) => {
                const isSelectable = file.type === 'file' && /\.(js|ts|tsx|jsx|py|java|go|cs|php|rb)$/i.test(file.name);
                return (
                  <li key={file.sha} className="p-3 bg-gray-700 rounded-md flex items-center font-mono text-sm">
                    <div className="flex-shrink-0" onClick={(e) => { e.stopPropagation(); }}>
                      <input type="checkbox" checked={selectedFiles.has(file.sha)} disabled={!isSelectable} onChange={() => { if (isSelectable) handleFileSelect(file); }} className="h-4 w-4 bg-gray-800 border-gray-600 text-cyan-500 focus:ring-cyan-600 disabled:opacity-50" />
                    </div>
                    <div onClick={() => (file.type === 'dir' ? handleFolderClick(file.path) : handleViewFile(file))} className={`ml-4 flex-grow truncate cursor-pointer hover:text-cyan-400`}>
                      <span className="mr-3">{file.type === 'dir' ? '📁' : '📄'}</span>
                      {file.name}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );

      case 'fileViewer':
        return (
          <div>
            <div className="flex justify-between items-center mb-4">
              <button onClick={() => setView('files')} className="px-3 py-1 bg-gray-600 rounded hover:bg-gray-500">&larr; Back to Files</button>
              <h2 className="text-xl font-semibold text-white truncate font-mono">{viewingFileName}</h2>
              <div style={{ width: '88px' }}></div>
            </div>
            <pre className="bg-gray-900 p-4 rounded-md overflow-x-auto max-h-[60vh]"><code className="text-sm font-mono whitespace-pre-wrap">{viewingFileContent}</code></pre>
          </div>
        );

      case 'suggestions':
        return (
          <div>
            <button onClick={() => setView('files')} className="mb-4 px-3 py-1 bg-gray-600 rounded hover:bg-gray-500">&larr; Back to Files</button>
            <h2 className="text-xl font-semibold text-white mb-4">Suggested Test Cases</h2>
            <ul className="space-y-3">
              {suggestions.map((suggestion, index) => (
                <li key={index} className="p-4 bg-gray-700 rounded-md">
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <h3 className="font-bold text-cyan-400 mb-1">{suggestion.title}</h3>
                      <p className="text-gray-300 text-sm">{suggestion.description}</p>
                    </div>
                    <button onClick={() => handleGenerateCode(suggestion)} className="ml-4 px-3 py-1 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-400 whitespace-nowrap">Generate Code</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );

      case 'code':
        return (
          <div>
            <div className="flex justify-between items-center mb-4">
              <button onClick={() => setView('suggestions')} className="px-3 py-1 bg-gray-600 rounded hover:bg-gray-500">&larr; Back to Suggestions</button>
              <h2 className="text-xl font-semibold text-white">Generated Test Code</h2>
              <button onClick={handleCopyToClipboard} className="px-4 py-2 bg-cyan-500 text-gray-900 font-bold rounded-lg hover:bg-cyan-400">Copy Code</button>
            </div>
            <pre className="bg-gray-900 p-4 rounded-md overflow-x-auto max-h-[40vh]"><code className="text-sm font-mono whitespace-pre-wrap">{generatedCode}</code></pre>
            
            <div className="mt-6 border-t border-gray-700 pt-6">
              <h3 className="text-lg font-semibold text-white mb-4">Create a Pull Request</h3>
              <form onSubmit={handleCreatePR} className="space-y-4">
                <div>
                  <label htmlFor="filePath" className="block text-sm font-medium text-gray-300">File Path</label>
                  <input type="text" name="filePath" id="filePath" defaultValue={`tests/ai_generated_${Date.now()}.test.js`} required className="mt-1 block w-full bg-gray-800 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-cyan-500 focus:border-cyan-500" />
                </div>
                <div>
                  <label htmlFor="commitMessage" className="block text-sm font-medium text-gray-300">Commit Message</label>
                  <input type="text" name="commitMessage" id="commitMessage" defaultValue="feat: Add AI-generated test case" required className="mt-1 block w-full bg-gray-800 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-cyan-500 focus:border-cyan-500" />
                </div>
                  <div>
                  <label htmlFor="prTitle" className="block text-sm font-medium text-gray-300">Pull Request Title</label>
                  <input type="text" name="prTitle" id="prTitle" defaultValue="AI Generated Tests" required className="mt-1 block w-full bg-gray-800 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-cyan-500 focus:border-cyan-500" />
                </div>
                  <div>
                  <label htmlFor="prBody" className="block text-sm font-medium text-gray-300">Pull Request Description</label>
                  <textarea name="prBody" id="prBody" rows={3} defaultValue="This PR was generated by the AI Test Case Generator." className="mt-1 block w-full bg-gray-800 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-cyan-500 focus:border-cyan-500"></textarea>
                </div>
                <div className="text-right">
                    <button type="submit" className="px-6 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-500">
                      Create Pull Request on GitHub
                    </button>
                </div>
              </form>
            </div>
          </div>
        );

      case 'login':
      default:
        return (
          <div>
            <h2 className="text-xl font-semibold mb-4 text-white">Connect to GitHub to Begin</h2>
            <p className="text-gray-400">Click the button below to authorize the application.</p>
            <button onClick={() => window.location.href = 'http://localhost:8000/auth/github'} className="mt-4 px-6 py-2 bg-cyan-500 text-gray-900 font-bold rounded-lg hover:bg-cyan-400">Login with GitHub</button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans">
      <header className="bg-gray-800 shadow-md p-4">
        <h1 className="text-2xl font-bold text-cyan-400 container mx-auto">
          AI Test Case Generator
        </h1>
      </header>
      <main className="container mx-auto p-8">
        <div className="bg-gray-800 rounded-lg p-6 max-w-4xl mx-auto min-h-[300px]">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}

export default App;
