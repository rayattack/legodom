# Quick Start

The fastest way to get started with Lego is using the CDN. No build tools required!

## 1. Create an HTML file

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Lego Quick Start</title>
</head>
<body>
    <!-- Interpolation works here too -->
    <hello-world name="Lego"></hello-world>

    <!-- 3. Define the template -->
    <template b-id="hello-world">
        <style>
            h1 { color: #646cff; }
        </style>
        <h1>Hello [[ name ]]!</h1>
        <button @click="count++">Count is [[ count ]]</button>
    </template>

    <!-- 4. Load Lego -->
    <script src="https://unpkg.com/lego-dom/main.js"></script>
    
    <!-- 5. Define logic & Init -->
    <script>
        document.querySelector('hello-world').state = {
            name: 'World',
            toggle() {
                this.name = this.name === 'World' ? 'Lego' : 'World';
            }
        };

        // Start the engine
        Lego.init();
    </script>
</body>
</html>
```

## Next Steps

- Explore [Core Concepts](/guide/components)
- Check out the [API Reference](/api/)
