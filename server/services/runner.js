/**
 * Runner Service - Führt Tests aus (Single, Batch, Retry)
 */

const { runModel } = require('../providers');
const { buildPrompt, normalizeOutput } = require('./promptPipeline');
const { runAutoCheck } = require('./evaluator');
const persistence = require('./persistence');
const { v4: uuidv4 } = require('uuid');

/**
 * Führt einen einzelnen Test-Run aus
 * @param {Object} params
 * @param {Object} params.test - Test-Definition
 * @param {string} params.provider - Provider Name
 * @param {string} params.model - Modell ID
 * @param {Object} params.options - Zusätzliche Optionen
 * @param {Function} params.onStream - Streaming Callback
 * @param {Function} params.onProgress - Progress Callback
 * @returns {Promise<Object>} - Run Result
 */
async function runSingle({ test, provider, model, options = {}, meta = {}, onStream = null, onProgress = null }) {
    const runId = uuidv4();
    const startTime = Date.now();

    // Erstelle initialen Run-Eintrag
    const run = {
        id: runId,
        testId: test.id,
        testName: test.name,
        provider,
        model,
        status: 'running',
        attempt: meta?.retryAttempt || 1,
        startedAt: new Date().toISOString(),
        isWarmup: meta?.isWarmup === true,
        isDebugAnalysis: meta?.isDebugAnalysis === true,
        retryId: meta?.retryId || null
    };

    if (onProgress) onProgress({ type: 'start', run });

    try {
        // Baue Prompt
        const testForRun = meta?.retryContext
            ? { ...test, promptTemplate: meta.retryContext + test.promptTemplate }
            : test;
        const { prompt, params, logInfo } = buildPrompt(testForRun);
        run.promptInfo = {
            ...logInfo,
            retryContext: meta?.retryContext || null,
            retryAttempt: meta?.retryAttempt || null,
            retryId: meta?.retryId || null
        };
        run.params = { ...params, ...options };

        // Führe Model aus
        const result = await runModel({
            provider,
            model,
            prompt,
            options: run.params,
            onStream
        });

        const endTime = Date.now();

        // Normalisiere Output
        const normalizedOutput = normalizeOutput(result.text, test.outputFormat);

        // Debug: Log output length and tail to confirm truncation source
        console.log(`[Runner] Output length: ${result.text.length}`);
        console.log('[Runner] Output tail:', result.text.slice(-400));

        // Update Run
        run.status = 'completed';
        run.output = result.text;
        run.normalizedOutput = normalizedOutput;
        run.meta = result.meta;
        run.completedAt = new Date().toISOString();

        // Metriken - Modellzeit
        run.metrics = {
            t_model_ms: result.meta.latency_ms || (endTime - startTime),
            time_to_first_token: result.meta.time_to_first_token,
            tokens_in: result.meta.tokens_in,
            tokens_out: result.meta.tokens_out,
            total_tokens: (result.meta.tokens_in || 0) + (result.meta.tokens_out || 0),
            output_length: result.text.length,
            cost: result.meta.cost || null
        };

        // Auto-Check falls definiert
        if (test.evaluationType === 'auto') {
            if (onProgress) onProgress({ type: 'checking', run });
            const checkStart = Date.now();
            run.checkResult = await runAutoCheck(normalizedOutput, test);
            run.metrics.t_check_ms = Date.now() - checkStart;
            run.passed = run.checkResult.passed;
            run.metrics.t_check_ms = run.metrics.t_check_ms || 0;
        } else {
            run.checkResult = null;
            run.passed = null; // Wartet auf manuellen Check
            run.metrics.t_check_ms = 0;
        }

        // Total Zeit berechnen
        run.metrics.t_total_ms = Date.now() - startTime;

        if (onProgress) onProgress({ type: 'complete', run });

    } catch (error) {
        run.status = 'failed';
        run.error = error.message;
        run.completedAt = new Date().toISOString();
        run.passed = false;

        if (onProgress) onProgress({ type: 'error', run, error });
    }

    // Speichere Run
    await persistence.saveRun(run);

    return run;
}

/**
 * Führt einen Test mehrfach aus (Batch)
 * @param {Object} params
 * @param {Object} params.test - Test-Definition
 * @param {string} params.provider - Provider Name
 * @param {string} params.model - Modell ID
 * @param {number} params.iterations - Anzahl Durchläufe
 * @param {Object} params.options - Zusätzliche Optionen
 * @param {Function} params.onProgress - Progress Callback
 * @returns {Promise<Object>} - Batch Result mit Aggregation
 */
async function runBatch({ test, provider, model, iterations = 3, options = {}, onProgress = null }) {
    const batchId = uuidv4();
    const runs = [];

    if (onProgress) {
        onProgress({
            type: 'batch_start',
            batchId,
            total: iterations
        });
    }

    for (let i = 0; i < iterations; i++) {
        if (onProgress) {
            onProgress({
                type: 'iteration_start',
                batchId,
                iteration: i + 1,
                total: iterations
            });
        }

        const run = await runSingle({
            test,
            provider,
            model,
            options,
            onProgress: (p) => {
                if (onProgress) {
                    onProgress({
                        ...p,
                        batchId,
                        iteration: i + 1,
                        total: iterations
                    });
                }
            }
        });

        run.batchId = batchId;
        run.batchIteration = i + 1;
        runs.push(run);

        // Kurze Pause zwischen Runs (Rate Limiting)
        if (i < iterations - 1) {
            await sleep(1000);
        }
    }

    // Aggregiere Ergebnisse
    const aggregation = aggregateRuns(runs);

    const batchResult = {
        batchId,
        testId: test.id,
        testName: test.name,
        provider,
        model,
        iterations,
        runs,
        aggregation,
        completedAt: new Date().toISOString()
    };

    if (onProgress) {
        onProgress({
            type: 'batch_complete',
            batchId,
            result: batchResult
        });
    }

    return batchResult;
}

/**
 * Führt einen Test mit Retry bei Fehler aus
 * @param {Object} params
 * @param {Object} params.test - Test-Definition
 * @param {string} params.provider - Provider Name
 * @param {string} params.model - Modell ID
 * @param {number} params.maxAttempts - Maximale Versuche
 * @param {boolean} params.includeFeedback - Fehlermeldung beim Retry mitgeben
 * @param {Object} params.options - Zusätzliche Optionen
 * @param {Function} params.onProgress - Progress Callback
 * @returns {Promise<Object>} - Retry Result
 */
async function runWithRetry({ test, provider, model, maxAttempts = 3, includeFeedback = true, options = {}, onProgress = null }) {
    const retryId = uuidv4();
    const attempts = [];
    let lastRun = null;
    let currentTest = { ...test };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (onProgress) {
            onProgress({
                type: 'retry_attempt',
                retryId,
                attempt,
                maxAttempts
            });
        }

        // Bei Retry: Füge Feedback zum Prompt hinzu
        if (attempt > 1 && lastRun && includeFeedback) {
            currentTest = {
                ...test,
                promptTemplate: buildRetryPrompt(test.promptTemplate, attempts)
            };
        }

        lastRun = await runSingle({
            test: currentTest,
            provider,
            model,
            options,
            onProgress
        });

        lastRun.retryId = retryId;
        lastRun.attempt = attempt;
        attempts.push(lastRun);

        // Bei Erfolg oder manuellem Check: Stoppe
        if (lastRun.passed === true || test.evaluationType === 'manual') {
            break;
        }

        // Kurze Pause vor Retry
        if (attempt < maxAttempts) {
            await sleep(2000);
        }
    }

    const retryResult = {
        retryId,
        testId: test.id,
        testName: test.name,
        provider,
        model,
        maxAttempts,
        actualAttempts: attempts.length,
        attempts,
        finalRun: lastRun,
        passed: lastRun?.passed ?? null,
        firstTrySuccess: attempts[0]?.passed === true,
        successWithinN: attempts.some(a => a.passed === true),
        completedAt: new Date().toISOString()
    };

    if (onProgress) {
        onProgress({
            type: 'retry_complete',
            retryId,
            result: retryResult
        });
    }

    return retryResult;
}

/**
 * Baut einen Retry-Prompt mit Feedback
 */
function buildRetryPrompt(originalTemplate, attempts) {
    let feedback = '\n\n--- BENCHMARK CONTEXT ---\n';
    feedback += 'You are in a benchmark test. Keep the output format exactly as instructed.\n';
    feedback += 'You will receive previous attempts and their check results. Use them to fix the solution.\n';
    feedback += 'Return ONLY the new solution, no extra commentary.\n';
    feedback += '--- END CONTEXT ---\n';

    if (attempts.length > 0) {
        feedback += '\n--- PREVIOUS ATTEMPTS ---\n';
        attempts.forEach((run, index) => {
            feedback += `Attempt ${index + 1}:\n`;
            feedback += run.output ? `Output:\n${run.output}\n` : 'Output: <empty>\n';
            if (run.checkResult?.details) {
                const details = run.checkResult.details;
                if (details.stderr) {
                    feedback += `Error: ${details.stderr}\n`;
                }
                if (details.stdout && run.passed === false) {
                    feedback += `Stdout: ${details.stdout}\n`;
                }
                if (details.exitCode !== undefined && details.exitCode !== 0) {
                    feedback += `Exit Code: ${details.exitCode}\n`;
                }
            }
            feedback += '\n';
        });
        feedback += '--- END PREVIOUS ATTEMPTS ---\n\n';
    }

    feedback += 'Please fix the solution and try again.\n\n';

    return feedback + originalTemplate;
}

/**
 * Aggregiert mehrere Runs zu Statistiken
 */
function aggregateRuns(runs) {
    const completed = runs.filter(r => r.status === 'completed');
    const withMetrics = completed.filter(r => r.metrics);

    // Neue Metrik-Namen verwenden (t_model_ms statt latency_ms für Kompatibilität)
    const modelTimes = withMetrics.map(r => r.metrics.t_model_ms || r.metrics.latency_ms).filter(Boolean);
    const checkTimes = withMetrics.map(r => r.metrics.t_check_ms).filter(v => v !== undefined);
    const totalTimes = withMetrics.map(r => r.metrics.t_total_ms).filter(Boolean);
    const ttfts = withMetrics.map(r => r.metrics.time_to_first_token).filter(Boolean);
    const tokensIn = withMetrics.map(r => r.metrics.tokens_in).filter(Boolean);
    const tokensOut = withMetrics.map(r => r.metrics.tokens_out).filter(Boolean);

    const passed = runs.filter(r => r.passed === true);
    const failed = runs.filter(r => r.passed === false);

    // Berechne ersten erfolgreichen Versuch
    const firstSuccessIdx = runs.findIndex(r => r.passed === true);
    const timeToFirstSuccess = firstSuccessIdx >= 0 && totalTimes[firstSuccessIdx]
        ? totalTimes.slice(0, firstSuccessIdx + 1).reduce((a, b) => a + b, 0)
        : null;

    return {
        total: runs.length,
        completed: completed.length,
        passed: passed.length,
        failed: failed.length,
        pending: runs.filter(r => r.passed === null).length,
        successRate: completed.length > 0 ? Math.round((passed.length / completed.length) * 100) : 0,
        firstTrySuccess: runs[0]?.passed === true,
        firstSuccessAttempt: firstSuccessIdx >= 0 ? firstSuccessIdx + 1 : null,
        timeToFirstSuccess,
        modelTime: {
            min: modelTimes.length > 0 ? Math.min(...modelTimes) : null,
            max: modelTimes.length > 0 ? Math.max(...modelTimes) : null,
            mean: modelTimes.length > 0 ? Math.round(modelTimes.reduce((a, b) => a + b, 0) / modelTimes.length) : null,
            median: modelTimes.length > 0 ? median(modelTimes) : null,
            stdDev: modelTimes.length > 1 ? Math.round(stdDev(modelTimes)) : null
        },
        checkTime: {
            mean: checkTimes.length > 0 ? Math.round(checkTimes.reduce((a, b) => a + b, 0) / checkTimes.length) : null,
            median: checkTimes.length > 0 ? median(checkTimes) : null
        },
        totalTime: {
            mean: totalTimes.length > 0 ? Math.round(totalTimes.reduce((a, b) => a + b, 0) / totalTimes.length) : null,
            median: totalTimes.length > 0 ? median(totalTimes) : null,
            stdDev: totalTimes.length > 1 ? Math.round(stdDev(totalTimes)) : null
        },
        timeToFirstToken: {
            mean: ttfts.length > 0 ? Math.round(ttfts.reduce((a, b) => a + b, 0) / ttfts.length) : null,
            median: ttfts.length > 0 ? median(ttfts) : null
        },
        tokens: {
            avgIn: tokensIn.length > 0 ? Math.round(tokensIn.reduce((a, b) => a + b, 0) / tokensIn.length) : null,
            avgOut: tokensOut.length > 0 ? Math.round(tokensOut.reduce((a, b) => a + b, 0) / tokensOut.length) : null,
            totalIn: tokensIn.length > 0 ? tokensIn.reduce((a, b) => a + b, 0) : null,
            totalOut: tokensOut.length > 0 ? tokensOut.reduce((a, b) => a + b, 0) : null
        }
    };
}

/**
 * Berechnet Median
 */
function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Berechnet Standardabweichung
 */
function stdDev(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1); // Sample std dev
    return Math.sqrt(variance);
}

/**
 * Sleep Helper
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    runSingle,
    runBatch,
    runWithRetry,
    aggregateRuns
};
