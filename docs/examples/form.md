# Form Example

Handling forms in Lego.

## Live Demo

```html
<template b-id="login-form">
  <form @submit.prevent="login()">
    <div>
      <label>Email:</label>
      <input type="email" b-sync="email">
    </div>
    
    <div>
      <label>Password:</label>
      <input type="password" b-sync="password">
    </div>
    
    <p b-if="error" style="color: red">{{ error }}</p>
    
    <button type="submit">Login</button>
  </form>
</template>

<script>
  Lego.define('login-form', {
    email: '',
    password: '',
    error: '',
    
    login() {
      if (!this.email || !this.password) {
        this.error = 'Please fill in all fields';
        return;
      }
      alert(`Logging in as ${this.email}`);
      this.error = '';
    }
  });
</script>
```
