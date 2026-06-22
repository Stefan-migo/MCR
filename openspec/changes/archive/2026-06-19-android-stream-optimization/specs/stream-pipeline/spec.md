# Delta for stream-pipeline

## MODIFIED Requirements

### Requirement: R-CD-001: Default quality preset by platform

The default `selectedQualityPreset` MUST be `QUALITY_PRESETS[1]` (Medium — 1280×720 @24fps, 500kbps) on mobile devices (Android/iOS by UA) and `QUALITY_PRESETS[2]` (High — 1920×1080 @30fps, 1Mbps) on desktop/laptop.
(Previously: Default was always High regardless of platform)

- The user MUST still be able to change quality via the existing `changeQuality` action.
- Presets only apply on first launch; persisted preferences SHOULD override.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — mobile start | Android phone opens the camera page | Store initializes; `startStreaming` called | `getUserMedia` requests 1280×720 @24fps (Medium) |
| Happy — desktop start | Desktop browser opens the camera page | Store initializes; `startStreaming` called | `getUserMedia` requests 1920×1080 @30fps (High) |
| Edge — low-end mobile | Device max resolution is 480p | Medium preset constraints applied | Browser falls back to nearest supported resolution |
| Edge — user upgrades on mobile | Mobile stream active; user selects High | `changeQuality(PRESETS[2])` called | Stream restarts at 1080p@30fps |

### Requirement: R-SQC-001: Producer simulcast encodings [sdp-exchange]

The producer MUST publish 3 simulcast encoding layers when the device supports it. Android devices (UA match `/android/i`) MUST use a single encoding with `degradationPreference: 'maintain-resolution'` and `maxBitrate: 10,000,000` instead of 3-layer simulcast. iOS Safari MUST also use the single-encoding fallback when simulcast is unsupported.
(Previously: Only iOS had the single-encoding fallback; Android had no special handling)

| Layer | spatialLayer | scaleResolutionDownBy | maxBitrate | UI Label |
|---|---|---|---|---|
| 0 | 0 | 4.0 | 200 Kbps | Low |
| 1 | 1 | 2.0 | 500 Kbps | Medium |
| 2 | 2 | 1.0 | 4 Mbps | High |

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — Android producer | Android device; UA matches `/android/i` | `sendTransport.produce()` called | Single encoding with maintain-resolution published |
| Happy — iPhone producer | iOS device starts streaming | 3 encodings published | Mediasoup receives all 3 simulcast layers |
| Edge — iOS no simulcast | iOS Safari only activates layer 0 | Producer detects incomplete simulcast | Falls back to single maintain-resolution encoding |
| Edge — desktop browser | Chrome/Firefox starts a stream | 3 encodings published | All 3 layers work normally — no regression |

## ADDED Requirements

### Requirement: R-SEC-003: Android VP8 codec negotiation

Android devices MUST filter out H.264 codec entries from `rtpCapabilities` during producer setup, forcing VP8 negotiation. The filter SHOULD apply to all Android devices (UA match `/android/i`), extending the existing `hasBuggyH264` pattern in `webrtc-client.ts`.

- VP8 MUST remain in capabilities — only H.264 entries are removed.
- Non-Android devices MUST be unaffected — H.264 remains available for iOS and desktop.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — Android forces VP8 | Android device with H.264+VP8 caps | `rtpCapabilities` is filtered | H.264 entries removed; only VP8 remains; stream uses VP8 |
| Edge — desktop preserved | Desktop Chrome connects | `rtpCapabilities` is processed | H.264 entries kept; normal H.264 negotiation occurs |
| Edge — iOS preserved | iOS Safari connects | `rtpCapabilities` is processed | H.264 entries kept; High Profile can be negotiated |

### Requirement: R-ADAPT-001: Stats-based adaptive quality

When `producer.getStats()` shows sustained encoder struggle (framerate drop for 5+ consecutive 2s samples), the system SHOULD reduce internal encoding parameters (bitrate, QP) to stabilize framerate. Output resolution MUST remain constant — only internal parameters adjust, not spatial layers or encoding structure.

- Original parameters SHOULD restore after 10+ consecutive normal samples.
- This applies primarily to single-encoding mobile producers using `maintain-resolution`.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — struggle recovery | Android producer framerate drops 24→12fps for 5 samples | Adaptive controller triggers reduction | Internal bitrate reduced; framerate stabilizes at 24fps; resolution unchanged |
| Edge — NDI stability | Encoding degrades during congestion | NDI consumer observes stream | NDI output resolution unchanged (720p); only bitrate/framerate changed |
| Edge — self-recovery | Stats normal for 10+ consecutive samples after adaptation | Controller detects sustained recovery | Original encoding parameters restored; quality returns to preset level |
| Edge — never triggered | Producer maintains stable framerate | Stats samples show no struggle | No adaptation occurs; no encoding parameter changes |
