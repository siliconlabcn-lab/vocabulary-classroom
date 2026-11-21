# 单词练习室

用于英语词汇体验课的静态网站，支持桌面浏览器和安卓等移动浏览器。

## 课堂功能

- 姓名、密码注册与登录。
- 学前测评与生词筛选，老师可以设置本轮训练词数。
- 待学、已学词库以及学习成绩、历史记录。
- 53 个词库、10,455 个英文词条，保留真人录音，并用自然合成语音补齐缺失发音。
- 中文带读只读第一个释义，词卡保留完整释义。

正式网址：<https://wordclassroom.cn/>。

正式站使用腾讯云 Makers Cloud Functions 和私有 Blob 持久存储。学员通过姓名、密码注册和登录，同一个账户可以在安卓、Windows 等设备读取学习记录。密码使用独立盐值和 PBKDF2-SHA256 派生，登录会话保存在 Secure、HttpOnly、SameSite=Strict Cookie 中；账号和档案均由后端验证权限。

学习时自动同步；网络异常时，本机缓存保留待同步档案，恢复网络后重试。学员首页提供同步、导出备份和导入旧档案。多个设备的历史课堂合并去重，旧档案导入保留已有记录。

浏览器本地旧账户使用原姓名和密码登录正式站时，会验证原密码并尝试升级。其他旧域名的数据需在原设备、原浏览器、原网址的 `migration.html` 导出，再到正式站同名账户导入。迁移文件不包含密码；迁移不会删除原数据。

## 本地运行

```sh
python3 -m http.server 4291 --directory dist
```

打开 <http://127.0.0.1:4291/> 可查看静态页面。云端账号 API 需要部署到 Makers，或使用 EdgeOne CLI 的函数开发环境。账号与同步检查执行 `npm test`。

## GitHub Pages

仓库使用 GitHub Actions 发布 `dist/`；GitHub Pages 保留旧档案导出和正式站导航，云端 API 部署在腾讯云项目中。
全部页面、词库与音频使用相对路径，适用于带仓库子路径的 GitHub Pages 地址。
安卓用户可在 Chrome、Edge 等现代浏览器中使用；首次播放如未自动开始，可点击发音按钮。

正式域名的 Windows / Edge 和安卓无代理真机验收需要在实际设备完成，详见 [部署说明](DEPLOYMENT-CN.md)。

## 音频来源

真人录音的作者、来源和许可证见页面底部“语音来源”以及 `dist/recordings.js` 中的逐条归属记录。
新增合成语音使用 en-US-JennyNeural 和 zh-CN-XiaoxiaoNeural；所有实际播放文件随网站提供。

## 维护脚本

- `scripts/verify-audio.py`：检查全词库音频覆盖、MP3 文件和逐词播放范围。
- `scripts/generate-audio.py`：补齐新增词条的自然合成语音。
- `scripts/compact-audio.py`：保留所需录音片段并重建播放范围。
- `scripts/build-offline.py`：生成包含全部音频的本地离线 HTML，生成结果不提交到仓库。
