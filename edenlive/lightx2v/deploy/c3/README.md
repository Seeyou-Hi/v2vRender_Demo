# C3 当前部署桥接源码快照

这些文件来自2026-10-20的 robotarm_lightx2v_20261020 部署，保留实际路径和平台约束，供审阅及复现桥接逻辑。它们不是通用安装器，不能直接在其他账号/服务器运行。尤其stop.py引用实际部署，不能作为新目录的停止入口。

- supervisor.py：heart上的TURN、SSH及 `gpu-shell -g2 -c16 -m160G -t01:00:00`；不取消其他作业。
- stdio_codec.py：PTY raw模式和EDEN_READY握手，防止平台stdio缓冲约一秒；帧格式仅封装SSH字节，不是额外的视频通道。
- stdio_endpoint.py：隔离作业内受限sshd、HTTP正向和TURN反向转发。
- gpu_isolated_dual.py：检查实际Slurm分配/设备映射，bwrap网络及设备隔离；不扩大CUDA_VISIBLE_DEVICES。
- inner.sh：独立环境双rank torchrun；前后端实际实现见../../scripts及../../web。
- launch/start/stop：独立tmux及本部署PID/作业核验。

运行需要部署自身创建的configs/bridge私钥、host key、known_hosts、TURN随机凭据、浏览器、coturn及安装环境；这些不在源码包中。新服务器请使用../../README.md中的通用入口，它动态生成自己的TURN私有文件，不依赖C3账号或MG4目录。C3迁移时保留隔离、重新建立本账号桥接密钥和路径，禁止拷贝旧服务凭据。

DEPLOYED-REFERENCE.txt为历史运维说明，作业ID、可用性、测试性能不能作为当前状态。
