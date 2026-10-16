# RoboTwin table integration

Official table construction: https://github.com/RoboTwin-Platform/RoboTwin/blob/ea8b21121ebb3cd201ff5b3fe361944ac94eda3f/envs/utils/create_actor.py (create_table). RoboTwin constructs its default table from a tabletop and four box legs; it does not use a separate scanned or GLB table mesh.

The included tabletop image is a resized JPEG of background_texture/seen/61.png from the official RoboTwin2.0 asset archive. Source hashes, revisions and adaptations are in provenance.json. The work area footprint is kept at 6.4 by 4.6 scene units to fit the existing UR5 dual arms; height, thickness and leg construction follow RoboTwin. Tabletop remains at y=-0.01 for existing tasks and calibration. Meshes also serve as matching box collision geometry. See UPSTREAM-LICENSE.
