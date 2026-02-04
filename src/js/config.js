/**
 * Konfiguration für den LLM Benchmark Tester (Frontend)
 */

const CONFIG = {
    // Backend API URL
    apiUrl: 'http://localhost:3000/api',

    // Kategorien für Tests
    categories: {
        'standard': { name: 'Standard Tests', icon: 'ST' },
        'long-input': { name: 'Long Input', icon: 'LI' },
        'limit-testing': { name: 'Limit Testing', icon: 'LT' }
    },

    // Schwierigkeitsgrade
    difficulties: {
        'easy': { name: 'Einfach', color: '#10b981' },
        'medium': { name: 'Mittel', color: '#f59e0b' },
        'hard': { name: 'Schwer', color: '#ef4444' }
    },

    // Standard Parameter
    defaultParams: {
        temperature: 0,
        max_tokens: 2048
    },

    // Benchmark Defaults
    benchmark: {
        warmupTestId: 'test-002',
        batchIterations: 10  // Erhöht für bessere statistische Signifikanz
    },

    // Default Modelle
    defaultModels: {
        openrouter: 'openai/gpt-4.1'
    },

    // Debug-Assistent Konfiguration
    debugAssistant: {
        // Modell für Debug-Analyse (stärker als getestete Modelle)
        model: 'openai/gpt-5.2',
        provider: 'openrouter',

        // Standardisierter Debug-Prompt Template
        promptTemplate: `You are a debugging assistant. Analyze the following single-file HTML app against the requirements.
Return ONLY a numbered list of issues. No praise, no explanations.

Requirements:
- Single HTML file with embedded CSS/JS
- Task CRUD + counts (total/done)
- Pomodoro 25/5 with start/pause/reset + auto-switch
- Persist tasks + timer state in localStorage
- Shortcuts: Enter adds task, Space toggles timer, Delete removes selected task
- Accessibility: labels, aria-labels, visible focus states
- No external libraries

Code:
\`\`\`html
{{CODE}}
\`\`\`

List all issues found:`
    },

    // Refresh Intervalle
    refreshInterval: 30000 // 30 Sekunden
};

/**
 * API Client
 */
const API = {
    async fetch(endpoint, options = {}) {
        const url = `${CONFIG.apiUrl}${endpoint}`;

        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }));
                throw new Error(error.error || 'API Error');
            }

            return response.json();
        } catch (error) {
            console.error(`[API] Fetch error for ${endpoint}:`, error);
            if (error.name === 'AbortError') {
                throw new Error('Request wurde abgebrochen');
            }
            if (error.message === 'Failed to fetch' || error.message.includes('NetworkError')) {
                throw new Error('Backend nicht erreichbar. Prüfe ob der Server läuft (npm start)');
            }
            throw error;
        }
    },

    // Tests
    async getTests(filters = {}) {
        const params = new URLSearchParams(filters);
        return this.fetch(`/tests?${params}`);
    },

    async getTest(id) {
        return this.fetch(`/tests/${id}`);
    },

    // Models
    async getModels() {
        return this.fetch('/models');
    },

    async getProviderStatus(provider) {
        return this.fetch(`/models/${provider}/status`);
    },

    // Runner
    async runSingle(testId, provider, model, options = {}, meta = null, fetchOptions = {}) {
        return this.fetch('/runner/single', {
            method: 'POST',
            body: JSON.stringify({ testId, provider, model, options, meta }),
            ...fetchOptions
        });
    },

    async runBatch(testId, provider, model, iterations = 3, options = {}, fetchOptions = {}) {
        return this.fetch('/runner/batch', {
            method: 'POST',
            body: JSON.stringify({ testId, provider, model, iterations, options }),
            ...fetchOptions
        });
    },

    async runWithRetry(testId, provider, model, maxAttempts = 3, options = {}, fetchOptions = {}) {
        return this.fetch('/runner/retry', {
            method: 'POST',
            body: JSON.stringify({ testId, provider, model, maxAttempts, options }),
            ...fetchOptions
        });
    },

    async runCompare(testId, models, options = {}, fetchOptions = {}) {
        return this.fetch('/runner/compare', {
            method: 'POST',
            body: JSON.stringify({ testId, models, options }),
            ...fetchOptions
        });
    },

    // Debug-Assistent
    async debugAnalyze(code, options = {}) {
        const { provider, model, promptTemplate } = {
            provider: CONFIG.debugAssistant.provider,
            model: CONFIG.debugAssistant.model,
            ...options
        };
        return this.fetch('/runner/debug-analyze', {
            method: 'POST',
            body: JSON.stringify({ code, provider, model, promptTemplate })
        });
    },

    // Runs
    async getRuns(filters = {}) {
        const params = new URLSearchParams(filters);
        return this.fetch(`/runs?${params}`);
    },

    async getRun(id) {
        return this.fetch(`/runs/${id}`);
    },

    async getStats(filters = {}) {
        const params = new URLSearchParams(filters);
        return this.fetch(`/runs/stats?${params}`);
    },

    async evaluateRun(runId, passed, comment = '', criteria = {}) {
        return this.fetch(`/runs/${runId}/evaluate`, {
            method: 'POST',
            body: JSON.stringify({ passed, comment, criteria })
        });
    },

    async exportRuns(format = 'json', filters = {}) {
        const params = new URLSearchParams({ format, ...filters });
        const url = `${CONFIG.apiUrl}/runs/export?${params}`;
        window.open(url, '_blank');
    },

    async clearRuns() {
        return this.fetch('/runs?confirm=true', { method: 'DELETE' });
    },

    // Health
    async checkHealth(options = {}) {
        return this.fetch('/health', options);
    },

    // Runner job control (server-side)
    async getActiveRunnerJobs() {
        return this.fetch('/runner/active');
    },

    async cancelAllRunnerJobs() {
        return this.fetch('/runner/cancel-all', { method: 'POST' });
    },

    async cancelRunnerJob(jobId) {
        return this.fetch(`/runner/cancel/${encodeURIComponent(jobId)}`, { method: 'POST' });
    }
};

export { CONFIG, API };
window.CONFIG = CONFIG;
window.API = API;
