
import express from 'express';
import morgan from 'morgan';
import path from 'path';
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const app = express();
if (process.env.SERVING) {
  app.use(morgan('dev'));
}
app.get('/test/bundle-browser.js', (req, res) => {
  rollup({
    input: path.join(import.meta.dirname, 'test.js'),
    plugins: [
      nodeResolve({ browser: true })
    ],
  })
    .then(result => {
      return result.generate({
        format: 'iife'
      })
    })
    .then(({ output: [{ code }] }) => {
      res.type('.js');
      res.send(code);
    }).catch(e => {
      console.log(e);
      res.sendStatus(500)
    })
})

app.use('/', express.static(path.join(import.meta.dirname, '..')));
export default app;
if (process.env.SERVING) {
  app.listen(3000, () => {
    console.log('go to http://localhost:3000/test/ to test in the browser');
  });
}