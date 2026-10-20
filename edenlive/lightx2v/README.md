# EdenLive / LightX2V 双 A800 实时机械臂

这是 2026-10-20 C3 当前双卡前后端的可迁移版本。保留旧的 `edenlive/start.sh` 单卡原生入口，双卡版本使用本目录自己的环境和启动器。完整 LightX2V 源码已随仓库提供，无需另外克隆 MG4 或 LightX2V；模型权重另行下载、转换和量化。

服务端 Chromium 执行原版双 UR5 模拟器、权威物理、IK、碰撞与抓放；左侧同步显示权威状态，右侧接收 H.264/RTP WebRTC 视频。三个模式是 RGB 首帧+RGB、写实首帧+RGB、写实首帧+语义代理。动态提示词包含结构稳定描述、当前抓持关系和本 chunk 的动作事件。首帧是实际初始条件，不能当作随意的风格参考。

## 安装与准备权重

验证硬件为 Linux x86_64、**两张 A800 80GB（SM80）**、Python 3.10、torch 2.11.0+cu128 / torchvision 0.26.0+cu128。C3 分配16 CPU、160 GB内存；转换及量化会产生额外权重文件，建议预留150 GB磁盘。需要现有驱动兼容 CUDA 12.8、NVIDIA EGL/OpenGL 库、Chrome/Chromium、coturn。脚本不升级驱动、不扩大 CUDA_VISIBLE_DEVICES。其他架构不能直接使用这个 SM80 packed INT8 配置。

以下命令均从仓库根目录执行：

```bash
# 安装放 tmux，断开电脑后继续。Python 包默认清华镜像，torch 使用官方 cu128 索引。
tmux new-session -s eden-light-install
bash edenlive/lightx2v/install.sh
# Ctrl-b d 脱离；日志：edenlive/lightx2v/logs/install.log
```

Ubuntu/Debian 管理员需预装 `python3.10-venv coturn curl libegl1 libgl1 libglib2.0-0` 及可用 Chromium。支持 `PYTHON`、`PIP_INDEX_URL`、`TORCH_INDEX_URL`；仅创建 `edenlive/lightx2v/.venv`。选中的 SDPA 配置**不需要 SageAttention**；A800 上已发现 Sage CUDA Graph 数值错误，不安装/启用该候选。当前依赖版本及原部署完整版本记录在 requirements.txt 和 configs/deployed-package-versions.json；后者含未启用的候选依赖，仅作环境证据。

```bash
# 登录/CPU侧下载并逐文件校验，支持断点续传，保持 TLS 验证。
# 已有23文件原权重可用 EDEN_MODEL_ROOT=/absolute/path/EdenLive 复用，不重复下载。
python3 edenlive/scripts/models.py download
python3 edenlive/scripts/models.py verify
# 只转换 5B few-step 和 UMT5，复用公共组件；CPU侧执行，不需要 CUDA。
edenlive/lightx2v/.venv/bin/python edenlive/lightx2v/scripts/prepare_models.py convert
# 在平台分配的 GPU 作业内执行一次 INT8 ConvRot 量化；禁止在登录节点执行。
edenlive/lightx2v/.venv/bin/python edenlive/lightx2v/scripts/prepare_models.py quantize
```

保留固定原模型 revision `de40b28f3f6eb6a0f12bb3d3967ca35578273713`，不下载14B/bidirectional/CLIP14B/FLUX。转换工具特意仅处理5B子集，不运行上游需要完整14B/CLIP的 `--all`。默认输出为 `edenlive/models/EdenLive-LightX2V` 和 `edenlive/models/EdenLive-LightX2V-int8`；已有转换/量化可用 **绝对路径**环境变量 `EDEN_LIGHT_MODEL_ROOT`、`EDEN_LIGHT_QUANT_ROOT` 复用。每次准备会生成大小/SHA256清单，原模型只读。转换记录 `configs/converted-manifest.json` 是 C3 历史参考，新环境以自己的 prepared-manifest.json 为准。

## 启动与访问

在**已分配的两张 GPU 作业内**启动；启动器本身不申请作业，也不修改设备可见性：

```bash
export EDEN_CHROME=/absolute/path/to/hardware-capable/chrome
bash edenlive/lightx2v/start.sh
# 调整端口：bash edenlive/lightx2v/start.sh --port 18511 --turn-port 24518
# 无 GPU、无模型时检查解析后的路径和命令：
python3 edenlive/lightx2v/scripts/start.py --dry-run
```

需要保证所选浏览器能够通过 ANGLE/EGL 使用分配的 NVIDIA GPU；检测到软件渲染会拒绝采集。未设置 EDEN_CHROME 时会找系统 google-chrome/chromium，或复用旧原生安装器记录的浏览器路径；双卡安装器不自动下载浏览器。C3 已验证的是 Chrome109，其他版本与驱动组合需实测。

日志：`edenlive/lightx2v/logs/backend.log`、`turn.log`；轮次/浏览器测量：`chunks.jsonl`、`browser.jsonl`、`realtime-performance.json`。生成随机 TURN 凭据仅写本机 runtime 私有文件，不提交版本库。

在用户电脑执行**一行**，两个端口都要转发，保持窗口运行：

```bash
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:18510:127.0.0.1:18510 -L 127.0.0.1:24508:127.0.0.1:24508 USER@GPU_SERVER
```

打开 **http://127.0.0.1:18510/**，等待模型加载后点击“开始 / 重启”。“停止生成”停止本轮但保持模型常驻；Ctrl+C 或以下脚本停止本次启动器及其子进程：

```bash
python3 edenlive/lightx2v/scripts/stop.py
```

端口占用会报错，不会停止其他服务。默认只供本机/SSH使用，未实现公网多用户鉴权。需要直接公网访问时必须另行配置 HTTPS、TURN 候选地址及防火墙。

## C3 隔离访问

上述通用启动适用于可通过 SSH 访问 GPU 主机/容器的场景。C3 的 heart 不是 GPU 节点，必须使用平台分配和隔离包装器。当前部署的专用桥完整参考在 [deploy/c3](deploy/c3/README.md)：`gpu-shell` PTY/raw/ready 握手承载 SSH，HTTP正向到作业，TURN反向到heart；随后用户电脑再转发heart。仅转发网页不能证明视频可用。

该目录是带 C3 绝对路径的实际部署快照，不是新机器上的一键启动器；私钥、host key、known_hosts、TURN凭据、浏览器和coturn二进制不在Git。不要直接在另一账号运行其停止脚本。新服务器使用本页的通用入口；C3适配不得通过关闭隔离解决。

## 加速实现

- 上游固定为 `ModelTC/LightX2V@d2d7424219abdc01b5722e7768e584bc96a5b418`；完整快照已包含3个兼容补丁，patches仅供审阅，**不要再重复应用**。
- INT8 ConvRot DiT/ProxyDINO、BF16 UMT5、双卡Ulysses序列并行；融合本地QKV/KV投影和FFN GELU，保持复制权重与原有分配限制。
- SDPA prepared BF16文本KV、稳定RoPE视图、双卡CUDA Graph；保留原clean-KV提交，不使用错误的Sage图执行候选。
- 每块3 latent，首块9像素帧、后续12帧；window18/sink6。实时latent存储有界，保留绝对位置与时序缓存。
- 最多一批未来输入；按处理时长安排采集。RGB用GPU张量NCCL广播；转RGB/拷回CPU在有界worker中与后续工作重叠；日志由有界后台队列写盘。
- WebRTC发送最多一块待发帧，过期帧替换；浏览器请求低抖动缓冲。原生H.264/RTP，无JPEG/Base64轮询视频。
- 写实首帧不论原始尺寸，先统一到704×1280再双卡广播和VAE编码，修复1691×930首帧导致首块退出的问题。

## 验证与限制

C3历史短测：模型约18.9 FPS、实际解码产出约18.2 FPS、测试浏览器约18 FPS；采集→显示中位约1.43秒。用户后续连接有效播放样本约1.54秒、发送→显示约206毫秒；网络和浏览器不同，不能套用单一时延。12帧输入收集、约0.64秒模型计算及分块播放仍有固定等待，**不宣称低至几百毫秒**。

模型FPS包含代理编码、必要文本编码、4步去噪、clean-KV提交和TAE；实际解码FPS按墙钟产出统计；浏览器FPS由rVFC回调测量。采集→显示使用RTP时间戳匹配和ping时钟估计，误差约半个最小RTT。控制序号匹配不代表视觉抓取动作已正确执行。显存约32.53 GB为rank0 PyTorch峰值allocated，不是全卡峰值；硬件WebGL已验证，硬件视频解码未验证。

首帧尺寸修复后，在C3实际执行写实首帧+RGB输出超过120帧，以及停止后RGB模式重启输出超过100帧。另有前次运行rank1 SIGSEGV尚未复现定位，不能称稳定性问题全部解决。约3分钟RGB连续生成出现明显色漂与结构漂移，量化/实时适配/缓存/基模贡献尚未隔离。抓持、释放位置、遮挡后夹爪恢复仍可能与权威输入不符。

性能证据见 [docs](docs/communication-REPORT.txt) 与 [原始汇总](docs/communication-summary.json)。这些是原C3部署历史结果，不是新服务器或便携入口的重新验收。便携发布执行了路径解析、语法、源码完整性及离线检查；未声称在全新服务器重新安装并完成GPU验收。后续工作见 [../TODO.md](../TODO.md)。
