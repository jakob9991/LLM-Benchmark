export const navigation = {
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
        console.log('[Navigation] Switching to view:', viewName);
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === viewName);
        });
        document.querySelectorAll('.view').forEach(view => {
            view.classList.toggle('active', view.id === `${viewName}-view`);
        });

        // View-spezifische Aktionen
        if (viewName === 'runs') {
            console.log('[Navigation] Loading runs...');
            this.loadRuns();
        }
        if (viewName === 'metrics') {
            console.log('[Navigation] Loading stats...');
            this.loadStats();
        }
    }
};

