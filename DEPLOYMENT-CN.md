# 正式部署与记录迁移

正式网址：<https://wordclassroom.cn/>。GitHub Pages 保留旧档案导出和正式站导航。

网站部署在用户的腾讯云 EdgeOne Makers 项目 wordclassroom，使用现有免费套餐和独立域名，HTTPS 证书由平台自动续签。域名需要按年续费，以注册商当期报价为准。项目使用中国大陆以外的加速区域。

## 云端账号和记录

- Cloud Functions 提供注册、登录、注销、档案保存和读取。
- 服务器验证密码和会话，只允许读取当前已登录学员的数据。
- 官方 Blob SDK 将数据持久化到当前项目的私有存储，部署更新不会清空档案。
- 浏览器保存待同步缓存；请求失败不会删除缓存，恢复网络后可重试。
- 多个设备的课堂按标识合并去重，已学和待学词库合并保存。

## 迁移旧档案

在当初学习的设备和浏览器中，打开原网址下的 migration.html。验证旧账户密码并导出 JSON 档案，然后在正式网址登录同名云端账户，选择“导入旧记录”。导入会合并当前档案，原网址的数据继续保留，导出文件不包含密码。

正式站的同一浏览器若仍有本机旧账户，可用旧姓名和密码登录进行升级。其他域名的本机数据不能由正式站直接读取；原浏览器数据若被清除，无法恢复此前从未上传的记录。

## 构建与验证

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
edgeone makers build
npm run prepare:deploy
```

部署 .edgeone 构建产物到原 Makers 项目，保留原域名、工作空间和加速区域。凭据由本机私有环境提供，不写入仓库或前端。先验证预览，再更新生产环境。

自动化检查覆盖独立会话同步、账号隔离、错误密码、会话失效、来源校验、旧档案去重，以及断网重试。实际 Windows / Edge 和安卓无代理访问仍需在学员设备验收，命令行直连检查不能替代真机测试。

## 官方说明

- [Cloud Functions](https://pages.edgeone.ai/document/node-functions)
- [Blob 持久存储](https://pages.edgeone.ai/zh/document/blob-storage)
- [免费套餐](https://pages.edgeone.ai/zh/document/billing-free-plan)
