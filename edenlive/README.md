# EdenLive 双机械臂实时渲染

这是 C3 当前 `robotarm_native_20261020` 前后端的可迁移代码版本，独立于仓库原有 Krea。保留原生 EdenLive 5B few-step/AR 推理、缓存、TAEHV 流式解码与 WebRTC 媒体管线；保留原版双 UR5 模拟器、资产、IK、碰撞、抓放、绿色可夹取提示、关节滑条、演示及相机控制。无需克隆 MG4 或其他私有项目，无前端构建步骤。

权威物理状态在服务端 Chromium 中执行。浏览器发送控制并同步显示状态；RGB/语义代理和抓取、移动、释放事件来自同一模拟器。动态提示词包含固定场景材质、结构稳定描述、当前抓持关系与该 chunk 的事件，超过512个文本token会报错而非静默截断。输入心跳超时会释放按键；停止生成同时暂停采集，模型可保持常驻。

此版本使用原生 FlashDreams 引擎与 `--compile`，**尚未接入完整 LightX2V 引擎**。加速优化列在 [TODO.md](TODO.md)。写实增强和几何/抓取保真度仍有局限，不保证夹爪不漂移、物体不出幻影或动作完全一致。

## 目录

```text
scripts/                  通用启动/停止、模型校验、原版机械臂适配和动态语义
web/                      当前左右双栏前端与开始/停止按钮
simulator/                完整模拟器、真实模型/纹理和vendor依赖
games/                   三个模式的注册配置、固定提示词和首帧
configs/                  写实首帧及来源说明
third_party/EdenLive/      完整推理源码快照、官方离线样例输入、许可证及上游文档
models/download-manifest.json  23个必需模型文件的固定版本、大小与哈希
versions.json             代码/权重/环境版本与LightX2V状态
runs/ logs/ runtime/ cache/   运行时自动创建，不提交Git
```

源码基于官方提交 `f9f15fd1810fc274f167bc2ff8784b2645170286`，包含部署时已有的本地修改，非声称与官方Git逐文件完全一致；快照文件哈希见 `source-manifest.json`，可执行 `python3 edenlive/scripts/check_source.py` 检查完整代码和资产。模型固定revision为 `de40b28f3f6eb6a0f12bb3d3967ca35578273713`。只需要 dit-5b、vae-5b、decoder-5b、umt5、vision-encoder、scheduler-5b；不需要14B、bidirectional、CLIP14B或FLUX。权重、环境、浏览器二进制、录像、私钥、密码和旧服务凭据不在Git中。各组件许可证见 [THIRD_PARTY.md](THIRD_PARTY.md)。

## 新服务器安装

基线：Linux x86_64、Python **3.10**、单张 **A800 80GB**、PyTorch **2.11.0+cu128**、torchvision **0.26.0+cu128**。建议可用主存96GB及磁盘100GB以上。其他GPU显存/架构尚未逐一验证。需要与CUDA12.8兼容的现有NVIDIA驱动；安装脚本不升级驱动。GPU作业还须能访问分配设备对应的EGL/OpenGL库，容器需要正确挂载 NVIDIA graphics 库；不能用软件渲染冒充硬件性能。

```bash
git clone https://github.com/Seeyou-Hi/v2vRender_Demo.git
cd v2vRender_Demo
# Ubuntu/Debian系统依赖（有管理权限时；无权限请由管理员预装）
sudo apt-get update
sudo apt-get install -y python3.10-venv curl coturn libegl1 libgl1 libglib2.0-0
bash edenlive/install.sh
```

Python包默认使用清华镜像，PyTorch单独从官方cu128索引安装。可用 `PIP_INDEX_URL`、`TORCH_INDEX_URL`、`PYTHON` 显式指定镜像/解释器。仅修改 `edenlive/.venv`，不修改其他后端环境。依赖固定在 requirements/constraints，安装记录保存为 runs/installed-freeze.txt。

服务端还需 **Chrome/Chromium**。安装脚本在未找到系统浏览器且未设置 `EDEN_CHROME` 时，会通过Playwright下载Chromium并记录可执行路径；可用 `EDEN_SKIP_BROWSER_INSTALL=1` 跳过。已安装 `google-chrome` 或 `chromium` 时自动发现；也可使用包内Playwright下载浏览器后指定路径：

```bash
edenlive/.venv/bin/python -m playwright install chromium
# 打印Playwright实际安装位置，将其作为EDEN_CHROME：
edenlive/.venv/bin/python -c 'from playwright.sync_api import sync_playwright; p=sync_playwright().start(); print(p.chromium.executable_path); p.stop()'
export EDEN_CHROME=/absolute/path/to/chrome
```

Playwright不自动安装系统图形依赖；若浏览器缺系统库，请管理员安装相应依赖。C3 原服务使用 Chrome109；新浏览器在不同驱动上的 ANGLE/EGL 兼容性仍需实测。启动后模拟器必须报告 NVIDIA 硬件渲染器，检测到 SwiftShader/llvmpipe 等软件后端会拒绝采集。

## 下载或复用模型

```bash
# 下载在CPU/登录侧执行，不占GPU等待下载；支持.part断点续传，默认HF镜像且TLS验证开启。
python3 edenlive/scripts/models.py download
python3 edenlive/scripts/models.py verify
# 改用官方HuggingFace：
# HF_ENDPOINT=https://huggingface.co python3 edenlive/scripts/models.py download
```

总计23个文件、36,731,006,909字节。脚本验证每个文件的大小及LFS SHA256/普通Git blob SHA1，不以目录大小判定完整。已有模型可通过环境变量复用：

```bash
export EDEN_MODEL_ROOT=/srv/models/EdenLive
python3 edenlive/scripts/models.py verify
edenlive/.venv/bin/python edenlive/scripts/check_install.py
```

`EDEN_MODEL_ROOT`建议使用绝对路径。首帧及机械臂资产已在代码中，无需再下载生成首帧用的图像模型。

## 启动前后端

在**已分配的一张GPU**环境中，从仓库根目录运行：

```bash
# 可选：在实际GPU作业内检查型号、CUDA和单卡可见性
edenlive/.venv/bin/python edenlive/scripts/check_install.py --gpu
bash edenlive/start.sh
```

默认监听本机HTTP **18500** 和 TURN/TCP **24488**，媒体relay使用本机UDP49620–49660；启动前检查端口，冲突会报错，不会停止别的服务。默认写实首帧+语义代理；可用 `--game robotarm` 从RGB基线启动、`--port`/`--turn-port`更换监听端口、`--no-compile`排查编译问题。**不设置或扩大 CUDA_VISIBLE_DEVICES**，遵循外部调度器/容器的设备分配。

首轮模型加载和编译会耗时，日志在 `edenlive/logs/backend.log`，打印访问地址不代表加载完成。默认启动本机 coturn 并生成本次随机凭据（仅runtime私有配置与子进程环境），原生媒体通过TURN/TCP传输，无JPEG/Base64轮询视频。默认配置只供本机/SSH使用，不是公网多用户部署方案。自有TURN可设置官方 `FLASHDREAMS_TURN_*` 环境变量并使用 `--no-turn`；服务端TURN地址不同可设置 `EDEN_SERVER_TURN_URL`，配置值不提交Git。

在用户电脑执行下列**一行命令**，保持终端运行：

```bash
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:18500:127.0.0.1:18500 -L 127.0.0.1:24488:127.0.0.1:24488 USER@GPU_SERVER
```

打开 **http://127.0.0.1:18500/ext/arm/**。只转发网页端口不足以保证WebRTC视频可用；必须同时转发TURN/TCP端口。更改服务端端口时，同步更改转发命令；浏览器本地TURN端口须与配置一致。若直接从远程IP访问网页，需另外处理HTTPS、ICE候选地址、媒体路由和防火墙，不适用上述loopback默认配置。

C3上 heart 与隔离GPU作业是两个网络空间，不能直接将这条普通SSH命令指向heart并认为已连通GPU。必须先建立**隔离作业→heart 的HTTP转发及TURN反向桥**，再转发heart到电脑；这里的通用启动器不自动创建C3桥、不改变隔离。安装使用 `cpu-run`，推理使用平台单卡作业并放在原有隔离包装器内，不能在heart启动CUDA。C3现有已部署目录保留，不被本次发布修改。

在tmux中启动可在断开电脑后继续：

```bash
tmux new-session -s edenlive
bash edenlive/start.sh
# Ctrl-b d 脱离；tmux attach -t edenlive 返回。
```

Ctrl+C停止本次启动的模型和TURN；另一终端可执行 `python3 edenlive/scripts/stop.py`，脚本核对PID与当前仓库路径，只停止本次启动器。网页“停止生成”仅停止采集/生成，服务与模型可继续常驻。

## 三个输入模式

| 模式 | 首帧 | 持续输入 |
| --- | --- | --- |
| RGB控制基线 | 模拟器原图 | 模拟器RGB |
| 写实首帧+语义代理 | 已提供写实PNG | 与权威物理状态同步的语义代理 |
| 写实首帧+RGB对照 | 同一写实PNG | 模拟器RGB |

选模式及动态提示词开关后点击“开始/重启此轮模型”，设置在新一轮生效并重置本轮。左侧观察相机可独立于模型固定输入机位。写实PNG是真正的初始画面条件，不是仅供风格参考；可替换configs中的图片及对应games/*/cover.png，但需保持初始机位、物体状态、尺寸和结构对齐。

物理逻辑以输入为准，模型视频是生成结果，不能拿生成画面反向判定模拟器抓取成功与否。原版60Hz物理步进、24FPS仿真采样，输入由模型消费背压控制，不代表每秒实时间固定采集24帧。当前模型首块9像素帧，后续12帧，对应3 latent帧；输入前取及生成/解码/媒体播放均会增加延迟。前端状态先于生成画面，24FPS标称播放率不是模型吞吐，也不是端到端延迟。

## 复现对照与验证边界

`/ext/arm/test-run`支持capture/static/dynamic/static-repeat/off；POST JSON例如 `{"case":"capture"}`。capture后开始一轮会执行原版演示并记录无损PNG、物体/关节权威状态；完整抓放后额外24帧写入 `runs/recordings/input/DONE.json`。先停止生成，再切换static/dynamic并重新开始，可重放相同输入；每次只保留对应case的当前结果。可通过 `EDEN_RECORD_DIR`指定新的独立输出目录，避免覆盖旧测试。

录像输出采用H.264/yuv420p/faststart。检查完整解码：`ffmpeg -v error -i OUTPUT.mp4 -f null -`。`scripts/test_semantics.py`可用系统Python直接验证事件与结构提示词逻辑。

发布包的迁移验证、浏览器检查和当前限制记录在 [VALIDATION.md](VALIDATION.md)。本次未在新服务器重新完成GPU端到端验收，不能把C3历史运行结果当成新环境的实测性能。
