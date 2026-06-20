/** Remove Grok Imagine magenta (#FF00FF) key and JPEG pink fringes. */

export function magentaKeyAlpha(r, g, b) {
  const dr = r - 255;
  const dg = g;
  const db = b - 255;
  const dist = Math.sqrt(dr * dr + dg * dg + db * db);
  if (dist < 120) return 0;
  if (dist < 175) return Math.floor(((dist - 120) / 55) * 255);

  const purple = (r + b) * 0.5 - g;
  if (r > 70 && b > 70 && g < Math.min(r, b) * 0.62 && purple > 40) {
    return Math.max(0, Math.min(255, Math.floor(255 - purple * 3.2)));
  }

  const pink = (r + b) * 0.5 - g;
  if (r > 165 && b > 145 && g < 140 && pink > 90) {
    return Math.max(0, Math.min(255, Math.floor(255 - pink * 2.2)));
  }
  return 255;
}

function despillPurple(d, i, purple) {
  const spill = Math.min(purple * 0.85, 48);
  d[i] = Math.max(0, d[i] - spill);
  d[i + 2] = Math.max(0, d[i + 2] - spill);
}

export function stripMagentaFromImageData(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const purple = (r + b) * 0.5 - g;
    const a = magentaKeyAlpha(r, g, b);
    if (a <= 0 || (purple > 18 && r > 50 && b > 50 && g < Math.min(r, b) * 0.7)) {
      d[i + 3] = 0;
    } else if (a < 255) {
      d[i + 3] = Math.min(d[i + 3], a);
      if (purple > 8) despillPurple(d, i, purple);
    } else if (purple > 8 && d[i + 3] < 250) {
      despillPurple(d, i, purple);
    }
  }
  return imageData;
}