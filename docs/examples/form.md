# Form Example

Handling forms in LegoDOM.

## Login Form

A simple login form using `b-sync` for two-way binding and `@submit.prevent` to handle form submission without page reload.

```html
<!-- Define the template with inline logic via b-logic -->
<template b-id="login-form" b-logic="{
  email: '',
  password: '',
  error: '',

  login() {
    if (!this.email || !this.password) {
      this.error = 'Please fill in all fields';
      return;
    }
    alert('Logging in as ' + this.email);
    this.error = '';
  }
}">
  <style>
    self { display: block; max-width: 400px; }
    form { display: flex; flex-direction: column; gap: 1rem; }
    label { display: block; margin-bottom: 0.25rem; font-weight: 600; }
    input { width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; }
    button { padding: 0.75rem; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; }
    .error { color: red; margin: 0; }
  </style>

  <form @submit.prevent="login()">
    <div>
      <label>Email:</label>
      <input type="email" b-sync="email">
    </div>

    <div>
      <label>Password:</label>
      <input type="password" b-sync="password">
    </div>

    <p b-show="error" class="error">[[ error ]]</p>

    <button type="submit">Login</button>
  </form>
</template>

<!-- Use it -->
<login-form></login-form>
```

### Alternative: Using `Lego.block()`

You can also define the form programmatically using the full `Lego.block()` signature:

```js
Lego.block('login-form', `
  <style>
    self { display: block; max-width: 400px; }
    .error { color: red; }
  </style>
  <form @submit.prevent="login()">
    <div>
      <label>Email:</label>
      <input type="email" b-sync="email">
    </div>
    <div>
      <label>Password:</label>
      <input type="password" b-sync="password">
    </div>
    <p b-show="error" class="error">[[ error ]]</p>
    <button type="submit">Login</button>
  </form>
`, {
  email: '',
  password: '',
  error: '',

  login() {
    if (!this.email || !this.password) {
      this.error = 'Please fill in all fields';
      return;
    }
    alert('Logging in as ' + this.email);
    this.error = '';
  }
});
```

::: tip Lego.block() Signature
`Lego.block(tagName, templateHTML, logic, styles, cascade, error)`

The second argument is always the template HTML string. The third is the logic object.
:::

## Form with Validation

A more complete form with field-level validation:

```html
<template b-id="signup-form" b-logic="{
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  errors: {},
  submitted: false,

  validate() {
    this.errors = {};
    if (this.username.length < 3) {
      this.errors.username = 'Username must be at least 3 characters';
    }
    if (!this.email.includes('@')) {
      this.errors.email = 'Please enter a valid email';
    }
    if (this.password.length < 8) {
      this.errors.password = 'Password must be at least 8 characters';
    }
    if (this.password !== this.confirmPassword) {
      this.errors.confirmPassword = 'Passwords do not match';
    }
    return Object.keys(this.errors).length === 0;
  },

  submit() {
    if (this.validate()) {
      this.submitted = true;
    }
  }
}">
  <style>
    self { display: block; max-width: 400px; }
    form { display: flex; flex-direction: column; gap: 1rem; }
    label { display: block; font-weight: 600; }
    input { width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; }
    .field-error { color: red; font-size: 0.85rem; margin-top: 0.25rem; }
    button { padding: 0.75rem; background: #333; color: white; border: none; border-radius: 4px; cursor: pointer; }
    .success { background: #d4edda; color: #155724; padding: 1rem; border-radius: 4px; }
  </style>

  <div b-show="!submitted">
    <h2>Sign Up</h2>
    <form @submit.prevent="submit()">
      <div>
        <label>Username</label>
        <input b-sync="username" placeholder="At least 3 characters">
        <p b-show="errors.username" class="field-error">[[ errors.username ]]</p>
      </div>
      <div>
        <label>Email</label>
        <input type="email" b-sync="email">
        <p b-show="errors.email" class="field-error">[[ errors.email ]]</p>
      </div>
      <div>
        <label>Password</label>
        <input type="password" b-sync="password" placeholder="At least 8 characters">
        <p b-show="errors.password" class="field-error">[[ errors.password ]]</p>
      </div>
      <div>
        <label>Confirm Password</label>
        <input type="password" b-sync="confirmPassword">
        <p b-show="errors.confirmPassword" class="field-error">[[ errors.confirmPassword ]]</p>
      </div>
      <button type="submit">Create Account</button>
    </form>
  </div>

  <div b-show="submitted" class="success">
    <h3>Account Created!</h3>
    <p>Welcome, [[ username ]]!</p>
    <button @click="submitted = false">Back to form</button>
  </div>
</template>
```

## Key Concepts

### Two-Way Binding with `b-sync`

`b-sync` binds a form input to a state property. Changes to the input update the state, and state changes update the input.

```html
<input b-sync="email">           <!-- text input -->
<textarea b-sync="message"></textarea>  <!-- textarea -->
<select b-sync="country">        <!-- select dropdown -->
<input type="checkbox" b-sync="agreed"> <!-- checkbox (boolean) -->
```

### Preventing Default Submission

Use the `.prevent` modifier on `@submit` to stop the browser from reloading the page:

```html
<form @submit.prevent="handleSubmit()">
```

### Showing Validation Errors

Use `b-show` to conditionally display error messages:

```html
<p b-show="errors.email">[[ errors.email ]]</p>
```

## Next Steps

- See [Directives Guide](/guide/directives) for all available directives
- Learn about [Persistence](/guide/persistence) to save form data across sessions
- Try the [Todo App](/examples/todo-app) example
