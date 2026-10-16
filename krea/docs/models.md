# 模型来源与固定版本

下载脚本固定以下版本。两个 Krea 优化版本共用同一组权重。

```text
https://huggingface.co/daydreamlive/krea-realtime-video
revision: 8c0d1571e6ed60992c15663bf2854ad23f96e029
https://huggingface.co/daydreamlive/krea-realtime-video/resolve/8c0d1571e6ed60992c15663bf2854ad23f96e029/config.json
SHA256: 95eeff7402d6ea3437d6a0993a716e4807f8539c03991ff8e8c52f8ef07462da
```

```text
https://huggingface.co/daydreamlive/krea-realtime-video
revision: 8c0d1571e6ed60992c15663bf2854ad23f96e029
https://huggingface.co/daydreamlive/krea-realtime-video/resolve/8c0d1571e6ed60992c15663bf2854ad23f96e029/krea-realtime-video-14b.safetensors
SHA256: 792f6042a645e227f5d71851845dc4098a7338fec9ec55279f88ebbc3527eec7
```

```text
https://huggingface.co/daydreamlive/Wan2.1-T2V-14B
revision: 0850912848a4e04d302c82f1e9cecda80bba43df
https://huggingface.co/daydreamlive/Wan2.1-T2V-14B/resolve/0850912848a4e04d302c82f1e9cecda80bba43df/config.json
SHA256: 7c9d7887442cb46716380bdf4426933d7cf88cbb31abcb434ea219322f5580ad
```

```text
https://huggingface.co/daydreamlive/Autoencoders
revision: 15b3be9cd154e089c560c094386659e027ab8a86
https://huggingface.co/daydreamlive/Autoencoders/resolve/15b3be9cd154e089c560c094386659e027ab8a86/taew2_1.pth
SHA256: f986092baa4a124035dcf44ef59cd30e0bef91b2aa4d6a6e8e152e55e82ca30c
```

```text
https://huggingface.co/Wan-AI/Wan2.1-VACE-14B
revision: 539c162b1387eac9dc4c20bd3f74671309e76a4c
```

```text
https://huggingface.co/Wan-AI/Wan2.1-VACE-1.3B
revision: 574e6a744642ce3bee319afc31496b88bde8aac4
```

VACE 源：`Wan-AI/Wan2.1-VACE-14B` 的 `diffusion_pytorch_model.safetensors.index.json`；236 个 `vace_blocks.*` / `vace_patch_embedding.*` 参数均位于 `diffusion_pytorch_model-00007-of-00007.safetensors`。只提取这些参数，保留 dtype。

文本编码器使用 `Wan-AI/Wan2.1-VACE-1.3B` 的 `models_t5_umt5-xxl-enc-bf16.pth` 与 `google/umt5-xxl/*`；不下载其 1.3B 扩散模型。

现有 C3 提取文件 SHA256 为 `fa3c87a0943a3e32ff4710abc39be2272d5c59dc268043d202191dd26a2a925a`。safetensors 不同版本序列化可能改变文件哈希；回归以参数与模型加载检查为准。
