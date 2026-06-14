"""SDP builder — converts mediasoup transport params into SDP.

mediasoup's custom signaling uses ICE parameters, ICE candidates, and
DTLS fingerprints instead of standard SDP. This module builds a valid
SDP from those params so aiortc can establish the WebRTC connection.
"""

import re


def build_remote_sdp(
    ice_ufrag: str,
    ice_pwd: str,
    ice_candidates: list[dict],
    dtls_fingerprint: dict,
    dtls_role: str = "auto",
) -> str:
    """Build an SDP string from mediasoup transport parameters.

    Parameters
    ----------
    ice_ufrag : str
        ICE username fragment from transport.iceParameters.
    ice_pwd : str
        ICE password from transport.iceParameters.
    ice_candidates : list[dict]
        ICE candidates from transport.iceCandidates.
    dtls_fingerprint : dict
        DTLS fingerprint with keys 'algorithm' and 'value'.
    dtls_role : str
        DTLS role ('auto', 'client', 'server').

    Returns
    -------
    str
        A valid SDP string suitable for aiortc's setRemoteDescription().
    """
    lines = [
        "v=0",
        f"o=- 0 0 IN IP4 0.0.0.0",
        "s=-",
        "t=0 0",
        "a=group:BUNDLE 0",
        "a=msid-semantic: WMS",
        "",
        "m=video 9 UDP/TLS/RTP/SAVPF 96 97 98 99 100 101 102 103 104 105 106",
        "c=IN IP4 0.0.0.0",
        "a=recvonly",
        f"a=ice-ufrag:{ice_ufrag}",
        f"a=ice-pwd:{ice_pwd}",
        f"a=fingerprint:{dtls_fingerprint['algorithm']} {dtls_fingerprint['value']}",
        f"a=setup:{dtls_role}",
        "a=mid:0",
        "a=rtcp-mux",
        # H.264 codec info
        "a=rtpmap:96 H264/90000",
        "a=rtcp-fb:96 nack pli",
        "a=rtcp-fb:96 transport-cc",
        "a=fmtp:96 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f",
    ]

    # Add ICE candidates
    for i, c in enumerate(ice_candidates):
        lines.append(
            f"a=candidate:{c.get('foundation', str(i))} 1 "
            f"udp {c.get('priority', 100)} "
            f"{c.get('ip', '127.0.0.1')} "
            f"{c.get('port', 9)} "
            f"typ {c.get('type', 'host')}"
        )

    lines.append("")
    return "\r\n".join(lines)


def extract_dtls_fingerprint(sdp: str) -> str:
    """Extract the DTLS fingerprint from a local SDP.

    Parameters
    ----------
    sdp : str
        The SDP string to extract from.

    Returns
    -------
    str
        The fingerprint value (e.g. "sha-256 XX:XX:...")
    """
    match = re.search(r"a=fingerprint:(\S+)", sdp)
    if match:
        return match.group(1)
    return ""
