# Krea 14B＋VACE 渲染后端

这是与仓库根目录 PAI H3 八步后端分开的可选模型。完整运行源码已包含；新服务器只需准备环境、模型权重和输入。

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

基线是 Linux x86_64、Python **3.12**、PyTorch **2.9.1+cu128**、CUDA Runtime **12.8**、FlashAttention **2.8.3**、cuDNN **9.15.1.9**。与 PAI 环境不同，必须使用独立虚拟环境。

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

默认分配四卡，`KREA_GPUS=2 bash render.sh ...` 可切换双卡，`KREA_GPUS=1` 切换单卡。请在服务器分配给自己的 GPU 内启动；C3 必须继续使用 Slurm 与隔离启动器，不在登录节点运行。新服务器不依赖 C3 的调度脚本。

## 4. 前端上传/返回接口

```bash
python scripts/server.py --config configs/example.json --gpus 4 --port 8001
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

一次处理一个 GPU 任务，其余排队。每次上传任务独立加载/热身并重置缓存，任务之间不保持时序上下文；服务重启不自动恢复队列。模型内部按时序因果分块，但此 HTTP 适配层仍是“上传片段→分块/完整结果”，不是前端持续推送帧的长会话协议。PAI 仍使用其原有命令行入口，不会因启动这个服务自动切换到 Krea。

## 源码目录

```text
scripts/render.py           可迁移多卡推理入口
scripts/server.py           上传、队列、进度、结果下载
scripts/media.py            输入采样/缩放、Canny、视频编码验证
scripts/attention_tp.py     注意力分头与 KV cache 分片
scripts/krea_ffn_parallel.py FFN 中间维度并行
scripts/opt_variants.py     BF16 通信及块编译开关
scripts/fuse_parallel.py    子模块编译
scripts/download_models.py 固定版本下载与 VACE 提取
scripts/check_install.py   环境与模型路径检查
third_party/Scope/          冻结的 Scope 源码和许可证
```
