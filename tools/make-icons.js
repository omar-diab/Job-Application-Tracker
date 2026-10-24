// Draws the extension icon on <canvas> elements and lets you download each size as a PNG file.

const SIZES = [16, 48, 128];

const INDIGO_LIGHT = '#6366f1';
const INDIGO_DARK = '#4f46e5';
const WHITE = '#ffffff';

// Fills the whole canvas with a rounded square and an indigo gradient.
function drawBackground(ctx, size, radius) {
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, INDIGO_LIGHT);
  gradient.addColorStop(1, INDIGO_DARK);

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, radius);
  ctx.fill();
}

// The 48 and 128 icons. We draw on a 128 x 128 grid and scale it down.
// Most numbers are multiples of 8, so at 48 px they land exactly on whole pixels.
function drawLargeIcon(ctx, size) {
  ctx.save();
  ctx.scale(size / 128, size / 128);

  drawBackground(ctx, 128, 28);

  // Handle: a thick white outline. The body covers its bottom half.
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(52, 28, 24, 24, 6);
  ctx.stroke();

  // Body of the briefcase.
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.roundRect(24, 48, 80, 56, 12);
  ctx.fill();

  // Check mark in the middle of the body.
  ctx.strokeStyle = INDIGO_DARK;
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(46, 76);
  ctx.lineTo(58, 88);
  ctx.lineTo(82, 64);
  ctx.stroke();

  ctx.restore();
}

// The 16 icon. Drawn directly in real pixels, with thicker lines and fewer details,
// so it stays sharp and does not become blurry.
function drawSmallIcon(ctx) {
  drawBackground(ctx, 16, 3);

  ctx.fillStyle = WHITE;

  // Handle: a top bar and two sides, each 2 pixels thick.
  ctx.fillRect(5, 2, 6, 2);
  ctx.fillRect(5, 2, 2, 4);
  ctx.fillRect(9, 2, 2, 4);

  // Body of the briefcase.
  ctx.beginPath();
  ctx.roundRect(2, 6, 12, 8, 1.5);
  ctx.fill();

  // Check mark, drawn pixel by pixel: one column of 2 pixels for each x.
  // Each pair is [x, top y]. Whole pixels mean no blurry edges.
  const checkPixels = [[4, 9], [5, 10], [6, 11], [7, 10], [8, 9], [9, 8], [10, 7]];
  ctx.fillStyle = INDIGO_DARK;
  checkPixels.forEach(function (pixel) {
    ctx.fillRect(pixel[0], pixel[1], 1, 2);
  });
}

function createIconCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (size <= 16) {
    drawSmallIcon(ctx);
  } else {
    drawLargeIcon(ctx, size);
  }

  return canvas;
}

// Turns the canvas into a PNG file and makes the browser download it.
function downloadCanvas(canvas, fileName) {
  canvas.toBlob(function (blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }, 'image/png');
}

function createPreview(size, theme, zoom) {
  const box = document.createElement('div');
  box.className = 'preview ' + theme;

  const canvas = createIconCanvas(size);
  if (zoom) {
    canvas.className = 'zoom';
  }
  box.appendChild(canvas);

  const label = document.createElement('span');
  label.textContent = zoom ? 'Zoomed' : theme === 'light' ? 'Light theme' : 'Dark theme';
  box.appendChild(label);

  return box;
}

function createCard(size) {
  const fileName = 'icon' + size + '.png';

  const card = document.createElement('section');
  card.className = 'card';

  const title = document.createElement('h2');
  title.textContent = size + ' × ' + size;
  card.appendChild(title);

  const previews = document.createElement('div');
  previews.className = 'previews';
  previews.appendChild(createPreview(size, 'light', false));
  previews.appendChild(createPreview(size, 'dark', false));
  if (size < 128) {
    previews.appendChild(createPreview(size, 'light', true));
  }
  card.appendChild(previews);

  // This canvas is never shown. It is only used to make the PNG file.
  const downloadSource = createIconCanvas(size);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Download ' + fileName;
  button.addEventListener('click', function () {
    downloadCanvas(downloadSource, fileName);
  });
  card.appendChild(button);

  return card;
}

const container = document.getElementById('icons');
SIZES.forEach(function (size) {
  container.appendChild(createCard(size));
});
