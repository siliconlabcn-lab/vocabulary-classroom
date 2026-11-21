# 国内直连部署

网站文件已经就绪；国内托管、正式域名及直连验收尚未完成。GitHub Pages 保留为现有入口。

当前先采用免费临时预览进行无代理真机验证。临时预览有期限与访问限制，不能作为长期共享网址；预览及认领凭据不写入本仓库。下述 CloudBase 配置是后续正式部署的可选准备，并不表示已购买或开通服务。

## 推荐部署目标

使用腾讯云 CloudBase 静态网站托管，绑定完成备案的自定义域名，并启用 HTTPS。默认测试域名不作为面向学员的长期入口。

注册、实名认证、域名购买与备案需由账号本人办理。托管及域名的具体费用以购买页面为准；尚未开通任何付费资源。

## 导入现有仓库

在静态网站托管控制台选择 Git 公开仓库部署，使用以下参数：

| 配置 | 值 |
| --- | --- |
| 仓库 | `https://github.com/siliconlabcn-lab/vocabulary-classroom.git` |
| 分支 | `main` |
| 项目根目录 | 仓库根目录 |
| 框架 | 纯静态 / static |
| 安装命令 | 空，跳过安装 |
| 构建命令 | 空，跳过构建 |
| 输出目录 | `dist` |
| 挂载路径 | `/` |
| 首页 | `index.html` |

`cloudbaserc.json` 已保存以上静态应用设置。取得实际环境 ID 并登录 CloudBase CLI 后，也可执行：

```sh
tcb app deploy vocabulary-classroom -e "$CLOUDBASE_ENV_ID"
```

`CLOUDBASE_ENV_ID` 必须是控制台返回的真实环境 ID；本仓库不存放云账号密钥或登录凭据。

## 发布包与检查

```sh
python3 scripts/package-hosting.py
python3 scripts/verify-public-site.py https://实际部署域名/ --direct
```

发布包在 `.sites/domestic-publish.zip`，仅含网站文件和全部音频。检查脚本会校验页面、词库与中英文录音的内容哈希。

`--direct` 忽略程序代理设置，但不能检测或关闭系统 VPN。报告因此不会自动宣称“国内直连已通过”。

正式切换前，在关闭代理/VPN的实际设备上分别验证：

- Windows / Edge：访问、注册、登录、筛选词数、学习和发音。
- 安卓 / Chrome 或 Edge：访问、注册、登录、词卡与中英文发音。
- 至少覆盖目标学员实际使用的家庭宽带与手机流量网络，记录时间、运营商和成功/失败结果。

现有账户与学习记录保存在当前浏览器，切换域名或设备不会自动同步。正式迁移前需另行处理原记录迁移。

## 官方参考

- [部署方式](https://docs.cloudbase.net/hosting/web-hosting)
- [静态应用部署参数](https://docs.cloudbase.net/cli-v1/app/deploy)
- [腾讯云备案条件](https://cloud.tencent.com/document/api/243/19630)
