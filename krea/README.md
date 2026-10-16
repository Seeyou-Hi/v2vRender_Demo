# Krea 14B＋VACE 渲染后端

本仓库仅提供 Krea 14B＋VACE 后端。完整推理源码与机械臂前端已包含；新服务器准备环境、模型权重后，按根目录 README 启动。

前端持续交互、四卡模型常驻和5 FPS逐帧返回的部署入口见 [C3实时联调说明](docs/live_frontend_20261016.md)。常驻入口为 `resident_4gpu.sh`，HTTP通过 `--resident-dir` 复用预加载worker；原片段上传入口仍保留。

## 两个优化版本（单卡、双卡和四卡）

| `--variant` | 实现 | 四卡历史测试稳态生成速度 |
|---|---|---|
| `bf16` | 注意力/FFN 输出采用 BF16 all-reduce；Q/K 归一化统计仍为 FP32；编译 336 个子模块 | 8.20 FPS |
| `bf16_blocks` | 上述优化＋编译 48 个 Transformer 块，允许 KV 管理造成的 graph breaks | 8.90 FPS |

默认 `bf16` 更接近原 FP32 通信版本；`bf16_blocks` 更快，但长视频累计像素/外观差异更大。两个版本不改模型权重。保留了每段新视频的 VACE 编码器与主 KV cache 双重重置，防止热身缓存导致开头动作跳变。

历史测试：4×A800 80GB、640×384、四步 `[1000,750,500,250]`、16 FPS 条件序列、TAE。首块输出 9 帧，后续每块 12 帧；仅末块补齐输入，输出裁去补帧。参考图仅首块输入。32.19 秒连续输入分别约 8.21 / 8.89 FPS。速度排除模型加载、编译热身和最终编码；不宣称达到 16 FPS 实时。详见 `docs/validation.md`。

### 单卡优化

设置 `KREA_GPUS=1` 使用完整模型和完整 KV cache，不做跨卡通信。单卡 `bf16` 对应 336 个子模块编译，`bf16_blocks` 在此基础上编译 48 个 Transformer 块；保留原有融合 QKV。两者都使用原 BF16 权重。

单张 A800 80GB、相同 10 秒 Depth＋参考图输入，完整热身后：原单卡 3.47 FPS，子模块编译 3.73 FPS，块编译 **3.93 FPS**（提升 13.2%，160 帧计算耗时 42.04 秒，实际交付吞吐 3.81 FPS）。峰值 PyTorch allocated 显存约 49.52 GiB；测试分配 160 GB 主机内存。速度不含加载、热身和编码，尚未达到实时。单卡新优化仅验证了 10 秒序列。详见 [单卡验证记录](docs/single_gpu_validation.md)。

```bash
# 从 krea/ 目录执行；输出目录必须尚不存在。
KREA_GPUS=1 bash render.sh --config configs/example.json \
  --control /srv/input/depth.mp4 --control-kind depth \
  --reference /srv/input/reference.png \
  --variant bf16_blocks --output outputs/single_blocks_case1

# 单卡上传/返回接口
python scripts/server.py --config configs/example.json --gpus 1 --port 8001
```

环境、模型下载和输入格式与多卡共用。默认热身为 33 帧；复现上面的测速时将配置 `warmup_frames` 设为 160。首次块编译较慢，短热身不保证覆盖所有 KV cache 形状。

## 1. 环境

基线是 Linux x86_64、Python **3.12**、PyTorch **2.9.1+cu128**、CUDA Runtime **12.8**、FlashAttention **2.8.3**、cuDNN **9.15.1.9**。建议使用项目独立虚拟环境。

系统需安装 Python 3.12/venv、FFmpeg（含 ffprobe）、C/C++ 编译器及兼容 CUDA 12.8 的 NVIDIA 驱动。测试使用四张 A800 80GB；源码也允许两卡；上表多卡速度/画质结论来自四卡，单卡结果见上一节。**模型初始化时每张卡会先加载完整模型再切分，不能按最终分片显存推断小显存卡能运行。** 建议至少 256 GB 主机内存，现有回归分配 384 GB。

在仓库根目录执行：

```bash
cd krea
bash install.sh
source .venv/bin/activate
```

安装脚本使用 `requirements.txt` 与完整解析的 `constraints.txt` 安装固定推理依赖和预编译 FlashAttention wheel。Scope 源码直接从 `third_party/Scope/src` 加载，不运行上游 UI 安装器。禁用 SageAttention，不需要其扩展。cuDNN 覆盖沿用 Scope 上游配置；它与 torch wheel 的严格元数据 pin 不同，`pip check` 可能报告该已知差异。

## 2. 下载模型

```bash
python scripts/download_models.py --model-dir models
python scripts/check_install.py --config configs/example.json
```

仅需下载一次，两个优化版本共用。可通过 `HF_ENDPOINT` 配置自己的 Hugging Face 镜像。脚本固定 revision，并核验已有 Krea/TAE/config 的 SHA256；Hugging Face 下载器会复用缓存。VACE 从官方 14B checkpoint 索引定位所需分片，精确提取 236 个 VACE 参数，不做精度转换；无需下载其无关基础模型分片。下载收据保存在 `models/download_receipt.json`。

完整模型地址与固定版本见 [docs/models.md](docs/models.md)。权重遵守各来源仓库的许可。

默认目录：

```text
models/
  krea-realtime-video/krea-realtime-video-14b.safetensors
  Wan2.1-T2V-14B/config.json
  Autoencoders/taew2_1.pth
  text_encoder/models_t5_umt5-xxl-enc-bf16.pth
  text_encoder/google/umt5-xxl/...
  vace_krea.safetensors
```

已有模型可复制/软链接至以上位置，或复制 `configs/example.json` 为 `configs/local.json` 并配置独立路径。所有 JSON 相对路径相对于配置文件，CLI 输入/输出路径相对于当前工作目录。模型不依赖 C3 的绝对路径。

## 3. 命令行渲染

所有以下命令从 `krea/` 执行。

```bash
# Depth 条件：必须是前端已归一化的 8-bit 深度视频，不是 RGB 视频。
bash render.sh --config configs/example.json \
  --control /srv/input/depth.mp4 --control-kind depth \
  --reference /srv/input/reference.png \
  --variant bf16 --output outputs/bf16_case1

# 第二个版本使用完全相同的输入、参考图、提示词。
bash render.sh --config configs/example.json \
  --control /srv/input/depth.mp4 --control-kind depth \
  --reference /srv/input/reference.png \
  --variant bf16_blocks --output outputs/bf16_blocks_case1

# 从 RGB 视频提取 Canny，阈值为 100/200。
bash render.sh --config configs/example.json \
  --control /srv/input/rgb.mp4 --control-kind canny \
  --reference /srv/input/reference.png \
  --variant bf16 --output outputs/canny_case1
```

`--reference` 可省略；`--prompt-file /path/prompt.txt` 覆盖默认真实材质提示词。参考图应与控制视频相机/构图对齐。视频与 PNG 序列保持宽高比缩放、黑边填充到 640×384，以 `floor(t*source_fps)` 采样至 16 FPS；PNG 目录需 `--source-fps 5`。NPY 输入必须已经是 16 FPS、RGB 顺序的 `uint8[T,384,640,3]` 控制帧，直接使用，不再次生成 Canny 或重采样。Depth 需要前端提供，当前工程不包含从 RGB 估计深度的另一个模型。

输出为 `output.mp4`（H.264/yuv420p/faststart，无音轨）、`profile.json`、`status.json`、环境和数值审计记录。输出目录必须不存在，防止覆盖实验。`--write-chunks` 会在生成过程中输出独立 chunk MP4；这些片段可提前取走，拼接时应保持顺序。`--save-array` 可用于像素回归，不建议普通任务启用。

默认使用单卡，`KREA_GPUS=2 bash render.sh ...` 可切换双卡，`KREA_GPUS=4` 切换四卡。请在服务器分配给自己的 GPU 内启动；C3 必须继续使用 Slurm 与隔离启动器，不在登录节点运行。新服务器不依赖 C3 的调度脚本。

## 4. 前端上传/返回接口

```bash
python scripts/server.py --config configs/example.json --gpus 1 --port 8001
```

默认监听 `127.0.0.1`；远程前端通过现有反向代理转发，或在受控内网指定 `--host 0.0.0.0`。该最小适配层没有用户认证，不能直接作为公网生产服务。

```bash
# 上传响应返回 upload 文件标识；把它们填入下一步 JSON。
curl --data-binary @/srv/input/depth.mp4 http://127.0.0.1:8001/uploads/mp4
curl --data-binary @/srv/input/reference.png http://127.0.0.1:8001/uploads/png

curl -H 'Content-Type: application/json' -d '{
  "control":"上一步返回的标识.mp4",
  "reference":"上一步返回的标识.png",
  "control_kind":"depth",
  "variant":"bf16_blocks",
  "prompt":"Photorealistic robotic workspace, fixed camera, preserve robot motion and objects, realistic materials and lighting."
}' http://127.0.0.1:8001/jobs

curl http://127.0.0.1:8001/jobs/JOB_ID
curl -o output.mp4 http://127.0.0.1:8001/jobs/JOB_ID/output.mp4
# 查询结果含已完成 chunks 列表；也可逐个下载：
curl -o chunk.mp4 http://127.0.0.1:8001/jobs/JOB_ID/chunks/000000.mp4
```

一次处理一个 GPU 任务，其余排队。每次上传任务独立加载/热身并重置缓存，任务之间不保持时序上下文；服务重启不自动恢复队列。上传任务使用“上传片段→分块/完整结果”；另支持下述持续推送帧的会话接口。

## 5. 持续输入与分块生成

前端“开始流式渲染”使用长会话；不用先完成录制或编码整段 MP4。会话内只加载一次模型，并保留 VACE 编码器和主 KV cache。会话支持 `--gpus 1/2/4`；单卡使用上面的编译优化，不初始化分布式通信，多卡在读取和消费帧块时保持同步。首块 9 帧，后续每块 12 帧，固定 640×384；会话支持 input_fps=5 或16，输出时间轴与输入一致。5 FPS下分别覆盖1.8秒和2.4秒，16 FPS下分别覆盖0.5625秒和0.75秒。停止输入后，不足一块的尾帧只在模型内部重复补齐，返回视频裁去补帧。

| 接口 | 内容 |
|---|---|
| `POST /streams` | JSON：`control_kind`、`variant`、`prompt`；返回 `id`、帧规格和容量 |
| `POST /streams/ID/frames/000000` | 紧密排列的 `uint8[T,384,640,3]` RGB24 原始字节；首块最多 9 帧，后续最多 12 帧 |
| `POST /streams/ID/finish` | JSON `{}`，表示不再输入；等待已接收的帧生成和完整视频封装 |
| `POST /streams/ID/cancel` | JSON `{}`，协作取消；模型加载或当前推理不会被立即中断 |
| `GET /streams/ID` | 任务状态、接收帧数和已完成的 `chunks` |
| `GET /streams/ID/chunks/000000.mp4` | 输入仍在进行时即可下载已完成分块 |
| `GET /streams/ID/output.mp4` | 输入结束且所有帧生成完成后下载完整视频 |

Depth 输入是已归一化的 8-bit 灰度，复制为三个通道；Canny 输入是 RGB，服务端逐块提取边缘。帧块按序发送，重复序号且内容一致会返回原确认，不会重复入队；乱序或内容不一致返回 409。短块必须是最后一块。当前会话接口不支持参考图。

后端待处理队列最多 4 块，满时返回 429；客户端保留并重试同一块。浏览器另保留最多 2 个待发块，满时暂停仿真并显示等待状态，不静默丢弃已采集帧。采样目标为 16 FPS，慢读回也会暂停仿真；硬件、浏览器和网络决定实际速度。RGB24 流约需 11.8 MB/s 的原始数据带宽。停止输入会先送完尾帧，再请求封装。

最多 4800 个输入帧；工作进程等待新输入超过 300 秒会失败。刷新页面不恢复会话。各会话仍共享一个 GPU 执行队列；会话之间重新加载模型。已消费的输入帧会删除，输出块保留在磁盘，最终通过 FFmpeg 拼接，避免把整段输出帧积存在内存中。生成与分块播放存在延迟，不保证实时或无缝播放。

重启 HTTP 服务以加载新接口；启动命令不变。此前 A800 上的离线吞吐结果不能视为本次流式协议或 PPU 推理已完成验证。协议测试使用模拟模型：

```bash
python -m unittest discover -s tests -p test_stream_input.py -v
```

## 源码目录

```text
scripts/render.py           可迁移多卡推理入口
scripts/server.py           上传、帧流会话、队列、进度、结果下载
scripts/stream_input.py     有界帧块队列、幂等序号及多卡读取同步
scripts/media.py            输入采样/缩放、Canny、视频编码验证
scripts/attention_tp.py     注意力分头与 KV cache 分片
scripts/krea_ffn_parallel.py FFN 中间维度并行
scripts/opt_variants.py     BF16 通信及块编译开关
scripts/fuse_parallel.py    子模块编译
scripts/download_models.py 固定版本下载与 VACE 提取
scripts/check_install.py   环境与模型路径检查
third_party/Scope/          冻结的 Scope 源码和许可证
```

## 逐帧输出（持续输入会话）

创建会话时可选：

```json
{
  "control_kind": "depth",
  "variant": "bf16_blocks",
  "output_mode": "frames",
  "frame_format": "png",
  "save_mp4": false,
  "prompt": "Photorealistic robot workspace..."
}
```

- `output_mode`：`video`（默认，兼容旧客户端）或 `frames`。
- `frame_format`：`png`（默认，无损）或 `jpeg`（质量95，文件扩展名 `.jpg`）。
- `save_mp4`：布尔值。frames 模式默认 false；设 true 同时输出图片、chunk MP4 和最终 MP4。video 模式必须为 true，默认 true。
- 只输出帧时不调用 MP4 编码/拼接，不要求 FFmpeg 用于这一输出路径。原片段 `/jobs` 接口保持原行为。

输入协议不变。通过 `GET /streams/ID/frames?after=-1&limit=128` 增量查询已生成帧；`after` 是上次收到的最后一个帧号，`limit` 为1–512。响应例子：

```json
{"frames":[{"index":0,"timestamp_seconds":0.0,"url":"/streams/ID/frames/000000.png"}],"next_after":0,"available_frames":1,"fps":16,"status":"running"}
```

按每条 `url` 下载图片，返回 `image/png` 或 `image/jpeg`。空列表时保留 `next_after` 并稍后查询；任务 completed 后继续拉取剩余帧。时间戳为视频时间 `index/input_fps`，不是生成完成的墙钟时间。经过 Node 路径代理时由前端加上自己的代理前缀。

图片从模型生成的 RGB uint8 直接编码，采用临时文件原子发布；不会从 MP4 解码，也不包含尾块补齐帧。帧号跨 chunk 连续从0开始。当前模型仍按首块9帧、后续12帧推理，图片在每块生成后依次发布；这是 HTTP 轮询/下载模式，不是 WebSocket 推送。图片保存在会话 `render/frames/`，保留到手动清理，会话仍受4800帧上限约束。

只输出图片时 `chunks` 为空、最终 `output.mp4` 不存在（下载返回404）；同时保存 MP4 时图片先发布，再编码该 chunk。图片编码、网络和前端播放也有延迟，此功能不会提高模型本身的推理 FPS。

CLI 示例：

```bash
python scripts/render.py --config configs/local.json --stream-dir /path/incoming \
  --output-mode frames --frame-format png --no-save-mp4 --output outputs/frame_session
# 同时保存 MP4：把 --no-save-mp4 换成 --save-mp4
```

## 四卡持续输入与逐帧输出

四卡与单卡共用 `/streams` 协议和输出模式。四个 rank 保持同一会话，注意力、FFN 和 KV cache 按既有张量并行方案切分；各 rank 读取同一输入块，在全部读取和生成完毕后同步，由 rank 0 删除输入。只有 rank 0 将生成图像搬到 CPU 并编码、发布图片/视频，其余 rank 继续参与分布式推理。

已分配四卡的环境中，从 `krea/` 启动 HTTP 服务：

```bash
bash serve_stream_4gpu.sh --config configs/local.json --port 8001
```

它等价于 `python scripts/server.py --gpus 4 ...`；服务本身只启动一次，由其为每个会话创建一个四进程 torchrun。不要通过 torchrun 启动 server.py，否则会重复绑定端口。`KREA_PYTHON` 可指定已有推理环境。

创建 `/streams` 时选择 `variant: "bf16_blocks"` 使用最快的已验证四卡编译方案；`output_mode: "frames"` 及 `save_mp4: false/true` 均可。帧率按会话 input_fps（5或16），首块9帧、后续12帧。

直接消费持续帧目录的 CLI：

```bash
bash render_stream_4gpu.sh --config configs/local.json \
  --stream-dir /srv/session/incoming --output-mode frames --no-save-mp4 \
  --output outputs/tp4_session
```

四卡 CLI 包装脚本默认选择 `bf16_blocks`。单卡默认入口保留。C3 必须先通过 Slurm 分配四卡并使用 `gpu_slurm_krea_isolated.py --offline` 启动；不能在 heart 登录节点直接运行 GPU worker。测试服务使用独立端口且已停止，既有前端部署未被替换。


## 与前端5 FPS采集连接

`/health` 返回 `supported_input_fps: [5,16]`，兼容现有前端的能力检查。前端已在创建会话时发送 `input_fps: 5`，后端现在将此参数传给工作进程并保存到会话状态。所有返回帧时间戳、MP4分块与最终视频均按5 FPS，无插帧、无重采样；一帧输入对应一帧输出。单卡/双卡/四卡共用此协议。

```json
{"input_fps":5,"control_kind":"depth","variant":"bf16_blocks","output_mode":"frames","frame_format":"png","save_mp4":true}
```

旧客户端省略 input_fps 时仍默认16 FPS；health.fps=16表示兼容默认值，创建会话响应fps=5及后续帧列表fps=5才是该会话的时间轴。其他输入帧率返回400。CLI指定 `--stream-dir ... --input-fps 5`；无需修改模型配置JSON的fps，普通整段视频路径继续使用既有16 FPS重采样。

5 FPS下首块9帧覆盖1.8秒，之后12帧覆盖2.4秒；第i帧时间戳i/5。模型仍按9/12帧生成，无权重或去噪步数改动。该适配保证传输/播放时间轴一致，不等同于针对5 FPS重新训练模型，也不保证视觉运动完全准确。

为避免独立MP4块拼接产生DTS间隙，新编码禁用B帧，保留H264/yuv420p/faststart；拼接后验证帧率与总时长。测试11帧在5FPS下为2.2秒，在16FPS下为0.6875秒，均完整解码通过。

现有 robotarm 前端的5FPS能力检查和原MP4播放器可使用此协议；逐帧图片代理与Canvas播放器仍需按前次检查完成。源码更新后需要重启实际运行的新版后端服务。


## 当前 C3 部署与后续维护（2026-10-16 核查）

- 本次上传以 C3 `/home/test01/siyuheng/v2v_demo/deployments/krea_streaming_20261016/krea` 的源码为准。
- 当前运行目录：`/home/test01/siyuheng/v2v_demo/runs/krea_7day_restart_20261016_122322`。作业号 14103 是历史记录；维护前以 `/health`、进程参数和 `resident/status.json` 核实。
- 环境：`/home/test01/siyuheng/v2v_demo/envs/scope`；模型：`/home/test01/siyuheng/v2v_demo/models/scope_plug`。文本编码器/分词器有独立路径，见当前运行目录 `config.json`。环境、权重、运行目录不上传 Git。
- 前端独立仓库：`https://github.com/LeroneMOI/robotarm`，本次核查提交 `74981ae9d7588838d47dc4a6f43e60146bb33311`；C3 路径 `/home/test01/dulingyi/robotarm`，直接修改 `dist/`。
- Nginx 在 `127.0.0.1:5175` 提供前端，`/api/render/*` 代理到 Python API `127.0.0.1:18801/*`；公网入口未验证。Nginx 配置位于 `/home/test01/siyuheng/v2v_demo/runs/krea_nginx_20261016_r1/nginx.conf`。
- 后端支持 `rgb24` 与 `gray8` 输入协商。Depth 使用 gray8 降低上传量，HTTP 接收后还原 RGB24 队列文件，GPU 接口不变。首块 9 帧，随后每块 12 帧；前端交互时间线为 5 FPS。
- HTTP API 串行执行会话，前一个会话若一直等待输入且未 finish/cancel，会使后续会话排队。结束采集时必须调用 finish；放弃时调用 cancel。
- 固定提示词来自 `configs/prompt_policy.json` 和 `scripts/prompt_policy.py`。前端只提交外观描述；固定规则始终拼接。负向模板作为 Avoid 文字约束，无独立负向 CFG。任务目录保存实际提示词及策略记录。

常驻模式：先在合适的 GPU 调度/隔离环境内运行模型进程，再运行 HTTP API，两者共享队列目录：

```bash
# 从 krea/ 执行。配置内替换模型路径，首次运行使用全新的队列目录。
KREA_PYTHON=/path/to/env/bin/python bash resident_4gpu.sh \
  --config /path/to/config.json --queue /path/to/new-resident

# 另一个终端/服务；等待 /health 的 resident.status 为 ready 后提交会话。
KREA_PYTHON=/path/to/env/bin/python bash serve_stream_4gpu.sh \
  --config /path/to/config.json --resident-dir /path/to/new-resident \
  --storage /path/to/api-output --port 18801
```

C3 GPU 进程必须通过 Slurm 及已有隔离启动器提交，不能在 heart 上直接推理。现有部署的 `start_gpu.sh` 是 C3 调度命令依据；迁移到其他机器时按本地调度方式启动。不要复用已有 `warmup_render` 的队列目录；不要在模型忙时重启 API。API 重启不会恢复内存中的会话，但输出文件仍保留。

验证：`python -m unittest discover -s tests -p 'test_*.py'`。此次上传只同步代码和运行 CPU 协议测试，不重启当前常驻模型。
