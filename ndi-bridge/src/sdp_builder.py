"""SDP builder — converts mediasoup transport params into SDP.

mediasoup's custom signaling uses ICE parameters, ICE candidates, and
DTLS fingerprints instead of standard SDP. This module builds a valid
SDP from those params so aiortc can establish the WebRTC connection.

Key mediasoup behaviors:
- WebRtcTransport uses ICE Lite (server is always controlling agent)
- Transport is the video SENDER (it routes producer media TO the consumer)
- DTLS: server is passive, client (bridge) is active
"""

import re


def build_remote_sdp(
    ice_ufrag: str,
    ice_pwd: str,
    ice_candidates: list[dict],
    dtls_fingerprints: list[dict],
    dtls_role: str = "auto",
    codecs: list[dict] | None = None,
    encodings: list[dict] | None = None,
) -> str:
    """Build an SDP string from mediasoup transport parameters.

    Parameters
    ----------
    ice_ufrag : str
    ice_pwd : str
    ice_candidates : list[dict]
    dtls_fingerprints : list[dict]
    dtls_role : str
    codecs : list[dict] | None
        Consumer's rtpParameters.codecs. Each dict: mimeType, payloadType, clockRate, parameters.
        If None, defaults to H.264 payload type 96.
    encodings : list[dict] | None
        Consumer's rtpParameters.encodings. Each dict has ssrc, rtx, etc.

    Returns
    -------
    str
        A valid SDP string suitable for aiortc's setRemoteDescription().
    """
    # aiortc supports: sha-256, sha-384, sha-512 (NOT sha-224 or sha-1)
    SUPPORTED_FP = {"sha-256", "sha-384", "sha-512"}

    print(f"[SDP] Server fingerprints: "
          f"{[(f['algorithm'], f['value'][:20] + '...') for f in dtls_fingerprints]}")

    # Build codec info from consumer rtpParameters (or default H.264 PT 96)
    if not codecs:
        codecs = [{"mimeType": "video/H264", "payloadType": 96, "clockRate": 90000,
                    "parameters": {"packetization-mode": 1, "profile-level-id": "42e01f"}}]

    pt_list = []
    rtpmap_lines = []
    fmtp_lines = []
    ssrc_lines = []

    for c in codecs:
        pt = c["payloadType"]
        pt_list.append(str(pt))
        mime = c["mimeType"]  # "video/H264"
        subtype = mime.split("/")[1]  # "H264"
        clock = c.get("clockRate", 90000)
        rtpmap_lines.append(f"a=rtpmap:{pt} {subtype}/{clock}")
        # NOTE: No rtcp-fb nack pli — LAN streaming has near-zero packet loss.
        # Removing retransmission reduces latency by avoiding NACK/PLI feedback loops.
        fmtp_str = ";".join(f"{k}={v}" for k, v in c.get("parameters", {}).items())
        if fmtp_str:
            fmtp_lines.append(f"a=fmtp:{pt} {fmtp_str}")

    # Add SSRC lines from encodings
    if encodings:
        for enc in encodings:
            ssrc = enc.get("ssrc")
            if ssrc:
                ssrc_lines.append(f"a=ssrc:{ssrc} cname:mediasoup")

    lines = [
        "v=0",
        "o=- 0 0 IN IP4 0.0.0.0",
        "s=-",
        "t=0 0",
        "a=group:BUNDLE 0",
        "a=msid-semantic: WMS",
        "a=ice-lite",
        "",
        f"m=video 9 UDP/TLS/RTP/SAVPF {' '.join(pt_list)}",
        "c=IN IP4 0.0.0.0",
        "a=sendonly",
        f"a=ice-ufrag:{ice_ufrag}",
        f"a=ice-pwd:{ice_pwd}",
    ]

    # DTLS fingerprints (only supported algorithms)
    included_fp = 0
    for fp in dtls_fingerprints:
        algo = fp.get("algorithm", "").lower()
        if algo in SUPPORTED_FP:
            lines.append(f"a=fingerprint:{fp['algorithm']} {fp['value']}")
            included_fp += 1
        else:
            print(f"[SDP]   Skipping unsupported: {algo}")

    if included_fp == 0:
        print(f"[SDP] ⚠ NO supported fingerprints! DTLS will fail.")
    else:
        print(f"[SDP] Included {included_fp} supported fingerprints")

    lines.extend([
        f"a=setup:{dtls_role}",
        "a=mid:0",
        "a=rtcp-mux",
    ])
    lines.extend(rtpmap_lines)
    lines.extend(ssrc_lines)
    lines.extend(fmtp_lines)

    # Add ICE candidates with proper format
    for i, c in enumerate(ice_candidates):
        foundation = c.get("foundation", str(i))
        comp = c.get("component", 1)
        transport = c.get("protocol", "udp")
        priority = c.get("priority", 100)
        ip = c.get("ip", "127.0.0.1")
        port = c.get("port", 9)
        cand_type = c.get("type", "host")

        cand = (
            f"a=candidate:{foundation} {comp} {transport} {priority} "
            f"{ip} {port} typ {cand_type}"
        )
        # Add optional fields if present
        if c.get("tcpType"):
            cand += f" tcptype {c['tcpType']}"
        if c.get("raddr"):
            cand += f" raddr {c['raddr']}"
        if c.get("rport"):
            cand += f" rport {c['rport']}"
        cand += f" generation 0"

        lines.append(cand)

    lines.append("")
    sdp = "\r\n".join(lines)

    print(f"[SDP] ICE ufrag: {ice_ufrag}, {len(ice_candidates)} candidates, "
          f"codec PTs: {pt_list}")

    return sdp


def extract_dtls_fingerprint(sdp: str) -> str:
    """Extract the DTLS fingerprint from a local SDP.

    The SDP line looks like: a=fingerprint:sha-256 AA:BB:CC:...
    We need everything after "a=fingerprint:".

    Parameters
    ----------
    sdp : str
        The SDP string to extract from.

    Returns
    -------
    str
        The full fingerprint value (e.g. "sha-256 AA:BB:CC:DD:EE:...")
    """
    match = re.search(r"a=fingerprint:(.+)", sdp)
    if match:
        fp = match.group(1).strip()
        return fp
    return ""
