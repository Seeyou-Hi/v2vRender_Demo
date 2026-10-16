# 视频片段接口约定（草案，未实现）

前端流程：上传片段 → 获得任务 ID → 查询状态 → 下载 H.264 MP4。
请求不等待模型推理完成，避免长请求超时。首版 GPU 同时只处理一个任务。

| 方法和路径 | 输入 | 返回 |
|---|---|---|
| POST /v1/render/jobs | multipart: video 文件，prompt 可选，seed 可选 | 202: job_id、status_url |
| GET /v1/render/jobs/{job_id} | 无 | queued/loading/encoding_reference/denoising/encoding_output/complete/failed；完成后提供 result_url |
| GET /v1/render/jobs/{job_id}/video | 无 | 完成时 video/mp4；未完成返回 409 |
| GET /healthz | 无 | 服务存活状态；不等价于模型已加载 |

首版沿用已测试输出规格 960×544、243 帧、24 FPS，任意输入长度/尺寸的裁剪和重采样规则仍需实现并在响应中返回；不能静默假设与输入逐帧等长。
服务端生成任务目录和文件名，不接受客户端任意服务器路径；任务状态应落盘。
失败返回可读错误，保留详细日志在服务端。队列容量、文件大小上限和代理超时在部署时配置。
片段之间暂不共享状态。此接口支持异步片段渲染，不表示连续实时流式输出。
