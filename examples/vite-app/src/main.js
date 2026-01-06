// Import LegoJS core
import { Lego } from 'lego-dom/main.js';

// Import virtual module that auto-discovers and registers all .lego components
import registerComponents from 'virtual:lego-components';

// Register all auto-discovered components
registerComponents();

// Initialize LegoJS
console.log('LegoJS initialized with auto-discovered components!');
