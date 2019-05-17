# 一个简单的使用webpack devServer代理SSO登录且代理api接口保持登录信息的例子

## 1. 什么是SSO

SSO（ Single Sign-On ），即单点登录，是一种控制多个相关但彼此独立的系统的访问权限，拥有这一权限的用户可以使用单一的ID和密码访问某个或多个系统从而避免使用不同的用户名或密码，或者通过某种配置无缝地登录每个系统。

单点登录的实现一般由cookie来完成，如果你不是很了解其原理，可以看这篇[单点登录（SSO）详解](https://cloud.tencent.com/developer/article/1352593)。

## 2. 使用devServer代理SSO

### 2.1 devServer.porxy的流程

首先我们需要了解，在开发环境下，所有浏览器发起的非跨域的请求（http://localhost:xxxx/），都是由node服务器，即`devServer`来处理。其中`devServer.proxy`是通过`http-proxy-middleware`将由浏览器发起的请求转发到目标服务器下，然后目标服务器将响应返回给node服务器，node服务器再将该响应返回给浏览器。简单表示如下：

浏览器⇄node服务器⇄目标服务器

### 2.2 配置devServer.porxy代理目标服务器

首先我们简单的配置目标服务器的代理，这里假定目标服务器为`http://app.example.com`，接口都是以`http://localhost:xxxx/api`开头，配置如下：

```javascript
{
  proxy： [{
    context: ['/api'],
    target: "http://app.example.com",
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

输入账号密码登录，观察所有的响应，一般会有location和set-cookie等字段的响应头，判断该set-cookie的值是否是用来确认身份信息的，同时观察该set-cookie响应相对应的请求是否是`http://sso.example.com/login`路径下的，如果不是，则还需要配置一些额外的代理来实现。如果是，则我们只需要将其值存入我们node服务器的内存中，在下次调用api接口时，从内存中获取该值将其添加到代理的请求头中。