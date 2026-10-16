# Krea 默认提示词与固定规则

配置：`configs/prompt_policy.json`；拼接：`scripts/prompt_policy.py`。

`POST /jobs` 和 `POST /streams` 的 `prompt` 字段仅作为外观描述。空字符串或空白恢复默认外观。后端始终添加几何、相机、运动轨迹、交互和时序规则，以及固定负向模板，不接受前端覆盖固定配置。`GET /prompt-policy` 返回当前规则。

当前 Krea 无独立负向 CFG 分支；负向模板以 `Avoid the following:` 加入实际文本条件。它不是独立 negative conditioning。提示词属于软约束，无法保证几何和动作完全锁定；前端描述也应避免与固定规则冲突。

每个任务目录保存 `prompt.txt`（实际模型输入）和 `prompt_policy.json`（完整正向、负向、用户外观及拼接方式）。固定规则位于用户外观之前，减少长输入截断固定规则的风险；过长的外观描述仍可能被编码器截断。

前端为独立仓库 `https://github.com/LeroneMOI/robotarm`，C3 源码位于 `/home/test01/dulingyi/robotarm/dist/`。

2026-10-16 验证：前端 11 项、后端 12 项现有测试通过；默认/自定义/空白提示词拼接检查通过；线上 Nginx `/api/render/prompt-policy` 可读；GPU 作业 14054 保持 ready。本次未额外运行画质对照推理。
