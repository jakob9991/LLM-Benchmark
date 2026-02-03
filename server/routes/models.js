/**
 * Models API Routes
 */

const express = require('express');
const router = express.Router();
const { getAvailableProviders, isProviderAvailable, getProviderModels } = require('../providers');

// GET /api/models - Alle Provider und Modelle
router.get('/', async (req, res) => {
    try {
        const providers = await getAvailableProviders();
        res.json(providers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/models/:provider - Modelle eines Providers
router.get('/:provider', async (req, res) => {
    try {
        const available = await isProviderAvailable(req.params.provider);

        if (!available) {
            return res.status(503).json({
                error: `Provider '${req.params.provider}' ist nicht verfügbar`,
                available: false
            });
        }

        const models = await getProviderModels(req.params.provider);
        res.json({
            provider: req.params.provider,
            available: true,
            models
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/models/:provider/status - Status eines Providers
router.get('/:provider/status', async (req, res) => {
    try {
        const available = await isProviderAvailable(req.params.provider);
        res.json({
            provider: req.params.provider,
            available,
            checkedAt: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
