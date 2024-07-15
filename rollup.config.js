import { nodeResolve } from '@rollup/plugin-node-resolve';
export default ({
    input: 'lib/browser.js',
    plugins: [
        nodeResolve({ browser: true })
    ],
    output: {
        file: './dist/shp.js',
        format: 'umd',
        name: 'shp'
    }
})