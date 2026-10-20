"""Portable native entrypoint; keep the deployed BUNDLE compatibility fix."""
import os
from aiortc import RTCIceServer, RTCPeerConnection, RTCConfiguration, RTCBundlePolicy
from flashdreams.runtime_v2.serving import webrtc_server

# Optional distinct server TURN URL for split-network deployments. Ordinary
# one-host installs use the same local coturn over TCP for both peers.
if os.environ.get('EDEN_SERVER_TURN_URL'):
    def server_ice_servers():
        return [RTCIceServer(os.environ['EDEN_SERVER_TURN_URL'],
                            username=os.environ['FLASHDREAMS_TURN_USERNAME'],
                            credential=os.environ['FLASHDREAMS_TURN_CREDENTIAL'])]
    webrtc_server._server_ice_servers = server_ice_servers

class CompatiblePeerConnection(RTCPeerConnection):
    def __init__(self, configuration=None):
        configuration = configuration or RTCConfiguration()
        configuration.bundlePolicy = RTCBundlePolicy.MAX_COMPAT
        super().__init__(configuration)

webrtc_server.RTCPeerConnection = CompatiblePeerConnection
import arm_adapter  # registers the original simulator and control extension
from flashdreams.runtime_v2.cli import entrypoint

if __name__ == '__main__':
    entrypoint()
