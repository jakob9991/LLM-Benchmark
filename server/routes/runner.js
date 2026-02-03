/**
 * Runner API Routes - Test-Ausführung
 */

const express = require('express');
const router = express.Router();
const { runSingle, runBatch, runWithRetry } = require('../services/runner');
const persistence = require('../services/persistence');

// POST /api/runner/single - Einzelnen Test ausführen
router.post('/single', async (req, res) => {
    try {
        const { testId, provider, model, options, meta } = req.body;

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
            meta
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/runner/batch - Test mehrfach ausführen
router.post('/batch', async (req, res) => {
    try {
        const { testId, provider, model, iterations = 3, options } = req.body;

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
            options
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/runner/retry - Test mit Retry ausführen
router.post('/retry', async (req, res) => {
    try {
        const { testId, provider, model, maxAttempts = 3, includeFeedback = true, options } = req.body;

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
            options
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
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
    }
});

module.exports = router;
