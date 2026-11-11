# MX2 production status and charts

The production device pages use a ten-minute online window. Devices remain online through ten minutes after the last telemetry timestamp; the existing SSE poll reports state changes every 30 seconds.

Heart-rate charts derive bounds from recent finite samples, round to five bpm and keep at least a 30 bpm span with padding. The current bounds appear beside the chart. The configured 60–100 band stays green; values outside it use yellow. Bands are clipped to the plotting area. Battery charts retain their fixed 0–100 scale and break at unknown values; isolated readings remain visible as points.

This update also brings previously deployed MX2 ingestion and radio battery display into source control. Core supports the legacy nine fields and extended ten fields. Radio battery 0–100 represents percentage, 101 external power without a percentage, and 255 unknown. Mock samples do not update real device state. MX2 ingestion uses the existing MLINK_MX2_API_KEY environment variable; provision it through deployment configuration.

Validation: production-stage type check and build passed; map key and static asset parity were verified. Isolated HTTP/SSR tests confirmed online at six minutes and nine minutes fifty seconds, offline at ten minutes one second, and dynamic chart bounds. Unit tests cover MX2 transactions, power display, valid chart segments, isolated readings, and dynamic ranges.

Timeline correction: samples and hover selection now use their real timestamps, including uneven gaps. Missing heart rate and battery values remain missing rather than extending previous readings; repeated SSE snapshots do not create duplicate points.
