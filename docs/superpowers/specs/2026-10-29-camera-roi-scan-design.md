# Camera QR ROI Scan Design

## Goal

Reduce ESP32-CAM QR decoder work during an inspection while preserving the existing scan behavior and its ability to read an officer badge QR shown on a phone screen.

## Flow context

- A rider scans the box's front QR with a phone to start the delivery flow. The rider does not present a QR to the ESP32-CAM.
- During an inspection, the ESP32-CAM reads the officer's short-lived badge QR displayed on the officer's phone.
- The board sends the complete decoded text to the backend. The backend remains responsible for deciding pass, retry, or fail.

## Current behavior

`firmware/src/camera_qr.cpp` captures grayscale VGA frames. `cameraScanQr` scans a centered 480×400 crop and scans the full frame every fourth frame using `quirc`. The camera capture format, job protocol, attempts, timeout, and backend decision are separate from the QR decoder and remain unchanged.

## Chosen design

Use a lightweight, coarse frame pass to find candidate regions with both bright background pixels and dark QR-like marks. Group nearby candidate tiles into one or more bounding boxes, expand each box by a margin, clamp it to the frame, then pass the original full-resolution pixels in each candidate box to `quirc`.

The coarse pass is only a scan-order optimization. It must not decide whether a QR is valid and must not be the only path to the decoder:

1. Capture the existing grayscale VGA frame.
2. On normal frames, sample it at reduced resolution and classify bright and dark pixels with a frame-adaptive threshold.
3. Form candidate regions from nearby tiles that contain both bright and dark samples; merge adjacent regions, cap the candidate count, and add a margin so the QR's white quiet zone is included.
4. Try candidate regions from largest/highest-contrast first using original-resolution pixels.
5. If no useful candidate is found, run the existing centered scan for that frame. If candidates were tried but none decoded, do not repeat a second crop scan on the same frame.
6. On the existing full-frame cadence (every fourth frame), run the full-frame scan regardless of ROI detection. This preserves recovery for off-center QR codes, unusual lighting, and filter false negatives.

Candidate dimensions, tile sampling, contrast thresholds, expansion margin, candidate cap, and full-frame interval are named constants in the firmware. They are tuned for VGA input and the existing officer badge QR use case; they do not become backend configuration or alter the API.

## Compatibility and scope

- Keep grayscale VGA capture, camera power control, flash behavior, existing QR payload handling, job attempts/timeouts, HMAC requests, diagnostics events, and server-side pass/retry/fail decisions unchanged.
- Do not scan or validate the rider's front-box QR on the board.
- Do not upload, persist, or log camera images or decoded QR text beyond the existing job result behavior.
- Add no dependencies and make no backend or database changes.

## Failure behavior

- If coarse candidate detection finds nothing, use the centered scan and the scheduled full-frame scan.
- If candidate-region decoding fails, continue with the other bounded candidate regions and use the scheduled full-frame recovery.
- If the frame is missing or invalid, preserve the existing retry-until-timeout behavior.
- ROI detection must not extend the configured scan timeout or change the reported job outcome.

## Verification

- Build the firmware with the existing PlatformIO environment.
- Verify the scan path using the officer badge QR displayed on a phone at center, off-center, different rotations supported by the existing decoder, and under bright and dim conditions.
- Verify that no-QR frames still time out normally and that an off-center QR remains readable through the full-frame recovery path.
- Compare frames and elapsed time to decode against the current implementation on the same board and phone. A code build or host-side image exercise alone cannot prove optical focus, exposure, or the real board's timing.
- Confirm the existing inspection and test job protocol remains unchanged.

## Known trade-off

The coarse pass costs CPU time, so it only improves total scan efficiency if candidate-region decoding avoids enough full-frame decoder work. The periodic full-frame recovery can reduce the gain but protects against missed QR codes. Physical measurements are required to tune the constants and confirm that the new path is faster on the target board.
