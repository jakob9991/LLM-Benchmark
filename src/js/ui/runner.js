import { API, CONFIG } from '../config.js';

export const runner = {
    beginRunnerOperation() {
        if (this.state.runnerAbortController) {
            this.state.runnerAbortController.abort();
        }
        this.state.runnerAbortController = new AbortController();
        this.state.runnerCancelRequested = false;
        this.setAbortButtonEnabled(true);
        // Avoid stale "post warmup" CTA during any active runner operation.
        const nextBtn = document.getElementById('runner-next-action-btn');
        if (nextBtn) {
            nextBtn.style.display = 'none';
            nextBtn.disabled = true;
        }
        this.startRunnerElapsedTimer();
        this.resetRunnerUI();
    },


    resetRunnerUI() {
        // Reset Output
        document.getElementById('runner-prompt').textContent = '';
        document.getElementById('runner-output').textContent = 'Warte auf Antwort...';
        const elapsed = document.getElementById('runner-elapsed');
        if (elapsed) elapsed.textContent = '0:00';
        const step = document.getElementById('runner-step');
        if (step) step.textContent = '-';

        // Hide/Reset all sections
        document.getElementById('runner-metrics').style.display = 'none';
        document.getElementById('check-result').style.display = 'none';
        document.getElementById('manual-eval').style.display = 'none';
        document.getElementById('runner-progress').style.display = 'none';

        // Reset buttons
        const previewBtn = document.getElementById('preview-html-btn');
        if (previewBtn) previewBtn.style.display = 'none';

        const debugBtn = document.getElementById('debug-analyze-btn');
        if (debugBtn) debugBtn.style.display = 'none';

        const debugResult = document.getElementById('debug-analysis-result');
        if (debugResult) debugResult.style.display = 'none';

        // Reset retry history
        const retryHistory = document.getElementById('retry-history-panel');
        if (retryHistory) retryHistory.style.display = 'none';

        // Reset run summary
        const summary = document.getElementById('run-summary');
        if (summary) summary.style.display = 'none';
        const summaryContent = document.getElementById('run-summary-content');
        if (summaryContent) summaryContent.innerHTML = '';

        // Reset output toggle
        const outputEl = document.getElementById('runner-output');
        if (outputEl) {
            outputEl.classList.remove('expanded');
            outputEl.classList.remove('collapsed');
        }

        const toggleBtn = document.getElementById('toggle-output-btn');
        if (toggleBtn) toggleBtn.textContent = 'Vollansicht';
    },


    resetRunnerUIBetweenTests() {
        // Leichteres Reset zwischen Tests in einem Batch
        if (!this.state._batchAllActive) {
            document.getElementById('runner-output').textContent = 'Warte auf Antwort...';
        }
        document.getElementById('runner-metrics').style.display = 'none';
        document.getElementById('check-result').style.display = 'none';

        // Preview/Debug Buttons verstecken (werden bei Bedarf wieder angezeigt)
        const previewBtn = document.getElementById('preview-html-btn');
        if (previewBtn) previewBtn.style.display = 'none';

        const debugBtn = document.getElementById('debug-analyze-btn');
        if (debugBtn) debugBtn.style.display = 'none';
    },

    appendRunnerLog(line) {
        const el = document.getElementById('runner-output');
        if (!el) return;
        const current = el.textContent || '';
        el.textContent = current ? `${current}\n${line}` : line;
    },


    finishRunnerOperation() {
        this.state.runnerAbortController = null;
        this.state.runnerCancelRequested = false;
        this.setAbortButtonEnabled(false);
        this.stopRunnerElapsedTimer();

        // Reset Limit-Test Mode
        if (this.state.isLimitTestMode) {
            this.state.isLimitTestMode = false;
            const runnerView = document.getElementById('runner-view');
            if (runnerView) {
                runnerView.classList.remove('runner-view-limit');
            }
        }

        // NICHT mehr automatisch in Idle setzen - Ergebnis soll sichtbar bleiben
        // Reset passiert erst beim Start des nächsten Tests (beginRunnerOperation)
        // if (!this.state.benchmarkRunning) {
        //     this.setRunnerIdle();
        // }
    },

    setRunnerIdle() {
        this.setRunnerStatus('idle', 'Bereit');
        document.getElementById('runner-test-name').textContent = '-';
        document.getElementById('runner-model-name').textContent = '-';
        document.getElementById('runner-mode').textContent = '-';
        document.getElementById('runner-prompt').textContent = 'Kein Test ausgewählt';
        document.getElementById('runner-output').textContent = 'Bereit für Test-Ausführung';
        document.getElementById('runner-progress').style.display = 'none';
    },

    showRunSummary({ title, stats = [], note = '' }) {
        const container = document.getElementById('run-summary');
        const content = document.getElementById('run-summary-content');
        if (!container || !content) return;

        const titleEl = container.querySelector('h3');
        if (titleEl && title) titleEl.textContent = title;

        const statsHtml = stats.map(s => `
            <div class="run-summary-stat">
                <div class="label">${s.label}</div>
                <div class="value ${s.tone || ''}">${s.value}</div>
            </div>
        `).join('');

        content.innerHTML = `
            <div class="run-summary-grid">${statsHtml}</div>
            ${note ? `<div class="run-summary-note">${note}</div>` : ''}
        `;
        container.style.display = 'block';
    },

    setAbortButtonEnabled(enabled) {
        const btn = document.getElementById('runner-abort-btn');
        if (!btn) return;
        btn.disabled = !enabled;
        btn.style.display = enabled ? 'inline-flex' : 'none';
    },


    requestRunnerAbort() {
        if (!this.state.runnerAbortController || this.state.runnerCancelRequested) return;
        this.state.runnerCancelRequested = true;
        try {
            this.state.runnerAbortController.abort();
        } catch (error) {
            console.warn('Abort failed:', error);
        }
        this.setRunnerStatus('error', 'Abbruch angefordert');
        const output = document.getElementById('runner-output');
        if (output) output.textContent = 'Abbruch angefordert...';
        this.setAbortButtonEnabled(false);
        if (!this.state.runnerInFlight) {
            this.handleRunnerAbort('Run abgebrochen.');
        }
    },

    async killAllRunnerJobs() {
        const ok = confirm('Wirklich ALLE laufenden Backend-Jobs abbrechen?');
        if (!ok) return;

        // Also cancel the local request (if any) so the UI unblocks immediately.
        try {
            this.requestRunnerAbort();
        } catch {
            // ignore
        }

        try {
            await API.cancelAllRunnerJobs();
            this.showToast?.('success', 'Backend-Jobs abgebrochen.', { timeoutMs: 3500 });
        } catch (error) {
            this.showError('Konnte Backend-Jobs nicht abbrechen: ' + error.message);
        }
    },


    isRunnerAbortRequested() {
        return this.state.runnerCancelRequested || this.state.runnerAbortController?.signal?.aborted;
    },


    isAbortError(error) {
        return error?.name === 'AbortError';
    },


    getRunnerSignal() {
        return this.state.runnerAbortController?.signal;
    },

    setRunnerStep(text) {
        const el = document.getElementById('runner-step');
        if (el) el.textContent = text || '-';
    },

    formatElapsed(ms) {
        const total = Math.max(0, Math.floor(ms / 1000));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const mm = String(m).padStart(2, '0');
        const ss = String(s).padStart(2, '0');
        if (h > 0) return `${h}:${mm}:${ss}`;
        return `${m}:${ss.padStart(2, '0')}`;
    },

    startRunnerElapsedTimer() {
        this.stopRunnerElapsedTimer();
        this._runnerElapsedStartedAt = Date.now();
        const tick = () => {
            const el = document.getElementById('runner-elapsed');
            if (!el) return;
            el.textContent = this.formatElapsed(Date.now() - this._runnerElapsedStartedAt);
        };
        tick();
        this._runnerElapsedInterval = window.setInterval(tick, 250);
    },

    stopRunnerElapsedTimer() {
        if (this._runnerElapsedInterval) {
            window.clearInterval(this._runnerElapsedInterval);
            this._runnerElapsedInterval = null;
        }
        this._runnerElapsedStartedAt = null;
    },

    clearPostWarmupAction() {
        this.state.postWarmupAction = null;
        this.updateRunnerNextActionButton();
    },

    inferPostWarmupAction() {
        const mode = document.querySelector('.mode-tab.active')?.dataset?.mode;
        if (mode === 'limit') return 'startLimitTest';
        if (mode === 'batch') return 'runBatchAll';
        if (mode === 'single') return 'runSelectedTests';
        return null;
    },

    updateRunnerNextActionButton() {
        const btn = document.getElementById('runner-next-action-btn');
        if (!btn) return;

        const action = this.state.postWarmupAction;
        const isLocal = this.state.selectedModel?.provider === 'ollama';
        const warmupReady = isLocal
            && !!this.state.warmupModelId
            && this.state.warmupModelId === this.state.selectedModel?.model;
        const backendReady = this.state.backendConnected !== false;

        // Never show while something is actively running.
        if (this.state.runnerInFlight || this.state.benchmarkRunning || this.state.isLimitTestMode) {
            btn.style.display = 'none';
            btn.disabled = true;
            return;
        }

        if (!warmupReady || !action) {
            btn.style.display = 'none';
            btn.disabled = true;
            return;
        }

        let enabled = backendReady && !this.state.benchmarkRunning;
        if (action === 'runSelectedTests') {
            enabled = enabled && document.querySelectorAll('.test-item-checkbox:checked').length > 0;
        } else if (action === 'startLimitTest') {
            enabled = enabled && this.state.tests.some(t => t.category === 'limit-testing');
        } else if (action === 'runBatchAll') {
            enabled = enabled && this.state.tests.length > 0;
        }

        btn.style.display = 'inline-flex';
        btn.disabled = !enabled;
        btn.textContent = action === 'startLimitTest' ? 'Jetzt Limit Test starten' : 'Jetzt Tests starten';
    },

    async runPostWarmupAction() {
        const action = this.state.postWarmupAction;
        if (!action || typeof this[action] !== 'function') {
            this.showError('Keine Aktion nach Warm-up gefunden. Bitte im Tests-Tab starten.');
            return;
        }

        // One-shot CTA: once you start, hide it to avoid "Limit Test starten" while already running.
        this.clearPostWarmupAction();
        try {
            await this[action]();
        } finally {
            this.updateRunnerNextActionButton();
        }
    },


    handleRunnerAbort(message = 'Run abgebrochen.') {
        this.setRunnerStatus('error', 'Abgebrochen');
        const output = document.getElementById('runner-output');
        if (output) output.textContent = message;
        this.stopRunnerElapsedTimer();
        this.setAbortButtonEnabled(false);
        this.state._batchAllActive = false;
        const progress = document.getElementById('runner-progress');
        if (progress) progress.style.display = 'none';
        const manualEval = document.getElementById('manual-eval');
        if (manualEval) manualEval.style.display = 'none';
        this.state.manualRetry = null;
        this.state.manualRetryHistory = null;
        this.updateRetryHistoryPanel();

        // Nach kurzer Verzögerung zurück in Idle
        setTimeout(() => {
            if (!this.state.benchmarkRunning && !this.state.runnerInFlight) {
                this.setRunnerIdle();
            }
        }, 2000);
    },


    getTemperature() {
        const runMode = document.getElementById('run-mode')?.value;
        const idByMode = {
            single: 'single-temperature',
            batch: 'batch-temperature',
            retry: 'limit-temperature'
        };
        const inputId = idByMode[runMode] || 'temperature';
        const temperature = parseFloat(document.getElementById(inputId)?.value ?? document.getElementById('temperature')?.value);
        if (Number.isNaN(temperature)) {
            return CONFIG.defaultParams?.temperature ?? 0;
        }
        return temperature;
    },


    getWarmupTest() {
        const preferredId = CONFIG.benchmark?.warmupTestId;
        if (preferredId) {
            const match = this.state.tests.find(test => test.id === preferredId);
            if (match) return match;
        }
        return this.state.tests[0] || null;
    },


    ensureWarmupReady() {
        if (this.state.selectedModel?.provider !== 'ollama') return true;
        if (this.state.warmupModelId === this.state.selectedModel.model) return true;
        this.showError('Bitte zuerst Warm-up für das lokale Modell ausführen.');
        return false;
    },


    setProgress(current, total) {
        const progressEl = document.getElementById('runner-progress');
        if (!progressEl) return;
        progressEl.style.display = 'block';
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        document.getElementById('progress-fill').style.width = `${percent}%`;
        document.getElementById('progress-text').textContent = `${percent}%`;
    },


    async runWarmup({ postAction } = {}) {
        this.state.postWarmupAction = postAction || this.inferPostWarmupAction() || this.state.postWarmupAction;
        this.updateRunnerNextActionButton();

        if (!(await this.checkBackendConnection({ timeoutMs: 1500 }))) {
            this.showError('Backend nicht erreichbar. Starte den Server mit: npm start');
            return;
        }

        const selected = this.state.selectedModel;
        if (!selected || selected.provider !== 'ollama') {
            this.showError('Bitte zuerst ein lokales Modell wählen.');
            return;
        }

        const localModels = this.state.models?.ollama?.models || [];
        const localModel = localModels.find(model => model.id === selected.model);
        const warmupTest = this.getWarmupTest();

        if (!warmupTest || !localModel) {
            this.showError('Warm-up nicht möglich: Keine lokalen Modelle oder Tests gefunden.');
            return;
        }

        this.state.benchmarkRunning = true;
        this.updateActionButtons();
        this.switchView('runner');
        this.setRunnerStatus('running', 'Warm-up läuft...');
        this.beginRunnerOperation();

        const options = { temperature: this.getTemperature() };
        const total = 1;

        document.getElementById('runner-mode').textContent = 'warmup';
        document.getElementById('runner-test-name').textContent = warmupTest.name;
        this.setRunnerStep('Warm-up 1/1');
        // Warmup ist technisch auch ein Test - setze ihn damit der Prompt sofort angezeigt werden kann.
        this.state.selectedTest = warmupTest;
        document.getElementById('runner-prompt').textContent = this.getOriginalPromptText();
        document.getElementById('runner-output').textContent = 'Warm-up gestartet...';
        document.getElementById('runner-metrics').style.display = 'none';
        document.getElementById('check-result').style.display = 'none';
        document.getElementById('manual-eval').style.display = 'none';

        const errors = [];

        document.getElementById('runner-model-name').textContent = `ollama/${localModel.id}`;
        document.getElementById('runner-output').textContent = `Warm-up: ${localModel.name} (1/${total})`;
        this.setProgress(0, total);

        let aborted = false;
        try {
            this.state.runnerInFlight = true;
            await API.runSingle(warmupTest.id, 'ollama', localModel.id, options, { isWarmup: true }, {
                signal: this.getRunnerSignal()
            });
        } catch (error) {
            if (this.isAbortError(error)) {
                aborted = true;
            } else {
                errors.push(`${localModel.name}: ${error.message}`);
            }
        } finally {
            this.state.runnerInFlight = false;
        }

        this.setProgress(1, total);

        if (aborted || this.isRunnerAbortRequested()) {
            this.handleRunnerAbort('Warm-up abgebrochen.');
            this.state.warmupModelId = null;
        } else if (errors.length > 0) {
            this.setRunnerStatus('failed', 'Warm-up mit Fehlern');
            document.getElementById('runner-output').textContent = `Warm-up beendet mit Fehlern:\n${errors.join('\n')}`;
            this.state.warmupModelId = null;
        } else {
            this.setRunnerStatus('success', 'Warm-up abgeschlossen');
            document.getElementById('runner-output').textContent = 'Warm-up abgeschlossen.';
            this.state.warmupModelId = localModel.id;
        }

        this.state.benchmarkRunning = false;
        this.updateActionButtons();
        this.updateRunnerNextActionButton();
        this.finishRunnerOperation();
    },


    async runBatchAll() {
        this.clearPostWarmupAction();
        if (!(await this.checkBackendConnection({ timeoutMs: 1500 }))) {
            this.showError('Backend nicht erreichbar. Starte den Server mit: npm start');
            return;
        }

        if (!this.state.selectedModel) {
            this.showError('Bitte zuerst ein Modell wählen.');
            return;
        }
        if (!this.ensureWarmupReady()) {
            return;
        }

        const iterations = parseInt(document.getElementById('batch-iterations')?.value, 10)
            || CONFIG.benchmark?.batchIterations
            || 5;
        const selectionMode = document.querySelector('input[name="batch-selection"]:checked')?.value || 'all';

        let tests = [];
        if (selectionMode === 'selected') {
            const selectedTestIds = Array.from(document.querySelectorAll('.test-item-checkbox:checked'))
                .map(cb => cb.dataset.testId);
            tests = this.state.tests.filter(test =>
                selectedTestIds.includes(test.id) && test.category !== 'limit-testing'
            );
        } else {
            const selectedCategories = Array.from(document.querySelectorAll('.batch-category'))
                .filter(input => input.checked)
                .map(input => input.value);
            tests = this.state.tests.filter(test =>
                selectedCategories.includes(test.category) && test.category !== 'limit-testing'
            );
        }

        // Batch-All soll NUR Auto-Tests ausfuehren (keine manuellen Evaluations).
        const beforeAutoFilter = tests.length;
        tests = tests.filter(test => test.evaluationType === 'auto');
        const skippedManual = beforeAutoFilter - tests.length;
        if (skippedManual > 0) {
            this.showToast?.('info', `${skippedManual} manuelle Tests wurden im Batch uebersprungen.`, { timeoutMs: 5000 });
        }

        if (tests.length === 0) {
            this.showError('Keine passenden Tests für Batch gefunden.');
            return;
        }

        const { provider, model } = this.state.selectedModel;

        this.state.benchmarkRunning = true;
        this.updateActionButtons();
        this.switchView('runner');
        this.setRunnerStatus('running', 'Batch-All läuft...');
        this.beginRunnerOperation();

        const options = { temperature: this.getTemperature() };
        const total = tests.length;
        const errors = [];
        let aborted = false;

        this.state._batchAllActive = true;

        // Batch-All: Output als fortlaufendes Log verwenden.
        document.getElementById('runner-output').textContent =
            `Batch-All gestartet: ${total} Tests a ${iterations} Iterationen`;
        document.getElementById('check-result').style.display = 'none';

        document.getElementById('runner-mode').textContent = `batch-all (${iterations}x)`;
        document.getElementById('runner-model-name').textContent = `${provider}/${model}`;

        for (let i = 0; i < tests.length; i++) {
            if (this.isRunnerAbortRequested()) {
                aborted = true;
                break;
            }
            const test = tests[i];

            this.state.selectedTest = test;

            // Reset für jeden Test
            this.resetRunnerUIBetweenTests();

            document.getElementById('runner-test-name').textContent = test.name;
            document.getElementById('runner-prompt').textContent = this.getOriginalPromptText();
            this.setRunnerStep(`Test ${i + 1}/${total} (${iterations}x)`);
            this.setProgress(i, total);
            // Restore/extend log after reset
            this.appendRunnerLog('');
            this.appendRunnerLog('---');
            this.appendRunnerLog(`Test ${i + 1}/${total}: ${test.name} (${iterations}x, laeuft...)`);
            this.appendRunnerLog(`Aufgabe: ${test.description || '-'}`);

            try {
                this.state.runnerInFlight = true;
                const result = await API.runBatch(test.id, provider, model, iterations, options, {
                    signal: this.getRunnerSignal()
                });
                this.displayBatchResult(result, { suppressOutput: true });
                const agg = result.aggregation || {};
                const passed = agg.passed ?? '-';
                const tot = agg.total ?? result.iterations ?? '-';
                const rate = agg.successRate ?? '-';
                this.appendRunnerLog(`Ergebnis: Bestanden ${passed}/${tot} (${rate}%)`);
                const last = result.runs?.[result.runs.length - 1];
                if (last?.output) {
                    const snippet = String(last.output).trim().slice(0, 240);
                    this.appendRunnerLog(`Letzter Output (Snippet): ${snippet}${last.output.length > 240 ? '...' : ''}`);
                }
            } catch (error) {
                if (this.isAbortError(error)) {
                    aborted = true;
                    break;
                }
                errors.push(`${test.name}: ${error.message}`);
                this.appendRunnerLog(`Fehler: ${error.message}`);
            } finally {
                this.state.runnerInFlight = false;
            }

            this.setProgress(i + 1, total);
        }

        if (aborted || this.isRunnerAbortRequested()) {
            this.handleRunnerAbort('Batch-All abgebrochen.');
        } else if (errors.length > 0) {
            this.setRunnerStatus('failed', 'Batch-All mit Fehlern');
            this.appendRunnerLog('');
            this.appendRunnerLog('Batch-All beendet mit Fehlern:');
            errors.forEach(e => this.appendRunnerLog(`- ${e}`));
        } else {
            this.setRunnerStatus('success', 'Batch-All abgeschlossen');
            this.appendRunnerLog('');
            this.appendRunnerLog('Batch-All abgeschlossen.');
        }

        this.state.benchmarkRunning = false;
        this.updateActionButtons();
        this.state._batchAllActive = false;
        this.finishRunnerOperation();
    },

    async runSelectedTests() {
        this.clearPostWarmupAction();
        if (!(await this.checkBackendConnection({ timeoutMs: 1500 }))) {
            this.showError('Backend nicht erreichbar. Starte den Server mit: npm start');
            return;
        }

        if (!this.state.selectedModel) {
            this.showError('Bitte zuerst ein Modell wählen.');
            return;
        }
        if (!this.ensureWarmupReady()) {
            return;
        }

        const checkboxes = document.querySelectorAll('.test-item-checkbox:checked');
        if (checkboxes.length === 0) {
            this.showError('Bitte mindestens einen Test auswählen.');
            return;
        }

        const selectedTestIds = Array.from(checkboxes).map(cb => cb.dataset.testId);
        const tests = this.state.tests.filter(test => selectedTestIds.includes(test.id));
        const { provider, model } = this.state.selectedModel;

        this.state.benchmarkRunning = true;
        this.updateActionButtons();
        this.switchView('runner');
        this.setRunnerStatus('running', 'Einzelne Tests laufen...');
        this.beginRunnerOperation();

        const options = { temperature: this.getTemperature() };
        const total = tests.length;
        const errors = [];
        const summary = { total, passed: 0, failed: 0, pending: 0 };
        let aborted = false;

        document.getElementById('runner-mode').textContent = `single-run (${tests.length} tests)`;
        document.getElementById('runner-model-name').textContent = `${provider}/${model}`;

        for (let i = 0; i < tests.length; i++) {
            if (this.isRunnerAbortRequested()) {
                aborted = true;
                break;
            }
            const test = tests[i];

            // Setze aktuellen Test
            this.state.selectedTest = test;

            // Reset für jeden Test
            this.resetRunnerUIBetweenTests();

            document.getElementById('runner-test-name').textContent = test.name;
            document.getElementById('runner-prompt').textContent = this.getOriginalPromptText();
            this.setRunnerStep(`Test ${i + 1}/${total}`);
            this.setProgress(i, total);

            try {
                this.state.runnerInFlight = true;

                // Erkennung des Test-Typs und entsprechende Ausführung
                if (test.category === 'limit-testing') {
                    // Limit Testing: Manual Retry System
                    this.state.isLimitTestMode = true;
                    const maxAttempts = parseInt(document.getElementById('limit-max-attempts')?.value, 10) || 5;
                    await this.startManualRetryFlow(maxAttempts);
                    this.state.isLimitTestMode = false;
                } else if (test.evaluationType === 'manual') {
                    // Manual Test: Single Run mit manueller Evaluation
                    const run = await API.runSingle(test.id, provider, model, options, null, {
                        signal: this.getRunnerSignal()
                    });
                    this.displaySingleResult(run);
                    if (run?.passed === true) summary.passed += 1;
                    else if (run?.passed === false) summary.failed += 1;
                    else summary.pending += 1;
                } else {
                    // Auto Test: Single Run
                    const run = await API.runSingle(test.id, provider, model, options, null, {
                        signal: this.getRunnerSignal()
                    });
                    this.displaySingleResult(run);
                    if (run?.passed === true) summary.passed += 1;
                    else if (run?.passed === false) summary.failed += 1;
                    else summary.pending += 1;
                }
            } catch (error) {
                if (this.isAbortError(error)) {
                    aborted = true;
                    break;
                }
                errors.push(`${test.name}: ${error.message}`);
                document.getElementById('runner-output').textContent = `Fehler bei ${test.name}: ${error.message}`;
                summary.failed += 1;
            } finally {
                this.state.runnerInFlight = false;
            }

            this.setProgress(i + 1, total);

            // Kurze Pause zwischen Tests
            if (i < tests.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        if (aborted || this.isRunnerAbortRequested()) {
            this.handleRunnerAbort('Test-Durchlauf abgebrochen.');
        } else if (errors.length > 0) {
            this.setRunnerStatus('failed', 'Test-Durchlauf mit Fehlern');
            document.getElementById('runner-output').textContent = `Test-Durchlauf beendet mit Fehlern:\n${errors.join('\n')}`;
        } else {
            this.setRunnerStatus('success', 'Test-Durchlauf abgeschlossen');
            document.getElementById('runner-output').textContent = 'Alle Tests abgeschlossen.';
        }

        if (!aborted && !this.isRunnerAbortRequested()) {
            const done = summary.passed + summary.failed + summary.pending;
            this.showRunSummary({
                title: 'Single Try Ergebnis',
                stats: [
                    { label: 'Tests', value: `${done}/${summary.total}` },
                    { label: 'Bestanden', value: `${summary.passed}`, tone: 'success' },
                    { label: 'Fehlgeschlagen', value: `${summary.failed}`, tone: 'failed' },
                    { label: 'Offen', value: `${summary.pending}` }
                ],
                note: summary.pending > 0
                    ? 'Einige Ergebnisse sind noch offen (manuelle Bewertung).'
                    : ''
            });
        }

        this.state.benchmarkRunning = false;
        this.updateActionButtons();
        this.finishRunnerOperation();

        // Checkboxen NICHT mehr zurücksetzen - Auswahl soll bleiben
        // document.querySelectorAll('.test-item-checkbox:checked').forEach(cb => cb.checked = false);
        // this.updateSelectedTestsCount();
    },


    async startTest() {
        this.clearPostWarmupAction();
        if (!(await this.checkBackendConnection({ timeoutMs: 1500 }))) {
            this.showError('Backend nicht erreichbar. Starte den Server mit: npm start');
            return;
        }

        if (!this.state.selectedTest || !this.state.selectedModel) return;

        this.state.manualRetry = null;
        this.state.manualRetryHistory = null;
        this.updateRetryHistoryPanel();

        const mode = document.getElementById('run-mode').value;
        const options = { temperature: this.getTemperature() };

        // Wechsle zur Runner View
        this.switchView('runner');
        this.setRunnerStatus('running', 'Läuft...');
        this.beginRunnerOperation();

        // Update Runner Info
        document.getElementById('runner-test-name').textContent = this.state.selectedTest.name;
        document.getElementById('runner-model-name').textContent =
            `${this.state.selectedModel.provider}/${this.state.selectedModel.model}`;
        document.getElementById('runner-mode').textContent = mode;
        document.getElementById('runner-prompt').textContent = this.getOriginalPromptText();
        if (mode === 'batch') {
            const iterations = parseInt(document.getElementById('iterations')?.value, 10) || 1;
            this.setRunnerStep(`Iterationen: ${iterations}`);
        } else if (mode === 'retry') {
            const maxAttempts = parseInt(document.getElementById('max-attempts')?.value, 10) || 1;
            this.setRunnerStep(`Versuch 1/${maxAttempts}`);
        } else {
            this.setRunnerStep('1/1');
        }

        // Reset
        document.getElementById('runner-output').textContent = 'Warte auf Antwort...';
        document.getElementById('runner-metrics').style.display = 'none';
        document.getElementById('check-result').style.display = 'none';
        document.getElementById('manual-eval').style.display = 'none';
        document.getElementById('runner-progress').style.display = 'none';
        const previewBtn = document.getElementById('preview-html-btn');
        if (previewBtn) {
            previewBtn.style.display = 'none';
        }
        const outputEl = document.getElementById('runner-output');
        if (outputEl) {
            outputEl.classList.remove('expanded');
            outputEl.classList.remove('collapsed');
        }
        const toggleBtn = document.getElementById('toggle-output-btn');
        if (toggleBtn) {
            toggleBtn.textContent = 'Vollansicht';
        }

        let keepAbortActive = false;
        try {
            let result;
            const { provider, model } = this.state.selectedModel;
            const testId = this.state.selectedTest.id;

            if (mode === 'single') {
                this.state.runnerInFlight = true;
                result = await API.runSingle(testId, provider, model, options, null, {
                    signal: this.getRunnerSignal()
                });
                this.state.runnerInFlight = false;
                this.displaySingleResult(result);
            } else if (mode === 'batch') {
                const iterations = parseInt(document.getElementById('iterations').value);
                document.getElementById('runner-progress').style.display = 'block';
                this.state.runnerInFlight = true;
                result = await API.runBatch(testId, provider, model, iterations, options, {
                    signal: this.getRunnerSignal()
                });
                this.state.runnerInFlight = false;
                this.displayBatchResult(result);
            } else if (mode === 'retry') {
                const maxAttempts = parseInt(document.getElementById('max-attempts').value);
                if (this.state.selectedTest.evaluationType === 'manual') {
                    keepAbortActive = true;
                    await this.startManualRetryFlow(maxAttempts);
                    return;
                }
                this.state.runnerInFlight = true;
                result = await API.runWithRetry(testId, provider, model, maxAttempts, options, {
                    signal: this.getRunnerSignal()
                });
                this.state.runnerInFlight = false;
                this.displayRetryResult(result);
            }

            if (result) {
                this.setRunnerStatus(result.passed === true ? 'success' : result.passed === false ? 'failed' : 'pending',
                    result.passed === true ? 'Bestanden' : result.passed === false ? 'Fehlgeschlagen' : 'Ausstehend');
            }

        } catch (error) {
            if (this.isAbortError(error) || this.isRunnerAbortRequested()) {
                this.handleRunnerAbort('Run abgebrochen.');
            } else {
                this.setRunnerStatus('error', 'Fehler');
                document.getElementById('runner-output').textContent = `Fehler: ${error.message}`;
            }
        } finally {
            this.state.runnerInFlight = false;
            if (!keepAbortActive) {
                this.finishRunnerOperation();
            }
        }
    },


    displaySingleResult(run) {
        this.state.currentRun = run;

        // Prompt
        if (run.promptInfo) {
            const retryContext = run.promptInfo.retryContext || '';
            const promptBody = run.promptInfo.promptTemplate.replace('{{INPUT}}', run.promptInfo.input);
            document.getElementById('runner-prompt').textContent = retryContext
                ? `${retryContext}\n${promptBody}`
                : promptBody;
        }

        // Output
        const outputText = run.output || run.error || '-';
        const outputEl = document.getElementById('runner-output');
        outputEl.textContent = outputText;
        const html = this.extractHtmlFromOutput(outputText);
        const hasHtml = !!html;
        const isLimitTest = this.state.selectedTest?.category === 'limit-testing';
        console.log('[Runner] output length:', outputText.length);
        console.log('[Runner] html detected:', hasHtml, 'html length:', html.length);
        console.log('[Runner] output tail:', outputText.slice(-400));
        if (outputText.includes('```')) {
            console.log('[Runner] output contains code fences');
        }
        const previewBtn = document.getElementById('preview-html-btn');
        if (previewBtn) {
            previewBtn.style.display = (hasHtml && isLimitTest) ? 'inline-flex' : 'none';
        }
        const debugBtn = document.getElementById('debug-analyze-btn');
        if (debugBtn) {
            debugBtn.style.display = (hasHtml && isLimitTest) ? 'inline-flex' : 'none';
        }
        // Reset Debug-Analyse Anzeige
        const debugResult = document.getElementById('debug-analysis-result');
        if (debugResult) {
            debugResult.style.display = 'none';
        }
        const toggleBtn = document.getElementById('toggle-output-btn');
        if (toggleBtn) {
            if (hasHtml) {
                outputEl.classList.add('collapsed');
                outputEl.classList.remove('expanded');
                toggleBtn.textContent = 'Code anzeigen';
                // Automatisches Popup nur bei limit-testing Tests
                const selectedTestId = typeof this.state.selectedTest === 'string'
                    ? this.state.selectedTest
                    : this.state.selectedTest?.id;
                const currentTest = selectedTestId ? this.state.tests.find(t => t.id === selectedTestId) : null;
                if (currentTest?.category === 'limit-testing') {
                    // Popups are often blocked outside a direct user gesture. Prefer the explicit Preview button.
                    this.showToast?.('info', 'HTML erkannt: klicke auf "HTML Preview".', { timeoutMs: 6000 });
                }
            } else {
                outputEl.classList.remove('collapsed');
                outputEl.classList.remove('expanded');
                toggleBtn.textContent = 'Vollansicht';
            }
        }

        // Metrics
        if (run.metrics) {
            document.getElementById('runner-metrics').style.display = 'block';
            // Unterstütze beide Metrik-Namen (t_model_ms neu, latency_ms alt)
            const latency = run.metrics.t_model_ms || run.metrics.latency_ms;
            document.getElementById('metric-latency').textContent = latency ? `${latency}ms` : '-';
            document.getElementById('metric-ttft').textContent =
                run.metrics.time_to_first_token ? `${run.metrics.time_to_first_token}ms` : '-';
            document.getElementById('metric-tokens-in').textContent = run.metrics.tokens_in || '-';
            document.getElementById('metric-tokens-out').textContent = run.metrics.tokens_out || '-';
        }

        // Check Result
        if (run.checkResult) {
            document.getElementById('check-result').style.display = 'block';
            const checkContent = document.getElementById('check-result-content');
            checkContent.innerHTML = `
                <div class="check-status ${run.passed ? 'passed' : 'failed'}">
                    ${run.passed ? '✅ Bestanden' : '❌ Nicht bestanden'}
                </div>
                <pre>${JSON.stringify(run.checkResult.details, null, 2)}</pre>
            `;
        }

        // Manual Evaluation
        if (run.passed === null && this.state.selectedTest.evaluationType === 'manual') {
            this.showManualEvaluation(run);
        }
    },


    displayBatchResult(result, { suppressOutput = false } = {}) {
        const lastRun = result.runs?.[result.runs.length - 1];
        if (lastRun) {
            // For Batch-All, the output area is used as a running log; avoid overwriting it.
            if (!suppressOutput) {
                this.displaySingleResult(lastRun);
            } else {
                this.state.currentRun = lastRun;
                if (lastRun.metrics) {
                    document.getElementById('runner-metrics').style.display = 'block';
                    const latency = lastRun.metrics.t_model_ms || lastRun.metrics.latency_ms;
                    document.getElementById('metric-latency').textContent = latency ? `${latency}ms` : '-';
                    document.getElementById('metric-ttft').textContent =
                        lastRun.metrics.time_to_first_token ? `${lastRun.metrics.time_to_first_token}ms` : '-';
                    document.getElementById('metric-tokens-in').textContent = lastRun.metrics.tokens_in || '-';
                    document.getElementById('metric-tokens-out').textContent = lastRun.metrics.tokens_out || '-';
                }
            }
        }

        // Zeige Aggregation
        const agg = result.aggregation;
        // Unterstütze beide Strukturen (modelTime neu, latency alt)
        const latencyStats = agg.modelTime || agg.latency || {};
        document.getElementById('check-result').style.display = 'block';
        document.getElementById('check-result-content').innerHTML = `
            <h4>Batch Ergebnis (${result.iterations} Durchläufe)</h4>
            <div class="batch-stats">
                <p>Erfolgsrate: <strong>${agg.successRate}%</strong> (${agg.passed}/${agg.total})</p>
                <p>First-Try Success: ${agg.firstTrySuccess ? 'Ja' : 'Nein'}</p>
                <p>Latenz: Median ${latencyStats.median || '-'}ms, Mean ${latencyStats.mean || '-'}ms${latencyStats.stdDev ? `, StdDev ${latencyStats.stdDev}ms` : ''}</p>
                ${agg.timeToFirstToken?.mean ? `<p>TTFT: Mean ${agg.timeToFirstToken.mean}ms</p>` : ''}
                ${agg.tokens?.avgIn ? `<p>Tokens: ~${agg.tokens.avgIn} in, ~${agg.tokens.avgOut} out</p>` : ''}
            </div>
        `;

        if (!this.state.benchmarkRunning) {
            document.getElementById('runner-progress').style.display = 'none';
        }
    },


    displayRetryResult(result) {
        const finalRun = result.finalRun;
        if (finalRun) {
            this.displaySingleResult(finalRun);
        }

        // Zeige Retry Info
        document.getElementById('check-result').style.display = 'block';
        const existing = document.getElementById('check-result-content').innerHTML;
        document.getElementById('check-result-content').innerHTML = `
            <h4>Retry Ergebnis</h4>
            <p>Versuche: ${result.actualAttempts}/${result.maxAttempts}</p>
            <p>Erster Versuch erfolgreich: ${result.firstTrySuccess ? 'Ja' : 'Nein'}</p>
            <p>Erfolgreich innerhalb N: ${result.successWithinN ? 'Ja' : 'Nein'}</p>
            <hr>
            ${existing}
        `;
    },


    showManualEvaluation(run) {
        document.getElementById('manual-eval').style.display = 'block';

        // Reset Feedback-Sektion
        this.hideFeedbackSection();

        // Zeige Versuchs-Badge
        const attemptBadge = document.getElementById('eval-attempt-badge');
        if (attemptBadge && this.state.manualRetry) {
            attemptBadge.textContent = `Versuch ${this.state.manualRetry.attempt} / ${this.state.manualRetry.maxAttempts}`;
            attemptBadge.style.display = 'inline-block';
        } else if (attemptBadge) {
            attemptBadge.style.display = 'none';
        }

        // Zeige Kriterien falls vorhanden
        const criteriaEl = document.getElementById('manual-criteria');
        const test = this.state.selectedTest;

        if (test.manualCriteria && test.manualCriteria.length > 0) {
            criteriaEl.innerHTML = `
                <p><strong>Prüfe folgende Punkte:</strong></p>
                <ul>
                    ${test.manualCriteria.map(c => `<li>${this.escapeHtml(c)}</li>`).join('')}
                </ul>
            `;
        } else {
            criteriaEl.innerHTML = '';
        }
    },


    async submitEvaluation(passed) {
        if (!this.state.currentRun) return;

        const comment = document.getElementById('eval-comment')?.value || '';

        try {
            await API.evaluateRun(this.state.currentRun.id, passed, comment);

            // Verstecke Feedback-Sektion
            this.hideFeedbackSection();

            if (this.state.manualRetry) {
                await this.handleManualRetryAfterEval(passed, comment);
                return;
            }
            this.setRunnerStatus(passed ? 'success' : 'failed', passed ? 'Bestanden' : 'Fehlgeschlagen');
            document.getElementById('manual-eval').style.display = 'none';
            this.showSuccess('Bewertung gespeichert');
        } catch (error) {
            this.showError('Fehler beim Speichern: ' + error.message);
        }
    },


    setRunnerStatus(status, text) {
        const badge = document.querySelector('#runner-status .status-badge');
        badge.className = `status-badge ${status}`;
        badge.textContent = text;
    },


    getOriginalPromptText() {
        const test = this.state.selectedTest;
        if (!test) return '';
        let prompt = test.promptTemplate.replace(/\{\{INPUT\}\}/g, test.input);
        if (test.outputFormat === 'code-only') {
            prompt += '\n\nWICHTIG: Antworte NUR mit dem Code, ohne Erklaerungen, Markdown-Codebloecke oder zusaetzlichen Text.';
        } else if (test.outputFormat === 'json') {
            prompt += '\n\nWICHTIG: Antworte NUR mit validem JSON, ohne zusaetzliche Erklaerungen.';
        }
        return prompt;
    },


    updateRetryHistoryPanel(selectedAttempt = null) {
        const panel = document.getElementById('retry-history-panel');
        if (!panel) return;
        const history = this.state.manualRetryHistory || [];
        if (!history.length) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'block';
        const select = document.getElementById('retry-attempt-select');
        select.innerHTML = history
            .map(entry => `<option value="${entry.attempt}">Versuch ${entry.attempt}</option>`)
            .join('');

        const attemptValue = selectedAttempt || history[history.length - 1].attempt;
        select.value = String(attemptValue);
        const currentIndex = history.findIndex(entry => entry.attempt === attemptValue);
        const entry = history[currentIndex >= 0 ? currentIndex : history.length - 1];

        const lastPrompt = entry?.lastPrompt || this.getOriginalPromptText();
        document.getElementById('retry-last-prompt').textContent = lastPrompt || '-';
        document.getElementById('retry-attempt-output').textContent = entry?.output || '-';
        document.getElementById('retry-attempt-comment').textContent = entry?.comment || '-';

        const subset = history.slice(0, currentIndex >= 0 ? currentIndex + 1 : history.length);
        const nextPrompt = this.buildManualRetryContext(subset) + this.getOriginalPromptText();
        document.getElementById('retry-next-prompt').textContent = nextPrompt;
        const statusEl = document.getElementById('retry-attempt-status');
        if (statusEl) {
            if (entry?.passed === true) {
                statusEl.className = 'status-badge success';
                statusEl.textContent = 'Bestanden';
            } else if (entry?.passed === false) {
                statusEl.className = 'status-badge failed';
                statusEl.textContent = 'Nicht bestanden';
            } else {
                statusEl.className = 'status-badge pending';
                statusEl.textContent = 'Ausstehend';
            }
        }
    },


    buildManualRetryContext(history) {
        let text = '\n\n--- BENCHMARK CONTEXT ---\n';
        text += 'You are in a benchmark test. Keep the output format exactly as instructed.\n';
        text += 'Use the previous attempts and evaluator feedback to fix the solution.\n';
        text += 'Return ONLY the new solution, no extra commentary.\n';
        text += '--- END CONTEXT ---\n';

        if (history.length > 0) {
            text += '\n--- PREVIOUS ATTEMPTS ---\n';
            history.forEach((entry) => {
                text += `Attempt ${entry.attempt}:\n`;
                text += entry.output ? `Output:\n${entry.output}\n` : 'Output: <empty>\n';
                if (entry.comment) {
                    text += `Evaluator feedback:\n${entry.comment}\n`;
                }
                text += '\n';
            });
            text += '--- END PREVIOUS ATTEMPTS ---\n\n';
        }

        text += 'Please fix the solution and try again.\n\n';
        return text;
    },


    async startManualRetryFlow(maxAttempts) {
        const retryId = (crypto?.randomUUID?.() || `retry-${Date.now()}`);
        this.state.manualRetry = {
            retryId,
            maxAttempts,
            history: [],
            attempt: 1
        };
        this.state.manualRetryHistory = this.state.manualRetry.history;
        this.updateRetryHistoryPanel();
        await this.runManualRetryAttempt();
    },


    async runManualRetryAttempt() {
        if (this.isRunnerAbortRequested()) {
            this.handleRunnerAbort('Retry abgebrochen.');
            this.finishRunnerOperation();
            return;
        }
        const { provider, model } = this.state.selectedModel;
        const testId = this.state.selectedTest.id;
        const options = { temperature: this.getTemperature() };
        const retry = this.state.manualRetry;
        const attempt = retry.attempt;

        this.setRunnerStatus('running', `Retry Versuch ${attempt}/${retry.maxAttempts}`);
        document.getElementById('runner-mode').textContent = `retry (${attempt}/${retry.maxAttempts})`;
        this.setRunnerStep(`Versuch ${attempt}/${retry.maxAttempts}`);
        document.getElementById('manual-eval').style.display = 'none';
        document.getElementById('runner-output').textContent = 'Warte auf Antwort...';
        const previewBtn = document.getElementById('preview-html-btn');
        if (previewBtn) previewBtn.style.display = 'none';
        const outputEl = document.getElementById('runner-output');
        if (outputEl) outputEl.classList.remove('expanded');
        const toggleBtn = document.getElementById('toggle-output-btn');
        if (toggleBtn) toggleBtn.textContent = 'Vollansicht';

        // Prompt sofort anzeigen (auch beim ersten Versuch), nicht erst wenn der Run zurueckkommt.
        const promptText = attempt > 1
            ? this.buildManualRetryContext(retry.history) + this.getOriginalPromptText()
            : this.getOriginalPromptText();
        document.getElementById('runner-prompt').textContent = promptText;

        const meta = attempt > 1
            ? {
                retryContext: this.buildManualRetryContext(retry.history),
                retryId: retry.retryId,
                retryAttempt: attempt
            }
            : { retryId: retry.retryId, retryAttempt: attempt };

        let run;
        try {
            this.state.runnerInFlight = true;
            run = await API.runSingle(testId, provider, model, options, meta, {
                signal: this.getRunnerSignal()
            });
        } catch (error) {
            if (this.isAbortError(error) || this.isRunnerAbortRequested()) {
                this.handleRunnerAbort('Retry abgebrochen.');
            } else {
                this.setRunnerStatus('error', 'Fehler');
                document.getElementById('runner-output').textContent = `Fehler: ${error.message}`;
            }
            this.finishRunnerOperation();
            return;
        } finally {
            this.state.runnerInFlight = false;
        }
        this.state.currentRun = run;
        const lastPrompt = promptText;
        retry.history.push({
            attempt,
            output: run.output || '',
            comment: '',
            passed: null,
            lastPrompt
        });
        this.state.manualRetryHistory = retry.history;
        this.displaySingleResult(run);
        this.updateRetryHistoryPanel(attempt);

        // Status auf "Warte auf Bewertung" setzen (nicht mehr blinkend)
        this.setRunnerStatus('pending', `Versuch ${attempt}/${retry.maxAttempts} - Bewerte jetzt`);
    },


    async handleManualRetryAfterEval(passed, comment) {
        const retry = this.state.manualRetry;
        if (!retry) return;

        const last = retry.history[retry.history.length - 1];
        if (last) {
            last.comment = comment || '';
            last.passed = passed;
        }
        this.state.manualRetryHistory = retry.history;
        this.updateRetryHistoryPanel(retry.attempt);

        if (passed) {
            this.setRunnerStatus('success', `✓ Bestanden (Versuch ${retry.attempt}/${retry.maxAttempts})`);
            document.getElementById('manual-eval').style.display = 'none';
            this.state.manualRetry = null;
            this.state.manualRetryHistory = retry.history;
            this.updateRetryHistoryPanel(retry.attempt);
            this.showSuccess('Test abgeschlossen - Bestanden!');
            this.finishRunnerOperation();
            return;
        }

        if (retry.attempt >= retry.maxAttempts) {
            this.setRunnerStatus('failed', `✗ Fehlgeschlagen (${retry.maxAttempts} Versuche)`);
            document.getElementById('manual-eval').style.display = 'none';
            this.state.manualRetry = null;
            this.state.manualRetryHistory = retry.history;
            this.updateRetryHistoryPanel(retry.attempt);
            this.showSuccess('Test abgeschlossen - Nicht bestanden');
            this.finishRunnerOperation();
            return;
        }

        retry.attempt += 1;
        await this.runManualRetryAttempt();
    },


    async startLimitTest() {
        this.clearPostWarmupAction();
        if (!(await this.checkBackendConnection({ timeoutMs: 1500 }))) {
            this.showError('Backend nicht erreichbar. Starte den Server mit: npm start');
            return;
        }

        if (!this.state.selectedModel) {
            this.showError('Bitte zuerst ein Modell auswählen.');
            return;
        }
        if (!this.ensureWarmupReady()) {
            return;
        }

        // Finde den Limit-Testing Test
        const limitTest = this.state.tests.find(t => t.category === 'limit-testing');
        if (!limitTest) {
            this.showError('Kein Limit-Testing Test gefunden.');
            return;
        }

        // Setze den Test als ausgewählt
        this.state.selectedTest = limitTest;
        this.state.isLimitTestMode = true;

        // Wechsle zur Runner View
        this.switchView('runner');

        // Aktiviere vereinfachte Limit-Test Ansicht
        const runnerView = document.getElementById('runner-view');
        if (runnerView) {
            runnerView.classList.add('runner-view-limit');
        }

        // Reset State
        this.state.manualRetry = null;
        this.state.manualRetryHistory = null;
        this.updateRetryHistoryPanel();

        // Starte mit konfigurierten Retries
        const maxAttempts = parseInt(document.getElementById('limit-max-attempts')?.value, 10) || 5;
        this.beginRunnerOperation();

        // Update Runner Info
        document.getElementById('runner-test-name').textContent = limitTest.name;
        document.getElementById('runner-model-name').textContent =
            `${this.state.selectedModel.provider}/${this.state.selectedModel.model}`;
        document.getElementById('runner-mode').textContent = `limit-test (max ${maxAttempts} Versuche)`;
        document.getElementById('runner-prompt').textContent = this.getOriginalPromptText();
        this.setRunnerStep(`Versuch 1/${maxAttempts}`);

        // Reset
        document.getElementById('runner-output').textContent = 'Starte Limit Testing...';
        document.getElementById('runner-metrics').style.display = 'none';
        document.getElementById('check-result').style.display = 'none';
        document.getElementById('manual-eval').style.display = 'none';
        document.getElementById('runner-progress').style.display = 'none';

        const previewBtn = document.getElementById('preview-html-btn');
        if (previewBtn) previewBtn.style.display = 'none';

        const outputEl = document.getElementById('runner-output');
        if (outputEl) {
            outputEl.classList.remove('expanded');
            outputEl.classList.remove('collapsed');
        }

        // Starte Manual Retry Flow
        await this.startManualRetryFlow(maxAttempts);
    },


    showFeedbackSection() {
        const feedbackSection = document.getElementById('eval-feedback-section');
        if (feedbackSection) {
            feedbackSection.style.display = 'block';
            const textarea = document.getElementById('eval-comment');
            if (textarea) {
                textarea.focus();
            }
        }
    },


    hideFeedbackSection() {
        const feedbackSection = document.getElementById('eval-feedback-section');
        if (feedbackSection) {
            feedbackSection.style.display = 'none';
        }
        const textarea = document.getElementById('eval-comment');
        if (textarea) {
            textarea.value = '';
        }
    },


    async runDebugAnalysis() {
        if (!this.state.currentRun?.output) {
            this.showError('Kein Output zum Analysieren vorhanden.');
            return;
        }

        const html = this.extractHtmlFromOutput(this.state.currentRun.output);
        if (!html) {
            this.showError('Kein gueltiges HTML im Output gefunden.');
            return;
        }

        const debugBtn = document.getElementById('debug-analyze-btn');
        const debugResult = document.getElementById('debug-analysis-result');
        const debugContent = document.getElementById('debug-analysis-content');
        const debugModel = document.getElementById('debug-analysis-model');
        const originalBtnText = debugBtn?.textContent;

        // Button deaktivieren während Analyse läuft
        if (debugBtn) {
            debugBtn.disabled = true;
            debugBtn.textContent = 'Analysiere...';
        }

        try {
            const result = await API.debugAnalyze(html);

            // Ergebnis anzeigen
            if (debugResult) {
                debugResult.style.display = 'block';
            }
            if (debugContent) {
                const raw = String(result.issues || '').trim();
                const s = raw.replace(/\r\n/g, '\n');
                const re = /(^|\n)\s*(\d+)\.\s+/g;
                const marks = [];
                let m;
                while ((m = re.exec(s)) !== null) {
                    marks.push({ idx: m.index, start: m.index + m[0].length });
                }

                // If the model responds as "1. ... 2. ... 3. ...", render as 1 item per line.
                if (marks.length > 1) {
                    const items = [];
                    for (let i = 0; i < marks.length; i++) {
                        const start = marks[i].start;
                        const end = (i + 1 < marks.length) ? marks[i + 1].idx : s.length;
                        const item = s.slice(start, end).trim();
                        if (item) items.push(item);
                    }
                    if (items.length > 0) {
                        debugContent.innerHTML = `<ol class="debug-issues">${items.map(it => `<li>${this.escapeHtml(it)}</li>`).join('')}</ol>`;
                    } else {
                        debugContent.textContent = raw || 'Keine Issues gefunden.';
                    }
                } else {
                    debugContent.textContent = raw || 'Keine Issues gefunden.';
                }
            }
            if (debugModel) {
                debugModel.textContent = result.model || 'GPT-4o';
            }

            this.showSuccess('Debug-Analyse abgeschlossen');
        } catch (error) {
            this.showError('Debug-Analyse fehlgeschlagen: ' + error.message);
        } finally {
            // Button wieder aktivieren
            if (debugBtn) {
                debugBtn.disabled = false;
                debugBtn.textContent = originalBtnText || 'Debug Analysis';
            }
        }
    }
};
