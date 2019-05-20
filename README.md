# 一个简单的使用webpack devServer代理SSO登录且代理api接口保持登录信息的例子

## 1. 什么是SSO

SSO（ Single Sign-On ），即单点登录，是一种控制多个相关但彼此独立的系统的访问权限，拥有这一权限的用户可以使用单一的ID和密码访问某个或多个系统从而避免使用不同的用户名或密码，或者通过某种配置无缝地登录每个系统。

单点登录的实现一般由cookie来完成，如果你不是很了解其原理，可以看这篇[单点登录（SSO）详解](https://cloud.tencent.com/developer/article/1352593)。

## 2. 使用devServer代理SSO

### 2.1 devServer.porxy的流程

首先我们需要了解，在开发环境下，所有浏览器发起的非跨域的请求（`http://localhost:xxxx/`），都是由node服务器，即`devServer`来处理。其中`devServer.proxy`是通过`http-proxy-middleware`将由浏览器发起的请求转发到目标服务器下，然后目标服务器将响应返回给node服务器，node服务器再将该响应返回给浏览器。简单表示如下：

浏览器⇄node服务器⇄目标服务器

### 2.2 配置devServer.porxy代理目标服务器

首先我们简单的配置目标服务器的代理，这里假定目标服务器为`http://api.example.com`，接口都是以`http://localhost:xxxx/api`开头，配置如下：

```javascript
{
  proxy： [{
    context: ['/api'],
    target: "http://api.example.com",
    changeOrigin: true,
  }]
}
```

这里`proxy`使用数组的形式是为了配置`context`列表，即支持多个`context`中的内容转发到同一目标服务器。

### 2.3 配置devServer.porxy代理SSO的服务器

这里假定SSO的服务器为`http://sso.example.com`，且该站点下登录页相关的所有资源都是以`http://sso.example.com/login`为前提，同时我们假定将`http://localhost:xxxx/login`都指向SSO服务器，向`proxy`添加代码如下：

```javascript
{
  proxy： [{
    context: ['/login'],
    target: "http://sso.example.com",
    changeOrigin: true,
  }]
}
```

此时我们命令行运行`webpack-dev-server`，同时地址栏输入`http://localhost:xxxx/login`，如果此时显示的页面与`http://sso.example.com/login`一致，则说明成功代理进行下一步配置。如果不一致，则分析SSO的登录页，添加代理的配置信息。

### 2.4 分析SSO登录过程

简单的可以用Chrome的调试工具，将其切换到network，同时勾上Preserve log选项。也可以用fiddler4等抓包工具进行抓包分析。

输入账号密码登录，观察所有的响应，一般会有`location`和`set-cookie`等字段的响应头，判断该`set-cookie`的值是否是用来确认身份信息的，同时观察该`set-cookie`响应相对应的请求是否是`http://sso.example.com/login`路径下的，如果不是，则还需要配置一些额外的代理来实现。如果是，则我们只需要将其值存入我们node服务器的内存中，在下次调用api接口时，从内存中获取该值将其添加到代理的请求头中。

在`login`的代理中添加`onProxyRes`方法来记录cookie值

```javascript
{
  proxy： [{
    context: ['/login'],
    target: "http://sso.example.com",
    changeOrigin: true,
    onProxyRes(proxyRes, req, res) {
      // proxyRes是登录服务器返回给node服务器的response
      // req是浏览器发给node服务器的request
      // res是node服务器返回给浏览器的response
      // 如果响应头中含有set-cookie字段，则将其cookie存入内存中
      if(proxyRes.headers['set-cookie']) {
        setCookie(req.get('User-Agent'), proxyRes.headers['set-cookie']);
      }
      // 如果响应头为重定向，则将重定向地址指向我们需要的页面
      if(proxyRes.statusCode === 302) {
        proxyRes.headers['Location'] = '/';
      }
    }
  }]
}
```

同时，我们在代码中添加一个用来存储不同浏览器(不同`User-Agent`)cookie的对象，以及设置cookie的方法。

```javascript
// 不同浏览器存放cookie的对象
const cookieMap = {};
// 设置cookie
const setCookie = (userAgent, cookies) => {
  let map = cookieMap[userAgent] || {};
  cookies.forEach((cookie) => {
    let [string, key, value] = cookie.match(/^(.*?)=(.*?);/);
    map[key] = value;
  });
  cookieMap[userAgent] = map;
}
```

此时重新运行`webpack-dev-server`，打开本地登录页并输入账号密码登录，如果不成功，则还需要更详细的修改配置，这里就不在做过多的说明。如登录成功并页面跳转至`http://localhost:xxxx/`则说明302已成功拦截，下面还得继续配置api目标服务器验证接口。

### 2.5 添加cookie至目标服务器

上面已经将cookie存入内存中，所以我们需要先添加一个通过不同浏览器(不同`User-Agent`)取cookie的方法。

```javascript
// 获取cookie
const getCookie = (userAgent) => {
  let map = cookieMap[userAgent] || {};
  let cookie = '';
  for(let key in map) {
    cookie += `${key}=${map[key]};`
  }
  return cookie;
}
```

然后向api的代理中添加`onProxyReq`方法来向请求添加cookie值，同时为了防止api接口中也会有`set-cookie`的情况，我们同样加入`onProxyRes`方法来重写cookie值。

```javascript
{
  proxy： [{
    // 代理服务器的请求
    context: ['/api'],
    // 服务器的目标地址
    target: "http://api.example.com",
    changeOrigin: true,
    // 监听代理请求
    onProxyReq(proxyReq, req, res) {
      // proxyReq是node服务器发给api服务器的response
      // req是浏览器发给node服务器的request
      // res是node服务器返回给浏览器的response
      // 将cookie插入到请求头
      proxyReq.setHeader('Cookie', getCookie(req.get('User-Agent')));
    },
    // 监听代理返回
    onProxyRes(proxyRes, req, res) {
      // proxyRes是登录服务器返回给node服务器的response
      // req是浏览器发给node服务器的request
      // res是node服务器返回给浏览器的response
      // 如果响应头中含有set-cookie字段，则将其cookie存入内存中
      if(proxyRes.headers['set-cookie']) {
        setCookie(req.get('User-Agent'), proxyRes.headers['set-cookie']);
      }
    }
  }]
}
```

最后再重新运行`webpack-dev-server`，此时我们api接口应该已经能获取到身份信息了。

### 2.6 拦截`http://localhost:xxxx/`首页

每次运行`webpack-dev-server`后，我们还要手动的去输入登录页的地址，这里我们通过拦截首页的方式，进行判断，如果还未登录就跳转到登录页，否则不做处理。

```javascript
const loginUrl = '/login';
{
  // index值为空时，可以让devServer拦截首页(localhost:xxxx)，配合 context: ['/'] 使用
  index: '',
  proxy: [{
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
```

这样我们每次只需要打开首页，让代码自己判断是继续还是去登录。


## 3. 总结

代理SSO登录，主要是利用`http-proxy-middleware`中间件中提供的两个监听函数`onProxyRes`和`onProxyReq`来进行处理。这样做的好处是能通过本地代码调试任意的服务器环境（后端电脑上的、测试服务器上的已经线上服务器等）。最后还需要注意的是如果没有做对首页的拦截处理，一定不要在配置中加入`index: ''`，不然你将得到一个空白的页面。

附上完整的代码[devServer.config.js](https://github.com/zjsxdyw/webpack-devServer-proxy-sso-example/blob/master/devServer.config.js)
