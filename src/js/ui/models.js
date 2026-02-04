import { API, CONFIG } from '../config.js';

export const models = {
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
        const ollamaEl = document.querySelector('#ollama-status .provider-state') || document.getElementById('ollama-status');
        if (!ollamaEl) return;
        if (providers.ollama?.available) {
            ollamaEl.textContent = `${providers.ollama.models.length} Modelle`;
            ollamaEl.className = ollamaEl.classList.contains('provider-state')
                ? 'provider-state available'
                : 'status-badge-small available';
        } else {
            ollamaEl.textContent = 'Nicht verfügbar';
            ollamaEl.className = ollamaEl.classList.contains('provider-state')
                ? 'provider-state unavailable'
                : 'status-badge-small unavailable';
        }

        // OpenRouter
        const openrouterEl = document.querySelector('#openrouter-status .provider-state') || document.getElementById('openrouter-status');
        if (openrouterEl) {
            if (providers.openrouter?.available) {
                openrouterEl.textContent = `${providers.openrouter.models.length} Modelle`;
                openrouterEl.className = openrouterEl.classList.contains('provider-state')
                    ? 'provider-state available'
                    : 'status-badge-small available';
            } else {
                openrouterEl.textContent = 'Nicht konfiguriert';
                openrouterEl.className = openrouterEl.classList.contains('provider-state')
                    ? 'provider-state unavailable'
                    : 'status-badge-small unavailable';
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
            const countEl = document.getElementById('openrouter-count');
            if (countEl) countEl.textContent = String(providers.openrouter.models.length);

            // Populate dropdown
            this.populateModelDropdown(providers.openrouter.models);

            // Dropdown change event
            openrouterSelect.onchange = (e) => {
                if (e.target.value) {
                    this.selectModel('openrouter', e.target.value);
                    this.showModelInfo(e.target.value);
                } else {
                    this.state.selectedModel = null;
                    const info = document.getElementById('selected-model-info');
                    if (info) info.style.display = 'none';
                    this.updateActionButtons();
                }
            };

            // Search filter
            const applySearch = () => {
                const all = this.state.openrouterModels || [];
                const searchTerm = (modelSearch?.value || '').trim().toLowerCase();
                const filtered = !searchTerm
                    ? all
                    : all.filter(m =>
                        (m.name || '').toLowerCase().includes(searchTerm) ||
                        (m.id || '').toLowerCase().includes(searchTerm)
                    );
                this.populateModelDropdown(filtered);
            };
            modelSearch.oninput = this.debounce(applySearch, 150);

            // Restore previously selected OpenRouter model if still available.
            if (this.state.selectedModel?.provider === 'openrouter') {
                const selectedId = this.state.selectedModel.model;
                const exists = (this.state.openrouterModels || []).some(m => m.id === selectedId);
                if (exists) {
                    openrouterSelect.value = selectedId;
                    this.showModelInfo(selectedId);
                }
            }

        } else {
            openrouterSection.querySelector('h4, h3').textContent = '🌐 OpenRouter (nicht konfiguriert)';
            openrouterSelect.innerHTML = '<option value="">API Key fehlt in .env</option>';
            this.state.openrouterModels = [];
            if (openrouterSelect) openrouterSelect.onchange = null;
            if (modelSearch) modelSearch.oninput = null;
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
        if (provider !== 'ollama') {
            this.state.warmupModelId = null;
        } else if (this.state.warmupModelId !== modelId) {
            this.state.warmupModelId = null;
        }
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
            status.textContent = 'Default nicht verfügbar';
            this.state.openrouterDefaultLocked = false;
            this.setOpenRouterSelectorEnabled(true);
            if (forceSelect) {
                this.showError('Default-Modell nicht verfügbar.');
            }
            return;
        }

        toggle.disabled = false;
        button.disabled = false;
        status.textContent = `Default verfügbar (${defaultId})`;

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
    }
};
