const MyKoa = require('./src/index.js');

const app = new MyKoa();

app.use(fn1);
app.use(fn2);
app.use(fn3);
app.use(fn4);

let server = app.listen(6000);



async function fn1(ctx, next) {
  console.log('fn1');
  await next();
  console.log('hui1');
}

async function fn2(ctx, next) {
  console.log('fn2');
  await next();
  console.log('hui2');
}

async function fn3(ctx, next) {
  console.log('fn3');
  await next();
  console.log('hui3');
}

async function fn4(ctx, next) {
  console.log('fn4');
  ctx.body = 'koa返回成功'
  await next();
  console.log('hui4');
}