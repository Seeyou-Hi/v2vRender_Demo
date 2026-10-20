# Universal Robots UR5

Source: https://github.com/ros-industrial/universal_robot
Revision: 39ad110d8f2e8f66856a201cca88aa7a7025e3eb
Visual meshes: ur_description/meshes/ur5/visual/*.dae (unmodified).
Joint and visual transforms: ur_description/urdf/inc/ur_macro.xacro,
ur_description/config/ur5/*.yaml (copies included here).
The upstream ur_description LICENSE is included verbatim.

This demo uses the original visual materials, a uniform 2.8x display scale,
and ROS Z-up to scene Y-up conversion. Its parallel gripper is a custom demo
attachment, not a Universal Robots product model.
The browser solves position and downward tool direction with joint limits.
Scene coordinates are scaled demonstration units, not physical robot commands.
