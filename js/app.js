const videoElement = document.getElementById('input-video');
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement.getContext('2d');
const gameCanvas = document.getElementById('game-canvas');
const gameCtx = gameCanvas.getContext('2d');
const scoreEl = document.getElementById('score-val');
const highScoreEl = document.getElementById('high-score-val');
const statusEl = document.getElementById('hand-status');
const loadingScreen = document.getElementById('loading-screen');
const gameOverScreen = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score-val');
const bossHud = document.getElementById('boss-hud');
const bossHealthBar = document.getElementById('boss-health');

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
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
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
    } else if (type === 'boss_hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
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
let highScore = localStorage.getItem('handracer_highscore') || 0;
let speedMultiplier = 1;
let playerX = 0.5;
const playerY = 0.70;
let handDetected = false;
let isFist = false;
let lastShotTime = 0;

// Update UI
highScoreEl.innerText = highScore;

// Boss State
let boss = null;
let level = 1;

// Helpers
let particles = [];
function createExplosion(x, y, color, size = 15) {
    for (let i = 0; i < size; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 1.0,
            color: color
        });
    }
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
        let x = landmarks[9].x;

        let targetX = (1 - x);
        targetX = (targetX - 0.2) / (0.6);
        targetX = Math.max(0, Math.min(1, targetX));

        playerX = playerX + (targetX - playerX) * 0.25;

        const wrist = landmarks[0];
        const indexTip = landmarks[8];
        const dist = Math.sqrt(Math.pow(indexTip.x - wrist.x, 2) + Math.pow(indexTip.y - wrist.y, 2));

        if (dist < 0.2) {
            isFist = true;
            statusEl.innerText = "FIST (AUTO-FIRE)";
            statusEl.classList.add('active');
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
        statusEl.classList.remove('active');
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
let survivors = [];
let bossBullets = [];
const playerWidth = 60;
const playerHeight = 80;

function shoot() {
    if (!gameRunning) return;
    const now = Date.now();
    if (now - lastShotTime < 150) return;

    lastShotTime = now;
    playSound('shoot');
    bullets.push({
        x: playerX,
        y: playerY - 0.05,
        speed: 0.025
    });
}

function spawnBoss() {
    boss = {
        x: 0.5,
        y: -0.2, // enters from top
        width: 150,
        height: 100,
        maxHealth: 50 * level, // Health scales with level
        health: 50 * level,
        mode: 'entering', // entering, fighting
        moveDir: 1,
        lastShoot: 0
    };
    bossHud.style.display = 'block';
    updateBossHealth();
}

function updateBossHealth() {
    if (!boss) return;
    const pct = (boss.health / boss.maxHealth) * 100;
    bossHealthBar.style.width = `${pct}%`;
}

function spawnProps() {
    if (!gameRunning || (boss && boss.mode === 'fighting')) return;

    // Spawn Obstacle
    if (Math.random() < 0.02 * speedMultiplier) {
        const size = Math.random() * 40 + 40;
        obstacles.push({
            x: Math.random(),
            y: -0.1,
            size: size,
            speed: (0.005 + (score * 0.00001)) * speedMultiplier,
            type: 'rock'
        });
    }

    // Spawn Survivors
    if (Math.random() < 0.008) {
        survivors.push({
            x: Math.random(),
            y: -0.1,
            size: 30,
            speed: 0.004 * speedMultiplier
        });
    }

    // Spawn Coin
    if (Math.random() < 0.01) {
        coins.push({
            x: Math.random(),
            y: -0.1,
            size: 30,
            speed: 0.007 * speedMultiplier
        });
    }
}

function resetGame() {
    obstacles = [];
    coins = [];
    bullets = [];
    survivors = [];
    bossBullets = [];
    particles = [];
    boss = null;
    bossHud.style.display = 'none';
    score = 0;
    level = 1;
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
    ctx.moveTo(x, y - height / 2);
    ctx.lineTo(x - width / 3, y);
    ctx.lineTo(x - width / 2, y + height / 2);
    ctx.lineTo(x - width / 4, y + height / 2 - 5);
    ctx.lineTo(x + width / 4, y + height / 2 - 5);
    ctx.lineTo(x + width / 2, y + height / 2);
    ctx.lineTo(x + width / 3, y);
    ctx.closePath();
    ctx.fill();

    // Cockpit
    ctx.fillStyle = '#111';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.ellipse(x, y + 5, width / 6, height / 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Engine
    ctx.fillStyle = '#ff5e00';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ff5e00';
    ctx.beginPath();
    ctx.arc(x - width / 4 + 5, y + height / 2, 4, 0, Math.PI * 2);
    ctx.arc(x + width / 4 - 5, y + height / 2, 4, 0, Math.PI * 2);
    ctx.fill();
}

function drawBoss(ctx, b, w, h) {
    const bX = b.x * w;
    const bY = b.y * h;

    // Boss Ship (Big Purple & Red)
    ctx.fillStyle = '#440055';
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#ff0055';

    ctx.beginPath();
    ctx.moveTo(bX, bY + b.height / 2); // Bottom Tip
    ctx.lineTo(bX - b.width / 2, bY - b.height / 2); // Top Left
    ctx.lineTo(bX, bY - b.height / 4); // Top Center notch
    ctx.lineTo(bX + b.width / 2, bY - b.height / 2); // Top Right
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Boss Core
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(bX, bY, 20, 0, Math.PI * 2);
    ctx.fill();
}

function saveHighScore() {
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('handracer_highscore', highScore);
        highScoreEl.innerText = highScore;
    }
}

function drawGame() {
    if (!gameRunning) return;

    // Background Gradient Cycle based on Level/Score
    const w = gameCanvas.width;
    const h = gameCanvas.height;

    // Biome Logic
    let biomeHue = (Math.floor(score / 2000) * 120) % 360; // Changes every 2000 pts
    gameCtx.fillStyle = `rgba(0,0,0,0.4)`; // Fade

    // Override fill for biome effect (subtle)
    // Draw bg rect
    gameCtx.fillRect(0, 0, w, h);

    // Grid color matches biome
    let gridColor = `hsla(${180 + biomeHue}, 100%, 50%, 0.15)`;

    // BOSS SPAWN CHECK
    if (!boss && score > 0 && score % 2000 > 1900 && score % 2000 < 1999) {
        // Warning?
    }
    if (!boss && score > 2000 * level && score > 500) {
        spawnBoss();
    }

    // Grid
    gameCtx.strokeStyle = gridColor;
    gameCtx.lineWidth = 1;
    gameCtx.beginPath();
    let gridOffset = (Date.now() / 20) % 100;
    for (let i = 0; i < w; i += 100) { gameCtx.moveTo(i, 0); gameCtx.lineTo(i, h); }
    for (let i = gridOffset; i < h; i += 100) { gameCtx.moveTo(0, i); gameCtx.lineTo(w, i); }
    gameCtx.stroke();

    // PLAYER
    const pX = playerX * w;
    const pY = playerY * h;
    drawSpaceShip(gameCtx, pX, pY, playerWidth, playerHeight);

    if (isFist) shoot();

    // BOSS LOGIC
    if (boss) {
        const bX = boss.x * w;
        const bY = boss.y * h;

        if (boss.mode === 'entering') {
            boss.y += 0.005;
            if (boss.y >= 0.2) boss.mode = 'fighting';
        } else {
            // Move Side to Side
            boss.x += 0.005 * boss.moveDir;
            if (boss.x > 0.9 || boss.x < 0.1) boss.moveDir *= -1;

            // Shoot
            if (Date.now() - boss.lastShoot > 1000) {
                boss.lastShoot = Date.now();
                // Shoot towards player
                let angle = Math.atan2(pY - bY, pX - bX);
                bossBullets.push({
                    x: boss.x,
                    y: boss.y,
                    vx: Math.cos(angle) * 0.01,
                    vy: Math.sin(angle) * 0.01
                });
            }
        }

        drawBoss(gameCtx, boss, w, h);
    }

    // BOSS BULLETS
    gameCtx.fillStyle = '#ff0000'; // Red lasers
    for (let i = bossBullets.length - 1; i >= 0; i--) {
        let bb = bossBullets[i];
        bb.x += bb.vx;
        bb.y += bb.vy;

        gameCtx.beginPath();
        gameCtx.arc(bb.x * w, bb.y * h, 8, 0, Math.PI * 2);
        gameCtx.fill();

        // Collsion with Player
        if (Math.abs(pX - bb.x * w) < playerWidth / 2 && Math.abs(pY - bb.y * h) < playerHeight / 2) {
            playSound('crash');
            saveHighScore();
            gameRunning = false;
            isGameOver = true;
            finalScoreEl.innerText = score;
            gameOverScreen.style.display = 'block';
        }

        if (bb.y > 1.1) bossBullets.splice(i, 1);
    }

    // BULLETS (Player)
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

        let bulletHit = false;

        // Boss Hit
        if (boss && boss.mode === 'fighting') {
            let bossX = boss.x * w;
            let bossY = boss.y * h;
            if (Math.abs(bX - bossX) < boss.width / 2 && Math.abs(bY - bossY) < boss.height / 2) {
                boss.health--;
                updateBossHealth();
                playSound('boss_hit');
                createExplosion(bX, bY, '#ff0055', 5);
                bulletHit = true;

                if (boss.health <= 0) {
                    // Boss Dead
                    createExplosion(bossX, bossY, '#ffffff', 50);
                    playSound('coin');
                    score += 5000;
                    boss = null;
                    bossHud.style.display = 'none';
                    level++;
                }
            }
        }

        // Rocks
        for (let k = obstacles.length - 1; k >= 0; k--) {
            let obs = obstacles[k];
            let oX = obs.x * w;
            let oY = obs.y * h;
            if (!bulletHit && Math.abs(bX - oX) < obs.size && Math.abs(bY - oY) < obs.size) {
                createExplosion(oX, oY, '#ff0055');
                score += 50;
                scoreEl.innerText = score;
                playSound('shoot');
                obstacles.splice(k, 1);
                bulletHit = true;
                break;
            }
        }

        if (bulletHit) bullets.splice(i, 1);
    }

    // SURVIVORS & PROPS (Only if no boss fighting)
    if (!boss || boss.mode !== 'fighting') {
        // Survivors
        for (let i = survivors.length - 1; i >= 0; i--) {
            let surv = survivors[i];
            surv.y += surv.speed;
            let sX = surv.x * w;
            let sY = surv.y * h;

            drawAstronaut(gameCtx, sX, sY, surv.size);

            if (Math.abs(pX - sX) < (playerWidth / 2 + surv.size / 2) && Math.abs(pY - sY) < (playerHeight / 2 + surv.size / 2)) {
                createExplosion(sX, sY, '#00ffff');
                score += 500;
                scoreEl.innerText = score;
                playSound('coin');
                survivors.splice(i, 1);
            } else if (surv.y > 1.1) survivors.splice(i, 1);
        }

        // Rocks
        gameCtx.fillStyle = '#ff0055';
        gameCtx.shadowColor = '#ff0055';
        for (let i = obstacles.length - 1; i >= 0; i--) {
            let obs = obstacles[i];
            obs.y += obs.speed;
            let oX = obs.x * w;
            let oY = obs.y * h;
            gameCtx.fillRect(oX - obs.size / 2, oY - obs.size / 2, obs.size, obs.size);

            if (Math.abs(pX - oX) < (playerWidth / 2 + obs.size / 2 - 10) && Math.abs(pY - oY) < (playerHeight / 2 + obs.size / 2 - 10)) {
                playSound('crash');
                createExplosion(pX, pY, '#ff0055');
                saveHighScore();
                gameRunning = false;
                isGameOver = true;
                finalScoreEl.innerText = score;
                gameOverScreen.style.display = 'block';
            }
            if (obs.y > 1.1) obstacles.splice(i, 1);
        }
    }

    // Coins logic remains same...
    for (let i = coins.length - 1; i >= 0; i--) {
        let coin = coins[i];
        coin.y += coin.speed;
        let cX = coin.x * w;
        let cY = coin.y * h;
        gameCtx.fillStyle = '#ffe600';
        gameCtx.beginPath();
        gameCtx.arc(cX, cY, 10, 0, Math.PI * 2);
        gameCtx.fill();
        if (Math.abs(pX - cX) < (playerWidth / 2 + 15) && Math.abs(pY - cY) < (playerHeight / 2 + 15)) {
            playSound('coin');
            score += 50;
            scoreEl.innerText = score;
            createExplosion(cX, cY, '#ffe600');
            coins.splice(i, 1);
            speedMultiplier += 0.02;
        }
        if (coin.y > 1.1) coins.splice(i, 1);
    }

    // Particles
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

    if (gameRunning) requestAnimationFrame(drawGame);
}
