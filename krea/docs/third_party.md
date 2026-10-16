# 代码来源

`third_party/Scope` 来自 https://github.com/daydreamlive/scope 的本地冻结源码，版本声明 0.2.5；本次从已验证的 `krea-vace-stable-20261016` 快照复制，未修改上游 Python 源码；省略无关 StreamDiffusionV2 示例 MP4。上游精确 commit 未在冻结文件中记录，因此不伪造 commit；逐文件 SHA256 记录在 `scope_source_sha256.json`。许可证保留于 `third_party/Scope/LICENSE.md`，各内嵌模块的版权头保留。

`attention_tp.py`、`krea_ffn_parallel.py`、`fuse_parallel.py` 与 BF16/块编译适配来自本项目已验证实验。实验冻结 tag 为 `krea-tp4-advanced-tested-20261016`，commit 前缀 `19d3265`。`opt_variants.py` 仅移除本次不发布的 Q/K 合并入口，BF16 与块编译实现保持原样；FFN/子模块编译的描述更新为实际组合后的通信方式。

`render.py` 将实验输入/模型/输出的绝对路径改为可配置入口，并保留四步、分块时序、参考图注入、缓存重置和数值审计。`server.py` 是新的片段上传适配层；PAI 后端代码独立保留。
