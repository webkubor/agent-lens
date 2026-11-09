# screenshots 来源说明

素材版本：mark.svg sha256 `��`，mark-dark.svg sha256 `��`（2026-11-09）

## 渲染器截图（rsvg-convert 2.x + Pillow 合成）

命令：`rsvg-convert -w N -h N assets/<v>.svg`，再用 Pillow 贴到纯色底（四周留 8px）。

| 文件 | 素材 | 背景 | 尺寸 |
|---|---|---|---|
| mark-32-on-light.png | mark.svg | #FFFFFF | 32px |
| mark-32-on-dark.png | mark.svg | #0D1117 | 32px |
| mark-128-on-light.png | mark.svg | #FFFFFF | 128px |
| mark-128-on-dark.png | mark.svg | #0D1117 | 128px |
| mark-dark-32-on-light.png | mark-dark.svg | #FFFFFF | 32px |
| mark-dark-32-on-dark.png | mark-dark.svg | #0D1117 | 32px |
| mark-dark-128-on-light.png | mark-dark.svg | #FFFFFF | 128px |
| mark-dark-128-on-dark.png | mark-dark.svg | #0D1117 | 128px |

像素检查：128px 渲染四角 alpha 都是 0，alpha 包围盒 (15,15,113,113)，非空像素 3872。

## 评审页截图（ego-browser 打开 review.html，视口 1713×909）

| 文件 | 操作 | 结果 |
|---|---|---|
| review-dark-32.png | 点「深底 #0D1117」+「32px」 | 加载的是独立深底版 mark-dark.svg，32px 可辨 |
| review-checker-128.png | 点「棋盘」+「128px」 | 主版本透明区域露出棋盘，没有烘焙背景 |

## 未做

- 评审页「复制完整任务」按钮的剪贴板检查：执行时浏览器控制权在用户手上，已停下，未测
- 评审页 SVG / JSON 下载链接：未点击测试
- 16px、彩色底、纹理底、色觉模拟：未做

---

# v2（叠镜，当前版本）

素材：lens.svg sha256 `��`，lens-dark.svg sha256 `��`（2026-11-09）。概念来源：museav gpt-image-2.6 生成的 6 张概念图里用户选定的 #5，原图在 `../concepts/`。

| 文件 | 素材 | 背景 | 尺寸 |
|---|---|---|---|
| v2-lens-{32,128}-on-{light,dark}.png | lens.svg | #FFFFFF / #0D1117 | 32 / 128px |
| v2-lens-dark-{32,128}-on-{light,dark}.png | lens-dark.svg | #FFFFFF / #0D1117 | 32 / 128px |
| v2-lens-sheet.png | 两版 | 浅底、深底、暖白 #F4F1EA | 16 / 32 / 128px（小图放大 4 倍） |

渲染：rsvg-convert + Pillow 合成。128px 四角 alpha 为 0，包围盒 (18,25,110,104)。

v2 未做：评审页浏览器截图（当时浏览器 MCP 进程崩溃）、色觉模拟。16px 能认出轮廓，但深青层与石墨层会糊在一起。v1（mark*）文件仅作历史对照保留，v1 素材见 assets/v1-old.svg。
