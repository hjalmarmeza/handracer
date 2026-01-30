const videoElement = document.getElementById('input-video');
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement.getContext('2d');
const gameCanvas = document.getElementById('game-canvas');
const gameCtx = gameCanvas.getContext('2d');
const scoreEl = document.getElementById('score-val');
const statusEl = document.getElementById('hand-status');
const loadingScreen = document.getElementById('loading-screen');
const gameOverScreen = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score-val');

// Audio Context (Simple Synth)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'coin') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'shoot') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'crash') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'start') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(800, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
    }
}

// Game State
let gameRunning = false;
let isGameOver = false;
let score = 0;
let speedMultiplier = 1;
let playerX = 0.5;
const playerY = 0.85;
let handDetected = false;
let isFist = false; // Trigger for shooting
let lastShotTime = 0;

// Helpers
let particles = [];
function createExplosion(x, y, color) {
    for (let i = 0; i < 15; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 1.0,
            color: color
        });
    }
}

function detectFist(landmarks) {
    // A simple heuristic: check if fingertips are close to wrist or Palm center
    // Tips: 8, 12, 16, 20. Wrist: 0
    // If all tips are below their PIP joints (6, 10, 14, 18) it's likely a fist in this orientation
    // But since hand can be anywhere, let's use distance from wrist.

    const wrist = landmarks[0];
    const tips = [8, 12, 16, 20];
    let foldedCount = 0;

    // Calculate simple distance-based folding
    // Or just check y-coordinate relative to PIP joint? Simpler:
    // If tip is "lower" (higher Y value in screen coords) than the knuckle?
    // Let's use a simpler "Compactness" check.

    let tipSum = 0;
    tips.forEach(idx => {
        let d = Math.sqrt(Math.pow(landmarks[idx].x - wrist.x, 2) + Math.pow(landmarks[idx].y - wrist.y, 2));
        tipSum += d;
    });

    // Threshold found experimentally
    return tipSum < 0.8; // Normalized coords
}

// MediaPipe Setup
function onResults(results) {
    if (loadingScreen.style.display !== 'none') {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            if (!gameRunning && !isGameOver) {
                gameRunning = true;
                playSound('start');
                spawnProps();
                drawGame();
            }
        }, 500);
    }

    // Draw Camera Preview
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        handDetected = true;

        const landmarks = results.multiHandLandmarks[0];

        // Control Logic: X position
        let x = landmarks[9].x;
        playerX = playerX + ((1 - x) - playerX) * 0.15; // Smooth movement

        // Shoot Logic (Fist Detection - simple check if tips are low)
        // Check if index finger tip (8) is below index finger mcp (5) -> Folded
        // Actually, just checking if Index Finger Tip is below the middle knuckle working well for "Clinch"
        // Let's use a simpler bool: is Index Tip close to wrist?
        const wrist = landmarks[0];
        const indexTip = landmarks[8];
        const dist = Math.sqrt(Math.pow(indexTip.x - wrist.x, 2) + Math.pow(indexTip.y - wrist.y, 2));

        // Threshold for fist/pinch
        if (dist < 0.15) { // Folded
            if (!isFist) {
                isFist = true;
                statusEl.innerText = "FIST (SHOOT)";
                statusEl.classList.add('active');
                shoot();
            }
        } else {
            isFist = false;
            statusEl.innerText = "OPEN HAND";
            statusEl.classList.remove('active');
        }

        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: isFist ? '#ff0055' : '#00ff00', lineWidth: 1 });
        drawLandmarks(canvasCtx, landmarks, { color: '#00f2ff', lineWidth: 1, radius: 2 });

    } else {
        handDetected = false;
        statusEl.innerText = "NO SIGNAL";
        statusEl.classList.add('waiting');
    }
    canvasCtx.restore();
}

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});
hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => { await hands.send({ image: videoElement }); },
    width: 320, height: 240
});
camera.start();

// GAME LOOP
function resizeGame() {
    gameCanvas.width = window.innerWidth;
    gameCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeGame);
resizeGame();

let obstacles = [];
let coins = [];
let bullets = [];
let enemies = []; // Targets to shoot
const playerWidth = 60;
const playerHeight = 80;

function shoot() {
    if (!gameRunning) return;
    const now = Date.now();
    if (now - lastShotTime < 200) return; // Cooldown

    lastShotTime = now;
    playSound('shoot');
    bullets.push({
        x: playerX,
        y: playerY - 0.05,
        speed: 0.02
    });
}

function spawnProps() {
    if (!gameRunning) return;

    // Spawn Obstacle (Red Rocks)
    if (Math.random() < 0.02 * speedMultiplier) {
        const size = Math.random() * 40 + 40;
        obstacles.push({
            x: Math.random(),
            y: -0.1,
            size: size,
            speed: (0.005 + (score * 0.00005)) * speedMultiplier,
            type: 'rock'
        });
    }

    // Spawn Enemy Target (Purple Orb)
    if (Math.random() < 0.015) {
        enemies.push({
            x: Math.random(),
            y: -0.1,
            size: 35,
            speed: 0.004 * speedMultiplier
        });
    }

    // Spawn Coin (Yellow)
    if (Math.random() < 0.01) {
        coins.push({
            x: Math.random(),
            y: -0.1,
            size: 30, // Visual size
            speed: 0.007 * speedMultiplier
        });
    }
}

function resetGame() {
    obstacles = [];
    coins = [];
    bullets = [];
    enemies = [];
    particles = [];
    score = 0;
    speedMultiplier = 1;
    scoreEl.innerText = '0';
    gameOverScreen.style.display = 'none';
    isGameOver = false;
    gameRunning = true;
    playSound('start');
    drawGame();
}
window.resetGame = resetGame;

function drawSpaceShip(ctx, x, y, width, height) {
    // Body
    ctx.fillStyle = '#00f2ff';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f2ff';

    ctx.beginPath();
    ctx.moveTo(x, y - height / 2); // Nose
    ctx.lineTo(x - width / 3, y); // Left inner
    ctx.lineTo(x - width / 2, y + height / 2); // Left wing tip
    ctx.lineTo(x - width / 4, y + height / 2 - 5); // Left engine
    ctx.lineTo(x + width / 4, y + height / 2 - 5); // Right engine
    ctx.lineTo(x + width / 2, y + height / 2); // Right wing tip
    ctx.lineTo(x + width / 3, y); // Right inner
    ctx.closePath();
    ctx.fill();

    // Cockpit
    ctx.fillStyle = '#111';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.ellipse(x, y + 5, width / 6, height / 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Engine Glow
    ctx.fillStyle = '#ff5e00';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ff5e00';
    ctx.beginPath();
    ctx.arc(x - width / 4 + 5, y + height / 2, 4, 0, Math.PI * 2);
    ctx.arc(x + width / 4 - 5, y + height / 2, 4, 0, Math.PI * 2);
    ctx.fill();
}

function drawGame() {
    if (!gameRunning) return;

    // Clear with trail
    gameCtx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    gameCtx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

    spawnProps();

    const w = gameCanvas.width;
    const h = gameCanvas.height;

    // Speed Lines Effect
    if (score > 100) {
        gameCtx.strokeStyle = `rgba(255,255,255,${0.1 * (score / 1000)})`;
        gameCtx.beginPath();
        for (let i = 0; i < 5; i++) {
            let lx = Math.random() * w;
            gameCtx.moveTo(lx, 0);
            gameCtx.lineTo(lx, h);
        }
        gameCtx.stroke();
    }

    // Grid
    gameCtx.strokeStyle = 'rgba(0, 242, 255, 0.15)';
    gameCtx.lineWidth = 1;
    gameCtx.beginPath();
    let gridOffset = (Date.now() / 20) % 100; // Moving grid
    for (let i = 0; i < w; i += 100) { gameCtx.moveTo(i, 0); gameCtx.lineTo(i, h); }
    for (let i = gridOffset; i < h; i += 100) { gameCtx.moveTo(0, i); gameCtx.lineTo(w, i); }
    gameCtx.stroke();

    // PLAYER
    const pX = playerX * w;
    const pY = playerY * h;
    drawSpaceShip(gameCtx, pX, pY, playerWidth, playerHeight);

    // BULLETS
    gameCtx.fillStyle = '#00f2ff';
    gameCtx.shadowBlur = 10;
    gameCtx.shadowColor = '#00f2ff';
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.y -= b.speed;
        let bX = b.x * w;
        let bY = b.y * h;

        gameCtx.fillRect(bX - 2, bY - 10, 4, 20);

        if (b.y < -0.1) bullets.splice(i, 1);

        // Bullet Collision with Enemies (Purple Orbs)
        let bulletHit = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
            let en = enemies[j];
            let eX = en.x * w;
            let eY = en.y * h;

            if (Math.abs(bX - eX) < en.size && Math.abs(bY - eY) < en.size) {
                createExplosion(eX, eY, '#a000ff'); // Purple explosion
                score += 200; // DOUBLE SCORE (was 100)
                scoreEl.innerText = score;
                playSound('coin');

                enemies.splice(j, 1);
                bulletHit = true;
                break;
            }
        }

        // Bullet Collision with Obstacles (Red Rocks) - NOW DESTRUCTIBLE
        if (!bulletHit) {
            for (let k = obstacles.length - 1; k >= 0; k--) {
                let obs = obstacles[k];
                let oX = obs.x * w;
                let oY = obs.y * h;

                if (Math.abs(bX - oX) < obs.size && Math.abs(bY - oY) < obs.size) {
                    createExplosion(oX, oY, '#ff0055'); // Red explosion
                    score += 50; // Points for clearing path
                    scoreEl.innerText = score;
                    playSound('shoot'); // Small hit sound

                    obstacles.splice(k, 1);
                    bulletHit = true;
                    break;
                }
            }
        }

        if (bulletHit) {
            bullets.splice(i, 1);
        }
    }

    // ENEMIES (Purple Orbs)
    gameCtx.fillStyle = '#a000ff';
    gameCtx.shadowColor = '#a000ff';
    gameCtx.shadowBlur = 15;
    for (let i = enemies.length - 1; i >= 0; i--) {
        let en = enemies[i];
        en.y += en.speed;
        let eX = en.x * w;
        let eY = en.y * h;

        // Draw Hexagon or Orb
        gameCtx.beginPath();
        gameCtx.arc(eX, eY, en.size / 2, 0, Math.PI * 2);
        gameCtx.fill();

        // Target Reticle
        gameCtx.strokeStyle = 'white';
        gameCtx.lineWidth = 2;
        gameCtx.strokeRect(eX - 10, eY - 10, 20, 20);

        if (en.y > 1.1) enemies.splice(i, 1);

        // Collision with player (Damage or Death?)
        if (Math.abs(pX - eX) < (playerWidth / 2 + en.size / 2) && Math.abs(pY - eY) < (playerHeight / 2 + en.size / 2)) {
            playSound('crash');
            gameRunning = false;
            isGameOver = true;
            finalScoreEl.innerText = score;
            gameOverScreen.style.display = 'block';
        }
    }

    // OBSTACLES (Red Rocks)
    gameCtx.fillStyle = '#ff0055';
    gameCtx.shadowBlur = 10;
    gameCtx.shadowColor = '#ff0055';
    for (let i = obstacles.length - 1; i >= 0; i--) {
        let obs = obstacles[i];
        obs.y += obs.speed;
        let oX = obs.x * w;
        let oY = obs.y * h;

        gameCtx.fillRect(oX - obs.size / 2, oY - obs.size / 2, obs.size, obs.size);

        // Crash
        if (Math.abs(pX - oX) < (playerWidth / 2 + obs.size / 2 - 10) &&
            Math.abs(pY - oY) < (playerHeight / 2 + obs.size / 2 - 10)) {

            playSound('crash');
            createExplosion(pX, pY, '#ff0055');
            gameRunning = false;
            isGameOver = true;
            finalScoreEl.innerText = score;
            gameOverScreen.style.display = 'block';
        }

        if (obs.y > 1.1) obstacles.splice(i, 1);
    }

    // COINS
    gameCtx.fillStyle = '#ffe600';
    gameCtx.shadowColor = '#ffe600';
    for (let i = coins.length - 1; i >= 0; i--) {
        let coin = coins[i];
        coin.y += coin.speed;
        let cX = coin.x * w;
        let cY = coin.y * h;

        gameCtx.beginPath();
        gameCtx.arc(cX, cY, 10, 0, Math.PI * 2);
        gameCtx.fill();

        if (Math.abs(pX - cX) < (playerWidth / 2 + 15) &&
            Math.abs(pY - cY) < (playerHeight / 2 + 15)) {

            playSound('coin');
            score += 50;
            scoreEl.innerText = score;
            createExplosion(cX, cY, '#ffe600');
            coins.splice(i, 1);
            speedMultiplier += 0.02;
        }

        if (coin.y > 1.1) coins.splice(i, 1);
    }

    // PARTICLES
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.05;
        gameCtx.globalAlpha = p.life;
        gameCtx.fillStyle = p.color;
        gameCtx.beginPath();
        gameCtx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        gameCtx.fill();
        if (p.life <= 0) particles.splice(i, 1);
    }
    gameCtx.globalAlpha = 1.0;

    // Passive Score
    if (gameRunning) {
        score++;
        if (score % 10 === 0) scoreEl.innerText = score;
    }

    if (gameRunning) requestAnimationFrame(drawGame);
}
