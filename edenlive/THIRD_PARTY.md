# 来源与许可

- `third_party/EdenLive/`：VAST-AI-Research/EdenLive，基于 `f9f15fd1810fc274f167bc2ff8784b2645170286` 的C3部署快照，保留其 Apache-2.0 LICENSE、NOTICE 以及 realtime 下 NVIDIA FlashDreams 的 LICENSES/THIRD-PARTY-NOTICES。快照包含部署时已有本地修改；本项目另增加可迁移入口与机械臂扩展。
- `simulator/`：用户现有双机械臂前端的项目副本，复用 UR5/RoboTwin/Robotiq/Three.js 等资产与实现。模型和vendor目录中保留各自LICENSE、UPSTREAM-LICENSE及来源说明；不以本项目名义重新授予第三方资产许可。RoboTwin资产的使用范围以附带许可为准。
- `configs/first-frame-photoreal-generated-v1.png` 和 `games/*/cover.png`：当前部署的模拟器起始画面及其AI写实化初始条件，来源说明见configs/photoreal-provenance.json；它们不是EdenLive生成的测试结果。
- 本次没有复制MG4模型、Krea环境、C3浏览器二进制、TURN/SSH凭据或其他账号数据。

模型文件另行从 VAST-AI/EdenLive 固定revision获取，其模型许可由下载清单中的LICENSE提供；不将模型权重纳入本仓库。

- `third_party/LightX2V/`：ModelTC/LightX2V，固定基线 `d2d7424219abdc01b5722e7768e584bc96a5b418` 的C3源码快照，保留Apache-2.0 LICENSE。快照已应用lightx2v/patches下3个兼容补丁；A800/双卡与实时调度扩展在lightx2v/scripts，非声称完全等同上游原文件。
