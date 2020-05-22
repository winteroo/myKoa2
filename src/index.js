const Emitter = require('events');
const http = require('http');
const context = require('./context.js');
const request = require('./request.js');
const response = require('./response.js');


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