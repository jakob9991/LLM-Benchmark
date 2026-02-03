/**
 * Persistence Service - Speichert Runs und Ergebnisse
 */

const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const RUNS_FILE = path.join(DATA_DIR, 'runs.json');
const TESTS_FILE = path.join(DATA_DIR, 'tests/default-tests.json');

/**
 * Stellt sicher, dass die Datenverzeichnisse existieren
 */
async function ensureDataDir() {
    await fs.mkdir(path.join(DATA_DIR, 'runs'), { recursive: true });
    await fs.mkdir(path.join(DATA_DIR, 'outputs'), { recursive: true });
}

/**
 * Lädt alle Runs
 * @returns {Promise<Array>}
 */
async function loadRuns() {
    try {
        await ensureDataDir();
        const data = await fs.readFile(RUNS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

/**
 * Speichert einen neuen Run (append)
 * @param {Object} run
 * @returns {Promise<Object>}
 */
async function saveRun(run) {
    await ensureDataDir();
    const runs = await loadRuns();
    runs.unshift(run); // Neueste zuerst

    // Begrenze auf maximal 1000 Runs
    if (runs.length > 1000) {
        runs.splice(1000);
    }

    await fs.writeFile(RUNS_FILE, JSON.stringify(runs, null, 2));
    return run;
}

/**
 * Aktualisiert einen Run
 * @param {string} runId
 * @param {Object} updates
 * @returns {Promise<Object|null>}
 */
async function updateRun(runId, updates) {
    const runs = await loadRuns();
    const index = runs.findIndex(r => r.id === runId);

    if (index === -1) {
        return null;
    }

    runs[index] = { ...runs[index], ...updates, updatedAt: new Date().toISOString() };
    await fs.writeFile(RUNS_FILE, JSON.stringify(runs, null, 2));
    return runs[index];
}

/**
 * Holt einen einzelnen Run
 * @param {string} runId
 * @returns {Promise<Object|null>}
 */
async function getRun(runId) {
    const runs = await loadRuns();
    return runs.find(r => r.id === runId) || null;
}

/**
 * Filtert Runs
 * @param {Object} filters
 * @returns {Promise<Array>}
 */
async function filterRuns(filters = {}) {
    let runs = await loadRuns();

    if (!filters.includeWarmup) {
        runs = runs.filter(r => !r.isWarmup);
    }

    if (filters.testId) {
        runs = runs.filter(r => r.testId === filters.testId);
    }
    if (filters.provider) {
        runs = runs.filter(r => r.provider === filters.provider);
    }
    if (filters.model) {
        runs = runs.filter(r => r.model === filters.model);
    }
    if (filters.status) {
        runs = runs.filter(r => r.status === filters.status);
    }
    if (filters.passed !== undefined) {
        runs = runs.filter(r => r.passed === filters.passed);
    }
    if (filters.fromDate) {
        runs = runs.filter(r => new Date(r.startedAt) >= new Date(filters.fromDate));
    }
    if (filters.toDate) {
        runs = runs.filter(r => new Date(r.startedAt) <= new Date(filters.toDate));
    }

    // Limit
    if (filters.limit) {
        runs = runs.slice(0, filters.limit);
    }

    return runs;
}

/**
 * Löscht alle Runs
 */
async function clearRuns() {
    await ensureDataDir();
    await fs.writeFile(RUNS_FILE, '[]');
}

/**
 * Exportiert Runs als JSON oder CSV
 * @param {string} format - 'json' oder 'csv'
 * @param {Object} filters
 * @returns {Promise<string>}
 */
async function exportRuns(format = 'json', filters = {}) {
    const runs = await filterRuns(filters);

    if (format === 'csv') {
        return runsToCSV(runs);
    }

    return JSON.stringify(runs, null, 2);
}

/**
 * Konvertiert Runs zu CSV
 */
function runsToCSV(runs) {
    if (runs.length === 0) return '';

    const headers = [
        'id', 'testId', 'testName', 'provider', 'model', 'status', 'passed', 'isWarmup',
        't_model_ms', 't_check_ms', 't_total_ms', 'time_to_first_token',
        'tokens_in', 'tokens_out', 'total_tokens', 'cost',
        'temperature', 'max_tokens',
        'attempt', 'startedAt', 'completedAt', 'error'
    ];

    const rows = runs.map(run => {
        return [
            run.id,
            run.testId,
            `"${(run.testName || '').replace(/"/g, '""')}"`,
            run.provider,
            run.model,
            run.status,
            run.passed,
            run.isWarmup ? 'true' : 'false',
            run.metrics?.t_model_ms || run.metrics?.latency_ms || '',
            run.metrics?.t_check_ms || '',
            run.metrics?.t_total_ms || '',
            run.metrics?.time_to_first_token || '',
            run.metrics?.tokens_in || '',
            run.metrics?.tokens_out || '',
            run.metrics?.total_tokens || '',
            run.metrics?.cost || '',
            run.params?.temperature || '',
            run.params?.max_tokens || '',
            run.attempt || 1,
            run.startedAt,
            run.completedAt || '',
            `"${(run.error || '').replace(/"/g, '""')}"`
        ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
}

/**
 * Lädt Tests
 * @returns {Promise<Array>}
 */
async function loadTests() {
    try {
        const data = await fs.readFile(TESTS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading tests:', error);
        return [];
    }
}

/**
 * Speichert Tests
 * @param {Array} tests
 */
async function saveTests(tests) {
    await fs.writeFile(TESTS_FILE, JSON.stringify(tests, null, 2));
}

/**
 * Berechnet Median
 */
function median(values) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Berechnet Standardabweichung
 */
function stdDev(values) {
    if (values.length < 2) return null;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1);
    return Math.round(Math.sqrt(variance));
}

/**
 * Berechnet aggregierte Statistiken
 * @param {Object} filters
 * @returns {Promise<Object>}
 */
async function getStatistics(filters = {}) {
    let runs = await filterRuns(filters);
    // Exclude debug-assistant runs from metrics/statistics.
    runs = runs.filter(r => r.testId !== 'debug-analyze' && !r.isDebugAnalysis);

    const byProvider = {};
    const byModel = {};
    const byTest = {};

    runs.forEach(run => {
        // Latenz (neue oder alte Metrik)
        const latency = run.metrics?.t_model_ms || run.metrics?.latency_ms;

        // Nach Provider
        if (!byProvider[run.provider]) {
            byProvider[run.provider] = { total: 0, passed: 0, failed: 0, latencies: [], firstTryPassed: 0 };
        }
        byProvider[run.provider].total++;
        if (run.passed === true) byProvider[run.provider].passed++;
        if (run.passed === false) byProvider[run.provider].failed++;
        if (run.attempt === 1 && run.passed === true) byProvider[run.provider].firstTryPassed++;
        if (latency) byProvider[run.provider].latencies.push(latency);

        // Nach Model
        const modelKey = `${run.provider}:${run.model}`;
        if (!byModel[modelKey]) {
            byModel[modelKey] = { total: 0, passed: 0, failed: 0, latencies: [], firstTryPassed: 0 };
        }
        byModel[modelKey].total++;
        if (run.passed === true) byModel[modelKey].passed++;
        if (run.passed === false) byModel[modelKey].failed++;
        if (run.attempt === 1 && run.passed === true) byModel[modelKey].firstTryPassed++;
        if (latency) byModel[modelKey].latencies.push(latency);

        // Nach Test
        if (!byTest[run.testId]) {
            byTest[run.testId] = { name: run.testName, total: 0, passed: 0, failed: 0, latencies: [] };
        }
        byTest[run.testId].total++;
        if (run.passed === true) byTest[run.testId].passed++;
        if (run.passed === false) byTest[run.testId].failed++;
        if (latency) byTest[run.testId].latencies.push(latency);
    });

    // Berechne Statistiken mit Median und StdDev
    const calcStats = (group) => {
        Object.values(group).forEach(g => {
            g.successRate = g.total > 0 ? Math.round((g.passed / g.total) * 100) : 0;
            if (g.firstTryPassed !== undefined) {
                g.firstTrySuccessRate = g.total > 0 ? Math.round((g.firstTryPassed / g.total) * 100) : 0;
            }
            if (g.latencies && g.latencies.length > 0) {
                g.latency = {
                    mean: Math.round(g.latencies.reduce((a, b) => a + b, 0) / g.latencies.length),
                    median: median(g.latencies),
                    stdDev: stdDev(g.latencies),
                    min: Math.min(...g.latencies),
                    max: Math.max(...g.latencies)
                };
                // Behalte auch avgLatency für Rückwärtskompatibilität
                g.avgLatency = g.latency.mean;
            }
            delete g.latencies;
            delete g.firstTryPassed;
        });
    };

    calcStats(byProvider);
    calcStats(byModel);
    calcStats(byTest);

    // Globale Latenz-Statistiken
    const allLatencies = runs
        .map(r => r.metrics?.t_model_ms || r.metrics?.latency_ms)
        .filter(Boolean);

    return {
        total: runs.length,
        passed: runs.filter(r => r.passed === true).length,
        failed: runs.filter(r => r.passed === false).length,
        pending: runs.filter(r => r.passed === null).length,
        globalLatency: allLatencies.length > 0 ? {
            mean: Math.round(allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length),
            median: median(allLatencies),
            stdDev: stdDev(allLatencies)
        } : null,
        byProvider,
        byModel,
        byTest
    };
}

module.exports = {
    loadRuns,
    saveRun,
    updateRun,
    getRun,
    filterRuns,
    clearRuns,
    exportRuns,
    loadTests,
    saveTests,
    getStatistics
};
