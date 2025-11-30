import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'dist/',
                'workers/',
                '*.config.js',
                'src/main.js',
                'src/visualization/**' // Three.js visualization - requires DOM/WebGL
            ]
        },
        include: ['test/**/*.test.js', 'test/**/*.spec.js']
    }
});
