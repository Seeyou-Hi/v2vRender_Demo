# Krea 机械臂交互渲染 Demo

完整的双机械臂浏览器前端与 **Krea 14B＋VACE** 后端。前端持续采集 Depth / RGB 转 Canny 条件，后端四步因果分块渲染并逐帧返回。页面上方播放渲染结果，下方操控仿真。

主分支只保留 Krea；模型权重和 Python 环境需另行准备。前端模型素材、纹理、浏览器依赖、Scope 推理源码、多卡优化及前后端代理均已纳入 Git，不需要再下载其他项目代码或运行前端构建。

## 目录

```text
frontend/                 完整前端：直接编辑 dist/，含 models/、vendor/ 和测试
krea/                     推理后端、独立 Python 依赖、配置与测试
  scripts/server.py       HTTP 上传、流式输入、状态与逐帧下载
  scripts/resident_worker.py  四卡模型常驻与会话调度
  scripts/render.py       Depth/Canny、可选参考图、分块推理与帧输出
  scripts/attention_tp.py 注意力及 KV cache 多卡并行
  scripts/krea_ffn_parallel.py  FFN 多卡并行
  scripts/opt_variants.py BF16 通信、块编译
  configs/prompt_policy.json   后端固定规则与默认外观提示词
  third_party/Scope/      已包含的推理代码与许可证
start.sh                  同机四卡常驻模型＋API＋前端启动
render.sh                 离线渲染入口
runs/                     本地日志、队列、任务输出（不提交）
```

## 环境和权重

验证基线为 Linux x86_64、4×A800 80GB、Python 3.12、PyTorch 2.9.1+cu128、CUDA Runtime 12.8、FlashAttention 2.8.3；前端 Node.js >=20。主机需 FFmpeg/ffprobe、兼容的 NVIDIA 驱动及 C/C++ 编译工具；建议主机内存至少 256 GB，现有四卡作业分配 384 GB。模型初始化时每卡先加载完整模型再切分，不能只按最终分片大小选择显存。

```bash
git clone https://github.com/Seeyou-Hi/v2vRender_Demo.git
cd v2vRender_Demo
bash krea/install.sh
source krea/.venv/bin/activate
python krea/scripts/download_models.py --model-dir krea/models
python krea/scripts/check_install.py --config krea/configs/example.json
```

模型目录按下载脚本生成；已有权重可以直接复用，修改配置的 `model_dir` 及必要的编码器/分词器路径即可。相对路径以配置文件所在目录为基准，**不要以 shell 当前目录为基准**。权重地址及文件表见 [模型说明](krea/docs/models.md)，精确依赖见 `krea/requirements.txt` 和 `krea/constraints.txt`。前端依赖均在 `frontend/dist/vendor/`，无需 npm install。

## 启动完整前后端

在已有四张 GPU 的机器/调度作业内，从仓库根目录执行：

```bash
bash start.sh
# 或使用自己的配置（路径内不能放账号、密码、token）：
bash start.sh /absolute/path/to/config.json
```

打开 `http://127.0.0.1:5175`。等待“检查连接”显示模型常驻就绪后，选择单视角、Depth 或 Canny，点击“开始流式渲染”。开始后操控机械臂；结束时点击“停止流式输入”，让后端收到结束信号。

需要首帧参考图时，先点击“重置到 ext1 并导出首帧”，保存 `ext1-initial-1280x768.png`。将该图交给图像编辑模型，仅改善材质、光照和纹理，保留相机、机械臂几何与物体布局，保持 5:3 比例。选择生成的 PNG/JPEG（例如 1280×768），确认“流式渲染使用参考图”已勾选，再开始流式渲染。启动会重置当前场景并固定使用 ext1；请保持导出时的物品、夹爪和仿真配置。参考图仅注入首块，通过后续时序缓存延续外观，并不强制将输出首帧替换为该图片。取消勾选即可使用原有无参考图流程；该参考图选项只用于流式模式。

网页“ext1 正面”使用与采集相同的固定相机，并按 5:3 留边显示；原来的“正视”按钮仍是另一种自由观察预设。参考图流程及验证限制见 [说明](krea/docs/ext1_reference_20261019.md)。

首次加载和编译需要时间；`/api/render/health` 的 `resident.status` 变为 `ready` 才可提交会话。启动器为每次启动创建新的 `runs/krea_*` 目录，记录三个进程的日志和 PID；Ctrl+C 停止本次启动的服务。前后端启动端口冲突时需改端口或使用下面的分别启动方式。脚本不会申请 Slurm 作业；C3 上必须沿用平台 GPU 分配与隔离规则，不能在 heart 直接运行 GPU 进程。

可选环境变量：

```bash
KREA_PYTHON=/srv/env/bin/python NODE=/usr/bin/node \
PORT=5176 KREA_API_PORT=8002 bash start.sh /srv/config.json
```

默认只监听本机。远程服务器可通过 SSH 转发访问，端口与启动参数保持一致：

```bash
ssh -N -L 5175:127.0.0.1:5175 user@your-server
```

浏览器在本机 `localhost` 上运行，也可使用 gzip 等浏览器功能。若自行对外部署，配置域名和 HTTPS；`HOST=0.0.0.0` 可调整 Node 监听地址，但本身不负责打开服务器网络端口。

## 分别启动／接入现有常驻模型

下面三个命令在不同终端运行。所有路径应改为实际绝对路径；队列目录必须全新，模型进程和 HTTP API 必须可读写同一个目录。

```bash
# 1. 在四卡 GPU 作业内加载并保持模型
cd krea
KREA_PYTHON=/srv/env/bin/python bash resident_4gpu.sh \
  --config /srv/config.json --queue /srv/new-run/resident

# 2. HTTP 服务，可与 GPU 服务分开管理
cd krea
KREA_PYTHON=/srv/env/bin/python bash serve_stream_4gpu.sh \
  --config /srv/config.json --resident-dir /srv/new-run/resident \
  --storage /srv/new-run/api --port 8001

# 3. 前端与代理；此命令从仓库根目录执行
KREA_BACKEND_URL=http://127.0.0.1:8001 node frontend/server.mjs 5175
```

若从已进入 `krea/` 的终端继续执行第二条，不要再次 `cd krea`；上面的每条命令按独立终端理解。Node 代理已支持压缩输入、帧图片和参考图上传，无需 Nginx 即可运行。Nginx 可替代 Node 的服务和代理，示例见 [配置](deploy/nginx.conf.example)。

## 输入、性能与提示词

- 当前交互输入 **640×384、5 FPS**，首块 9 帧，后续 12 帧。四卡常驻使用 `bf16_blocks`。离线入口支持单卡、双卡、四卡和 `bf16` / `bf16_blocks` 两种优化，见 [后端说明](krea/README.md)。
- Depth 协商为 gray8，支持 gzip 无损压缩；Canny 接收 RGB。输出最多六张并发取回，按序以 5 FPS 播放。MP4 是可选保存格式，前端默认逐帧返回且不保存 MP4。
- 固定几何、相机、运动和时序规则由后端拼接，前端只编辑外观。负向模板以 Avoid 文本加入正向条件；没有独立负向 CFG。模型指令是软约束，无法保证精确复刻几何。
- 历史四卡计算约 1.34 秒/12 帧，模型计算快于 5 FPS 输入；实际延迟还包括首块采集、上传、排队和播放。不是所有网络和客户端都能持续实时。最近的真实 API/Canvas 测试通过；151 软件 WebGL 的真实 3D 采集测试未完成，不宣称全新服务器已完成 GPU/浏览器实机验收。
- 同一后端串行处理会话。已有任务时新流返回明确错误；结束旧流后再开新流。刷新/退出页面会尽力发送取消，异常断网仍可能需等待超时。HTTP API 重启不恢复旧会话内存状态，已生成文件保留。

## 检查与维护

```bash
# CPU 协议与媒体测试，使用准备好的 Krea 环境
krea/.venv/bin/python -m unittest discover -s krea/tests -p 'test_*.py'
# Node >=20；不需要 npm install
cd frontend
npm run check
npm test
```

改页面和仿真：`frontend/dist/`；改传输代理：`frontend/backend-proxy.mjs`；改 API/调度/推理：`krea/scripts/`。静态文件修改刷新即可；API 修改需结束会话后重启 API；模型进程已导入的推理代码修改需重启 GPU worker。

依赖、模型和素材的许可及来源保留在各自目录；Scope 来源见 [说明](krea/docs/third_party.md)。当前 C3 机器路径及历史测速记录在 `krea/docs/`，属于部署证据，迁移时以根目录的可配置启动方式为准。
