# Nginx前端入口与四卡后端重启

本次运行目录：`/home/test01/siyuheng/v2v_demo/runs/krea_nginx_20261016_r1`。

原作业14040已经因NCCL通信等待600秒超时退出；原API PID1089990与原Node PID1090198已停止。保留历史输出、源码和权重。

新入口：151的 `http://127.0.0.1:15175` → 既有SSH隧道 → heart的Nginx `127.0.0.1:5175`。Nginx直接提供 `/home/test01/dulingyi/robotarm/dist`，`/api/render/` 代理到新API `127.0.0.1:18801`。不再运行Node静态服务器。仅监听回环地址，没有开放公网服务。

Nginx使用Ubuntu软件仓库包解压部署在 `/home/test01/siyuheng/v2v_demo/tools/nginx`，没有修改系统安装。配置为运行目录中的 `nginx.conf`，日志为 `nginx_access.log` 与 `nginx_error.log`。临时文件及PID均保存在运行目录。

新四卡作业14047，申请8小时，复用原Scope环境及权重；服务日志为 `launcher.log`、`api.log`、`watch.log`。常驻worker状态：`resident/status.json`。

## 空闲通信超时修复

旧版rank0在本地文件队列循环等待任务，其余rank已经进入broadcast。连续空闲10分钟会触发NCCL默认600秒超时。新版所有rank每秒共同完成一次空闲消息广播，结束collective后再等待；rank0每5秒写入 `heartbeat_unix`，可确认空闲状态下通信仍向前推进。没有通过关闭watchdog或无限延长超时掩盖问题。

## 查看与维护

```bash
R=/home/test01/siyuheng/v2v_demo
S=$R/runs/krea_nginx_20261016_r1
curl -s http://127.0.0.1:5175/nginx-health
curl -s http://127.0.0.1:5175/api/render/health
cat "$S/resident/status.json"
tail -f "$S/launcher.log"
# 验证Nginx配置
"$R/tools/nginx/usr/sbin/nginx" -t -p "$S" -c "$S/nginx.conf"
# 配置重载（仅在修改并验证后执行）
"$R/tools/nginx/usr/sbin/nginx" -p "$S" -c "$S/nginx.conf" -s reload
```

自己电脑访问可使用：

```bash
ssh -p 22001 -N -L 5175:127.0.0.1:5175 test01@47.99.114.202
```

浏览器打开 `http://127.0.0.1:5175`。若在151本机打开则使用已有15175入口。任何机器的127.0.0.1都指向该机器自身，不能从另一台电脑直接访问151的回环监听端口。

## 重启后验收

2026-10-16 18:37（北京时间）：通过Nginx入口完成真实浏览器会话 `7bcee8e4f0b043fbaccf0317c28dfd62`，22帧全部采集、渲染并返回播放。浏览器无JS异常；观察到帧序号1至22连续，原始RGB与实际输入深度的索引均等于输出索引。相机为live_viewport，实际source_aspect约1.668，640×384内容区域完整覆盖画布，无宽幅黑边。

当前GPU健康状态ready，job14047；`heartbeat_unix`在两次检查间从1792147024.0296增加到1792147059.1883，证明空闲collective持续推进。尚未做超过10分钟的空闲耐久测试。Nginx健康请求返回200，实测约0.268秒。异步文件读取 `aio threads` 与 `sendfile on` 已启用，静态大文件读取不占用主事件循环。

前端相关11项CPU回归测试通过。实际浏览器验证记录与三栏截图位于151：`/data2/siyuheng/v2v_demo/results/krea_nginx_20261016`。

本次初始资源读取和SSH链路发生明显延迟，浏览器采集使用软件WebGL；不以该测试声称端到端5 FPS或低延迟。原始RGB24输入每个9帧包约6.64MB，弱网时上传会成为瓶颈。图像生成仍为软深度约束，同帧对照通过不等于严格几何重建。

## 公网访问核查（18:41）

先前15175地址仍依赖SSH隧道，不是公网发布。SSH连接47.99.114.202:22001实际落到heart，网卡地址192.168.10.26；该公网IP并不在heart接口上。test01仅有C3调度broker的sudo授权，没有公网网关或防火墙管理权限。外部探测47.99.114.202:8080连接超时，且heart另有服务占用覆盖网络地址192.168.196.58:8080，未改动该服务。

已在现有Nginx中额外监听 `192.168.10.26:15175`，保留 `127.0.0.1:5175`。公网管理员需要根据实际网络建立公网HTTP入口/端口映射到heart的这个内网入口，并放行对应入站端口。拟议映射为 `47.99.114.202:15175 -> heart 192.168.10.26:15175`，当前尚未建立或验证公网映射，不可把拟议公网URL视为可用链接。修改前配置备份为运行目录 `nginx.before_lan.conf`。

补充实测：ss确认Nginx已监听192.168.10.26:15175，但从heart自身使用curl --noproxy '*'访问该地址仍被拒绝；127.0.0.1:5175/nginx-health正常返回nginx ok。因此不仅缺少公网映射，内网监听的连接路径也尚未可用，需要管理员检查节点网络访问策略/防火墙。不能声称内网入口已经联通，也不能仅凭监听成功判断公网可用。

## 7天常驻切换（2026-10-16 19:00，北京时间）

按用户要求取消旧作业14047，停止其API，重新申请4卡作业14054。调度器确认TimeLimit=7-00:00:00，StartTime=2026-10-16T19:00:48，EndTime=2026-10-23T19:00:48。新后端服务目录 `/home/test01/siyuheng/v2v_demo/runs/krea_7day_20261016`，新日志、resident队列和API结果均放在此目录。Nginx保持原进程与配置目录，仍代理127.0.0.1:18801。

SSH登录：

```bash
ssh -p 22001 test01@47.99.114.202
```

在访问网页的电脑上运行端口转发，并保持该终端打开：

```bash
ssh -p 22001 -N -L 15175:127.0.0.1:5175 -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 test01@47.99.114.202
```

浏览器打开 http://127.0.0.1:15175 。断开转发不会终止GPU后台作业，但该电脑将无法通过回环地址访问网页。公网入口仍未打通。
