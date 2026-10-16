# 代码来源

`third_party/Scope` 来自 https://github.com/daydreamlive/scope 的本地冻结源码，版本声明 0.2.5；本次从已验证的 `krea-vace-stable-20261016` 快照复制，未修改上游 Python 源码；省略无关 StreamDiffusionV2 示例 MP4。上游精确 commit 未在冻结文件中记录，因此不伪造 commit；逐文件 SHA256 记录在 `scope_source_sha256.json`。许可证保留于 `third_party/Scope/LICENSE.md`，各内嵌模块的版权头保留。

`attention_tp.py`、`krea_ffn_parallel.py`、`fuse_parallel.py` 与 BF16/块编译适配来自本项目已验证实验。实验冻结 tag 为 `krea-tp4-advanced-tested-20261016`，commit 前缀 `19d3265`。`opt_variants.py` 仅移除本次不发布的 Q/K 合并入口，BF16 与块编译实现保持原样；FFN/子模块编译的描述更新为实际组合后的通信方式。

`render.py` 将实验输入/模型/输出的绝对路径改为可配置入口，并保留四步、分块时序、参考图注入、缓存重置和数值审计。`server.py` 是新的片段上传适配层；本次发布仅提供 Krea 后端。

完整机械臂前端来自 `LeroneMOI/robotarm` 的 C3 工作区（基于 `74981ae9d7588838d47dc4a6f43e60146bb33311`，包含后续延迟修复），整理至根目录 `frontend/`。其模型和浏览器库的原有许可证、来源说明均保留。Node 代理补齐 Content-Encoding 透传与参考图路由。`c3_validation.py` 将既有 C3 验证逻辑放入本仓库，免除推理脚本对其他 checkout 的导入依赖；平台 GPU 分配/隔离启动器仍由部署环境提供。
