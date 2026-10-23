import React, { useMemo } from "react";
import { View } from "react-native";
import createQR from "qrcode-generator";

const QUIET = 4; // white border in modules; scanners need it

// QR code drawn with plain Views (no SVG/native module needed, works in Expo Go, web and builds):
// one View per run of dark modules in a row keeps the element count low.
export default function QRCode({ value, size = 220, testID }: { value: string; size?: number; testID?: string }) {
  const { runs, count } = useMemo(() => {
    const qr = createQR(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    const out: { row: number; start: number; len: number }[] = [];
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!qr.isDark(r, c)) { c++; continue; }
        const start = c;
        while (c < n && qr.isDark(r, c)) c++;
        out.push({ row: r, start, len: c - start });
      }
    }
    return { runs: out, count: n };
  }, [value]);

  const cell = Math.max(2, Math.floor(size / (count + QUIET * 2))); // whole pixels keep the edges crisp
  const total = cell * (count + QUIET * 2);

  return (
    <View testID={testID} accessible accessibilityRole="image" style={{ width: total, height: total, backgroundColor: "#FFFFFF", borderRadius: cell * 2 }}>
      {runs.map((r, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            top: (r.row + QUIET) * cell,
            left: (r.start + QUIET) * cell,
            width: r.len * cell,
            height: cell,
            backgroundColor: "#000000",
          }}
        />
      ))}
    </View>
  );
}
