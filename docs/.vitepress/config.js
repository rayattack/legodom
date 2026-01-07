import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Lego',
  description: 'A feature-rich web components + SFC frontend framework',
  base: '/legodom/',

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'API', link: '/api/' },
      { text: 'Examples', link: '/examples/' },
      { text: 'Router', link: '/router/' },
      {
        text: 'v0.0.7',
        items: [
          { text: 'Changelog', link: 'https://github.com/rayattack/LegoJS/releases' }

        ]
      }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is Lego?', link: '/guide/' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Quick Start', link: '/guide/quick-start' },
            { text: 'Contributing', link: '/guide/contributing' }
          ]
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Components', link: '/guide/components' },
            { text: 'Templating', link: '/guide/templating' },
            { text: 'Reactivity', link: '/guide/reactivity' },
            { text: 'Directives', link: '/guide/directives' }
          ]
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Single File Components', link: '/guide/sfc' },
            { text: 'Routing', link: '/guide/routing' },
            { text: 'CDN Usage', link: '/guide/cdn-usage' },
            { text: 'Lifecycle Hooks', link: '/guide/lifecycle' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'Lego.define()', link: '/api/define' },
            { text: 'Lego.route()', link: '/api/route' },
            { text: 'Lego.globals', link: '/api/globals' },
            { text: 'Directives', link: '/api/directives' },
            { text: 'Lifecycle Hooks', link: '/api/lifecycle' },
            { text: 'Vite Plugin', link: '/api/vite-plugin' }
          ]
        }
      ],
      '/router/': [
        {
          text: 'LegoDOM Router',
          items: [
            { text: 'About', link: '/router/' },
            { text: 'Basic Routing', link: '/router/basic-routing' },
            { text: 'Surgical Swaps', link: '/router/surgical-swaps' },
            { text: 'Cold Entry', link: '/router/cold-entry' },
            { text: 'History', link: '/router/history' }
          ]
        }
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Overview', link: '/examples/' },
            { text: 'Todo App', link: '/examples/todo-app' },
            { text: 'Routing Demo', link: '/examples/routing' },
            { text: 'SFC Showcase', link: '/examples/sfc-showcase' },
            { text: 'Form Validation', link: '/examples/form' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/rayattack/LegoJS' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present'
    },

    search: {
      provider: 'local'
    },

    editLink: {
      pattern: 'https://github.com/rayattack/LegoJS/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    }
  },

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    }
  }
});
