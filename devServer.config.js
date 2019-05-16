// 不同浏览器存放cookie的对象
const cookieMap = {};
// 去掉域名的sso登录地址
const loginUrl = '/login';
// 默认打开页，为空时写'/'
const openPage = '/';

// 设置cookie
const setCookie = (userAgent, cookies) => {
  let map = cookieMap[userAgent] || {};
  cookies.forEach((cookie) => {
    let [string, key, value] = cookie.match(/^(.*?)=(.*?);/);
    map[key] = value;
  });
  cookieMap[userAgent] = map;
}

// 获取cookie
const getCookie = (userAgent) => {
  let map = cookieMap[userAgent] || {};
  let cookie = '';
  for(let key in map) {
    cookie += `${key}=${map[key]};`
  }
  return cookie;
}

module.exports = {
  // index值为空时，可以让devServer代理首页(localhost:xxxx)，配合 context: ['/'] 使用
  index: '',
  // 自动打开页面
  open: true,
  // 代理配置
  proxy: [{
    // 代理服务器的请求
    context: ['/api'],
    // 服务器的目标地址
    target: "http://www.your-server.com",
    changeOrigin: true,
    // 监听代理请求
    onProxyReq(proxyReq, req, res) {
      // 将cookie插入到请求头
      proxyReq.setHeader('Cookie', getCookie(req.get('User-Agent')));
    },
    // 监听代理返回
    onProxyRes(proxyRes, req, res) {
      // 如果响应头中含有set-cookie字段，则将其cookie存入内存中
      if(proxyRes.headers['set-cookie']) {
        setCookie(req.get('User-Agent'), proxyRes.headers['set-cookie']);
      }
    }
  }, {
    // 代理登录相关的所有请求
    context: ['/login'],
    // 登录的目标地址
    target: "http://www.sso.com",
    changeOrigin: true,
    onProxyRes(proxyRes, req, res) {
      // 如果响应头中含有set-cookie字段，则将其cookie存入内存中
      if(proxyRes.headers['set-cookie']) {
        setCookie(req.get('User-Agent'), proxyRes.headers['set-cookie']);
      }
      // 如果响应头为重定向，则将重定向地址指向我们需要的页面
      if(proxyRes.statusCode === 302) {
        proxyRes.headers['Location'] = openPage;
      }
    }
  }, {
    // 代理首页(localhost:xxxx)
    context: ['/'],
    bypass: function(req, res, proxyOptions) {
      // 如果请求为首页且发起该请求的浏览器没有登录，则跳转到登录页
      if (req.url === '/' && !cookieMap[req.get('User-Agent')]) {
        res.redirect(loginUrl);
        return true;
      }
    }
  }]
}