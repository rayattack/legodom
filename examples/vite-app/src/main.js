// Import Tailwind CSS
import './app.css';

// Import Lego core
import { Lego } from 'lego-dom/main.js';

// Import virtual module that auto-discovers and registers all .lego components
import registerComponents from 'virtual:lego-components';

// Register all auto-discovered components
registerComponents();

// 10. Define SPA Routes
Lego.route('/', 'sample-component');
Lego.route('/todo', 'todo-list');
Lego.route('/card', 'greeting-card');

// 11. Optional: Add a middleware example
Lego.route('/admin', 'admin-panel', async (params, globals) => {
  console.log('Checking permissions for', params);
  return globals.isLoggedIn;
});

// Initialize Lego
console.log('Lego initialized with SPA routes!');
