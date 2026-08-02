/**
 * Zeroing the alternate groups mediabunny writes.
 *
 * mediabunny sets every track's `tkhd.alternate_group` to the track's own id
 * (isobmff-boxes.js, `u16(trackData.track.id)`), so the video track lands in
 * alternate group 1 and the audio in group 2. Per ISO 14496-12 an alternate
 * group marks tracks that are selectable alternatives to each other; 0 means
 * the track has no such relationship. ffmpeg writes 0 for video.
 *
 * Safari's AVFoundation takes the grouping seriously: with the video track in
 * an alternate group, the media controls never auto-hide, and the controls
 * scrim sits over the picture for the whole of playback, reading as washed-out
 * grey. Isolated both directions on one file pair: flipping only these two
 * bytes in a working file breaks it, and zeroing only them in a broken file
 * fixes it, with every other suspect (interleaving, timescales, edit lists,
 * cover art, moov placement) ruled out on controlled bases along the way.
 *
 * Until mediabunny writes 0 or exposes the field, this repairs the finalized
 * file. Tracked in #86; delete this module when upstream fixes it. In place: the field is fixed-size, so nothing moves and no offsets
 * need rewriting.
 */

const BOX_HEADER = 8;

/** Walk the boxes directly inside [start, end), tolerating malformed input. */
function* boxes(
  data: DataView,
  start: number,
  end: number
): Generator<{ type: string; body: number; end: number }> {
  let at = start;
  while (at + BOX_HEADER <= end) {
    let size = data.getUint32(at);
    let header = BOX_HEADER;
    if (size === 1) {
      size = data.getUint32(at + 8) * 2 ** 32 + data.getUint32(at + 12);
      header = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < BOX_HEADER || at + size > end) return;
    const type = String.fromCharCode(
      data.getUint8(at + 4),
      data.getUint8(at + 5),
      data.getUint8(at + 6),
      data.getUint8(at + 7)
    );
    yield { type, body: at + header, end: at + size };
    at += size;
  }
}

/**
 * Set `alternate_group` to 0 in every track header, in place.
 * Returns how many were changed; 0 means the file already had none set
 * (or no parseable moov, in which case there is nothing to safely touch).
 */
export function clearAlternateGroups(mp4: Uint8Array): number {
  const data = new DataView(mp4.buffer, mp4.byteOffset, mp4.byteLength);
  let cleared = 0;
  for (const top of boxes(data, 0, mp4.byteLength)) {
    if (top.type !== "moov") continue;
    for (const trak of boxes(data, top.body, top.end)) {
      if (trak.type !== "trak") continue;
      for (const box of boxes(data, trak.body, trak.end)) {
        if (box.type !== "tkhd") continue;
        // v0: ver/flags 4, times 4+4, id 4, reserved 4, duration 4,
        // reserved 8, layer 2 -> alternate_group at body+34. v1 has 8-byte
        // times and duration -> body+46.
        const version = data.getUint8(box.body);
        const at = box.body + (version === 1 ? 46 : 34);
        if (at + 2 <= box.end && data.getUint16(at) !== 0) {
          data.setUint16(at, 0);
          cleared++;
        }
      }
    }
  }
  return cleared;
}
