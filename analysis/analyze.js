/**
 * Benchmark Analysis Script
 *
 * Liest Benchmark JSON-Dateien und erzeugt Auswertungen für die PowerPoint
 *
 * Verwendung:
 *   node analyze.js
 *
 * Erwartet Dateien im gleichen Ordner:
 *   - STANDARD.json (Standard-Tests: test-001, test-002, etc.)
 *   - LONG_INPUT.json (Long Input Tests: test-010 bis test-014)
 */

const fs = require('fs');
const path = require('path');

// Konfiguration
const ANALYSIS_DIR = __dirname;

// Hilfsfunktionen
function median(values) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(values) {
    if (values.length < 2) return null;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1);
    return Math.sqrt(variance);
}

function mean(values) {
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

function formatMs(ms) {
    if (ms === null || ms === undefined) return '-';
    return Math.round(ms) + 'ms';
}

function formatPercent(value) {
    if (value === null || value === undefined) return '-';
    return Math.round(value * 100) + '%';
}

// Lädt eine JSON-Datei
function loadBenchmarkFile(filename) {
    const filepath = path.join(ANALYSIS_DIR, filename);
    try {
        const data = fs.readFileSync(filepath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Fehler beim Laden von ${filename}:`, error.message);
        return null;
    }
}

// Analysiert Runs und gruppiert nach Modell
function analyzeRuns(runs) {
    const byModel = {};
    const byTest = {};

    runs.forEach(run => {
        // Skip warmup runs
        if (run.isWarmup) return;

        const modelKey = `${run.provider}:${run.model}`;
        const latency = run.metrics?.t_model_ms || run.metrics?.latency_ms;

        // Nach Modell gruppieren
        if (!byModel[modelKey]) {
            byModel[modelKey] = {
                provider: run.provider,
                model: run.model,
                displayName: getDisplayName(run.provider, run.model),
                total: 0,
                passed: 0,
                failed: 0,
                latencies: [],
                costs: [],
                tokens: []
            };
        }

        byModel[modelKey].total++;
        if (run.passed === true) byModel[modelKey].passed++;
        if (run.passed === false) byModel[modelKey].failed++;
        if (latency) byModel[modelKey].latencies.push(latency);
        if (run.metrics?.cost) byModel[modelKey].costs.push(run.metrics.cost);
        if (run.metrics?.total_tokens) byModel[modelKey].tokens.push(run.metrics.total_tokens);

        // Nach Test gruppieren
        if (!byTest[run.testId]) {
            byTest[run.testId] = {
                testId: run.testId,
                testName: run.testName,
                models: {}
            };
        }

        if (!byTest[run.testId].models[modelKey]) {
            byTest[run.testId].models[modelKey] = {
                passed: 0,
                failed: 0,
                latencies: []
            };
        }

        if (run.passed === true) byTest[run.testId].models[modelKey].passed++;
        if (run.passed === false) byTest[run.testId].models[modelKey].failed++;
        if (latency) byTest[run.testId].models[modelKey].latencies.push(latency);
    });

    return { byModel, byTest };
}

// Erzeugt einen lesbaren Namen für das Modell
function getDisplayName(provider, model) {
    const names = {
        'ollama:codellama:7b': 'CodeLlama 7B (Lokal)',
        'ollama:codellama:7b-instruct': 'CodeLlama 7B Instruct (Lokal)',
        'ollama:qwen2.5-coder:7b': 'Qwen 2.5 Coder 7B (Lokal)',
        'openrouter:openai/gpt-4o-mini': 'GPT-4o Mini (Cloud)',
        'openrouter:anthropic/claude-3.5-haiku': 'Claude 3.5 Haiku (Cloud)',
        'openrouter:mistralai/mistral-7b-instruct': 'Mistral 7B Instruct (Cloud)',
        'openrouter:qwen/qwen-2.5-coder-7b-instruct': 'Qwen 2.5 Coder 7B (Cloud)'
    };
    return names[`${provider}:${model}`] || model;
}

// Berechnet finale Statistiken für ein Modell
function calculateStats(modelData) {
    const successRate = modelData.total > 0 ? modelData.passed / modelData.total : 0;
    const latencyMean = mean(modelData.latencies);
    const latencyMedian = median(modelData.latencies);
    const latencyStdDev = stdDev(modelData.latencies);
    const totalCost = modelData.costs.reduce((a, b) => a + b, 0);
    const avgTokens = mean(modelData.tokens);

    return {
        ...modelData,
        successRate,
        latency: {
            mean: latencyMean,
            median: latencyMedian,
            stdDev: latencyStdDev,
            min: modelData.latencies.length > 0 ? Math.min(...modelData.latencies) : null,
            max: modelData.latencies.length > 0 ? Math.max(...modelData.latencies) : null
        },
        totalCost,
        avgTokens
    };
}

// Formatiert die Ergebnisse als Tabelle für die Konsole
function printModelTable(title, modelStats) {
    console.log('\n' + '='.repeat(100));
    console.log(title);
    console.log('='.repeat(100));

    // Header
    console.log(
        'Modell'.padEnd(35) +
        'Erfolg'.padStart(10) +
        'Tests'.padStart(8) +
        'Latenz Ø'.padStart(12) +
        'Median'.padStart(12) +
        'StdDev'.padStart(12) +
        'Kosten'.padStart(12)
    );
    console.log('-'.repeat(100));

    // Sortiere nach Erfolgsrate
    const sorted = Object.values(modelStats).sort((a, b) => b.successRate - a.successRate);

    sorted.forEach(stat => {
        console.log(
            stat.displayName.padEnd(35) +
            formatPercent(stat.successRate).padStart(10) +
            `${stat.passed}/${stat.total}`.padStart(8) +
            formatMs(stat.latency.mean).padStart(12) +
            formatMs(stat.latency.median).padStart(12) +
            formatMs(stat.latency.stdDev).padStart(12) +
            (stat.totalCost > 0 ? `$${stat.totalCost.toFixed(4)}` : '-').padStart(12)
        );
    });
}

// Druckt Vergleichstabelle für PowerPoint
function printPowerPointTable(title, modelStats) {
    console.log('\n' + '='.repeat(80));
    console.log(`POWERPOINT TABELLE: ${title}`);
    console.log('='.repeat(80));
    console.log('(Kopiere diese Daten in deine PowerPoint)\n');

    // Lokale vs Cloud Vergleich
    const local = Object.values(modelStats).filter(s => s.provider === 'ollama');
    const cloud = Object.values(modelStats).filter(s => s.provider === 'openrouter');

    console.log('| Modell | Typ | Erfolgsrate | Median Latenz | Kosten |');
    console.log('|--------|-----|-------------|---------------|--------|');

    [...local, ...cloud].forEach(stat => {
        const type = stat.provider === 'ollama' ? 'Lokal' : 'Cloud';
        const cost = stat.totalCost > 0 ? `$${stat.totalCost.toFixed(4)}` : '$0.00';
        console.log(`| ${stat.displayName} | ${type} | ${formatPercent(stat.successRate)} | ${formatMs(stat.latency.median)} | ${cost} |`);
    });
}

// Druckt Zusammenfassung
function printSummary(standardStats, longInputStats) {
    console.log('\n' + '='.repeat(80));
    console.log('ZUSAMMENFASSUNG FÜR FORSCHUNGSFRAGEN');
    console.log('='.repeat(80));

    // Berechne Durchschnitte für lokal vs cloud
    const calcAverages = (stats, type) => {
        const filtered = Object.values(stats).filter(s =>
            type === 'lokal' ? s.provider === 'ollama' : s.provider === 'openrouter'
        );
        if (filtered.length === 0) return null;
        return {
            avgSuccessRate: mean(filtered.map(s => s.successRate)),
            avgLatency: mean(filtered.filter(s => s.latency.median).map(s => s.latency.median)),
            totalCost: filtered.reduce((a, b) => a + b.totalCost, 0)
        };
    };

    if (standardStats) {
        console.log('\n### Standard-Tests ###');
        const lokalStd = calcAverages(standardStats, 'lokal');
        const cloudStd = calcAverages(standardStats, 'cloud');

        if (lokalStd && cloudStd) {
            console.log(`\nLokale Modelle:`);
            console.log(`  - Durchschnittliche Erfolgsrate: ${formatPercent(lokalStd.avgSuccessRate)}`);
            console.log(`  - Durchschnittliche Latenz (Median): ${formatMs(lokalStd.avgLatency)}`);
            console.log(`  - Gesamtkosten: $${lokalStd.totalCost.toFixed(4)}`);

            console.log(`\nCloud Modelle:`);
            console.log(`  - Durchschnittliche Erfolgsrate: ${formatPercent(cloudStd.avgSuccessRate)}`);
            console.log(`  - Durchschnittliche Latenz (Median): ${formatMs(cloudStd.avgLatency)}`);
            console.log(`  - Gesamtkosten: $${cloudStd.totalCost.toFixed(4)}`);

            console.log(`\nVergleich (Lokal vs Cloud):`);
            console.log(`  - Erfolgsrate Differenz: ${formatPercent(lokalStd.avgSuccessRate - cloudStd.avgSuccessRate)}`);
            console.log(`  - Latenz Faktor: ${(lokalStd.avgLatency / cloudStd.avgLatency).toFixed(2)}x`);
        }
    }

    if (longInputStats) {
        console.log('\n### Long-Input-Tests ###');
        const lokalLong = calcAverages(longInputStats, 'lokal');
        const cloudLong = calcAverages(longInputStats, 'cloud');

        if (lokalLong && cloudLong) {
            console.log(`\nLokale Modelle:`);
            console.log(`  - Durchschnittliche Erfolgsrate: ${formatPercent(lokalLong.avgSuccessRate)}`);
            console.log(`  - Durchschnittliche Latenz (Median): ${formatMs(lokalLong.avgLatency)}`);

            console.log(`\nCloud Modelle:`);
            console.log(`  - Durchschnittliche Erfolgsrate: ${formatPercent(cloudLong.avgSuccessRate)}`);
            console.log(`  - Durchschnittliche Latenz (Median): ${formatMs(cloudLong.avgLatency)}`);
        }
    }

    // F2 Beantwortung
    console.log('\n' + '-'.repeat(80));
    console.log('BEANTWORTUNG FORSCHUNGSFRAGE F2:');
    console.log('"Wie performen selbstgehostete LLMs im Vergleich zu Cloud-Diensten?"');
    console.log('-'.repeat(80));

    if (standardStats) {
        const lokalStd = calcAverages(standardStats, 'lokal');
        const cloudStd = calcAverages(standardStats, 'cloud');

        if (lokalStd && cloudStd) {
            if (lokalStd.avgSuccessRate >= cloudStd.avgSuccessRate * 0.8) {
                console.log('\n✓ Lokale Modelle erreichen mindestens 80% der Cloud-Erfolgsrate');
            } else {
                console.log('\n✗ Lokale Modelle erreichen weniger als 80% der Cloud-Erfolgsrate');
            }

            if (lokalStd.avgLatency > cloudStd.avgLatency * 2) {
                console.log('✗ Lokale Modelle sind mehr als 2x langsamer');
            } else {
                console.log('✓ Lokale Modelle haben akzeptable Latenz');
            }
        }
    }
}

// Export für CSV
function exportCSV(modelStats, filename) {
    const headers = ['Modell', 'Provider', 'Typ', 'Total', 'Passed', 'Failed', 'Erfolgsrate',
                     'Latenz_Mean', 'Latenz_Median', 'Latenz_StdDev', 'Kosten'];

    const rows = Object.values(modelStats).map(stat => [
        stat.displayName,
        stat.provider,
        stat.provider === 'ollama' ? 'Lokal' : 'Cloud',
        stat.total,
        stat.passed,
        stat.failed,
        (stat.successRate * 100).toFixed(1),
        stat.latency.mean ? Math.round(stat.latency.mean) : '',
        stat.latency.median ? Math.round(stat.latency.median) : '',
        stat.latency.stdDev ? Math.round(stat.latency.stdDev) : '',
        stat.totalCost.toFixed(4)
    ]);

    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const filepath = path.join(ANALYSIS_DIR, filename);
    fs.writeFileSync(filepath, csv, 'utf-8');
    console.log(`\nCSV exportiert: ${filepath}`);
}

// Hauptfunktion
function main() {
    console.log('='.repeat(80));
    console.log('LLM BENCHMARK ANALYSE');
    console.log('='.repeat(80));
    console.log(`Arbeitsverzeichnis: ${ANALYSIS_DIR}`);

    // Lade verfügbare Dateien
    const files = fs.readdirSync(ANALYSIS_DIR).filter(f => f.endsWith('.json'));
    console.log(`\nGefundene JSON-Dateien: ${files.join(', ') || 'Keine'}`);

    if (files.length === 0) {
        console.log('\nKeine Benchmark-Dateien gefunden!');
        console.log('Bitte exportiere deine Benchmark-Runs und speichere sie als:');
        console.log('  - STANDARD.json (für Standard-Tests)');
        console.log('  - LONG_INPUT.json (für Long-Input-Tests)');
        return;
    }

    let standardStats = null;
    let longInputStats = null;

    // Analysiere Standard-Tests
    if (files.includes('STANDARD.json')) {
        console.log('\n>>> Analysiere STANDARD.json...');
        const standardRuns = loadBenchmarkFile('STANDARD.json');
        if (standardRuns) {
            const { byModel } = analyzeRuns(standardRuns);
            standardStats = {};
            Object.keys(byModel).forEach(key => {
                standardStats[key] = calculateStats(byModel[key]);
            });

            printModelTable('STANDARD-TESTS (test-001 bis test-009)', standardStats);
            printPowerPointTable('Standard-Tests', standardStats);
            exportCSV(standardStats, 'results_standard.csv');
        }
    }

    // Analysiere Long-Input-Tests
    if (files.includes('LONG_INPUT.json')) {
        console.log('\n>>> Analysiere LONG_INPUT.json...');
        const longInputRuns = loadBenchmarkFile('LONG_INPUT.json');
        if (longInputRuns) {
            const { byModel } = analyzeRuns(longInputRuns);
            longInputStats = {};
            Object.keys(byModel).forEach(key => {
                longInputStats[key] = calculateStats(byModel[key]);
            });

            printModelTable('LONG-INPUT-TESTS (test-010 bis test-014)', longInputStats);
            printPowerPointTable('Long-Input-Tests', longInputStats);
            exportCSV(longInputStats, 'results_long_input.csv');
        }
    }

    // Analysiere alle anderen JSON-Dateien
    files.filter(f => !['STANDARD.json', 'LONG_INPUT.json'].includes(f)).forEach(file => {
        console.log(`\n>>> Analysiere ${file}...`);
        const runs = loadBenchmarkFile(file);
        if (runs) {
            const { byModel } = analyzeRuns(runs);
            const stats = {};
            Object.keys(byModel).forEach(key => {
                stats[key] = calculateStats(byModel[key]);
            });
            printModelTable(`ERGEBNISSE: ${file}`, stats);
            printPowerPointTable(file.replace('.json', ''), stats);
        }
    });

    // Zusammenfassung
    printSummary(standardStats, longInputStats);

    console.log('\n' + '='.repeat(80));
    console.log('ANALYSE ABGESCHLOSSEN');
    console.log('='.repeat(80));
}

main();
