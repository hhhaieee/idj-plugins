# 黑果夜剧插件商店

黑果夜剧（HeiGuoYeJu）的官方插件商店索引。App 内「插件」页读取本仓库的 `index.json`，列出可安装插件，点「安装」即下载校验后装进本地，可随时卸载。

## 目录结构

- `index.json` — 商店索引（订阅格式），App 读取它列出插件
- `<插件名>/manifest.json` — 插件清单（含 entry、权限、完整性哈希）
- `<插件名>/main.js` — 插件脚本

## 上架新插件

1. 在仓库新建 `<插件id>/` 目录，放入 `manifest.json` 和 `main.js`（manifest 的 `integrity.files` 填 `main.js` 的 `sha256-<base64>`）
2. 在 `index.json` 的 `plugins` 数组里加一条记录，`manifest` 填相对路径 `<插件id>/manifest.json`
3. 提交即可，App 内刷新商店即见。

`index.json` 通过 jsDelivr 提供 CDN 加速：
`https://cdn.jsdelivr.net/gh/hhhaieee/idj-plugins@main/index.json`
