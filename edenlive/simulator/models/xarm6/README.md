# UFACTORY xArm6

Source: https://github.com/xArm-Developer/xarm_ros
Revision: aad7e1611c9c46eb719045414394bfdd42dcb0f8
Meshes: xarm_description/meshes/xarm6/visual/*.stl (unmodified).
Joint data: xarm_description/config/kinematics/default/xarm6_default_kinematics.yaml
Limits: xarm_description/urdf/xarm6/xarm6.urdf.xacro
License: BSD-3-Clause, copyright UFACTORY Inc. See LICENSE.

The demo applies a uniform 3.2x display scale, rotates ROS Z-up into browser Y-up,
uses custom shell materials, and adds a procedural parallel gripper.
The gripper is a demo attachment, not the official UFACTORY gripper model.
Position and downward tool direction are solved numerically with joint limits.
No self-collision, dynamics, or physical robot control is included.
