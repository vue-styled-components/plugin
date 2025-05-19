# Vue Styled Plugin

A Vite plugin that provides TypeScript generic syntax support for Vue Styled Components, similar to React styled-components.

> [!CAUTION]
> The current plugin is not fully mature and may not completely support complex TypeScript types.

## Features

- Allows using the `styled.tag<Props>` syntax instead of the original required `styled('tag', { props })` syntax
- Automatically transforms at compile time with no runtime performance impact

## Installation

```bash
# npm
npm install @vue-styled-components/plugin --save-dev

# yarn
yarn add @vue-styled-components/plugin --dev

# pnpm
pnpm add @vue-styled-components/plugin -D
```

## Usage

### Add the plugin to your Vite config

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueStyled from '@vue-styled-components/plugin'

export default defineConfig({
  plugins: [
    // Make sure to use it before vue and vueJsx plugins
    vueStyled(),
    vue(),
    vueJsx(),
  ],
})
```

### Configuration Options

```ts
vueStyled({
  // Included file extensions, default is ['.vue', '.tsx', '.jsx', '.ts', '.js']
  include: ['.vue', '.tsx', '.jsx', '.ts', '.js'],
  
  // Excluded file paths, default is ['node_modules']
  exclude: ['node_modules'],
  
  // Enable debug mode
  debug: false,
  
  // Log level: 'error' | 'warn' | 'info' | 'debug' | 'none'
  logLevel: 'error',
  
  // Enable type caching for better performance
  enableCache: true,
})
```

## Examples

### Using Generic Syntax

```tsx
import styled from '@vue-styled-components/core'

interface IconProps {
  color?: string
  size?: number
}

// Using the new generic syntax
const Icon = styled.span<IconProps>`
  color: ${props => props.color || 'currentColor'};
  font-size: ${props => `${props.size || 16}px`};
`

// Equivalent to the original syntax
const IconOriginal = styled('span', {
  color: String,
  size: Number,
})`
  color: ${props => props.color || 'currentColor'};
  font-size: ${props => `${props.size || 16}px`};
`
```

## How It Works

The plugin intercepts source code during the compilation phase, uses an AST parser to analyze the code, searches for `styled.tag<Props>` patterns, and transforms them into the `styled('tag', Props)` format supported by Vue Styled Components.

## License

Alpha-2.0
