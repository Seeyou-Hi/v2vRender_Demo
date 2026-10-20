# 夹爪模型来源

Robotiq 2F-85： https://github.com/robotiq/ros
提交：adb20dc0048ff2ef51c5a86fe2f7880a8618f099
文件来自 grippers/robotiq_description/meshes/visual/2f_85 与 collision/2f_85；关节来自 robotiq_2f_85_macro.urdf.xacro。原始文件和许可保留在 robotiq/。

UFACTORY xArm G1： https://github.com/xArm-Developer/xarm_ros
提交：aad7e1611c9c46eb719045414394bfdd42dcb0f8
文件来自 xarm_description/meshes/gripper/xarm；关节来自 xarm_gripper.urdf.xacro。原始文件和许可保留在 xarm/。

assembly.json 是为浏览器提取的连杆、坐标、转轴与 mimic 联动参数。xArm 夹爪绕 Z 轴旋转 90°，使夹指闭合方向与现有控制一致。显示比例沿用机械臂的 2.8 倍；夹爪位置用仿真安装偏移，并非真实硬件适配器设计。
开口与指尖坐标根据网格和关节姿态测量，抓取点按所选型号补偿。夹爪动作与抓取逻辑仍是运动学演示，不包含驱动、摩擦与抓取力求解。


2026-10-14：增加自建仿真安装座，连接腕部端面与夹爪底座；原始仓库连杆与网格未改动。物品按夹持部位宽度闭合，并将细物体放在平行夹指接触面之间。
