
# **Expert Analysis of RTP Management for Professional WebRTC SFU Implementation**

## **I. Strategic Architectural Foundation: Mediasoup SFU Blueprint**

### **1.1. Rationale for SFU Topology over Mesh/MCU (Performance and Cost Analysis)**

The selection of a Selective Forwarding Unit (SFU) architecture, implemented using Mediasoup, is the strategic prerequisite for achieving scalability, multi-stream support, and the required low-latency target. An architectural decision determines whether a WebRTC application can scale effectively or incurs excessive costs.1 For applications supporting five to over 100 concurrent participants, the SFU model is demonstrably superior to peer-to-peer (Mesh) or centralized mixing (MCU) topologies.1

While Mesh architecture provides the absolute lowest theoretical latency, often in the range of 50–100ms, it is highly inefficient in terms of bandwidth. Each participant must upload $(N-1)$ streams and download $(N-1)$ streams, which rapidly degrades video quality beyond four participants and prematurely drains mobile battery life.1 Conversely, the MCU approach is the most bandwidth-efficient for the client, requiring only one stream up and one stream down, but it introduces the highest latency (200–500ms) due to the substantial server-side processing required for mixing and encoding the composite stream.2

The Mediasoup SFU strikes the optimal balance. It maintains a low latency profile, typically operating between 100ms and 200ms, while keeping client upload bandwidth constant at one stream, regardless of the number of consumers.2 Crucially, the SFU handles adaptation, such as Simulcast or SVC stream selection, on the server, significantly reducing the processing load on client devices.3 Furthermore, migrating to an SFU architecture early avoids expensive infrastructure overhauls and results in drastically lower server costs compared to resource-intensive MCU deployments, which can cost 10 to 50 times more for equivalent participant loads.1 The inherent low-latency range of the SFU (100–200ms) provides a significant margin, securing the project's goal of achieving total stream latency below 500ms.

Table 1: SFU Topology Performance Comparison

| Topology | Typical Latency | Client Upload Bandwidth | Server Processing Load | Scalability (Participants) |
| :---- | :---- | :---- | :---- | :---- |
| Mesh | 50–100ms (Lowest) | $(N-1) \\times$ Stream Bitrate (High) | Minimal | Low (2–4) |
| **SFU (Mediasoup)** | **100–200ms (Low)** | **$1 \\times$ Stream Bitrate (Constant)** | Routing & Adaptation | High (5–100+) |
| MCU | 200–500ms (Moderate) | $1 \\times$ Stream Bitrate (Constant) | Maximum (Mixing/Encoding) | High, but costly |

### **1.2. Mediasoup Component Overview (Workers, Routers, Transports, and Pipes)**

Mediasoup functions as a powerful, low-level server-side WebRTC library, integrable as a Node.js module or Rust crate.4 Its architecture facilitates horizontal scalability necessary for professional broadcasting.

The system relies on **Workers**, which are C++ subprocesses running on the host machine. To maximize performance and throughput, Workers should be distributed across separate CPU cores.5 The **Router** is the core functional unit within a Worker, responsible for enabling injection, selection, and forwarding of media streams among various transports. In a large system, Routers can logically represent separate conference rooms or sessions, and the overall load can be distributed by creating multiple Routers across different Workers or even physical hosts.5 This distribution is managed through the router.pipeToRouter() function.5

Media traffic enters and exits the Router through **Transports**. Three types are relevant here:

1. WebRtcTransport: Handles standard browser and mobile WebRTC connections, managing ICE/DTLS negotiation.7  
2. PlainTransport: Essential for integrating external media sources like the NDI Bridge, as it manages non-WebRTC, raw RTP/UDP streams.7  
3. PipeTransport: Used specifically for connecting two Routers, enabling media distribution and scaling across server instances.5

### **1.3. High-Level System Diagram and Inter-Service Communication (Signaling Plane)**

A crucial aspect of Mediasoup implementation is recognizing that it handles media transport only; it does not provide a signaling protocol.7 A separate, application-layer Signaling Server is mandatory.

The most suitable choice for the Signaling Tier is a full-duplex channel, typically **WebSocket**, which facilitates the necessary bidirectional communication.7 The signaling flow dictates that the client must first request the server's routerRtpCapabilities. Upon receiving these capabilities, the client-side Device object loads them.8 This establishes the common set of negotiable options for media transmission. Subsequently, the signaling server coordinates the creation of Transports, Producers (sending media *to* Mediasoup), and Consumers (receiving media *from* Mediasoup).7

The overall professional system must be structured into several Dockerized tiers:

* **Client Tier:** Mobile Progressive Web Apps (PWAs).  
* **Signaling Tier:** WebSocket server (e.g., Node.js/Express) managing user authentication and orchestrating Mediasoup API calls.  
* **Media Tier:** Mediasoup Workers and Routers containers.  
* **NDI Bridge Tier:** Dedicated containers running FFmpeg or GStreamer to convert NDI to RTP.  
* **Networking Tier:** STUN/TURN servers and a potential WebRTC media gateway (like STUNner) for robust public exposure.10

## **II. Deep Dive into RTP Packet Management and QoS Mechanisms**

### **2.1. RTP Negotiation and Capability Matching (Router vs. Endpoint Constraints)**

Effective RTP handling begins with strict negotiation. The Mediasoup Router must expose its routerRtpCapabilities—the list of supported codecs, header extensions, and RTCP features.11 The client-side mediasoup-client Device loads these capabilities and negotiates the final parameters based on its own browser constraints.8

Mediasoup enforces a strict rule set: the codec preferredPayloadType values and RTP header extension preferredId values used by the sending endpoint (either Mediasoup or the client) *must* precisely match those defined in the receiving entity's capabilities.11 The system operates on the principle that the entity sending RTP decides the necessary identification IDs, and the receiving entity must honor those IDs.11 This rigorous matching process is essential for media streams, including NDI streams injected via PlainTransport, to be correctly routed and processed within the SFU.7

### **2.2. Critical Low-Latency Configurations: Jitter Buffers and Keyframe Requests**

Minimizing the system latency (100–200ms SFU latency plus network jitter) requires meticulous management of buffering. WebRTC clients employ adaptive jitter buffers to compensate for variable packet timing.12 While buffer sizes typically range from 15ms to 120ms for audio, the requirement for sub-500ms video streaming demands minimizing these internal buffers to the greatest extent possible without introducing visible artifacts.12

Crucially, the management of keyframes (I-frames) is paramount, especially for a VJ Dashboard environment where streams may be aggressively paused and resumed. When a stream resumes or a new consumer connects, a keyframe request—either a Picture Loss Indication (PLI) or a Full Intra Request (FIR)—is triggered to enable stream decoding.8 If many consumers simultaneously resume viewing the same producer, a burst of keyframe requests can overwhelm the producer and the network, leading to latency spikes and black screens.13

Mediasoup offers a solution via the KeyframeRequestManager, configured using keyframeRequestDelay. By setting this delay (e.g., 1 second), Mediasoup effectively batches multiple concurrent PLI/FIR requests for the same producer within that time window.13 All batched requests are satisfied by a single aggregated request sent to the producer once the delay expires. This grouping mechanism prevents the producer from being choked by a high volume of requests, stabilizes the stream, and ensures that keyframes are delivered efficiently, thus protecting the established low-latency baseline.13

### **2.3. Congestion Control Implementation: Transport BWE and Bitrate Management**

To maintain stream quality and low latency under fluctuating network conditions, Mediasoup incorporates advanced sender-side Bandwidth Estimation (BWE) and congestion control algorithms.14 This server-side adaptation evaluates available bandwidth and dynamically modulates the stream bitrate without necessarily altering the video layers, often adapting within milliseconds.14

For a professional application, the signaling server must be able to influence this process actively. The Mediasoup Transport API allows dynamic bitrate control using transport.setMaxOutgoingBitrate(bitrate) and transport.setMinOutgoingBitrate(bitrate).6 This capability is instrumental for quality of service (QoS) management. For instance, if real-time statistics indicate severe congestion for a specific consumer's transport, the VJ Dashboard logic can use setMaxOutgoingBitrate() to force the SFU to switch to a lower quality layer (if Simulcast is enabled), stabilizing the connection and preventing total stream failure, which is preferable to allowing latency to spiral out of control.6

### **2.4. RTCP Feedback Loop: Configuring NACK, PLI, and FIR for Loss Recovery**

Stream reliability relies on robust configuration of RTCP feedback loops, which must be explicitly defined in the router's RtpCodecCapability.8

* **NACK (Negative Acknowledgement):** NACK enables the receiver to request retransmission of lost RTP packets. This is a critical mechanism for loss recovery in video codecs (VP8, H.264), and is also supported for audio using OPUS.6  
* **PLI (Picture Loss Indication):** PLI is essential for requesting a new keyframe when partial packet loss prevents the decoding of subsequent dependent frames.8  
* **FIR (Full Intra Request):** FIR is used to explicitly request a new, full keyframe (I-frame), typically required when a stream starts, resumes, or when a decoder completely loses synchronization.8

The router's configuration must include entries like { type: "nack" }, { type: "nack", parameter: "pli" }, and { type: "ccm", parameter: "fir" } within the video codec definitions to ensure these recovery mechanisms are active and honored during negotiation.8

## **III. NDI Bridge Implementation: External RTP Ingestion via PlainTransport**

Integrating professional video sources using NDI requires a dedicated bridge to translate the NDI stream into WebRTC-compatible RTP packets that Mediasoup can ingest.

### **3.1. NDI Conversion Workflow: Choosing the Bridge Endpoint (FFmpeg/GStreamer)**

NDI streams must be converted and re-encoded into a format matching the Mediasoup Router's supported codecs (H.264 or VP8) before being sent over RTP/UDP. The standard tools for this task are FFmpeg or GStreamer, which Mediasoup supports as external endpoints.4 While these tools are capable, the application developer is responsible for compiling them with NDI support and managing the associated proprietary SDK licensing.16 The conversion process involves decoding the NDI source and then re-encoding it, setting specific parameters such as the SSRC values and the exact codec payload type, to match Mediasoup’s expectations.7

### **3.2. Detailed PlainTransport Setup and Connection Parameters**

The PlainTransport is the designated Mediasoup mechanism for receiving raw RTP traffic from external devices.7

The setup involves several manual steps on the Mediasoup server:

1. **Transport Creation:** The application calls router.createPlainTransport() and provides the necessary listenInfo, specifying the local UDP IP and port(s) where Mediasoup should listen for incoming RTP traffic.7  
2. **RTCP Handling:** The configuration must address RTCP multiplexing (rtcpMux). If the external endpoint (FFmpeg) sends RTP and RTCP on separate ports, rtcpMux must be set to false. The transport will then expose two port tuples: one for RTP (rtpTransport.tuple) and one for RTCP (rtpTransport.rtcpTuple).7  
3. **Connection:** The NDI bridge application must then be instructed to stream its encoded media to the local IP and port(s) returned by the created PlainTransport.7

### **3.3. Manual RtpSendParameters Generation (SSRC, CNAME, Payload Types)**

The most frequent source of failure when integrating external endpoints is the mismatch between the streams being sent and the parameters Mediasoup expects.17 Since there is no negotiation protocol (like DTLS/SDP) with a PlainTransport, the application must manually define the precise stream characteristics via RtpSendParameters.7

When creating the Producer on the PlainTransport via transport.produce(), the application must provide parameters that include:

* **Encodings Array:** This array must contain the specific SSRC value (e.g., ssrc: 22222222\) that the NDI bridge endpoint will use to identify its stream.7  
* **Codecs Array:** This array must contain the exact codec definition, including the preferredPayloadType, that matches the encoder configuration used by the NDI bridge.7

Mediasoup uses the SSRC or, secondarily, the MID RTP extension to associate incoming packets with the correct Producer.18 The NDI Bridge must be configured *before* the FFmpeg/GStreamer process is launched, ensuring the SSRC and payload type are synchronized between the Mediasoup Producer definition and the external encoder's output command.

### **3.4. FFmpeg Command Line Example (NDI to RTP)**

A typical FFmpeg command structure for taking an NDI input and outputting a low-latency H.264 RTP stream to a Mediasoup PlainTransport involves compiling FFmpeg with NDI support and meticulously defining the output parameters:

ffmpeg \-f libndi\_newtek \-i "NDI Source Name" \\  
\-codec:v libx264 \-preset veryfast \-tune zerolatency \-crf 23 \-pix\_fmt yuv420p \\  
\-f rtp \-payload\_type \<PAYLOAD\_TYPE\> \-ssrc \<SSRC\_VALUE\> \\  
udp://\<Mediasoup\_PlainTransport\_IP\>:\<RTP\_PORT\>  
The \<PAYLOAD\_TYPE\> and \<SSRC\_VALUE\> must be the constants provided to the Mediasoup transport.produce() call.

## **IV. Cross-Platform Compatibility and Optimized Codec Strategy**

### **4.1. Mandatory Codec Support: H.264 Baseline Profile for iOS PWA Compliance**

Cross-browser compatibility is fundamentally challenging due to platform restrictions, especially concerning mobile PWAs.19 On iOS, all browsers (including Chrome and Firefox) are required to use Apple's WebKit rendering engine.19 This constraint imposes an H.264-only video codec limitation for WebRTC.19

For a professional application targeting mobile users, the Mediasoup Router must define and prioritize H.264 (specifically supporting Baseline Profile) to ensure universal connectivity, particularly for iOS Safari.21 Failure to include H.264 support will prevent iOS clients from consuming video streams.

### **4.2. Advanced Codecs: Leveraging VP8/VP9 for Efficiency and SVC/Simulcast**

While H.264 is the baseline requirement for reach, VP8 and VP9 offer superior performance and features for optimization.

* **VP8:** As a mandatory and royalty-free codec in the WebRTC specification, VP8 is supported by all compatible browsers.22  
* **VP9:** VP9 offers significant compression efficiency, achieving comparable quality at bitrates up to 50% lower than VP8, which is advantageous for bandwidth savings and reliability in challenging network environments.23

The Mediasoup Router should be configured to offer both H.264 and VP8/VP9 in its mediaCodecs list.8 The client-side mediasoup-client Device then negotiates the best common codec available, using the device's capabilities to determine what kind of media it can produce or consume.9

### **4.3. Simulcast and Scalable Video Coding (SVC) Implementation in Mediasoup**

To support multi-stream consumption across varying network conditions, Mediasoup leverages advanced scaling mechanisms.

* **Simulcast:** This involves the producer sending $N$ separate RTP streams (each with a unique SSRC) representing different resolutions or bitrates of the same video source.11 Simulcast is critical for SFU performance, allowing the server to select the appropriate layer to forward to each consumer based on their detected bandwidth.3 Mediasoup supports Simulcast for both VP8 and H.264, making it compatible with the mandatory iOS codec.11  
* **SVC (Scalable Video Coding):** SVC, supported by VP9, achieves similar scalability benefits by encoding all resolution and quality layers into a single RTP stream.11 SVC often results in better optimization of CPU and GPU load on the client side and further cuts bandwidth usage.23

For a consumer receiving media, Mediasoup simplifies the process by presenting a single entry in the encodings array, abstracting the complexity of layer selection from the client application.11

### **4.4. Adaptive Bitrate Strategies and Client-Side Optimization**

Client-side PWA development must integrate the WebRTC APIs effectively. PWAs can leverage getUserMedia() to access local camera feeds 24 and utilize the Fullscreen API to provide an immersive, dedicated VJ dashboard interface.25 While the Fullscreen API can display content using the user's entire screen, PWAs generally require a user request to enter fullscreen mode on desktop and iPadOS, though automatic fullscreen support is more common on Android.26 The client must use the device.canProduce(kind) check to verify the media capabilities supported by the browser against the router's configuration before attempting to produce media.9

## **V. VJ Dashboard: Real-Time Monitoring and Stream Control**

The VJ Dashboard must provide fine-grained, real-time control over media distribution, which is achieved by integrating the signaling layer tightly with the Mediasoup API.

### **5.1. Implementing the Control Signaling Protocol (WebSocket API)**

The Dashboard interface sends control commands (e.g., layout changes, stream quality adjustments, producer muting) to the Signaling Server via the established WebSocket connection.7 The Signaling Server then acts as the central orchestrator, translating these high-level commands into low-level Mediasoup API calls, such as creating transports, producing media, or consuming specific streams.9 This layered separation ensures that complex media logic remains isolated on the server.

### **5.2. Producer and Consumer Lifecycle Management (Pause/Resume/Mute)**

The ability to pause and resume streams is critical for optimizing resource consumption and for the dynamic layouts inherent in a VJ system.

* **Producer Control:** Pausing a Producer via the server-side API immediately stops the flow of RTP packets from that source to Mediasoup. This action simultaneously affects *all* Consumers subscribed to that Producer.  
* **Consumer Control:** Pausing a specific Consumer only stops the flow of RTP packets from Mediasoup to that particular client. This is essential for streams that become temporarily non-visible on a dashboard or mobile screen, preserving bandwidth for critical streams. Upon Consumer resume, the system's inherent mechanisms trigger a keyframe request (PLI/FIR) to the Producer, initiating the display of video.13

### **5.3. Real-Time Diagnostics: Utilizing getStats() for Performance Monitoring**

A professional VJ Dashboard requires real-time diagnostic data to monitor stream health and take corrective action. Mediasoup provides comprehensive metrics through the asynchronous getStats() method available on all RTC classes (Transport, Producer, Consumer, etc.).27

* **Producer Statistics:** These reports provide details on the incoming stream quality, including packet loss rates and received bitrate, exactly as sent by the endpoint.27  
* **Transport Statistics:** These are crucial for observing the system's response to network flux, providing data on congestion control algorithms and current bandwidth usage.15

The synthesis of this diagnostic data allows the VJ Dashboard to become an active traffic manager. For example, if Consumer Statistics report a consistently high packet loss rate for a specific transport, the application can determine that the remote network is struggling. This triggers an automated or VJ-initiated intervention using transport.setMaxOutgoingBitrate() 6, compelling the SFU to switch the Consumer to a lower-quality Simulcast layer, thus mitigating congestion and maintaining the sub-500ms latency goal.

### **5.4. Advanced Client Controls: PWA Access to Camera (getUserMedia) and PTZ (Pan/Tilt/Zoom)**

For professional media inputs, the application may require advanced camera control. The PWA utilizes standard getUserMedia() constraints for basic camera selection.29 For hardware-supported control, the WebRTC API supports Pan, Tilt, and Zoom (PTZ) features via MediaStreamTrack constraints.30 However, support for PTZ remains limited and is often restricted to specific configurations (e.g., Chromium-based browsers on Windows).31 The Dashboard should implement a feature detection mechanism to expose PTZ controls only when the client's camera hardware and browser fully support the necessary constraints.30

## **VI. Production Deployment Strategy: Docker Containerization**

Deploying Mediasoup for production requires managing the intrinsic challenges of WebRTC's reliance on dynamic UDP port ranges within a containerized environment.

### **6.1. Docker Configuration for Mediasoup Workers and UDP Port Range Exposure**

Mediasoup Transports require access to a defined range of UDP ports for RTP/RTCP exchange.32 This port range must be configured both within the Mediasoup Worker settings (using TransportPortRange) and exposed by the Docker container.

Standard Docker port mapping defaults to TCP.33 The deployment configuration (e.g., docker-compose.yml) must explicitly specify the UDP protocol for the entire range of ports used by the Mediasoup Worker (e.g., mapping 10000-11000 UDP ports).33 Furthermore, the listenIps setting in the Mediasoup configuration must accurately reflect the public IP address that clients and the NDI bridge will use to reach the container, not the container's internal IP.32

### **6.2. Network Architecture Options: Host Networking vs. Dedicated WebRTC Gateways (STUNner)**

Managing the wide UDP port range and NAT traversal securely presents a major architectural choice.

One option is deploying the Mediasoup Worker using Kubernetes hostNetwork: true. While this simplifies the UDP exposure, it introduces significant operational limitations and undermines Docker's security model by removing container isolation and granting the media server direct access to the host's network stack.10

The preferred professional solution involves deploying Mediasoup into ordinary Kubernetes/Docker pods that utilize a private IP network, protected behind a dedicated WebRTC media gateway, such as STUNner.10 STUNner acts as a local STUN/TURN server, handling the complex NAT traversal and exposing the media server securely to the public internet. This preserves the security benefits of Docker isolation, which relies on kernel namespaces and cgroups.10

### **6.3. ICE/STUN/TURN Server Requirements and Integration with Docker Compose**

A reliable STUN/TURN infrastructure is non-negotiable for establishing connectivity in WebRTC. STUN (Session Traversal Utilities for NAT) allows clients to discover their public IP addresses, and TURN (Traversal Using Relays around NAT) relays media when direct peer-to-peer connection fails due to restrictive firewalls.36 This capability significantly reduces connection setup time and latency by minimizing relay hops. A separate Docker service should host the STUN/TURN server, and the PWA clients must be configured with the necessary public IP, port, and credentials to utilize these services.34

## **VII. Conclusion and Recommendations**

The creation of a professional video stream application centered on receiving and managing RTP packets demands a highly sophisticated SFU architecture built on Mediasoup. The low-latency goal (sub-500ms) is achieved through the inherent performance of Mediasoup (100–200ms) combined with meticulous QoS tuning.

The analysis yields several critical implementation priorities:

1. **Low-Latency Assurance:** Latency must be controlled proactively by implementing keyframe request batching using Mediasoup's keyframeRequestDelay (e.g., 1 second) to prevent resource exhaustion from simultaneous stream resumptions in the VJ Dashboard.13 Furthermore, the VJ Dashboard must leverage real-time getStats() data to dynamically enforce quality limits via transport.setMaxOutgoingBitrate() 6, forcing Simulcast layer switching before congestion leads to prohibitive buffering.  
2. **Cross-Platform Mandate:** H.264 video codec support is mandatory and must be prioritized in the router configuration to ensure compatibility with all iOS PWA clients utilizing WebKit.19 Simulcast should be enabled for both H.264 and VP8/VP9 to facilitate server-side adaptation.11  
3. **NDI Bridge Precision:** Integration of NDI sources requires the rigid adherence to manual parameter synchronization when using PlainTransport. The application must generate stable SSRC values and payload types for the NDI endpoint and ensure these match precisely the RtpSendParameters defined in the Mediasoup Producer.7  
4. **Production Security:** Docker deployment should avoid high-risk configurations like hostNetwork: true. The deployment should instead leverage a dedicated WebRTC media gateway (e.g., STUNner) to handle public UDP exposure, thereby securing the Mediasoup Workers within isolated private network pods.10 A separate, reliable STUN/TURN server deployment is also indispensable for maximizing connectivity rates.36

#### **Obras citadas**

1. WebRTC Network Topology: Complete Guide to Mesh, SFU, and MCU Architecture Selection Published by Mohit Dubey on October 2, 2025 \- DEV Community, fecha de acceso: octubre 29, 2025, [https://dev.to/akeel\_almas\_9a2ada3db4257/webrtc-network-topology-complete-guide-to-mesh-sfu-and-mcu-architecture-selection-published-by-3fi6](https://dev.to/akeel_almas_9a2ada3db4257/webrtc-network-topology-complete-guide-to-mesh-sfu-and-mcu-architecture-selection-published-by-3fi6)  
2. Mesh vs SFU vs MCU: Choosing the Right WebRTC Network Topology \- Ant Media Server, fecha de acceso: octubre 29, 2025, [https://antmedia.io/webrtc-network-topology/](https://antmedia.io/webrtc-network-topology/)  
3. the complete Guide.. What is WebRTC SFU (Selective… | by James bordane | Medium, fecha de acceso: octubre 29, 2025, [https://medium.com/@jamesbordane57/webrtc-sfu-the-complete-guide-3589be4daa54](https://medium.com/@jamesbordane57/webrtc-sfu-the-complete-guide-3589be4daa54)  
4. mediasoup, fecha de acceso: octubre 29, 2025, [https://mediasoup.org/](https://mediasoup.org/)  
5. Try Mediasoup: An Open Source Streaming Media Tool \- The New Stack, fecha de acceso: octubre 29, 2025, [https://thenewstack.io/try-mediasoup-an-open-source-streaming-media-tool/](https://thenewstack.io/try-mediasoup-an-open-source-streaming-media-tool/)  
6. API \- mediasoup, fecha de acceso: octubre 29, 2025, [https://mediasoup.org/documentation/v3/mediasoup/api/](https://mediasoup.org/documentation/v3/mediasoup/api/)  
7. Communication Between Client and Server \- mediasoup, fecha de acceso: octubre 29, 2025, [https://mediasoup.org/documentation/v3/communication-between-client-and-server/](https://mediasoup.org/documentation/v3/communication-between-client-and-server/)  
8. Streaming with WebRTC and Mediasoup | by Gaurav Sarma | Sep, 2025 \- Medium, fecha de acceso: octubre 29, 2025, [https://gauravsarma1992.medium.com/streaming-with-webrtc-and-mediasoup-4aaff6bf668e](https://gauravsarma1992.medium.com/streaming-with-webrtc-and-mediasoup-4aaff6bf668e)  
9. API \- mediasoup, fecha de acceso: octubre 29, 2025, [https://mediasoup.org/documentation/v3/mediasoup-client/api/](https://mediasoup.org/documentation/v3/mediasoup-client/api/)  
10. STUNner demo: Video-conferencing with mediasoup \- L7mp.io, fecha de acceso: octubre 29, 2025, [https://docs.l7mp.io/en/stable/examples/mediasoup/](https://docs.l7mp.io/en/stable/examples/mediasoup/)  
11. RTP Parameters and Capabilities \- mediasoup, fecha de acceso: octubre 29, 2025, [https://mediasoup.org/documentation/v3/mediasoup/rtp-parameters-and-capabilities/](https://mediasoup.org/documentation/v3/mediasoup/rtp-parameters-and-capabilities/)  
12. WebRTC and Buffers \- GetStream.io, fecha de acceso: octubre 29, 2025, [https://getstream.io/resources/projects/webrtc/advanced/buffers/](https://getstream.io/resources/projects/webrtc/advanced/buffers/)  
13. keyframeRequestDelay implementation clarification \- mediasoup Discourse Group, fecha de acceso: octubre 29, 2025, [https://mediasoup.discourse.group/t/keyframerequestdelay-implementation-clarification/4280](https://mediasoup.discourse.group/t/keyframerequestdelay-implementation-clarification/4280)  
14. Scaling WebRTC with Mediasoup V3 \- RTCWeb, fecha de acceso: octubre 29, 2025, [https://rtcweb.in/scaling-webrtc-with-mediasoup-v3/](https://rtcweb.in/scaling-webrtc-with-mediasoup-v3/)  
15. Congestion control and bandwidth transport stats \- mediasoup Discourse Group, fecha de acceso: octubre 29, 2025, [https://mediasoup.discourse.group/t/congestion-control-and-bandwidth-transport-stats/6102](https://mediasoup.discourse.group/t/congestion-control-and-bandwidth-transport-stats/6102)  
16. Using FFmpeg with NDI | Docs and Guides, fecha de acceso: octubre 29, 2025, [https://docs.ndi.video/all/faq/sdk/using-ffmpeg-with-ndi](https://docs.ndi.video/all/faq/sdk/using-ffmpeg-with-ndi)  
17. PlainTransport, ffmpeg, recording \- Integration \- mediasoup Discourse Group, fecha de acceso: octubre 29, 2025, [https://mediasoup.discourse.group/t/plaintransport-ffmpeg-recording/6512](https://mediasoup.discourse.group/t/plaintransport-ffmpeg-recording/6512)  
18. Using GStreamer webrtcbin as MediaSoup client \- Integration, fecha de acceso: octubre 29, 2025, [https://mediasoup.discourse.group/t/using-gstreamer-webrtcbin-as-mediasoup-client/590](https://mediasoup.discourse.group/t/using-gstreamer-webrtcbin-as-mediasoup-client/590)  
19. WebRTC Browser Support 2025: Complete Compatibility Guide \- Ant Media Server, fecha de acceso: octubre 29, 2025, [https://antmedia.io/webrtc-browser-support/](https://antmedia.io/webrtc-browser-support/)  
20. How to make a Webrtc connection from iOS Safari to Android Chrome \- Stack Overflow, fecha de acceso: octubre 29, 2025, [https://stackoverflow.com/questions/48188949/how-to-make-a-webrtc-connection-from-ios-safari-to-android-chrome](https://stackoverflow.com/questions/48188949/how-to-make-a-webrtc-connection-from-ios-safari-to-android-chrome)  
21. Simulcast \- Docs \- OpenVidu, fecha de acceso: octubre 29, 2025, [https://docs.openvidu.io/en/stable/openvidu-enterprise/simulcast/](https://docs.openvidu.io/en/stable/openvidu-enterprise/simulcast/)  
22. WebRTC Codecs \- What's supported? \- GetStream.io, fecha de acceso: octubre 29, 2025, [https://getstream.io/resources/projects/webrtc/advanced/codecs/](https://getstream.io/resources/projects/webrtc/advanced/codecs/)  
23. Stream Releases VP9 SVC Codec for Enhanced Video Call Efficiency \- GetStream.io, fecha de acceso: octubre 29, 2025, [https://getstream.io/blog/vp9-enhanced/](https://getstream.io/blog/vp9-enhanced/)  
24. How to Access the Camera in a PWA \[2025 guide\] \- SimiCart, fecha de acceso: octubre 29, 2025, [https://simicart.com/blog/pwa-camera-access/](https://simicart.com/blog/pwa-camera-access/)  
25. Fullscreen API \- MDN Web Docs, fecha de acceso: octubre 29, 2025, [https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen\_API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API)  
26. App design | web.dev, fecha de acceso: octubre 29, 2025, [https://web.dev/learn/pwa/app-design](https://web.dev/learn/pwa/app-design)  
27. RTC Statistics \- mediasoup, fecha de acceso: octubre 29, 2025, [https://mediasoup.org/documentation/v3/mediasoup/rtc-statistics/](https://mediasoup.org/documentation/v3/mediasoup/rtc-statistics/)  
28. Mediasoup.Consumer — mediasoup\_elixir v0.17.0 \- Hexdocs, fecha de acceso: octubre 29, 2025, [https://hexdocs.pm/mediasoup\_elixir/Mediasoup.Consumer.html](https://hexdocs.pm/mediasoup_elixir/Mediasoup.Consumer.html)  
29. WebRTC samples, fecha de acceso: octubre 29, 2025, [https://webrtc.github.io/samples/](https://webrtc.github.io/samples/)  
30. Control camera pan, tilt, and zoom, fecha de acceso: octubre 29, 2025, [https://webrtc.github.io/samples/src/content/getusermedia/pan-tilt-zoom/](https://webrtc.github.io/samples/src/content/getusermedia/pan-tilt-zoom/)  
31. Video SDK \- web \- Camera controls \- Zoom Developer Platform, fecha de acceso: octubre 29, 2025, [https://developers.zoom.us/docs/video-sdk/web/video-camera-controls/](https://developers.zoom.us/docs/video-sdk/web/video-camera-controls/)  
32. mediasoup v3 with Docker \- Stack Overflow, fecha de acceso: octubre 29, 2025, [https://stackoverflow.com/questions/63966380/mediasoup-v3-with-docker](https://stackoverflow.com/questions/63966380/mediasoup-v3-with-docker)  
33. When I specify ports in a docker-compose.yml file, is it TCP or UDP? \- Stack Overflow, fecha de acceso: octubre 29, 2025, [https://stackoverflow.com/questions/60061703/when-i-specify-ports-in-a-docker-compose-yml-file-is-it-tcp-or-udp](https://stackoverflow.com/questions/60061703/when-i-specify-ports-in-a-docker-compose-yml-file-is-it-tcp-or-udp)  
34. damhau/mediasoup-demo-docker \- GitHub, fecha de acceso: octubre 29, 2025, [https://github.com/damhau/mediasoup-demo-docker](https://github.com/damhau/mediasoup-demo-docker)  
35. Docker Engine security \- Docker Docs, fecha de acceso: octubre 29, 2025, [https://docs.docker.com/engine/security/](https://docs.docker.com/engine/security/)  
36. WebRTC Low Latency: The Ultimate Guide to Real-Time Streaming in 2025 \- VideoSDK, fecha de acceso: octubre 29, 2025, [https://www.videosdk.live/developer-hub/webrtc/webrtc-low-latency](https://www.videosdk.live/developer-hub/webrtc/webrtc-low-latency)