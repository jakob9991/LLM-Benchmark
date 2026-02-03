/**
 * Tests API Routes
 */

const express = require('express');
const router = express.Router();
const persistence = require('../services/persistence');

// GET /api/tests - Alle Tests laden
router.get('/', async (req, res) => {
    try {
        const tests = await persistence.loadTests();

        // Filter nach Kategorie falls angegeben
        let filtered = tests;
        if (req.query.category) {
            filtered = tests.filter(t => t.category === req.query.category);
        }
        if (req.query.difficulty) {
            filtered = filtered.filter(t => t.difficulty === req.query.difficulty);
        }

        res.json({
            tests: filtered,
            total: filtered.length,
            categories: [...new Set(tests.map(t => t.category))],
            difficulties: [...new Set(tests.map(t => t.difficulty))]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/tests/:id - Einzelnen Test laden
router.get('/:id', async (req, res) => {
    try {
        const tests = await persistence.loadTests();
        const test = tests.find(t => t.id === req.params.id);

        if (!test) {
            return res.status(404).json({ error: 'Test nicht gefunden' });
        }

        res.json(test);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/tests - Neuen Test erstellen
router.post('/', async (req, res) => {
    try {
        const tests = await persistence.loadTests();

        const newTest = {
            id: `test-${Date.now()}`,
            createdAt: new Date().toISOString(),
            ...req.body
        };

        // Validierung
        if (!newTest.name || !newTest.promptTemplate || !newTest.input) {
            return res.status(400).json({
                error: 'Pflichtfelder fehlen: name, promptTemplate, input'
            });
        }

        tests.push(newTest);
        await persistence.saveTests(tests);

        res.status(201).json(newTest);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/tests/:id - Test aktualisieren
router.put('/:id', async (req, res) => {
    try {
        const tests = await persistence.loadTests();
        const index = tests.findIndex(t => t.id === req.params.id);

        if (index === -1) {
            return res.status(404).json({ error: 'Test nicht gefunden' });
        }

        tests[index] = {
            ...tests[index],
            ...req.body,
            id: req.params.id, // ID nicht überschreiben
            updatedAt: new Date().toISOString()
        };

        await persistence.saveTests(tests);
        res.json(tests[index]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/tests/:id - Test löschen
router.delete('/:id', async (req, res) => {
    try {
        const tests = await persistence.loadTests();
        const filtered = tests.filter(t => t.id !== req.params.id);

        if (filtered.length === tests.length) {
            return res.status(404).json({ error: 'Test nicht gefunden' });
        }

        await persistence.saveTests(filtered);
        res.json({ message: 'Test gelöscht' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
