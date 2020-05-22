# Koa2源码剖析

Koa（Koa2）是一个新的 web 框架，由 Express 幕后的原班人马打造， 
致力于成为 web 应用和 API 开发领域中的一个更小、更富有表现力、更健壮的基石。 
通过利用 async 函数，Koa 帮你丢弃回调函数，并有力地增强错误处理。 Koa 并没有捆绑任何中间件， 
而是提供了一套优雅的方法，帮助您快速而愉快地编写服务端应用程序。

Koa的源码非常短小、精炼，大致可以分成4个模块：

* 1、web服务器的创建
* 2、构造context对象
* 3、中间件机制（洋葱圈模型）
* 4、错误捕获与处理

接下来就让我们一同探索吧！

## 源码目录结构
Koa2的源码目录很清晰，总共四个文件

* ```application.js``` 入口文件，包含服务器创建、中间件机制
* ```context.js``` 包含context对象创建以及错误处理
* ```request.js``` 请求封装方法（大量包含get 、set）
* ```response.js``` 响应封装方法（大量包含get 、set）


![koa2source](~@Backend/Nodejs/images/koaDirList.png)

## 源码总览

入口文件进入，我们可以发现Koa其实是一个继承自Emitter的类，
context.js、request.js、response.js分别导出了各自封装的对象
伪代码如下：
```js
const response = require('./response');
const context = require('./context');
const request = require('./request');

module.exports = class Application extends Emitter {
  constructor(options) {
    super();
    this.middleware = []; // 中间件队列
    this.context = Object.create(context); // 从./context.js文件导出的context对象初始化context
    this.request = Object.create(request); // 从./request.js文件导出的request对象初始化request
    this.response = Object.create(response);// 从./response.js文件导出的response对象初始化response
  }
  ......
}
```


## 服务器创建

在koa的官网中提供了如下创建web服务器的方式：
```js
const Koa = require('koa');
const app = new Koa();

app.use(async ctx => {
  ctx.body = 'Hello World';
});

app.listen(3000);
```
可以发现，在创建了Koa实例后，调用实例上的```listen```方法，便可以创建一个web服务器。

在源码```application.js```中，找到```listen```方法源码如下：
```js
listen(...args) {
  debug('listen');
  const server = http.createServer(this.callback());
  return server.listen(...args);
}
```
利用```nodejs```的原生HTTP模块创建web服务器，这里关键的是回调函数```this.callback()```，我们继续
查看```this.callback()```的源码。
```js
callback() {
  const fn = compose(this.middleware);

  if (!this.listenerCount('error')) this.on('error', this.onerror);

  const handleRequest = (req, res) => {
    const ctx = this.createContext(req, res);
    return this.handleRequest(ctx, fn);
  };

  return handleRequest;
}
```
函数第一行，组合中间件，咱们放到后面中间件一节探讨，继续往下，错误处理先略过，
```handleRequest```这个函数被返回，该函数的第一句，我们从字面意思可以理解这句是用来创建context对象的。

## 构造context对象
来到```createContext ```函数定义:
```js
createContext(req, res) {
  const context = Object.create(this.context);
  const request = context.request = Object.create(this.request);
  const response = context.response = Object.create(this.response);
  context.app = request.app = response.app = this;
  context.req = request.req = response.req = req;
  context.res = request.res = response.res = res;
  request.ctx = response.ctx = context;
  request.response = response;
  response.request = request;
  context.originalUrl = request.originalUrl = req.url;
  context.state = {};
  return context;
}
```
这个函数返回了一个context对象，context上委托了```request```、```response```、```res```、```req```、```app```等对象，
具体的context

## 中间件机制（洋葱圈模型）
有了context对象，回到```handleRequest```函数，他返回了```this.handleRequest(ctx, fn)```的结果，
下面查看```this.handleRequest```源码
```js
handleRequest(ctx, fnMiddleware) {
  const res = ctx.res;
  res.statusCode = 404;
  const onerror = err => ctx.onerror(err);
  const handleResponse = () => respond(ctx);
  onFinished(res, onerror);
  return fnMiddleware(ctx).then(handleResponse).catch(onerror);
}
```
```fnMiddleware```是中间件组合之后返回的函数，所以我们接下来先看中间件的核心组合函数```compose```,
```js
/**
 * Compose `middleware` returning
 * a fully valid middleware comprised
 * of all those which are passed.
 *
 * @param {Array} middleware
 * @return {Function}
 * @api public
 */

function compose (middleware) {
  /**
   * @param {Object} context
   * @return {Promise}
   * @api public
   */
  return function (context, next) {
    // last called middleware #
    let index = -1
    return dispatch(0)
    function dispatch (i) {
      if (i <= index) return Promise.reject(new Error('next() called multiple times'))
      index = i
      let fn = middleware[i]
      if (i === middleware.length) fn = next
      if (!fn) return Promise.resolve()
      try {
        return Promise.resolve(fn(context, dispatch.bind(null, i + 1)));
      } catch (err) {
        return Promise.reject(err)
      }
    }
  }
}

```
```compose```函数返回了一个以```context```,```next```为参数的函数，函数中的```dispatch ```函数递归的调用
中间件队列中的函数，依次执行每个中间件在```await next() ```之前的函数体，当```i === middleware.length ```，即
每个中间件```await next() ```之前的代码已经全部执行完成，此时，函数```return Promise.resolve()```，开始反向执行
每个中间件```await next() ```之后的代码，直到全部中间件执行完成。

下面是测试代码：
```js
async function fn1 (ctx, next) {
  console.log('fn1');
  await next();
  console.log('hui1');
}

async function fn2 (ctx, next) {
  console.log('fn2');
  await next();
  console.log('hui2');
}

async function fn3 (ctx, next) {
  console.log('fn3');
  await next();
  console.log('hui3');
}

async function fn4 (ctx, next) {
  console.log('fn4');
  await next();
  console.log('hui4');
}

let middlewareArr = [fn1, fn2, fn3, fn4]

// 洋葱圈模型
compose(middlewareArr)()
.then((res) => {
  console.log('结束', res)
})
```
测试结果：
![composeTest](~@Backend/Nodejs/images/composeTest.png)

所以```handleRequest ```函数就是执行中间件，之后如果中间件全部执行通过，即进入```fnMiddleware(ctx).then(handleResponse) ```，
Koa会去处理请求，我们查看```handleResponse ```函数，其实就是返回```ctx.body```的内容，至此一个请求就完成了 **请求来 => 经过洋葱圈式的中间件处理 => 请求返回**这个过程。


## 错误捕获与处理

要实现一个基础框架，错误处理和捕获必不可少，一个健壮的框架，必须保证在发生错误的时候，
能够捕获到错误和抛出的异常，并反馈出来，将错误信息发送到监控系统上进行反馈，那么Koa是如何实现错误捕获的呢，
下面我们来一起探讨一下。

在```handleRequest ```函数中，我们可以发现，当中间件发生错误时，Koa会调用```onerror```函数
```js
const onerror = err => ctx.onerror(err);
return fnMiddleware(ctx).then(handleResponse).catch(onerror);
```
查看```context```中的```onerror```函数，关键代码如下：

```js{4}
onerror(err) {
  if (null == err) return;
  ... ...
  this.app.emit('error', err, this);
  ... ...
  this.status = err.status;
  res.end('错误信息');
 }
```
可以发现，Koa捕获到错误后会向外发出```error ```事件，并设置请求返回的状态码，并发送错误信息。
多以我们可以在外侧监听error事件，来记录错误日志。
## 实现简单的koa

```js
const Emitter = require('events');
const http = require('http');
// const ctx = require('./context.js');
// const request = require('./request.js');
// const response = require('./response.js');

let context = {
  onerror(err) {
    if (null == err) return;
    this.app.emit('error', err, this);
    const {
      res
    } = this;
    res.statusCode = 500;
    res.end('error');
  },
}

let request = {}

let response = {}

class MyKoa extends Emitter {
  constructor() {
    super();
    this.middleware = [];
    this.context = context;
    this.request = request;
    this.response = response;
  }
  /**
   * web服务器创建
   * @param { String } port 端口 
   */
  listen(port) {
    const server = http.createServer(this.callback());
    return server.listen(port);
  }
  /**
   * 中间件注册
   * @param {function} fn 中间件函数
   */
  use(fn) {
    this.middleware.push(fn);
  }
  /**
   * 服务创建成功的回调，洋葱圈模型
   * 执行中间件
   */
  callback() {
    const fn = this.compose(this.middleware);

    const handleRequest = (req, res) => {
      const ctx = this.createContext(req, res);
      return this.handleRequest(ctx, fn);
    };

    return handleRequest;
  }

  /**
   * 组合中间件
   * @param {Array} middleware
   * @return {Function}
   * @api public
   */

  compose(middleware) {
    /**
     * @param {Object} context
     * @return {Promise}
     * @api public
     */
    return function (context, next) {
      let index = -1
      return dispatch(0)

      function dispatch(i) {
        if (i <= index) return Promise.reject(new Error('next() called multiple times'))
        index = i
        let fn = middleware[i]
        if (i === middleware.length) fn = next
        if (!fn) return Promise.resolve()
        try {
          return Promise.resolve(fn(context, dispatch.bind(null, i + 1)));
        } catch (err) {
          return Promise.reject(err)
        }
      }
    }
  }

  /**
   * 创建context对象
   * req，res  原生nodejs请求、响应对象，
   * request、response Koa封装的请求、响应对象
   */
  createContext(req, res) {
    const context = Object.create(this.context);
    const request = context.request = Object.create(this.request);
    const response = context.response = Object.create(this.response);
    context.app = request.app = response.app = this;
    context.req = request.req = response.req = req;
    context.res = request.res = response.res = res;
    request.ctx = response.ctx = context;
    return context;
  }

  handleRequest(ctx, fnMiddleware) {
    const res = ctx.res;
    const onerror = err => ctx.onerror(err);
    const handleResponse = () => this.respond(ctx);
    return fnMiddleware(ctx).then(handleResponse).catch(onerror);
  }

  respond(ctx) {
    const res = ctx.res;
    let body = ctx.body;
    const code = ctx.status;
    body = JSON.stringify(body);
    res.end(body);
  }

}

module.exports = MyKoa;
```

测试用例：
```js
const MyKoa = require('./index.js');

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
```
postman发请求测试结果：
![testMyKoa](~@Backend/Nodejs/images/testMyKoa.png)
![postmanKoaTest](~@Backend/Nodejs/images/postmanKoaTest.png)

## 总结
通读koa的源码，我发现，koa只是提供了一种处理web请求的新方式，它来定义这种方式，同时用```async/await```避免了nodejs的
回调地狱问题，这使得在编写koa程序时，我们能用写同步代码的方式去写异步代码，koa剥离了所有的插件，它只提供一个核心运行机制，
这样，koa的源码看起来非常的小巧，其实上面分析下来，我发现，甚至koa的源码可以总结为几个核心函数，其余只是对一些常用方法
的封装。所以，对于程序来说，关键在于设计思想和设计理念，优秀的程序可能只需要几个关键函数，就能颠覆整个程序的运行机制，所以，
我们更应该注重的是设计思想、设计模式、算法这些基础，盲目的编写千篇一律的业务代码，无异于熟练工种罢了，思考和思想才最重要。