# Routing Example

A multi-page application demonstrating client-side routing.

## Full Source Code

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Routing Demo - LegoJS</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      margin: 0;
      padding: 0;
    }
    
    nav {
      background: #333;
      padding: 1rem;
      display: flex;
      gap: 1rem;
    }
    
    nav a {
      color: white;
      text-decoration: none;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      transition: background 0.2s;
    }
    
    nav a:hover {
      background: #555;
    }
    
    nav a.active {
      background: #4CAF50;
    }
    
    main {
      padding: 2rem;
      max-width: 800px;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  <nav>
    <a href="/" b-link>Home</a>
    <a href="/about" b-link>About</a>
    <a href="/users" b-link>Users</a>
    <a href="/contact" b-link>Contact</a>
  </nav>
  
  <main>
    <lego-router></lego-router>
  </main>

  <script src="https://unpkg.com/lego-dom/main.js"></script>
  
  <!-- Home Page -->
  <template b-id="home-page">
    <style>
      self { display: block; }
      .hero {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 3rem;
        border-radius: 8px;
        text-align: center;
      }
      .features {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin-top: 2rem;
      }
      .feature {
        padding: 1.5rem;
        background: #f5f5f5;
        border-radius: 8px;
      }
    </style>
    
    <div class="hero">
      <h1>Welcome to LegoJS Routing Demo</h1>
      <p>Navigate between pages using client-side routing</p>
    </div>
    
    <div class="features">
      <div class="feature">
        <h3>🚀 Fast</h3>
        <p>No page reloads, instant navigation</p>
      </div>
      <div class="feature">
        <h3>📦 Simple</h3>
        <p>Built-in router, no dependencies</p>
      </div>
      <div class="feature">
        <h3>🎨 Clean URLs</h3>
        <p>No hash-based routing, real paths</p>
      </div>
    </div>
  </template>
  
  <!-- About Page -->
  <template b-id="about-page">
    <style>
      self { display: block; }
    </style>
    
    <h1>About LegoJS</h1>
    <p>LegoJS is a tiny, zero-dependency JavaScript library for building reactive Web Components.</p>
    
    <h2>Features</h2>
    <ul>
      <li>Zero dependencies</li>
      <li>Under 500 lines of code</li>
      <li>True reactivity with Proxies</li>
      <li>Shadow DOM encapsulation</li>
      <li>Built-in routing</li>
    </ul>
    
    <p><a href="/users/1" b-link>View User #1</a></p>
  </template>
  
  <!-- Users List Page -->
  <template b-id="users-page">
    <style>
      self { display: block; }
      .user-card {
        padding: 1rem;
        margin: 0.5rem 0;
        background: #f9f9f9;
        border-radius: 4px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .user-card a {
        color: #4CAF50;
        text-decoration: none;
        font-weight: 600;
      }
    </style>
    
    <h1>Users</h1>
    
    <div class="user-card" b-for="user in users">
      <div>
        <strong>{{ user.name }}</strong>
        <p style="margin:0;color:#666;">{{ user.email }}</p>
      </div>
      <a href="/users/{{ user.id }}" b-link>View Profile →</a>
    </div>
  </template>
  
  <!-- User Profile Page (Dynamic Route) -->
  <template b-id="user-profile">
    <style>
      self { display: block; }
      .profile {
        background: white;
        padding: 2rem;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      .loading {
        text-align: center;
        padding: 2rem;
        color: #666;
      }
    </style>
    
    <div b-if="loading" class="loading">
      Loading user...
    </div>
    
    <div b-if="!loading && user" class="profile">
      <h1>{{ user.name }}</h1>
      <p><strong>Email:</strong> {{ user.email }}</p>
      <p><strong>Phone:</strong> {{ user.phone }}</p>
      <p><strong>Website:</strong> {{ user.website }}</p>
      
      <hr>
      
      <h3>Address</h3>
      <p>
        {{ user.address.street }}<br>
        {{ user.address.city }}, {{ user.address.zipcode }}
      </p>
      
      <p><a href="/users" b-link>← Back to users</a></p>
    </div>
  </template>
  
  <!-- Contact Page -->
  <template b-id="contact-page">
    <style>
      self { display: block; }
      form {
        background: white;
        padding: 2rem;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      .form-group {
        margin-bottom: 1rem;
      }
      label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 600;
      }
      input, textarea {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 1rem;
      }
      button {
        background: #4CAF50;
        color: white;
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
      }
      .success {
        background: #d4edda;
        color: #155724;
        padding: 1rem;
        border-radius: 4px;
        margin-top: 1rem;
      }
    </style>
    
    <h1>Contact Us</h1>
    
    <form b-if="!submitted" @submit="handleSubmit(event)">
      <div class="form-group">
        <label>Name</label>
        <input b-sync="form.name" required>
      </div>
      
      <div class="form-group">
        <label>Email</label>
        <input type="email" b-sync="form.email" required>
      </div>
      
      <div class="form-group">
        <label>Message</label>
        <textarea b-sync="form.message" rows="5" required></textarea>
      </div>
      
      <button type="submit">Send Message</button>
    </form>
    
    <div b-if="submitted" class="success">
      <h3>✅ Message Sent!</h3>
      <p>Thank you for contacting us, {{ form.name }}. We'll respond to {{ form.email }} soon.</p>
      <button @click="submitted = false">Send Another</button>
    </div>
  </template>

  <script>
    // Define routes
    Lego.route('/', 'home-page');
    Lego.route('/about', 'about-page');
    Lego.route('/users', 'users-page');
    Lego.route('/users/:id', 'user-profile');
    Lego.route('/contact', 'contact-page');
    
    // Users page component
    Lego.define('users-page', 
      document.querySelector('template[b-id="users-page"]').innerHTML, {
        users: [],
        
        async mounted() {
          const response = await fetch('https://jsonplaceholder.typicode.com/users');
          this.users = await response.json();
        }
      }
    );
    
    // User profile component (dynamic route)
    Lego.define('user-profile',
      document.querySelector('template[b-id="user-profile"]').innerHTML, {
        loading: true,
        user: null,
        
        async mounted() {
          const userId = Lego.globals.params.id;
          const response = await fetch(`https://jsonplaceholder.typicode.com/users/${userId}`);
          this.user = await response.json();
          this.loading = false;
        }
      }
    );
    
    // Contact page component
    Lego.define('contact-page',
      document.querySelector('template[b-id="contact-page"]').innerHTML, {
        form: {
          name: '',
          email: '',
          message: ''
        },
        submitted: false,
        
        handleSubmit(event) {
          event.preventDefault();
          this.submitted = true;
        }
      }
    );
    
    // Update active nav link on route change
    window.addEventListener('popstate', updateActiveLink);
    updateActiveLink();
    
    function updateActiveLink() {
      document.querySelectorAll('nav a[b-link]').forEach(link => {
        const isActive = link.getAttribute('href') === window.location.pathname;
        link.classList.toggle('active', isActive);
      });
    }
  </script>
</body>
</html>
```

## Features Demonstrated

### ✅ Multiple Routes
- `/` - Home page
- `/about` - About page
- `/users` - Users list
- `/users/:id` - Dynamic user profile
- `/contact` - Contact form

### ✅ Dynamic Routes
Access parameters via `Lego.globals.params`:

```js
const userId = Lego.globals.params.id;
```

### ✅ Data Fetching
Fetch data in `mounted()` hook:

```js
async mounted() {
  const response = await fetch('https://api.example.com/users');
  this.users = await response.json();
}
```

### ✅ Active Link Styling
Highlight current page in navigation.

### ✅ Loading States
Show spinner while fetching data.

## Key Concepts

### Route Definition

```js
Lego.route('/', 'home-page');
Lego.route('/users/:id', 'user-profile');
```

### Accessing Route Params

```js
{
  mounted() {
    const userId = Lego.globals.params.id;
    this.fetchUser(userId);
  }
}
```

### Navigation

```html
<a href="/about" b-link>About</a>
```

## Try It Yourself

1. Copy the code above
2. Save as `routing-demo.html`
3. Open in a browser  
4. Click links—no page reload!
5. Use browser back/forward buttons

## Next Steps

- See [Todo App Example](/examples/todo-app)
- Learn about [Routing Guide](/guide/routing)
- Try [Form Validation Example](/examples/form)
