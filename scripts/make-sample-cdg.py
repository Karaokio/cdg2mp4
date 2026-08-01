#!/usr/bin/env python3
"""Generate a copyright-free CDG test fixture (graphics) from scratch.

CDG has no encoder/muxer in ffmpeg, so we emit the raw subcode-packet stream by
hand: a color-bar test card plus a white block that sweeps across, then hold.
Pair it with a synthetic tone (made separately with ffmpeg) and there is nothing
copyrighted anywhere.

Writes two fixtures:

  test/files/sample.cdg      opaque background, the general-purpose fixture
  test/files/sample-key.cdg  declares the background color transparent, and
                             erases the sweeping block to it rather than
                             repainting over it

The keyed one exists to pin down a specific failure: a renderer that composites
each frame over the last (canvas drawImage's default) never erases anything a
transparent pixel covers, so the sweeping block leaves a trail the whole width
of the screen instead of moving. It is invisible in the opaque fixture, and it
is what real rips do between lyric lines.

CDG runs at 300 packets/sec. Each packet is 24 bytes; only packets whose low-6
command bits == 0x09 are TV-Graphics instructions, the rest are no-ops.
"""
import os

PACKETS_PER_SEC = 300
DURATION_SEC = 8

CMD = 0x09  # TV graphics command
MEMORY_PRESET, BORDER_PRESET = 1, 2
LOAD_CLUT_LO = 30
TILE_NORMAL = 6
TRANSPARENT_COLOR = 28

# 8-color palette (4-bit R,G,B), indices referenced below.
PALETTE = [
    (0, 0, 10),    # 0 deep blue (background)
    (15, 15, 0),   # 1 yellow
    (15, 3, 3),    # 2 red
    (3, 13, 5),    # 3 green
    (15, 15, 15),  # 4 white
    (4, 14, 15),   # 5 cyan
    (14, 4, 14),   # 6 magenta
    (1, 1, 1),     # 7 near-black
]


def packet(instruction, data):
    p = bytearray(24)
    p[0] = CMD & 0x3F
    p[1] = instruction & 0x3F
    for i, b in enumerate(data[:16]):
        p[4 + i] = b & 0x3F
    return bytes(p)


def noop():
    return bytes(24)


def color_pair(r, g, b):
    hi = ((r & 0x0F) << 2) | ((g >> 2) & 0x03)
    lo = ((g & 0x03) << 4) | (b & 0x0F)
    return hi & 0x3F, lo & 0x3F


def load_clut_lo():
    data = []
    for r, g, b in PALETTE:
        hi, lo = color_pair(r, g, b)
        data += [hi, lo]
    return packet(LOAD_CLUT_LO, data)


def solid_tile(row, col, color):
    # color0 == color1 → a fully solid 6x12 block of `color`.
    return packet(TILE_NORMAL, [color & 0x0F, color & 0x0F, row & 0x1F, col & 0x3F] + [0] * 12)


def build(key=False):
    packets = [load_clut_lo(), packet(BORDER_PRESET, [7]), packet(MEMORY_PRESET, [0])]
    if key:
        # Palette index 0 (the background) becomes transparent.
        packets.append(packet(TRANSPARENT_COLOR, [0]))

    # Screen is 50 tile-cols (0..49) x 18 tile-rows (0..17). Paint 6 vertical
    # color bars across the middle band, wiping in left-to-right.
    bar_colors = [2, 1, 3, 5, 6, 4]
    for col in range(2, 48):
        color = bar_colors[(col - 2) * len(bar_colors) // 46]
        for row in range(3, 15):
            packets.append(solid_tile(row, col, color))
            packets.append(noop())  # pace the wipe so it reads as animation

    # A white block sweeps across row 8-9 over the remaining time.
    target = DURATION_SEC * PACKETS_PER_SEC
    prev = None
    for col in range(2, 48):
        if prev is not None:
            # Erase the previous block: to the background color when keyed (so
            # the erase itself is transparent, which is the interesting case),
            # otherwise back to the bar color underneath it.
            pc = 0 if key else bar_colors[(prev - 2) * len(bar_colors) // 46]
            packets += [solid_tile(8, prev, pc), solid_tile(9, prev, pc)]
        packets += [solid_tile(8, col, 4), solid_tile(9, col, 4)]
        packets += [noop()] * 12  # hold each step ~13 packets
        prev = col

    # Pad to the full duration with no-ops.
    packets += [noop()] * max(0, target - len(packets))
    return b"".join(packets)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    for name, key in (("sample.cdg", False), ("sample-key.cdg", True)):
        out = os.path.join(here, "..", "test", "files", name)
        with open(out, "wb") as f:
            f.write(build(key=key))
        print(f"Wrote {os.path.relpath(out)} ({os.path.getsize(out)} bytes)")


if __name__ == "__main__":
    main()
