import { API, CONFIG } from '../config.js';

export const tests = {
    /**
     * Lädt Tests
     */
    async loadTests() {
        try {
            const data = await API.getTests();
            this.state.tests = data.tests;
            this.renderTests(data.tests);
            this.populateFilters(data.categories, data.difficulties);
            const limitNameEl = document.getElementById('limit-test-name');
            if (limitNameEl) {
                const limitTest = data.tests.find(t => t.category === 'limit-testing');
                limitNameEl.textContent = limitTest ? limitTest.name : '-';
            }
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
            const categoryInfo = CONFIG.categories[test.category] || { name: test.category, icon: '📁' };
            const difficultyInfo = CONFIG.difficulties[test.difficulty] || { name: test.difficulty, color: '#6b7280' };

            return `
                <div class="test-item" data-test-id="${test.id}">
                    <input type="checkbox" class="test-item-checkbox" data-test-id="${test.id}" />
                    <div class="test-item-info">
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
                </div>
            `;
        }).join('');

        // Bind checkbox events
        container.querySelectorAll('.test-item-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateSelectedTestsCount();
            });
        });

        // Bind click events
        container.querySelectorAll('.test-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Ignoriere Klicks auf den Info-Button
                if (e.target.classList.contains('test-info-btn')) return;

                // Wenn Checkbox geklickt, lass das native Verhalten laufen
                if (e.target.classList.contains('test-item-checkbox')) return;

                // Ansonsten: Toggle Checkbox
                const checkbox = item.querySelector('.test-item-checkbox');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    this.updateSelectedTestsCount();
                }
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

        this.updateSelectedTestsCount();
    },

    populateFilters(categories, difficulties) {
        const catSelect = document.getElementById('filter-category');
        if (catSelect) {
            // Behalte nur die erste Option ("Alle Kategorien")
            const firstOption = catSelect.querySelector('option:first-child');
            catSelect.innerHTML = firstOption ? firstOption.outerHTML : '<option value="">Alle Kategorien</option>';

            categories?.forEach(cat => {
                const info = CONFIG.categories[cat] || { name: cat };
                catSelect.innerHTML += `<option value="${cat}">${info.name}</option>`;
            });
        }

        const diffSelect = document.getElementById('filter-difficulty');
        if (diffSelect) {
            // Behalte nur die erste Option ("Alle Schwierigkeiten")
            const firstOption = diffSelect.querySelector('option:first-child');
            diffSelect.innerHTML = firstOption ? firstOption.outerHTML : '<option value="">Alle Schwierigkeiten</option>';

            difficulties?.forEach(diff => {
                const info = CONFIG.difficulties[diff] || { name: diff };
                diffSelect.innerHTML += `<option value="${diff}">${info.name}</option>`;
            });
        }
    },

    bindFilters() {
        document.getElementById('filter-category')?.addEventListener('change', () => this.applyFilters());
        document.getElementById('filter-difficulty')?.addEventListener('change', () => this.applyFilters());
    },

    applyFilters() {
        const category = document.getElementById('filter-category')?.value || '';
        const difficulty = document.getElementById('filter-difficulty')?.value || '';

        let filtered = this.state.tests;
        if (category) filtered = filtered.filter(t => t.category === category);
        if (difficulty) filtered = filtered.filter(t => t.difficulty === difficulty);

        this.renderTests(filtered);
    },

    updateSelectedTestsCount() {
        const checkboxes = document.querySelectorAll('.test-item-checkbox:checked');
        const count = checkboxes.length;
        const countEl = document.getElementById('selected-count');
        const btn = document.getElementById('run-selected-btn');

        if (countEl) countEl.textContent = count;
        if (btn) {
            btn.disabled = count == 0;
            btn.textContent = count == 0 ? 'Keine Tests ausgewählt' : `${count} Test${count > 1 ? 's' : ''} ausführen`;
        }

        const selectedTestIds = Array.from(checkboxes).map(cb => cb.dataset.testId);
        const selectedTests = this.state.tests.filter(test => selectedTestIds.includes(test.id));

        const renderList = (listEl) => {
            if (!listEl) return;
            if (count == 0) {
                listEl.innerHTML = '<div class="selected-tests-header">Markierte Tests:</div><p class="info-text-empty">Keine Tests ausgewählt</p>';
                return;
            }
            listEl.innerHTML = `
                <div class="selected-tests-header">Markierte Tests: (${count})</div>
                <ul class="selected-tests-items">
                    ${selectedTests.map(test => `
                        <li class="selected-test-item">
                            <span class="selected-test-icon">${this.getTestCategoryIcon(test.category)}</span>
                            <span class="selected-test-name">${this.escapeHtml(test.name)}</span>
                            <button class="remove-test-btn" data-test-id="${test.id}" title="Entfernen">x</button>
                        </li>
                    `).join('')}
                </ul>
            `;

            listEl.querySelectorAll('.remove-test-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const testId = btn.dataset.testId;
                    const checkbox = document.querySelector(`.test-item-checkbox[data-test-id="${testId}"]`);
                    if (checkbox) {
                        checkbox.checked = false;
                        this.updateSelectedTestsCount();
                    }
                });
            });
        };

        renderList(document.getElementById('selected-tests-list'));
        renderList(document.getElementById('single-selected-tests'));
        renderList(document.getElementById('batch-selected-tests'));

        this.updateActionButtons();
    },

    getTestCategoryIcon(category) {
        const categoryInfo = CONFIG.categories[category];
        return categoryInfo ? categoryInfo.icon : '📁';
    }
};
