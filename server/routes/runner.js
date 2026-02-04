/**
 * Runner API Routes - Test-Ausführung
 */

const express = require('express');
const router = express.Router();
const { runSingle, runBatch, runWithRetry, createJob, finishJob, listJobs, cancelJob, cancelAllJobs } = require('../services/runner');
const persistence = require('../services/persistence');

// GET /api/runner/active - Liste aktiver Jobs (fuer UI nach Refresh)
router.get('/active', (req, res) => {
    res.json({ jobs: listJobs() });
});

// POST /api/runner/cancel-all - Bricht alle laufenden Jobs ab
router.post('/cancel-all', (req, res) => {
    const cancelled = cancelAllJobs();
    res.json({ cancelled });
});

// POST /api/runner/cancel/:jobId - Bricht einen Job ab
router.post('/cancel/:jobId', (req, res) => {
    const ok = cancelJob(req.params.jobId);
    if (!ok) return res.status(404).json({ error: 'Job nicht gefunden' });
    res.json({ cancelled: true });
});

// POST /api/runner/single - Einzelnen Test ausführen
router.post('/single', async (req, res) => {
    let job = null;
    try {
        const { testId, provider, model, options, meta } = req.body;

        job = createJob({ type: 'single', testId, provider, model });

        // Validierung
        if (!testId || !provider || !model) {
            return res.status(400).json({
                error: 'Pflichtfelder: testId, provider, model'
            });
        }

        // Test laden
        const tests = await persistence.loadTests();
        const test = tests.find(t => t.id === testId);

        if (!test) {
            return res.status(404).json({ error: 'Test nicht gefunden' });
        }

        // Test ausführen
        const result = await runSingle({
            test,
            provider,
            model,
            options,
            meta,
            abortSignal: job.signal
        });

        res.json({ ...result, jobId: job.jobId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (job) finishJob(job.jobId);
    }
});

// POST /api/runner/batch - Test mehrfach ausführen
router.post('/batch', async (req, res) => {
    let job = null;
    try {
        const { testId, provider, model, iterations = 3, options } = req.body;

        job = createJob({ type: 'batch', testId, provider, model, iterations });

        // Validierung
        if (!testId || !provider || !model) {
            return res.status(400).json({
                error: 'Pflichtfelder: testId, provider, model'
            });
        }

        if (iterations < 1 || iterations > 10) {
            return res.status(400).json({
                error: 'iterations muss zwischen 1 und 10 liegen'
            });
        }

        // Test laden
        const tests = await persistence.loadTests();
        const test = tests.find(t => t.id === testId);

        if (!test) {
            return res.status(404).json({ error: 'Test nicht gefunden' });
        }

        // Batch ausführen
        const result = await runBatch({
            test,
            provider,
            model,
            iterations,
            options,
            abortSignal: job.signal
        });

        res.json({ ...result, jobId: job.jobId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (job) finishJob(job.jobId);
    }
});

// POST /api/runner/retry - Test mit Retry ausführen
router.post('/retry', async (req, res) => {
    let job = null;
    try {
        const { testId, provider, model, maxAttempts = 3, includeFeedback = true, options } = req.body;

        job = createJob({ type: 'retry', testId, provider, model, maxAttempts });

        // Validierung
        if (!testId || !provider || !model) {
            return res.status(400).json({
                error: 'Pflichtfelder: testId, provider, model'
            });
        }

        if (maxAttempts < 1 || maxAttempts > 20) {
            return res.status(400).json({
                error: 'maxAttempts muss zwischen 1 und 20 liegen'
            });
        }

        // Test laden
        const tests = await persistence.loadTests();
        const test = tests.find(t => t.id === testId);

        if (!test) {
            return res.status(404).json({ error: 'Test nicht gefunden' });
        }

        // Mit Retry ausführen
        const result = await runWithRetry({
            test,
            provider,
            model,
            maxAttempts,
            includeFeedback,
            options,
            abortSignal: job.signal
        });

        res.json({ ...result, jobId: job.jobId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (job) finishJob(job.jobId);
    }
});

// POST /api/runner/debug-analyze - Code mit Debug-Assistent analysieren
router.post('/debug-analyze', async (req, res) => {
    try {
        const { code, provider = 'openrouter', model = 'openai/gpt-4o', promptTemplate } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'code ist erforderlich' });
        }

        // Default Prompt Template
        const defaultTemplate = `You are a debugging assistant. Analyze the following single-file HTML app against the requirements.
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

List all issues found:`;

        const prompt = (promptTemplate || defaultTemplate).replace('{{CODE}}', code);

        // Führe Analyse aus
        const result = await runSingle({
            test: {
                id: 'debug-analyze',
                name: 'Debug Analysis',
                promptTemplate: prompt,
                input: '',
                evaluationType: 'manual'
            },
            provider,
            model,
            options: { temperature: 0 },
            meta: { isDebugAnalysis: true }
        });

        res.json({
            issues: result.output,
            model: `${provider}/${model}`,
            metrics: result.metrics
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (job) finishJob(job.jobId);
    }
});

// POST /api/runner/compare - Test mit mehreren Modellen vergleichen
router.post('/compare', async (req, res) => {
    try {
        const { testId, models, options } = req.body;

        // models: [{provider: 'ollama', model: 'mistral'}, {provider: 'openai', model: 'gpt-4'}]
        if (!testId || !models || !Array.isArray(models) || models.length < 2) {
            return res.status(400).json({
                error: 'Pflichtfelder: testId, models (Array mit min. 2 Modellen)'
            });
        }

        // Test laden
        const tests = await persistence.loadTests();
        const test = tests.find(t => t.id === testId);

        if (!test) {
            return res.status(404).json({ error: 'Test nicht gefunden' });
        }

        // Alle Modelle nacheinander testen
        const results = [];
        for (const modelConfig of models) {
            try {
                const result = await runSingle({
                    test,
                    provider: modelConfig.provider,
                    model: modelConfig.model,
                    options
                });
                results.push(result);
            } catch (error) {
                results.push({
                    provider: modelConfig.provider,
                    model: modelConfig.model,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        res.json({
            testId,
            testName: test.name,
            results,
            comparison: {
                fastest: results
                    .filter(r => r.metrics?.latency_ms)
                    .sort((a, b) => a.metrics.latency_ms - b.metrics.latency_ms)[0],
                allPassed: results.every(r => r.passed === true),
                passedCount: results.filter(r => r.passed === true).length
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (job) finishJob(job.jobId);
    }
});

module.exports = router;
