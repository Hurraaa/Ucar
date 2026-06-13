const { createCanvas } = require('canvas');
const fs = require('fs');
const { drawProCar } = require('./carrender.js');

const W = 1000, H = 640;
const c = createCanvas(W, H);
const ctx = c.getContext('2d');

// Gökyüzü
let g = ctx.createLinearGradient(0, 0, 0, H * 0.55);
g.addColorStop(0, '#2a5db0'); g.addColorStop(1, '#bfe0f5');
ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.55);
// Asfalt
g = ctx.createLinearGradient(0, H * 0.55, 0, H);
g.addColorStop(0, '#5b5f68'); g.addColorStop(1, '#3a3d44');
ctx.fillStyle = g; ctx.fillRect(0, H * 0.55, W, H * 0.45);

// Üç araç: normal, frenli, açık renk
drawProCar(ctx, W * 0.27, H * 0.86, 420, { body: '#c0392b', brake: false });
drawProCar(ctx, W * 0.74, H * 0.86, 420, { body: '#c0392b', brake: true });
drawProCar(ctx, W * 0.5, H * 0.52, 240, { body: '#2d7dd2', brake: false });

fs.writeFileSync('car_preview.png', c.toBuffer('image/png'));
console.log('wrote car_preview.png');
