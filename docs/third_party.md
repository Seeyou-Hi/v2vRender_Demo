# 随仓库提供的第三方运行代码

runtime_deps 的五个 Python 文件已经随本工程纳入 Git，无需在新服务器另外 clone H3、LightX2V 或 PAI 推理仓库。它们作为固定版本依赖使用，文件 SHA256 记录于 configs/artifacts.json；当前没有自动更新逻辑。

| 文件 | 来源与核验状态 |
|---|---|
| minimax_h3_pdd.py | alibaba-pai/MiniMax-H3-Acc-LoRAs，revision `335001fb9e5455d68a0caa18ec2e319072150328`；当前文件 Git blob 哈希与下载时的上游元数据一致，未修改 |
| inference_minimax_h3.py | C3 已成功运行的 third_party/Minimax-H3-Turbo 快照；保留文件中的 HuggingFace Copyright / Apache-2.0 声明 |
| minimax_h3_ref2va_pipeline.py | 同一 C3 快照，保持原文件 |
| resolution_util.py | 同一 C3 快照，保持原文件 |
| convert_minimax_h3_to_diffusers.py | 同一 C3 快照，保持原文件；用于从原始权重转换，直接迁移完整转换权重时无需运行 |

除 PAI 文件外，以上快照尚未完成与原始上游 revision 的逐文件核对，不声称历史上从未改动。纳入本工程时未编辑这些五个文件。不要用最新版上游文件直接覆盖已测试快照。

本工程不为第三方代码重新授予许可证，原有版权声明保留；PAI 模型说明标注 MiniMax-H3 Community License。第三方权利不因收录而改变。现有本地记录未覆盖所有文件的完整许可证来源，这一信息缺口仍保留在此。

项目适配在 scripts/render.py：双卡 FSDP2、文本编码器 CPU offload、2048-token FFN 分块、设备修正、PAI 八次前向校验、视频编码和可配置路径。没有训练或修改模型权重。

scripts/gpu_slurm_multi_isolated.py 是项目自身的 C3 隔离启动/验证代码。迁移时将其探测 Python 从旧工程绝对路径改为当前解释器；普通非 C3 服务器直接使用 torchrun，不依赖 C3 启动器。
