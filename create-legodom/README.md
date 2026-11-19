# create-legodom

Scaffolding tool for LegoDOM applications.

## Usage

Create a new LegoDOM project with a single command:

```bash
npm create legodom@latest
```

Or specify a project name directly:

```bash
npm create legodom@latest my-app
```

Then follow the prompts!

## What Gets Created

The scaffolding tool sets up a complete LegoDOM project with:

- ✅ **Vite** configured with the LegoDOM plugin
- ✅ **Sample `.lego` component** following kebab-case naming conventions
- ✅ **Proper project structure** with `src/` directory
- ✅ **Development scripts** ready to use
- ✅ **All dependencies** pre-configured
- ✅ **Coding agent instructions**: `AGENTS.md` (read by Codex, Cursor, Copilot and others) and a `CLAUDE.md` that imports it

### Project Structure

```
my-app/
├── public/
│   └── lego.svg
├── src/
│   ├── my-app.lego      # Sample component
│   ├── app.js           # Entry point (app.ts for TypeScript)
│   └── style.css        # Global styles
├── AGENTS.md            # How to write LegoDOM, for coding agents
├── CLAUDE.md            # Points Claude Code at AGENTS.md
├── index.html
├── package.json
└── vite.config.js       # Pre-configured with LegoDOM plugin
```

## Next Steps

After scaffolding:

```bash
cd my-app
npm install
npm run dev
```

Your LegoDOM app will be running at `http://localhost:5173` 🚀

## Documentation

For complete documentation, visit [LegoDOM Documentation](https://github.com/rayattack/LegoDOM#readme).

## License

MIT
