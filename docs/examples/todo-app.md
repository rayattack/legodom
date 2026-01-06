# Todo App Example

A complete todo application demonstrating LegoJS features.

## Live Demo

<iframe src="/demos/todo-app.html" style="width:100%;height:500px;border:1px solid #ddd;border-radius:4px;"></iframe>

## Full Source Code

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Todo App - LegoJS</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 600px;
      margin: 2rem auto;
      padding: 0 1rem;
      background: #f5f5f5;
    }
    h1 {
      text-align: center;
      color: #333;
    }
  </style>
</head>
<body>
  <h1>📝 Todo App</h1>
  
  <todo-app></todo-app>

  <script src="https://unpkg.com/lego-dom/main.js"></script>
  
  <template b-id="todo-app">
    <style>
      self {
        display: block;
        background: white;
       border-radius: 8px;
        padding: 1.5rem;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      
      .input-group {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
      }
      
      input[type="text"] {
        flex: 1;
        padding: 0.75rem;
        font-size: 1rem;
        border: 2px solid #e0e0e0;
        border-radius: 4px;
      }
      
      input[type="text"]:focus {
        outline: none;
        border-color: #4CAF50;
      }
      
      .btn {
        padding: 0.75rem 1.5rem;
        font-size: 1rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
        transition: background 0.2s;
      }
      
      .btn-primary {
        background: #4CAF50;
        color: white;
      }
      
      .btn-primary:hover {
        background: #45a049;
      }
      
      .filters {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
      }
      
      .filter-btn {
        padding: 0.5rem 1rem;
        background: #f0f0f0;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
      
      .filter-btn.active {
        background: #4CAF50;
        color: white;
      }
      
      ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      
      li {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem;
        border-bottom: 1px solid #f0f0f0;
        transition: background 0.2s;
      }
      
      li:hover {
        background: #f9f9f9;
      }
      
      input[type="checkbox"] {
        width: 20px;
        height: 20px;
        cursor: pointer;
      }
      
      .todo-text {
        flex: 1;
        font-size: 1rem;
      }
      
      .todo-text.done {
        text-decoration: line-through;
        color: #999;
      }
      
      .delete-btn {
        padding: 0.25rem 0.5rem;
        background: #f44336;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.875rem;
      }
      
      .delete-btn:hover {
        background: #da190b;
      }
      
      .stats {
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 2px solid #f0f0f0;
        display: flex;
        justify-content: space-between;
        color: #666;
        font-size: 0.875rem;
      }
      
      .clear-completed {
        background: none;
        border: none;
        color: #f44336;
        cursor: pointer;
        text-decoration: underline;
      }
    </style>
    
    <div class="input-group">
      <input 
        type="text"
        b-sync="newTodo" 
        placeholder="What needs to be done?"
        @keyup="event.key === 'Enter' && addTodo()">
      <button class="btn btn-primary" @click="addTodo()">Add</button>
    </div>
    
    <div class="filters">
      <button 
        class="filter-btn {{ filter === 'all' ? 'active' : '' }}"
        @click="filter = 'all'">
        All
      </button>
      <button 
        class="filter-btn {{ filter === 'active' ? 'active' : '' }}"
        @click="filter = 'active'">
        Active
      </button>
      <button 
        class="filter-btn {{ filter === 'completed' ? 'active' : '' }}"
        @click="filter = 'completed'">
        Completed
      </button>
    </div>
    
    <ul>
      <li b-for="todo in filteredTodos()">
        <input type="checkbox" b-sync="todo.done">
        <span class="todo-text {{ todo.done ? 'done' : '' }}">
          {{ todo.text }}
        </span>
        <button class="delete-btn" @click="deleteTodo(todo)">Delete</button>
      </li>
    </ul>
    
    <div class="stats">
      <span>{{ remaining() }} item{{ remaining() === 1 ? '' : 's' }} left</span>
      <button 
        class="clear-completed" 
        b-if="completedCount() > 0"
        @click="clearCompleted()">
        Clear completed ({{ completedCount() }})
      </button>
    </div>
  </template>

  <script>
    Lego.define('todo-app', 
      document.querySelector('template[b-id="todo-app"]').innerHTML, 
      {
        newTodo: '',
        filter: 'all',
        todos: [],
        
        mounted() {
          // Load from localStorage
          const saved = localStorage.getItem('legojs-todos');
          if (saved) {
            this.todos = JSON.parse(saved);
          }
        },
        
        updated() {
          // Save to localStorage
          localStorage.setItem('legojs-todos', JSON.stringify(this.todos));
        },
        
        addTodo() {
          if (this.newTodo.trim()) {
            this.todos.push({
              id: Date.now(),
              text: this.newTodo,
              done: false
            });
            this.newTodo = '';
          }
        },
        
        deleteTodo(todo) {
          const index = this.todos.indexOf(todo);
          if (index > -1) {
            this.todos.splice(index, 1);
          }
        },
        
        filteredTodos() {
          if (this.filter === 'active') {
            return this.todos.filter(t => !t.done);
          } else if (this.filter === 'completed') {
            return this.todos.filter(t => t.done);
          }
          return this.todos;
        },
        
        remaining() {
          return this.todos.filter(t => !t.done).length;
        },
        
        completedCount() {
          return this.todos.filter(t => t.done).length;
        },
        
        clearCompleted() {
          this.todos = this.todos.filter(t => !t.done);
        }
      }
    );
  </script>
</body>
</html>
```

## Features Demonstrated

### ✅ Reactivity
- Auto-updates when todos change
- Two-way binding with `b-sync`
- Computed values (`remaining()`, `completedCount()`)

### ✅ List Rendering
- `b-for` to iterate over todos
- Dynamic filtering based on status

### ✅ Event Handling
- Add on Enter key
- Click to complete/delete
- Filter buttons

### ✅ Lifecycle Hooks
- `mounted()` - Load from localStorage
- `updated()` - Save to localStorage

### ✅ Conditional Rendering
- Show/hide "Clear completed" button
- Different styles for completed items

### ✅ Methods
- `addTodo()` - Add new item
- `deleteTodo()` - Remove item
- `filteredTodos()` - Filter logic
- `clearCompleted()` - Batch delete

## Key Concepts

### Local Storage Persistence

```js
mounted() {
  const saved = localStorage.getItem('legojs-todos');
  if (saved) {
    this.todos = JSON.parse(saved);
  }
},

updated() {
  localStorage.setItem('legojs-todos', JSON.stringify(this.todos));
}
```

### Filtering

```js
filteredTodos() {
  if (this.filter === 'active') {
    return this.todos.filter(t => !t.done);
  } else if (this.filter === 'completed') {
    return this.todos.filter(t => t.done);
  }
  return this.todos;
}
```

### Array Manipulation

```js
// Add
this.todos.push({ ... });

// Remove
this.todos.splice(index, 1);

// Filter (reassign)
this.todos = this.todos.filter(t => !t.done);
```

## Try It Yourself

1. Copy the code above
2. Save as `todo.html`
3. Open in a browser
4. Add todos, mark as complete, filter, delete
5. Refresh—todos persist!

## Extensions

Try adding these features:

- **Edit mode** - Double click to edit todo text
- **Due dates** - Add date picker and sort by date
- **Categories** - Organize todos into lists
- **Drag & drop** - Reorder todos
- **Export/Import** - Download/upload todo list

## Next Steps

- See [Routing Example](/examples/routing)
- Learn about [Form Validation](/examples/form)
- Explore [SFC Showcase](/examples/sfc-showcase)
