# v2vRender Demo：两个可选视频渲染后端

本仓库提供 **PAI MiniMax-H3 Ref2VA 八步**与 **Krea 14B＋VACE** 两个独立后端。两者的代码、权重和 Python 环境分别管理。

| 后端 | 代码入口 | 输入 | 运行方式 |
|---|---|---|---|
| PAI H3 八步 | `scripts/render.py`、`runtime_deps/` | RGB 视频＋提示词 | 双卡离线渲染；已有实现保留 |
| Krea＋VACE | `krea/scripts/render.py`、`krea/third_party/Scope/` | Depth / Canny 条件＋可选对齐参考图＋提示词 | 因果分块推理，支持单卡编译优化及注意力/KV/FFN 多卡并行；上传/下载及持续帧输入 HTTP 适配层 |

Krea 内有两个优化选项：`bf16`（BF16 通信）和 `bf16_blocks`（BF16 通信＋Transformer 块编译）。它们共享同一套模型权重。默认单卡，可通过 `KREA_GPUS=2/4` 或 HTTP 服务参数 `--gpus 2/4` 切换多卡；单卡的两个选项分别使用子模块编译和子模块＋块编译，不进行跨卡通信；单张 A800 80GB 已测最快约 3.93 FPS。

- **Krea 安装、模型下载、启动和接口：见 [krea/README.md](krea/README.md)。**
- **PAI H3 原有安装与启动说明：见 [docs/pai_h3.md](docs/pai_h3.md)。** PAI 的 `scripts/`、`configs/`、`runtime_deps/` 和根目录 `requirements.txt` 保持原路径；PAI 文档中的命令均从仓库根目录执行。

Krea 的 Scope 源码、模型加载/VACE 实现和本项目多卡优化代码均已纳入 Git，无需另外 clone Scope、LongLive 或其他推理工程。模型权重、Python 环境、输入和生成视频不纳入 Git；下载/安装命令随仓库提供。

Krea 已有四张 A800 80GB 测试结果：640×384、四步，BF16 约 8.2 FPS，BF16＋块编译约 8.9 FPS。这是热身后模型计算吞吐，不是 16 FPS 端到端实时保证。默认接口按任务加载模型；配置 `--resident-dir` 后使用跨会话常驻模型，每次会话重置缓存。

也可从仓库根目录用统一命令选择后端（输入/输出路径相对于仓库根目录）：

```bash
PAI_PYTHON=/srv/envs/pai/bin/python bash render_backend.sh pai-h3 --config configs/local.json
bash render_backend.sh krea --config krea/configs/example.json \
  --control /srv/input/depth.mp4 --reference /srv/input/reference.png \
  --variant bf16 --output krea/outputs/example
```

`PAI_PYTHON` 和 `KREA_PYTHON` 必须是各自环境的解释器；不能把两套依赖混装。Krea 默认为 `krea/.venv/bin/python`。
