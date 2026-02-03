/**
 * Evaluator Service - Automatische und manuelle Bewertung von Outputs
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Whitelist für erlaubte Commands (Sicherheit)
const ALLOWED_COMMANDS = ['node', 'python', 'python3', 'npm', 'eslint', 'tsc', 'java', 'javac'];

// Temporäres Verzeichnis für Output-Dateien
const OUTPUT_DIR = path.join(__dirname, '../../data/outputs');

/**
 * Führt einen Auto-Check aus
 * @param {string} output - Der Output vom LLM
 * @param {Object} test - Test-Definition
 * @returns {Promise<{passed: boolean, details: Object}>}
 */
async function runAutoCheck(output, test) {
    const result = {
        passed: false,
        checkType: null,
        details: {},
        error: null
    };

    // Wenn kein Check definiert, prüfe nur expected
    if (!test.checkCommand && !test.expected) {
        result.checkType = 'none';
        result.passed = true;
        result.details.message = 'Kein Auto-Check definiert';
        return result;
    }

    // Prüfe expected Pattern zuerst (falls kein Command)
    if (test.expected && !test.checkCommand) {
        result.checkType = 'pattern';
        return await checkExpected(output, test.expected, result);
    }

    // Führe Command aus (falls definiert)
    if (test.checkCommand) {
        result.checkType = 'command';
        return await runCheckCommand(output, test, result);
    }

    return result;
}

/**
 * Prüft ob der Output dem erwarteten Pattern entspricht
 */
async function checkExpected(output, expected, result) {
    try {
        // Multi-Check Support: Array von Checks (alle müssen passen)
        if (Array.isArray(expected)) {
            result.details = { checks: [] };
            let allPassed = true;

            for (const check of expected) {
                const checkResult = await checkSingleExpected(output, check);
                result.details.checks.push(checkResult);
                if (!checkResult.passed) allPassed = false;
            }

            result.passed = allPassed;
            return result;
        }

        // Single Check
        return await checkSingleExpected(output, expected, result);
    } catch (error) {
        result.error = error.message;
    }

    return result;
}

/**
 * Einzelner Check
 */
async function checkSingleExpected(output, expected, result = { passed: false, details: {} }) {
    try {
        switch (expected.type) {
            case 'contains':
                result.passed = output.includes(expected.value);
                result.details = {
                    type: 'contains',
                    expected: expected.value,
                    found: result.passed
                };
                break;

            case 'not_contains':
                result.passed = !output.includes(expected.value);
                result.details = {
                    type: 'not_contains',
                    forbidden: expected.value,
                    found: !result.passed,
                    passed: result.passed
                };
                break;

            case 'regex':
            case 'output':
                const regex = new RegExp(expected.pattern || expected.value, expected.flags || 's');
                result.passed = regex.test(output);
                result.details = {
                    type: 'regex',
                    pattern: expected.pattern || expected.value,
                    found: result.passed
                };
                break;

            case 'not_regex':
                const notRegex = new RegExp(expected.pattern || expected.value, expected.flags || 's');
                result.passed = !notRegex.test(output);
                result.details = {
                    type: 'not_regex',
                    forbidden_pattern: expected.pattern || expected.value,
                    found: !result.passed,
                    passed: result.passed
                };
                break;

            case 'exact':
                result.passed = output.trim() === expected.value.trim();
                result.details = {
                    type: 'exact',
                    expected: expected.value,
                    actual: output.substring(0, 200)
                };
                break;

            default:
                result.error = `Unbekannter expected type: ${expected.type}`;
        }
    } catch (error) {
        result.error = error.message;
    }

    return result;
}

/**
 * Führt einen Check-Command aus
 */
async function runCheckCommand(output, test, result) {
    try {
        // Erstelle temporäre Datei für den Output
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
        const outputFile = path.join(OUTPUT_DIR, `output_${uuidv4()}.${getFileExtension(test)}`);

        // Schreibe Output in Datei
        await fs.writeFile(outputFile, output);

        // Ersetze Placeholder im Command
        let command = test.checkCommand.replace(/\{\{OUTPUT_FILE\}\}/g, outputFile);

        // Parse Command
        const parts = command.split(' ');
        const cmd = parts[0];
        const args = parts.slice(1);

        // Sicherheitscheck: Nur erlaubte Commands
        if (!ALLOWED_COMMANDS.includes(cmd)) {
            result.error = `Command '${cmd}' ist nicht erlaubt. Erlaubt: ${ALLOWED_COMMANDS.join(', ')}`;
            await cleanupFile(outputFile);
            return result;
        }

        // Führe Command aus
        const execResult = await executeCommand(cmd, args, {
            timeout: 30000, // 30 Sekunden Timeout
            cwd: OUTPUT_DIR
        });

        result.details = {
            command: command,
            exitCode: execResult.exitCode,
            stdout: execResult.stdout,
            stderr: execResult.stderr,
            duration: execResult.duration
        };

        // Prüfe Exit Code
        if (test.expected && test.expected.type === 'exitcode') {
            result.passed = execResult.exitCode === test.expected.value;
        } else if (test.expected && (test.expected.type === 'output' || test.expected.type === 'regex')) {
            // Prüfe stdout gegen Pattern
            const regex = new RegExp(test.expected.pattern, test.expected.flags || '');
            result.passed = regex.test(execResult.stdout);
            result.details.patternMatched = result.passed;
        } else {
            // Default: Exit Code 0 = Success
            result.passed = execResult.exitCode === 0;
        }

        // Cleanup
        await cleanupFile(outputFile);

    } catch (error) {
        result.error = error.message;
    }

    return result;
}

/**
 * Führt einen Shell-Command aus
 */
function executeCommand(cmd, args, options = {}) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        let stdout = '';
        let stderr = '';

        const proc = spawn(cmd, args, {
            cwd: options.cwd,
            timeout: options.timeout,
            shell: process.platform === 'win32'
        });

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            resolve({
                exitCode: code,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                duration: Date.now() - startTime
            });
        });

        proc.on('error', (err) => {
            resolve({
                exitCode: -1,
                stdout: '',
                stderr: err.message,
                duration: Date.now() - startTime
            });
        });

        // Timeout Handler
        if (options.timeout) {
            setTimeout(() => {
                proc.kill();
                resolve({
                    exitCode: -1,
                    stdout,
                    stderr: 'Timeout exceeded',
                    duration: options.timeout
                });
            }, options.timeout);
        }
    });
}

/**
 * Ermittelt Dateiendung basierend auf Test
 */
function getFileExtension(test) {
    if (test.checkCommand) {
        if (test.checkCommand.startsWith('python')) return 'py';
        if (test.checkCommand.startsWith('node')) return 'js';
        if (test.checkCommand.startsWith('java')) return 'java';
        if (test.checkCommand.includes('tsc')) return 'ts';
    }
    return 'txt';
}

/**
 * Löscht temporäre Datei
 */
async function cleanupFile(filePath) {
    try {
        await fs.unlink(filePath);
    } catch (e) {
        // Ignoriere Fehler beim Löschen
    }
}

/**
 * Speichert manuelles Check-Ergebnis
 * @param {string} runId - Run ID
 * @param {Object} manualResult - {passed: boolean, comment: string, criteria: Object}
 */
function createManualCheckResult(runId, manualResult) {
    return {
        runId,
        checkType: 'manual',
        passed: manualResult.passed,
        details: {
            comment: manualResult.comment || '',
            criteria: manualResult.criteria || {},
            evaluatedAt: new Date().toISOString(),
            evaluatedBy: manualResult.evaluatedBy || 'user'
        }
    };
}

module.exports = {
    runAutoCheck,
    createManualCheckResult,
    ALLOWED_COMMANDS
};
