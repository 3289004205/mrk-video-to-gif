# MRK 视频转Gif

浏览器本地视频抽帧与 GIF 转换工具。无后端、无运行时第三方请求，素材不会上传到服务器。

## 使用

在线版本：https://framegif-studio-m1971.gzzy666666.chatgpt.site

本地版本：在本目录执行 `python -m http.server 8787 --bind 127.0.0.1 --directory dist`，打开 http://127.0.0.1:8787 。需通过 HTTP 使用模块和编码 Worker，不要直接双击 HTML。

1. 选择或拖入视频；格式支持取决于当前浏览器的解码器，推荐 H.264 MP4 或 WebM。
2. 设置片段（最长 60 秒）、宽度（160–1280 px，按比例缩放且长边最多 1280 px）、帧率（5–24 FPS）。不会放大低分辨率源视频。
3. 文件大小上限默认为 2.9 MB，可选 1、5、10 MB。这里 1 MB = 1,000,000 字节。
4. 生成后显示实际体积、尺寸和帧率，点击下载 GIF。压缩按实际编码字节数判定，超过时重新编码，必要时降低颜色数、帧率和尺寸。无法满足时显示错误，不提供超限结果。
5. 「抽取画面帧」在所选片段均匀选取 8 张原分辨率 PNG，点击各图独立下载。

可在转换或抽帧过程中取消。GIF 不含音频；刷新会清除当前素材和结果。MOV 内的视频编码未必受浏览器支持。

## 实现

`dist/app.js` 管理视频解码与 Canvas 抽帧；`dist/encoder-worker.js` 在 Web Worker 内逐帧量化和编码，限制并发帧内存。编码使用本地打包的 [gifenc 1.0.3](https://github.com/mattdesl/gifenc)，MIT 许可证见 `dist/vendor/LICENSE-gifenc.md`。

静态文件可部署到常规 HTTP 静态服务器。Sites 身份保存在 `.openai/hosting.json`。
