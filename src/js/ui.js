// Deprecated shim: UI is now split into ES modules under src/js/ui/.
// Keep this file for legacy imports/debugging.
import { UI } from './ui/index.js';

export { UI };
window.UI = UI;
