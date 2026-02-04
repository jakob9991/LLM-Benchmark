/**
 * Runs API Routes - Ergebnisse und History
 */

const express = require('express');
const router = express.Router();
const persistence = require('../services/persistence');
const { createManualCheckResult } = require('../services/evaluator');

// GET /api/runs - Alle Runs laden (mit Filtern)
router.get('/', async (req, res) => {
    try {
        const filters = {
            testId: req.query.testId,
            provider: req.query.provider,
            model: req.query.model,
            status: req.query.status,
            passed: req.query.passed === 'true' ? true : req.query.passed === 'false' ? false : undefined,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            includeWarmup: req.query.includeWarmup === 'true',
            includeDebug: req.query.includeDebug === 'true',
            limit: req.query.limit ? parseInt(req.query.limit) : 100
        };

        const runs = await persistence.filterRuns(filters);
        res.json({
            runs,
            total: runs.length,
            filters
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/runs/stats - Statistiken
router.get('/stats', async (req, res) => {
    try {
        const filters = {
            provider: req.query.provider,
            model: req.query.model,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            includeWarmup: req.query.includeWarmup === 'true'
        };

        const stats = await persistence.getStatistics(filters);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/runs/export - Export als JSON oder CSV
router.get('/export', async (req, res) => {
    try {
        const format = req.query.format || 'json';
        const filters = {
            testId: req.query.testId,
            provider: req.query.provider,
            model: req.query.model,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            includeWarmup: req.query.includeWarmup === 'true',
            includeDebug: req.query.includeDebug === 'true'
        };

        const data = await persistence.exportRuns(format, filters);

        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=benchmark-runs-${Date.now()}.csv`);
        } else {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=benchmark-runs-${Date.now()}.json`);
        }

        res.send(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/runs/:id - Einzelnen Run laden
router.get('/:id', async (req, res) => {
    try {
        const run = await persistence.getRun(req.params.id);

        if (!run) {
            return res.status(404).json({ error: 'Run nicht gefunden' });
        }

        res.json(run);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/runs/:id/evaluate - Manuellen Check hinzufügen
router.post('/:id/evaluate', async (req, res) => {
    try {
        const { passed, comment, criteria } = req.body;

        if (passed === undefined) {
            return res.status(400).json({ error: 'Pflichtfeld: passed (boolean)' });
        }

        const run = await persistence.getRun(req.params.id);
        if (!run) {
            return res.status(404).json({ error: 'Run nicht gefunden' });
        }

        const checkResult = createManualCheckResult(req.params.id, {
            passed,
            comment,
            criteria
        });

        const updatedRun = await persistence.updateRun(req.params.id, {
            checkResult,
            passed,
            evaluatedAt: new Date().toISOString()
        });

        res.json(updatedRun);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/runs - Alle Runs löschen
router.delete('/', async (req, res) => {
    try {
        // Sicherheitsabfrage via Query-Parameter
        if (req.query.confirm !== 'true') {
            return res.status(400).json({
                error: 'Bestätigung erforderlich. Füge ?confirm=true hinzu.'
            });
        }

        await persistence.clearRuns();
        res.json({ message: 'Alle Runs gelöscht' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
