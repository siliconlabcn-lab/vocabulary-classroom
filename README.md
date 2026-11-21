# 单词练习室

用于英语词汇体验课的静态网站，支持桌面浏览器和安卓等移动浏览器。

## 课堂功能

- 姓名、密码注册与登录。
- 学前测评与生词筛选，老师可以设置本轮训练词数。
- 待学、已学词库以及学习成绩、历史记录。
- 53 个词库、10,455 个英文词条，保留真人录音，并用自然合成语音补齐缺失发音。
- 中文带读只读第一个释义，词卡保留完整释义。

账户和学习记录保存在当前浏览器中；它们不会自动跨设备、跨浏览器或跨域名同步。更换网站地址后需要在新地址注册账户。

## 本地运行

```sh
python3 -m http.server 4291 --directory dist
```

打开 <http://127.0.0.1:4291/>。

## GitHub Pages

仓库使用 GitHub Actions 发布 `dist/`，发布设置选择 GitHub Actions。推送到 `main` 后自动部署。
全部页面、词库与音频使用相对路径，适用于带仓库子路径的 GitHub Pages 地址。
安卓用户可在 Chrome、Edge 等现代浏览器中使用；首次播放如未自动开始，可点击发音按钮。

国内无代理访问尚未实测完成；正式国内托管的配置与验收步骤见 [国内直连部署](DEPLOYMENT-CN.md)。

## 音频来源

真人录音的作者、来源和许可证见页面底部“语音来源”以及 `dist/recordings.js` 中的逐条归属记录。
新增合成语音使用 en-US-JennyNeural 和 zh-CN-XiaoxiaoNeural；所有实际播放文件随网站提供。

## 维护脚本

- `scripts/verify-audio.py`：检查全词库音频覆盖、MP3 文件和逐词播放范围。
- `scripts/generate-audio.py`：补齐新增词条的自然合成语音。
- `scripts/compact-audio.py`：保留所需录音片段并重建播放范围。
- `scripts/build-offline.py`：生成包含全部音频的本地离线 HTML，生成结果不提交到仓库。
