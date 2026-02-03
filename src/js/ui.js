/**
 * UI-Modul für den LLM Benchmark Tester
 */

const UI = {
    // State
    state: {
        selectedTest: null,
        selectedModel: null, // {provider, model}
        tests: [],
        models: {},
        currentRun: null,
        benchmarkRunning: false,
        openrouterDefaultLocked: true,
        manualRetry: null,
        manualRetryHistory: null,
        runnerAbortController: null,
        runnerCancelRequested: false,
        runnerInFlight: false,
        isLimitTestMode: false
    },

    /**
     * Initialisiert die UI
     */
    async init() {
        this.bindNavigation();
        this.bindRunOptions();
        this.bindActions();
        this.bindModal();
        this.bindFilters();
        this.bindDefaultModelControls();
        this.applyDefaultParams();

        // Lade initiale Daten
        await this.loadProviders();
        await this.loadTests();
        this.checkBackendConnection();
    },

    /**
     * Navigation zwischen Views
     */
    bindNavigation() {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const view = tab.dataset.view;
                this.switchView(view);
            });
        });
    },

    switchView(viewName) {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === viewName);
        });
        document.querySelectorAll('.view').forEach(view => {
            view.classList.toggle('active', view.id === `${viewName}-view`);
        });

        // View-spezifische Aktionen
        if (viewName === 'runs') this.loadRuns();
        if (viewName === 'metrics') this.loadStats();
    },

    /**
     * Lädt Provider und Modelle
     */
    async loadProviders() {
        try {
            const providers = await API.getModels();
            this.state.models = providers;
            this.renderProviderStatus(providers);
            this.renderModels(providers);
        } catch (error) {
            console.error('Error loading providers:', error);
            this.showError('Backend nicht erreichbar. Starte den Server mit: npm start');
        }

        this.updateActionButtons();
    },

    renderProviderStatus(providers) {
        // Ollama
        const ollamaEl = document.querySelector('#ollama-status .provider-state');
        if (providers.ollama?.available) {
            ollamaEl.textContent = `${providers.ollama.models.length} Modelle`;
            ollamaEl.className = 'provider-state available';
        } else {
            ollamaEl.textContent = 'Nicht verfügbar';
            ollamaEl.className = 'provider-state unavailable';
        }

        // OpenRouter
        const openrouterEl = document.querySelector('#openrouter-status .provider-state');
        if (openrouterEl) {
            if (providers.openrouter?.available) {
                openrouterEl.textContent = `${providers.openrouter.models.length} Modelle`;
                openrouterEl.className = 'provider-state available';
            } else {
                openrouterEl.textContent = 'Nicht konfiguriert';
                openrouterEl.className = 'provider-state unavailable';
            }
        }
    },

    renderModels(providers) {
        // Ollama Modelle
        const ollamaSection = document.getElementById('ollama-models');
        const ollamaList = document.getElementById('ollama-model-list');

        if (providers.ollama?.available && providers.ollama.models.length > 0) {
            ollamaSection.style.display = 'block';
            ollamaList.innerHTML = providers.ollama.models.map(model =>
                this.createModelCard('ollama', model.id, model.name, model.size)
            ).join('');

            // Bind click events für Ollama
            ollamaList.querySelectorAll('.model-option').forEach(option => {
                option.addEventListener('click', () => {
                    this.selectModel('ollama', option.dataset.model, option);
                });
            });
        } else {
            ollamaSection.style.display = 'none';
        }

        // OpenRouter Dropdown
        const openrouterSection = document.getElementById('openrouter-models');
        const openrouterSelect = document.getElementById('openrouter-model-select');
        const modelSearch = document.getElementById('model-search');

        if (providers.openrouter?.available && providers.openrouter.models.length > 0) {
            openrouterSection.style.display = 'block';
            this.state.openrouterModels = providers.openrouter.models;

            // Populate dropdown
            this.populateModelDropdown(providers.openrouter.models);

            // Dropdown change event
            openrouterSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.selectModel('openrouter', e.target.value);
                    this.showModelInfo(e.target.value);
                } else {
                    this.state.selectedModel = null;
                    document.getElementById('selected-model-info').style.display = 'none';
                    this.updateActionButtons();
                }
            });

            // Search filter
            modelSearch.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const filtered = providers.openrouter.models.filter(m =>
                    m.name.toLowerCase().includes(searchTerm) ||
                    m.id.toLowerCase().includes(searchTerm)
                );
                this.populateModelDropdown(filtered);
            });
        } else {
            openrouterSection.querySelector('h4').textContent = '🌐 OpenRouter (nicht konfiguriert)';
            openrouterSelect.innerHTML = '<option value="">API Key fehlt in .env</option>';
            this.state.openrouterModels = [];
        }

        this.applyDefaultOpenRouterState(false);
        this.updateActionButtons();
    },

    populateModelDropdown(models) {
        const select = document.getElementById('openrouter-model-select');
        const currentValue = select.value;

        // Gruppiere nach Provider
        const grouped = {};
        models.forEach(m => {
            const provider = m.id.split('/')[0] || 'other';
            if (!grouped[provider]) grouped[provider] = [];
            grouped[provider].push(m);
        });

        let html = '<option value="">-- Modell auswählen (' + models.length + ' verfügbar) --</option>';

        // Sortierte Provider-Liste (beliebte zuerst)
        const providerOrder = ['openai', 'anthropic', 'google', 'meta-llama', 'mistralai', 'deepseek', 'qwen'];
        const sortedProviders = Object.keys(grouped).sort((a, b) => {
            const aIdx = providerOrder.indexOf(a);
            const bIdx = providerOrder.indexOf(b);
            if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
            if (aIdx === -1) return 1;
            if (bIdx === -1) return -1;
            return aIdx - bIdx;
        });

        sortedProviders.forEach(provider => {
            html += `<optgroup label="${this.escapeHtml(provider.toUpperCase())}">`;
            grouped[provider].forEach(m => {
                const price = m.pricing?.prompt ? `$${(parseFloat(m.pricing.prompt) * 1000000).toFixed(2)}/1M` : '';
                html += `<option value="${m.id}">${this.escapeHtml(m.name)} ${price ? '(' + price + ')' : ''}</option>`;
            });
            html += '</optgroup>';
        });

        select.innerHTML = html;

        // Restore selection if still available
        if (currentValue && models.some(m => m.id === currentValue)) {
            select.value = currentValue;
        }
    },

    showModelInfo(modelId) {
        const model = this.state.openrouterModels?.find(m => m.id === modelId);
        const infoEl = document.getElementById('selected-model-info');

        if (model) {
            infoEl.style.display = 'flex';
            infoEl.querySelector('.model-name').textContent = model.name;
            infoEl.querySelector('.model-context').textContent = model.context_length ? `${(model.context_length / 1000).toFixed(0)}K Context` : '';
            if (model.pricing?.prompt) {
                const pricePerMillion = (parseFloat(model.pricing.prompt) * 1000000).toFixed(2);
                infoEl.querySelector('.model-price').textContent = `$${pricePerMillion}/1M tokens`;
            } else {
                infoEl.querySelector('.model-price').textContent = '';
            }
        } else {
            infoEl.style.display = 'none';
        }
    },

    selectModel(provider, modelId, element = null) {
        // Entferne alle vorherigen Selektionen
        document.querySelectorAll('.model-option').forEach(o => o.classList.remove('selected'));

        if (provider === 'ollama') {
            const openrouterSelect = document.getElementById('openrouter-model-select');
            if (openrouterSelect) {
                openrouterSelect.value = '';
            }
            const infoEl = document.getElementById('selected-model-info');
            if (infoEl) {
                infoEl.style.display = 'none';
            }
            const defaultToggle = document.getElementById('openrouter-default-toggle');
            if (defaultToggle) {
                defaultToggle.checked = false;
            }
            this.state.openrouterDefaultLocked = false;
            this.setOpenRouterSelectorEnabled(true);
        }

        // Markiere neues Element (falls Ollama Karte)
        if (element) {
            element.classList.add('selected');
        }

        this.state.selectedModel = { provider, model: modelId };
        this.updateActionButtons();
    },

    createModelCard(provider, modelId, modelName, sizeBytes = null) {
        const sizeStr = sizeBytes ? this.formatBytes(sizeBytes) : '';
        return `
            <div class="model-option" data-provider="${provider}" data-model="${modelId}">
                <span class="model-icon">🖥️</span>
                <span class="model-name">${this.escapeHtml(modelName)}</span>
                ${sizeStr ? `<span class="model-size">${sizeStr}</span>` : ''}
            </div>
        `;
    },

    /**
     * Formatiert Bytes in menschenlesbare Größe (GB/MB)
     */
    formatBytes(bytes) {
        if (!bytes || bytes === 0) return '';
        const gb = bytes / (1024 * 1024 * 1024);
        if (gb >= 1) {
            return `${gb.toFixed(1)} GB`;
        }
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(0)} MB`;
    },

    /**
     * Lädt Tests
     */
    async loadTests() {
        try {
            const data = await API.getTests();
            this.state.tests = data.tests;
            this.renderTests(data.tests);
            this.populateFilters(data.categories, data.difficulties);
            this.updateActionButtons();
        } catch (error) {
            console.error('Error loading tests:', error);
        }
    },

    renderTests(tests) {
        const container = document.getElementById('test-list');

        if (!tests || tests.length === 0) {
            container.innerHTML = '<p class="no-tests">Keine Tests vorhanden.</p>';
            return;
        }

        container.innerHTML = tests.map(test => {
            const categoryInfo = CONFIG.categories[test.category] || { name: test.category, icon: '📝' };
            const difficultyInfo = CONFIG.difficulties[test.difficulty] || { name: test.difficulty, color: '#6b7280' };

            return `
                <div class="test-item" data-test-id="${test.id}">
                    <div class="test-item-header">
                        <span class="test-category-icon">${categoryInfo.icon}</span>
                        <span class="test-item-name">${this.escapeHtml(test.name)}</span>
                        <span class="test-difficulty" style="background: ${difficultyInfo.color}">${difficultyInfo.name}</span>
                        <button class="test-info-btn" data-test-id="${test.id}" title="Test-Details anzeigen">ℹ️</button>
                    </div>
                    <div class="test-item-description">${this.escapeHtml(test.description)}</div>
                    <div class="test-item-meta">
                        <span class="test-category">${categoryInfo.name}</span>
                        <span class="test-eval-type">${test.evaluationType === 'auto' ? '🤖 Auto' : '👤 Manuell'}</span>
                    </div>
                </div>
            `;
        }).join('');

        // Bind click events
        container.querySelectorAll('.test-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Ignoriere Klicks auf den Info-Button
                if (e.target.classList.contains('test-info-btn')) return;

                container.querySelectorAll('.test-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                this.state.selectedTest = this.state.tests.find(t => t.id === item.dataset.testId);
                this.updateActionButtons();
            });

            // Doppelklick öffnet Details
            item.addEventListener('dblclick', (e) => {
                if (e.target.classList.contains('test-info-btn')) return;
                const test = this.state.tests.find(t => t.id === item.dataset.testId);
                this.showTestDetails(test);
            });
        });

        // Bind Info-Button clicks
        container.querySelectorAll('.test-info-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const test = this.state.tests.find(t => t.id === btn.dataset.testId);
                this.showTestDetails(test);
            });
        });
    },

    populateFilters(categories, difficulties) {
        const catSelect = document.getElementById('filter-category');
        categories?.forEach(cat => {
            const info = CONFIG.categories[cat] || { name: cat };
            catSelect.innerHTML += `<option value="${cat}">${info.name}</option>`;
        });

        const diffSelect = document.getElementById('filter-difficulty');
        difficulties?.forEach(diff => {
            const info = CONFIG.difficulties[diff] || { name: diff };
            diffSelect.innerHTML += `<option value="${diff}">${info.name}</option>`;
        });
    },

    bindFilters() {
        document.getElementById('filter-category').addEventListener('change', () => this.applyFilters());
        document.getElementById('filter-difficulty').addEventListener('change', () => this.applyFilters());
    },

    bindDefaultModelControls() {
        const toggle = document.getElementById('openrouter-default-toggle');
        const button = document.getElementById('openrouter-default-btn');

        if (toggle) {
            this.state.openrouterDefaultLocked = toggle.checked;
            toggle.addEventListener('change', () => {
                this.state.openrouterDefaultLocked = toggle.checked;
                this.applyDefaultOpenRouterState(false);
            });
        }

        if (button) {
            button.addEventListener('click', () => this.applyDefaultOpenRouterState(true));
        }
    },

    applyFilters() {
        const category = document.getElementById('filter-category').value;
        const difficulty = document.getElementById('filter-difficulty').value;

        let filtered = this.state.tests;
        if (category) filtered = filtered.filter(t => t.category === category);
        if (difficulty) filtered = filtered.filter(t => t.difficulty === difficulty);

        this.renderTests(filtered);
    },

    applyDefaultParams() {
        const tempInput = document.getElementById('temperature');
        if (tempInput && CONFIG.defaultParams?.temperature !== undefined) {
            tempInput.value = CONFIG.defaultParams.temperature;
        }

        const iterationsInput = document.getElementById('iterations');
        if (iterationsInput && CONFIG.benchmark?.batchIterations) {
            iterationsInput.value = CONFIG.benchmark.batchIterations;
        }

        const batchIterationsInput = document.getElementById('batch-iterations');
        if (batchIterationsInput && CONFIG.benchmark?.batchIterations) {
            batchIterationsInput.value = CONFIG.benchmark.batchIterations;
        }
    },

    resolveDefaultOpenRouterModelId() {
        const preferredId = CONFIG.defaultModels?.openrouter;
        const models = this.state.openrouterModels || [];

        if (preferredId) {
            const exact = models.find(m => m.id === preferredId);
            if (exact) return exact.id;
        }

        const fallback = models.find(m => m.id?.toLowerCase().includes('gpt-4.1'));
        return fallback ? fallback.id : null;
    },

    setOpenRouterSelectorEnabled(enabled) {
        const select = document.getElementById('openrouter-model-select');
        const search = document.getElementById('model-search');
        if (select) select.disabled = !enabled;
        if (search) search.disabled = !enabled;
    },

    applyDefaultOpenRouterState(forceSelect) {
        const toggle = document.getElementById('openrouter-default-toggle');
        const status = document.getElementById('openrouter-default-status');
        const button = document.getElementById('openrouter-default-btn');
        const defaultId = this.resolveDefaultOpenRouterModelId();

        if (!toggle || !status || !button) return;

        if (!defaultId) {
            toggle.checked = false;
            toggle.disabled = true;
            button.disabled = true;
            status.textContent = 'Default nicht verfuegbar';
            this.state.openrouterDefaultLocked = false;
            this.setOpenRouterSelectorEnabled(true);
            if (forceSelect) {
                this.showError('Default-Modell nicht verfuegbar.');
            }
            return;
        }

        toggle.disabled = false;
        button.disabled = false;
        status.textContent = `Default verfuegbar (${defaultId})`;

        this.state.openrouterDefaultLocked = toggle.checked;
        const shouldSelect = forceSelect || this.state.openrouterDefaultLocked;

        if (shouldSelect) {
            const select = document.getElementById('openrouter-model-select');
            if (select) {
                select.value = defaultId;
            }
            this.selectModel('openrouter', defaultId);
            this.showModelInfo(defaultId);
        }

        this.setOpenRouterSelectorEnabled(!this.state.openrouterDefaultLocked);
        this.updateActionButtons();
    },

    /**
     * Run Options
     */
    bindRunOptions() {
        document.getElementById('run-mode').addEventListener('change', (e) => {
            const mode = e.target.value;
            document.getElementById('iterations-label').style.display = mode === 'batch' ? 'block' : 'none';
            document.getElementById('max-attempts-label').style.display = mode === 'retry' ? 'block' : 'none';
        });
    },

    /**
     * Action Buttons
     */
    bindActions() {
        document.getElementById('start-test-btn').addEventListener('click', () => this.startTest());
        document.getElementById('compare-btn').addEventListener('click', () => this.showCompareDialog());
        document.getElementById('start-test-btn-top')?.addEventListener('click', () => this.startTest());
        document.getElementById('compare-btn-top')?.addEventListener('click', () => this.showCompareDialog());
        document.getElementById('limit-test-btn')?.addEventListener('click', () => this.startLimitTest());
        document.getElementById('warmup-local-btn')?.addEventListener('click', () => this.runWarmup());
        document.getElementById('batch-all-btn')?.addEventListener('click', () => this.runBatchAll());
        document.getElementById('runner-abort-btn')?.addEventListener('click', () => this.requestRunnerAbort());
        document.getElementById('preview-html-btn')?.addEventListener('click', () => {
            if (!this.state.currentRun?.output) {
                this.showError('Kein Output zum Anzeigen vorhanden.');
                return;
            }
            const html = this.extractHtmlFromOutput(this.state.currentRun.output);
            if (!html) {
                this.showError('Kein gueltiges HTML im Output gefunden.');
                return;
            }
            this.openHtmlPreview(html);
        });
        document.getElementById('debug-analyze-btn')?.addEventListener('click', () => {
            this.runDebugAnalysis();
        });
        document.getElementById('toggle-output-btn')?.addEventListener('click', () => {
            const output = document.getElementById('runner-output');
            if (!output) return;
            if (output.classList.contains('collapsed')) {
                output.classList.remove('collapsed');
                output.classList.add('expanded');
            } else {
                output.classList.toggle('expanded');
            }
            const btn = document.getElementById('toggle-output-btn');
            if (btn) {
                if (output.classList.contains('collapsed')) {
                    btn.textContent = 'Code anzeigen';
                } else {
                    btn.textContent = output.classList.contains('expanded') ? 'Vollansicht schliessen' : 'Vollansicht';
                }
            }
        });
        document.getElementById('retry-attempt-select')?.addEventListener('change', (e) => {
            const selected = parseInt(e.target.value, 10);
            this.updateRetryHistoryPanel(Number.isNaN(selected) ? null : selected);
        });

        // Runs View
        document.getElementById('export-json-btn')?.addEventListener('click', () => API.exportRuns('json'));
        document.getElementById('export-csv-btn')?.addEventListener('click', () => API.exportRuns('csv'));
        document.getElementById('clear-runs-btn')?.addEventListener('click', () => this.confirmClearRuns());
        document.getElementById('refresh-runs-btn')?.addEventListener('click', () => this.loadRuns());

        // Filter für Runs
        ['filter-run-provider', 'filter-run-status', 'filter-run-passed'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', () => this.loadRuns());
        });

        // Stats
        document.getElementById('refresh-stats-btn')?.addEventListener('click', () => this.loadStats());

        // Manual Evaluation - New intuitive flow
        document.getElementById('eval-pass')?.addEventListener('click', () => this.submitEvaluation(true));
        document.getElementById('eval-fail-with-feedback')?.addEventListener('click', () => this.showFeedbackSection());
        document.getElementById('eval-submit-fail')?.addEventListener('click', () => this.submitEvaluation(false));
    },

    updateActionButtons() {
        const hasTest = !!this.state.selectedTest;
        const hasModel = !!this.state.selectedModel;
        const hasLimitTest = this.state.tests.some(t => t.category === 'limit-testing');

        document.getElementById('start-test-btn').disabled = !(hasTest && hasModel);
        document.getElementById('compare-btn').disabled = !hasTest;
        const startTop = document.getElementById('start-test-btn-top');
        if (startTop) startTop.disabled = !(hasTest && hasModel);
        const compareTop = document.getElementById('compare-btn-top');
        if (compareTop) compareTop.disabled = !hasTest;

        // Limit Test Button - nur Modell nötig
        const limitBtn = document.getElementById('limit-test-btn');
        if (limitBtn) limitBtn.disabled = !(hasModel && hasLimitTest);

        const warmupBtn = document.getElementById('warmup-local-btn');
        if (warmupBtn) {
            const isLocalSelected = this.state.selectedModel?.provider === 'ollama';
            warmupBtn.disabled = !isLocalSelected || this.state.benchmarkRunning;
        }

        const batchAllBtn = document.getElementById('batch-all-btn');
        if (batchAllBtn) {
            batchAllBtn.disabled = !(hasModel && this.state.tests.length > 0) || this.state.benchmarkRunning;
        }
    },

    beginRunnerOperation() {
        if (this.state.runnerAbortController) {
            this.state.runnerAbortController.abort();
        }
        this.state.runnerAbortController = new AbortController();
        this.state.runnerCancelRequested = false;
        this.setAbortButtonEnabled(true);
    },

    finishRunnerOperation() {
        this.state.runnerAbortController = null;
        this.state.runnerCancelRequested = false;
        this.setAbortButtonEnabled(false);

        // Reset Limit-Test Mode
        if (this.state.isLimitTestMode) {
            this.state.isLimitTestMode = false;
            const runnerView = document.getElementById('runner-view');
            if (runnerView) {
                runnerView.classList.remove('runner-view-limit');
            }
        }
    },

    setAbortButtonEnabled(enabled) {
        const btn = document.getElementById('runner-abort-btn');
        if (btn) btn.disabled = !enabled;
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

    isRunnerAbortRequested() {
        return this.state.runnerCancelRequested || this.state.runnerAbortController?.signal?.aborted;
    },

    isAbortError(error) {
        return error?.name === 'AbortError';
    },

    getRunnerSignal() {
        return this.state.runnerAbortController?.signal;
    },

    handleRunnerAbort(message = 'Run abgebrochen.') {
        this.setRunnerStatus('error', 'Abgebrochen');
        const output = document.getElementById('runner-output');
        if (output) output.textContent = message;
        const progress = document.getElementById('runner-progress');
        if (progress) progress.style.display = 'none';
        const manualEval = document.getElementById('manual-eval');
        if (manualEval) manualEval.style.display = 'none';
        this.state.manualRetry = null;
        this.state.manualRetryHistory = null;
        this.updateRetryHistoryPanel();
    },

    getTemperature() {
        const temperature = parseFloat(document.getElementById('temperature')?.value);
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

    setProgress(current, total) {
        const progressEl = document.getElementById('runner-progress');
        if (!progressEl) return;
        progressEl.style.display = 'block';
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        document.getElementById('progress-fill').style.width = `${percent}%`;
        document.getElementById('progress-text').textContent = `${percent}%`;
    },

    async runWarmup() {
        const selected = this.state.selectedModel;
        if (!selected || selected.provider !== 'ollama') {
            this.showError('Bitte zuerst ein lokales Modell waehlen.');
            return;
        }

        const localModels = this.state.models?.ollama?.models || [];
        const localModel = localModels.find(model => model.id === selected.model);
        const warmupTest = this.getWarmupTest();

        if (!warmupTest || !localModel) {
            this.showError('Warm-up nicht moeglich: Keine lokalen Modelle oder Tests gefunden.');
            return;
        }

        this.state.benchmarkRunning = true;
        this.updateActionButtons();
        this.switchView('runner');
        this.setRunnerStatus('running', 'Warm-up laeuft...');
        this.beginRunnerOperation();

        const options = { temperature: this.getTemperature() };
        const total = 1;

        document.getElementById('runner-mode').textContent = 'warmup';
        document.getElementById('runner-test-name').textContent = warmupTest.name;
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
        } else if (errors.length > 0) {
            this.setRunnerStatus('failed', 'Warm-up mit Fehlern');
            document.getElementById('runner-output').textContent = `Warm-up beendet mit Fehlern:\n${errors.join('\n')}`;
        } else {
            this.setRunnerStatus('success', 'Warm-up abgeschlossen');
            document.getElementById('runner-output').textContent = 'Warm-up abgeschlossen.';
        }

        this.state.benchmarkRunning = false;
        this.updateActionButtons();
        this.finishRunnerOperation();
    },

    async runBatchAll() {
        if (!this.state.selectedModel) {
            this.showError('Bitte zuerst ein Modell waehlen.');
            return;
        }

        const iterations = parseInt(document.getElementById('batch-iterations')?.value, 10)
            || CONFIG.benchmark?.batchIterations
            || 5;
        const autoOnly = document.getElementById('batch-auto-only')?.checked ?? true;
        const selectedCategories = Array.from(document.querySelectorAll('.batch-category'))
            .filter(input => input.checked)
            .map(input => input.value);
        const filteredByCategory = this.state.tests.filter(test =>
            selectedCategories.includes(test.category)
        );
        const tests = autoOnly
            ? filteredByCategory.filter(test => test.evaluationType === 'auto')
            : filteredByCategory;

        if (tests.length === 0) {
            this.showError('Keine passenden Tests fuer Batch-All gefunden.');
            return;
        }

        const { provider, model } = this.state.selectedModel;

        this.state.benchmarkRunning = true;
        this.updateActionButtons();
        this.switchView('runner');
        this.setRunnerStatus('running', 'Batch-All laeuft...');
        this.beginRunnerOperation();

        const options = { temperature: this.getTemperature() };
        const total = tests.length;
        const errors = [];
        let aborted = false;

        document.getElementById('runner-mode').textContent = `batch-all (${iterations}x)`;
        document.getElementById('runner-model-name').textContent = `${provider}/${model}`;

        for (let i = 0; i < tests.length; i++) {
            if (this.isRunnerAbortRequested()) {
                aborted = true;
                break;
            }
            const test = tests[i];
            document.getElementById('runner-test-name').textContent = test.name;
            document.getElementById('runner-output').textContent = `Batch-All: ${test.name} (${i + 1}/${total})`;
            this.setProgress(i, total);

            try {
                this.state.runnerInFlight = true;
                if (test.evaluationType === 'manual') {
                    const run = await API.runSingle(test.id, provider, model, options, null, {
                        signal: this.getRunnerSignal()
                    });
                    this.displaySingleResult(run);
                } else {
                    const result = await API.runBatch(test.id, provider, model, iterations, options, {
                        signal: this.getRunnerSignal()
                    });
                    this.displayBatchResult(result);
                }
            } catch (error) {
                if (this.isAbortError(error)) {
                    aborted = true;
                    break;
                }
                errors.push(`${test.name}: ${error.message}`);
                document.getElementById('runner-output').textContent = `Fehler bei ${test.name}: ${error.message}`;
            } finally {
                this.state.runnerInFlight = false;
            }

            this.setProgress(i + 1, total);
        }

        if (aborted || this.isRunnerAbortRequested()) {
            this.handleRunnerAbort('Batch-All abgebrochen.');
        } else if (errors.length > 0) {
            this.setRunnerStatus('failed', 'Batch-All mit Fehlern');
            document.getElementById('runner-output').textContent = `Batch-All beendet mit Fehlern:\n${errors.join('\n')}`;
        } else {
            this.setRunnerStatus('success', 'Batch-All abgeschlossen');
            document.getElementById('runner-output').textContent = 'Batch-All abgeschlossen.';
        }

        this.state.benchmarkRunning = false;
        this.updateActionButtons();
        this.finishRunnerOperation();
    },

    /**
     * Test starten
     */
    async startTest() {
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
        console.log('[Runner] output length:', outputText.length);
        console.log('[Runner] html detected:', hasHtml, 'html length:', html.length);
        console.log('[Runner] output tail:', outputText.slice(-400));
        if (outputText.includes('```')) {
            console.log('[Runner] output contains code fences');
        }
        const previewBtn = document.getElementById('preview-html-btn');
        if (previewBtn) {
            previewBtn.style.display = hasHtml ? 'inline-flex' : 'none';
        }
        const debugBtn = document.getElementById('debug-analyze-btn');
        if (debugBtn) {
            debugBtn.style.display = hasHtml ? 'inline-flex' : 'none';
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
                const currentTest = this.state.tests.find(t => t.id === this.state.selectedTest);
                if (currentTest?.category === 'limit-testing') {
                    this.openHtmlPreview(html);
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

    displayBatchResult(result) {
        const lastRun = result.runs[result.runs.length - 1];
        if (lastRun) {
            this.displaySingleResult(lastRun);
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

    /**
     * Runs laden
     */
    async loadRuns() {
        try {
            const filters = {
                provider: document.getElementById('filter-run-provider')?.value,
                status: document.getElementById('filter-run-status')?.value,
                passed: document.getElementById('filter-run-passed')?.value
            };

            // Entferne leere Filter
            Object.keys(filters).forEach(k => !filters[k] && delete filters[k]);

            const data = await API.getRuns(filters);
            this.renderRuns(data.runs);
        } catch (error) {
            console.error('Error loading runs:', error);
        }
    },

    renderRuns(runs) {
        const container = document.getElementById('runs-container');

        if (!runs || runs.length === 0) {
            container.innerHTML = '<p class="no-runs">Keine Runs vorhanden.</p>';
            return;
        }

        container.innerHTML = runs.map(run => {
            const statusClass = run.passed === true ? 'success' : run.passed === false ? 'failed' : 'pending';
            const statusIcon = run.passed === true ? '✅' : run.passed === false ? '❌' : '⏳';

            const latency = run.metrics?.t_model_ms || run.metrics?.latency_ms;
            return `
                <div class="log-entry" data-run-id="${run.id}">
                    <span class="log-status ${statusClass}">${statusIcon}</span>
                    <div class="log-info">
                        <div class="log-test-name">${this.escapeHtml(run.testName || '-')}</div>
                        <div class="log-details">
                            ${run.provider}/${run.model}
                            ${latency ? `• ${latency}ms` : ''}
                            ${run.attempt > 1 ? `• Versuch ${run.attempt}` : ''}
                        </div>
                    </div>
                    <span class="log-timestamp">${this.formatDate(run.startedAt)}</span>
                </div>
            `;
        }).join('');

        // Bind click für Details
        container.querySelectorAll('.log-entry').forEach(entry => {
            entry.addEventListener('click', () => this.showRunDetail(entry.dataset.runId));
        });
    },

    async showRunDetail(runId) {
        try {
            const run = await API.getRun(runId);
            const showPreview = this.isHtmlDocument(run.output || '');
            this.state.modalPreviewOutput = showPreview ? run.output : null;
            this.showModal('Run Details', `
                <div class="run-detail">
                    <h4>${this.escapeHtml(run.testName || '-')}</h4>
                    <p><strong>ID:</strong> ${run.id}</p>
                    <p><strong>Provider/Model:</strong> ${run.provider}/${run.model}</p>
                    <p><strong>Status:</strong> ${run.status}</p>
                    <p><strong>Passed:</strong> ${run.passed === null ? 'Ausstehend' : run.passed ? 'Ja' : 'Nein'}</p>
                    <p><strong>Zeitstempel:</strong> ${run.startedAt}</p>

                    ${showPreview ? `
                        <button id="modal-preview-btn" class="btn btn-secondary">HTML Preview</button>
                    ` : ''}

                    ${run.metrics ? `
                        <h4>Metriken</h4>
                        <pre>${JSON.stringify(run.metrics, null, 2)}</pre>
                    ` : ''}

                    ${run.output ? `
                        <h4>Output</h4>
                        <pre class="output-preview">${this.escapeHtml(run.output)}</pre>
                    ` : ''}

                    ${run.checkResult ? `
                        <h4>Check Ergebnis</h4>
                        <pre>${JSON.stringify(run.checkResult, null, 2)}</pre>
                    ` : ''}

                    ${run.error ? `
                        <h4>Fehler</h4>
                        <pre class="error">${this.escapeHtml(run.error)}</pre>
                    ` : ''}
                </div>
            `);
            this.bindModalPreview();
        } catch (error) {
            this.showError('Fehler beim Laden: ' + error.message);
        }
    },

    async confirmClearRuns() {
        if (confirm('Alle Runs wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
            try {
                await API.clearRuns();
                this.loadRuns();
                this.showSuccess('Alle Runs gelöscht');
            } catch (error) {
                this.showError('Fehler: ' + error.message);
            }
        }
    },

    /**
     * Stats laden
     */
    async loadStats() {
        try {
            const stats = await API.getStats();

            document.getElementById('stat-total').textContent = stats.total;
            document.getElementById('stat-passed').textContent = stats.passed;
            document.getElementById('stat-failed').textContent = stats.failed;

            const rate = stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0;
            document.getElementById('stat-success-rate').textContent = `${rate}%`;

            // By Provider
            this.renderStatsTable('stats-by-provider', stats.byProvider, true);

            // By Model
            this.renderStatsTable('stats-by-model', stats.byModel, true);

            // By Test
            this.renderStatsTable('stats-by-test', stats.byTest, false);

        } catch (error) {
            console.error('Error loading stats:', error);
        }
    },

    renderStatsTable(tableId, data, showLatency) {
        const tbody = document.querySelector(`#${tableId} tbody`);
        if (!data || Object.keys(data).length === 0) {
            tbody.innerHTML = `<tr><td colspan="${showLatency ? 8 : 5}">Keine Daten</td></tr>`;
            return;
        }

        tbody.innerHTML = Object.entries(data).map(([key, val]) => {
            const latency = val.latency || {};
            const median = latency.median || val.medianLatency || '-';
            const stdDev = latency.stdDev || val.stdDevLatency || '-';
            const avg = latency.mean || val.avgLatency || '-';

            return `
                <tr>
                    <td>${this.escapeHtml(val.name || key)}</td>
                    <td>${val.total}</td>
                    <td>${val.passed}</td>
                    <td>${val.failed}</td>
                    <td>${val.successRate}%</td>
                    ${showLatency ? `
                        <td>${avg !== '-' ? Math.round(avg) + 'ms' : '-'}</td>
                        <td>${median !== '-' ? Math.round(median) + 'ms' : '-'}</td>
                        <td>${stdDev !== '-' ? Math.round(stdDev) + 'ms' : '-'}</td>
                    ` : ''}
                </tr>
            `;
        }).join('');
    },

    /**
     * Modal
     */
    bindModal() {
        const modal = document.getElementById('detail-modal');
        modal.querySelector('.modal-close').addEventListener('click', () => this.closeModal());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeModal();
        });
    },

    showModal(title, content) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = content;
        document.getElementById('detail-modal').classList.add('active');
    },

    closeModal() {
        document.getElementById('detail-modal').classList.remove('active');
    },

    /**
     * Zeigt Test-Details im Modal (für Live-Demo)
     */
    showTestDetails(test) {
        if (!test) return;

        const categoryInfo = CONFIG.categories[test.category] || { name: test.category, icon: '📝' };
        const difficultyInfo = CONFIG.difficulties[test.difficulty] || { name: test.difficulty, color: '#6b7280' };

        // Expected Output formatieren
        let expectedHtml = '';
        if (test.expected) {
            if (Array.isArray(test.expected)) {
                expectedHtml = test.expected.map(exp => `
                    <div class="expected-item">
                        <strong>${exp.type}:</strong> <code>${this.escapeHtml(exp.pattern || exp.value || JSON.stringify(exp))}</code>
                    </div>
                `).join('');
            } else {
                expectedHtml = `<code>${this.escapeHtml(test.expected.pattern || test.expected.value || JSON.stringify(test.expected))}</code>`;
            }
        }

        // Manuelle Kriterien
        let criteriaHtml = '';
        if (test.manualCriteria && test.manualCriteria.length > 0) {
            criteriaHtml = `
                <div class="test-detail-section">
                    <h4>Manuelle Bewertungskriterien</h4>
                    <ul class="criteria-list">
                        ${test.manualCriteria.map(c => `<li>${this.escapeHtml(c)}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        const content = `
            <div class="test-detail-view">
                <div class="test-detail-header">
                    <span class="test-category-icon-large">${categoryInfo.icon}</span>
                    <div>
                        <h3>${this.escapeHtml(test.name)}</h3>
                        <div class="test-detail-meta">
                            <span class="test-category">${categoryInfo.name}</span>
                            <span class="test-difficulty" style="background: ${difficultyInfo.color}">${difficultyInfo.name}</span>
                            <span class="test-eval-type">${test.evaluationType === 'auto' ? '🤖 Automatisch' : '👤 Manuell'}</span>
                        </div>
                    </div>
                </div>

                <div class="test-detail-section">
                    <h4>Beschreibung</h4>
                    <p>${this.escapeHtml(test.description)}</p>
                </div>

                <div class="test-detail-section">
                    <h4>Prompt Template</h4>
                    <pre class="code-block">${this.escapeHtml(test.promptTemplate)}</pre>
                </div>

                <div class="test-detail-section">
                    <h4>Input</h4>
                    <pre class="code-block">${this.escapeHtml(test.input)}</pre>
                </div>

                ${test.expected ? `
                <div class="test-detail-section">
                    <h4>Erwartetes Ergebnis (${test.expected.type || 'pattern'})</h4>
                    ${expectedHtml}
                </div>
                ` : ''}

                ${test.checkCommand ? `
                <div class="test-detail-section">
                    <h4>Check Command</h4>
                    <code>${this.escapeHtml(test.checkCommand)}</code>
                </div>
                ` : ''}

                ${criteriaHtml}
            </div>
        `;

        this.showModal(`Test: ${test.id}`, content);
    },

    bindModalPreview() {
        const btn = document.getElementById('modal-preview-btn');
        if (!btn) return;
        btn.addEventListener('click', () => {
            if (!this.state.modalPreviewOutput) {
                this.showError('Kein Output zum Anzeigen vorhanden.');
                return;
            }
            this.openHtmlPreview(this.state.modalPreviewOutput);
        });
    },

    /**
     * Backend Connection Check
     */
    async checkBackendConnection() {
        try {
            await API.checkHealth();
            document.querySelector('.status-dot').classList.add('connected');
            document.querySelector('.status-text').textContent = 'Backend verbunden';
        } catch {
            document.querySelector('.status-dot').classList.remove('connected');
            document.querySelector('.status-text').textContent = 'Backend nicht erreichbar';
        }
    },

    /**
     * Helpers
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    formatDate(isoString) {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleString('de-DE');
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

    isHtmlDocument(text) {
        if (!text) return false;
        const normalized = text.trim().toLowerCase();
        return normalized.includes('<!doctype html') || normalized.includes('<html');
    },

    extractHtmlFromOutput(text) {
        if (!text) return '';
        const trimmed = text.trim();
        const fenceMatch = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
        if (fenceMatch) {
            return fenceMatch[1].trim();
        }
        if (trimmed.startsWith('```') && this.isHtmlDocument(text)) {
            const withoutFence = trimmed.replace(/^```(?:html)?/i, '').replace(/```$/, '');
            return withoutFence.trim();
        }
        if (this.isHtmlDocument(text)) {
            return trimmed;
        }
        return '';
    },


    openHtmlPreview(html) {
        const preview = window.open('', '_blank');
        if (!preview) {
            this.showError('Popup blockiert. Erlaube Popups fuer diese Seite.');
            return;
        }
        preview.document.open();
        preview.document.write(html);
        preview.document.close();
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
        document.getElementById('manual-eval').style.display = 'none';
        document.getElementById('runner-output').textContent = 'Warte auf Antwort...';
        const previewBtn = document.getElementById('preview-html-btn');
        if (previewBtn) previewBtn.style.display = 'none';
        const outputEl = document.getElementById('runner-output');
        if (outputEl) outputEl.classList.remove('expanded');
        const toggleBtn = document.getElementById('toggle-output-btn');
        if (toggleBtn) toggleBtn.textContent = 'Vollansicht';

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
        const lastPrompt = attempt > 1
            ? this.buildManualRetryContext(retry.history) + this.getOriginalPromptText()
            : this.getOriginalPromptText();
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

    showError(message) {
        alert('Fehler: ' + message);
    },

    showSuccess(message) {
        console.log('Success:', message);
    },

    showCompareDialog() {
        // TODO: Implement model comparison dialog
        alert('Model-Vergleich: Wähle mehrere Modelle aus und starte den Vergleich.');
    },

    /**
     * Quick-Start für Limit Testing mit 5 Retries
     */
    async startLimitTest() {
        if (!this.state.selectedModel) {
            this.showError('Bitte zuerst ein Modell auswählen.');
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

        // Starte mit 5 Retries
        const maxAttempts = 5;
        this.beginRunnerOperation();

        // Update Runner Info
        document.getElementById('runner-test-name').textContent = limitTest.name;
        document.getElementById('runner-model-name').textContent =
            `${this.state.selectedModel.provider}/${this.state.selectedModel.model}`;
        document.getElementById('runner-mode').textContent = `limit-test (max ${maxAttempts} Versuche)`;

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

    /**
     * Zeigt die Feedback-Sektion für "Nicht bestanden"
     */
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

    /**
     * Versteckt die Feedback-Sektion
     */
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

    /**
     * Debug-Analyse mit GPT-4o-mini durchführen
     */
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
                debugContent.textContent = result.issues || 'Keine Issues gefunden.';
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
                debugBtn.textContent = 'Debug-Analyse (GPT-4o)';
            }
        }
    }
};
