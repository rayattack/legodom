// Import Tailwind CSS
import './app.css';

// Import Lego core (local source, so the example tracks the working tree)
import { Lego } from '../../../src/index.js';

// Import virtual module that auto-discovers and registers all .lego blocks
import 'virtual:lego-blocks';

// 10. Define SPA Routes
Lego.route('/', 'sample-block');
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
