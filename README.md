# MRK 视频转Gif

浏览器本地视频抽帧与 GIF 转换工具。素材不会上传到服务器，无需运行时第三方请求。

[在线应用](https://framegif-studio-m1971.gzzy666666.chatgpt.site) · [GitHub](https://github.com/3289004205/mrk-video-to-gif)

## 使用

1. 选择或拖入视频，推荐 H.264 MP4 或 WebM；格式支持取决于浏览器解码器。
2. 设置片段（最长 60 秒）、宽度（160–1280 px，保持比例且长边最多 1280 px）和帧率（5–24 FPS）。不会放大低分辨率源视频。
3. 应用采样片段中最多 5 张画面，使用相同尺寸及 256 色编码，再根据总帧数估算 GIF 体积。调整尺寸、帧率或片段时长会重新预估。画面内容变化会影响准确性，实际大小以完整导出为准。
4. 生成后显示实际大小、尺寸和帧率，点击下载 GIF。按所选参数完整编码，不设目标文件大小，也不自动降低尺寸、帧率或颜色数。
5. 「抽取画面帧」均匀选取片段中的 8 张原分辨率 PNG，点击各图独立下载。

转换和抽帧支持取消。GIF 不含音频；刷新会清除当前素材与结果。文件体积使用十进制 MB（1 MB = 1,000,000 字节）。

## 本地运行

在本目录执行 `python -m http.server 8787 --bind 127.0.0.1 --directory dist`，打开 http://127.0.0.1:8787 。需通过 HTTP 使用模块及编码 Worker，不要直接双击 HTML。

`dist/app.js` 管理视频解码、抽帧与文件大小预估；`dist/encoder-worker.js` 在 Web Worker 内逐帧量化和编码，控制并发帧内存。编码使用本地打包的 [gifenc 1.0.3](https://github.com/mattdesl/gifenc)，MIT 许可证见 `dist/vendor/LICENSE-gifenc.md`。

静态文件可部署到常规 HTTP 静态服务器。Sites 身份保存在 `.openai/hosting.json`。
