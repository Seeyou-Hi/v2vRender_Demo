# PAI H3 八步机械臂渲染后端

从 C3 已跑通的 PAI MiniMax-H3 Ref2VA 八步实验中提取的独立工程草稿。
当前交付为双卡离线命令行后端；上传/返回的 HTTP 层只完成接口约定，尚未实现。
重构后完成语法和配置检查，尚未在目标服务器运行 GPU 回归，不能视为开箱即用部署包。

## 文件

```text
scripts/render.py            PAI 专用双卡 FSDP2 推理
scripts/video_io.py          H.264 / yuv420p / AAC 编码与完整解码验证
scripts/check_config.py      不加载模型的部署检查
scripts/relocate_model.py    迁移后更新模型索引中的绝对路径
configs/example.json         路径、尺寸、帧数、随机种子
configs/robot_realism.txt    首轮 PAI 真实材质提示词
configs/artifacts.json      PAI 权重版本/哈希、运行辅助代码哈希
docs/interface.md           前端上传片段、查询任务、下载结果的接口草案
requirements.txt           已核实的主要依赖版本，非完整环境锁
runtime_deps/              随 Git 提供的固定版本运行辅助代码
provenance/                C3 原脚本/实验追溯，不进入 Git
```

## 推理行为

RGB 原视频作为 Ref2VA 参考；没有 Canny/Depth 硬控制。默认 960×544、243 帧、24 FPS、seed 43。
使用原先真实材质实验提示词，摄像机与动作保留仍然是软约束，不能保证严格逐帧对齐。
PAI 适配器不是普通 PEFT LoRA；保留 `apply_pdd_lora`、video/audio shift 12/3、9 个网格点对应实际 8 次 DiT 前向的实现，并断言 NFE=8。
保留双卡 FSDP2、文本编码器 CPU offload、FFN token chunk=2048、BF16 适配器与原有输出头精度。
每次启动都会加载模型，尚未改成常驻服务，也没有跨片段状态或实时能力保证。

## 迁移与运行

1. 在新服务器单独准备 Python 3.10、匹配驱动的 PyTorch 2.11.0+cu128、requirements.txt 与系统 ffprobe。现有 C3 环境继承父 Conda 包，不能只复制其虚拟环境目录。
2. 单独迁移 `H3-Acc-local` 完整模型。原目录的 text_encoder/tokenizer/processor 是绝对软链接，复制时必须带上目标实际内容，例如针对该模型目录使用 `rsync -aL`。不要修改 C3 原权重。
3. 单独迁移 PAI `MiniMax-H3-Ref2VA-Acc-8Step.safetensors`（约 1.37 GB）并按 artifacts.json 核验 SHA256；它不能代替 H3 基础模型。
4. runtime_deps 已随 Git 纳入，保持当前目录即可，不需要额外下载 H3 推理代码。来源与校验信息见 docs/third_party.md 和 configs/artifacts.json。
5. 对目标模型运行 `python scripts/relocate_model.py /srv/models/H3-Acc-local`，更新模型索引中的旧绝对路径。
6. 复制 configs/example.json 为 configs/local.json，设置路径和输出目录，放好输入视频。

```bash
python scripts/check_config.py --config configs/local.json
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 torchrun --standalone --nproc_per_node=2 scripts/render.py --config configs/local.json
```

以上是普通双卡服务器启动示例。C3 上必须使用原工程的 Slurm 和隔离启动器，不能在登录节点直接运行；worker 在 Slurm 环境中仍调用原隔离验证函数，对应验证模块已随 scripts 提供。其他服务器使用自身调度和分配规则。

结果为配置 output_dir 下的 output.mp4、status.json、status_rank1.json、video_validation.json。
当前基线使用两张 A800 80GB；尚未验证其他卡型、较低显存或新的依赖安装环境。

## Git 上传边界

上传 scripts、runtime_deps、configs（不含 local 配置）、docs、requirements.txt、README.md、.gitignore。
不上传权重、虚拟环境、输入/输出视频、缓存、原始下载日志/响应头、实验目录、SSH 配置和凭据。
不把整个 C3 v2v_demo 根目录直接 git add；该目录含其他模型与实验资源。

下一步需完成：目标环境安装验证、目标 GPU 回归、HTTP 任务队列实现及前端联调。
仓库不包含模型权重或输入输出视频。独立工程尚未进行新的 GPU 回归验证。
