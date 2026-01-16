// Import Tailwind CSS
import './app.css';

// Import Lego core (local for testing)
import { Lego } from '../../../lego.js';

// Import virtual module that auto-discovers and registers all .lego components
import registerComponents from 'virtual:lego-components';

// Register all auto-discovered components
registerComponents();

// 10. Define SPA Routes
Lego.route('/', 'sample-component');
Lego.route('/todo', 'todo-list');
Lego.route('/card', 'user-card');
Lego.route('/customers/:id/orders', 'customer-orders');
Lego.route('/customers/:id/details', 'customer-details');

// 11. Optional: Add a middleware example
Lego.route('/admin', 'admin-panel', async (params, globals) => {
  console.log('Checking permissions for', params);
  return globals.isLoggedIn;
});

// Initialize Lego
await Lego.init(document.body, {
  tailwind: ['/src/app.css']
})
