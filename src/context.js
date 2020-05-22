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


module.exports = context;