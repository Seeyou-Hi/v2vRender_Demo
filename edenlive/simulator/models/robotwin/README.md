---
license: MIT License
---

RoboTwin2.0 模型资产仓库。


#### 下载方法 
:modelscope-code[]{type="sdk"}
:modelscope-code[]{type="git"}

# RoboTwin object assets

Source: https://huggingface.co/datasets/TianxingChen/RoboTwin2.0/blob/main/objects.zip
Official catalog: https://robotwin-platform.github.io/doc/objects/index.html
Dataset and archive README declare MIT. UPSTREAM-LICENSE retains the RoboTwin repository MIT copyright and permission notice (Tianxing Chen, 2025).

Selected custom/optimized catalog models: 001_bottle/base0 and base1; 035_apple/base0 and base1; 071_can/base0 and base1. No Objaverse distractor models or PartNet-Mobility articulated models are included. provenance.json records the downloaded original file hashes, archive ETag, and dataset revision.

The `*-web.glb` files preserve mesh geometry and contain resized JPEG textures (maximum 1024 pixels). The application uniformly scales and centers them and uses separate approximate collision boxes. Original GLB downloads are retained outside the published dist directory in assets-source/robotwin.

This uses RoboTwin assets in the existing Three.js app. It does not run the RoboTwin/SAPIEN simulator or trained policies.
