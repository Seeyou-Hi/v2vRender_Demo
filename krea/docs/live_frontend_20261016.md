# C3 前后端常驻联调（2026-10-16）

## 当前入口

- 前端代码：`/home/test01/dulingyi/robotarm`；heart 监听 `127.0.0.1:5175`。
- Node 代理：`/api/render/*` → `http://127.0.0.1:18801/*`，浏览器无需直接连接计算节点。
- 后端：`/home/test01/siyuheng/v2v_demo/deployments/krea_streaming_20261016/krea`。
- 本次服务目录：`/home/test01/siyuheng/v2v_demo/runs/krea_live_20261016`。
- 四卡作业：14040，4×A800 80GB，申请8小时；不是永久服务。以健康接口和 gpu-jobs 的实际状态为准。
- 151 已建立本地转发，可在151浏览器访问 `http://127.0.0.1:15175`。

在自己的电脑访问（保持SSH终端连接）：

```bash
ssh -p 22001 -N -L 5175:127.0.0.1:5175 test01@47.99.114.202
# 浏览器打开 http://127.0.0.1:5175
```

页面选择“当前网页视角”（与屏幕相机一致；ext1/ext2是各自固定相机）、深度控制、块编译加速，点击“开始流式渲染”，操作机械臂，再点击“停止流式输入”。开始前可点击“检查连接”。模型预加载完成后才接受会话；停止输入会送完尾帧并播放剩余输出，不卸载模型。

## 数据与时序

采集与播放均为5 FPS，640×384。首块9帧，后续每块12帧。输入是逐帧RGB24格式的深度预览（也支持RGB转Canny）；后端每完成一块，发布连续序号JPEG，前端下载后按5 FPS在Canvas播放。不需要等待完整MP4，不接受流式参考图。

客户端当前发送 `output_mode=frames, frame_format=jpeg, save_mp4=false, input_fps=5`。API仍允许 `save_mp4=true`，保留MP4保存能力。健康接口 `fps=16` 是旧客户端兼容默认值；支持5 FPS列表见 `supported_input_fps`，每个流会话的 `fps/input_fps` 为5。

模型加载、四卡拆分与编译热身只在常驻进程启动时执行。会话之间清空KV与VACE编码缓存、重置随机种子；同一会话内部保持KV延续。一次只渲染一个会话，其他任务排队，共用同一组四卡。

这是持续分块输入输出，有固有缓冲延迟：首块需约1.8秒采集，后续每块覆盖2.4秒，再加上传、推理、下载和播放排队。吞吐达到5 FPS不意味着操控到画面只有200毫秒延迟。软件WebGL测试机采集低于5 FPS时会暂停仿真等待，不能用该机器的墙钟速度代表硬件浏览器性能。

## 环境、模型与运行状态

环境：`/home/test01/siyuheng/v2v_demo/envs/scope/bin/python`，Torch2.9.1+cu128、CUDA12.8。实际模型路径和参数在服务目录 `config.json`，复用既有权重，没有再次下载。

```bash
R=/home/test01/siyuheng/v2v_demo
S=$R/runs/krea_live_20261016
curl -s http://127.0.0.1:18801/health
cat "$S/resident/status.json"
tail -f "$S/resident.log"
# 同时可检查 api.log、frontend.log
```

GPU由 `start_gpu.sh` 经 gpu-run 和既有多卡隔离器调度，不能在heart直接执行推理。heart只运行HTTP、Node代理、调度启动器和存活监测。存活监测 `scripts/watch_resident.py` 监视启动器退出；作业到期/退出后把健康状态置为failed，避免遗留ready误导客户端。

## 重启原则

先停止输入并等待当前会话结束，再关闭旧服务。停止常驻模型可创建 `$S/resident/stop`（当前会话结束后退出）；不要删除或覆盖正在运行的queue。重新部署使用新的服务目录与空resident目录，复制有效config，按现有start_gpu.sh改成新目录重新申请四卡。新的HTTP进程指定同一新目录；不要同时启动两份API使用同一个任务目录。API重启不恢复内存中的旧会话。

通用服务器（非C3调度环境）的入口：

```bash
KREA_PYTHON=/path/to/environment/bin/python bash krea/resident_4gpu.sh \
  --config /path/to/local.json --queue /path/to/new-resident-dir
# 第二个进程；与worker共享本地/网络文件系统，所有绝对路径均需相同
python3 krea/scripts/server.py --config /path/to/local.json --gpus 4 \
  --resident-dir /path/to/new-resident-dir --storage /path/to/api-output --port 18801
```

前端启动命令：

```bash
cd /home/test01/dulingyi/robotarm
KREA_BACKEND_URL=http://127.0.0.1:18801 node server.mjs 5175
```

修改前前端文件保存在 `/home/test01/siyuheng/v2v_demo/versions/frontend_before_live_20261016`；后端旧脚本保存在 `versions/before_resident_20261016`。PAI H3后端未改动。

## 本次验收结果

真实Chrome浏览器操作前端，两场会话分别完成12帧、25帧；同一常驻作业14040，模型加载耗时均为0秒。第二场输入9+12+4帧，最后4帧补齐模型块后裁回4帧，最终25张JPEG逐张解码并在Canvas显示，观察到的播放序号严格为1至25，没有缺帧或乱序，页面无JavaScript错误。第一场之后无需重启GPU；此前取消的空会话也没有阻止后续正常渲染。

第二场首块9帧计算1.229秒，完整12帧块计算1.382秒，约8.68 FPS；最后短尾块同样计算12帧但只交付4帧。整个25帧的计算耗时3.993秒。这些数值不含采集、等待输入、网络与浏览器播放。软件WebGL测试浏览器采集明显低于5 FPS，因此本次验证的是持续交互链路和驻留复用，不是端到端5 FPS或长期低延迟保证。

前端10项接口/背压回归测试通过；启动器退出监测实测通过；后端既有12项CPU测试通过。第二场验收状态 `BROWSER_LIVE_PASS`。结果、截图、profile及修改过的前端文件副本在151：`/data2/siyuheng/v2v_demo/results/krea_live_20261016`。机器可读记录见 `resident_frontend_acceptance_20261016.json`。
