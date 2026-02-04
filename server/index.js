/**
 * LLM Benchmark Tester - Backend Server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const testsRouter = require('./routes/tests');
const modelsRouter = require('./routes/models');
const runnerRouter = require('./routes/runner');
const runsRouter = require('./routes/runs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Statische Dateien (Frontend)
app.use(express.static(path.join(__dirname, '..')));

// API Routes
app.use('/api/tests', testsRouter);
app.use('/api/models', modelsRouter);
app.use('/api/runner', runnerRouter);
app.use('/api/runs', runsRouter);

// Health Check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: require('../package.json').version
    });
});

// Error Handler
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║     LLM Benchmark Tester - Server Started     ║
╠═══════════════════════════════════════════════╣
║  URL: http://localhost:${PORT}                   ║
║  API: http://localhost:${PORT}/api               ║
║  Tailscale: http://100.125.60.111:${PORT}        ║
╚═══════════════════════════════════════════════╝
    `);

    // Zeige Konfigurationsstatus
    console.log('Konfiguration:');
    console.log(`  - OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✓ gesetzt' : '✗ nicht gesetzt'}`);
    console.log(`  - Ollama URL: ${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}`);
    console.log('');
});
