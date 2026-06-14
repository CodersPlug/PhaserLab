// =============================================================
//  PhaserLab — Mario-like starter
//  Arrow keys / WASD to move, Up / W / Space to jump
//  On-screen buttons for touch (iPad / iPhone)
// =============================================================

const GRAVITY    = 800;
const MOVE_SPEED = 220;
const JUMP_FORCE = 480;

// ── Game Over Scene ───────────────────────────────────────────
class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Dark overlay
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65);

    this.add.text(W / 2, H / 2 - 60, 'GAME OVER', {
      fontSize: '48px',
      fontFamily: 'monospace',
      fill: '#ff4444',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Play Again button
    const btn = this.add.rectangle(W / 2, H / 2 + 40, 220, 55, 0x4a90e2, 1)
      .setInteractive({ useHandCursor: true });

    this.add.text(W / 2, H / 2 + 40, 'Play Again', {
      fontSize: '24px',
      fontFamily: 'monospace',
      fill: '#ffffff',
    }).setOrigin(0.5);

    btn.on('pointerover', () => btn.setFillStyle(0x5aa0f2));
    btn.on('pointerout',  () => btn.setFillStyle(0x4a90e2));
    btn.on('pointerdown', () => {
      this.scene.stop('GameOver');
      this.scene.stop('GameScene');
      this.scene.start('GameScene');
    });
  }
}

// ── Main Game Scene ───────────────────────────────────────────
class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  preload() {
    const makeRect = (key, w, h, color) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(color);
      g.fillRect(0, 0, w, h);
      g.generateTexture(key, w, h);
      g.destroy();
    };
    makeRect('player',    24, 32, 0x4a90e2);
    makeRect('ground',   800, 20, 0x5cb85c);
    makeRect('platform', 120, 16, 0xa0724a);
    makeRect('coin',      16, 16, 0xf5c518);
    makeRect('enemy',     24, 24, 0xe74c3c);
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.cameras.main.setBackgroundColor('#3a7bd5');

    const WORLD_W = 2400;
    this.physics.world.setBounds(0, 0, WORLD_W, H);
    this.cameras.main.setBounds(0, 0, WORLD_W, H);

    // ── Ground ───────────────────────────────────────────────
    this.platforms = this.physics.add.staticGroup();
    for (let x = 0; x < WORLD_W; x += 800) {
      this.platforms.create(x + 400, H - 10, 'ground')
        .setScale(1, 1).refreshBody();
    }

    const platPositions = [
      [300, H - 140], [500, H - 210], [750, H - 140],
      [950, H - 250], [1150, H - 160], [1350, H - 250],
      [1600, H - 190], [1800, H - 270], [2000, H - 170],
      [2200, H - 250], [2350, H - 140],
    ];
    platPositions.forEach(([x, y]) => {
      this.platforms.create(x, y, 'platform').refreshBody();
    });

    // ── Player ───────────────────────────────────────────────
    this.player = this.physics.add.sprite(80, H - 100, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0.1);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // ── Coins ────────────────────────────────────────────────
    this.coins = this.physics.add.staticGroup();
    [
      [300, H-170], [330, H-170], [360, H-170],
      [500, H-240], [530, H-240],
      [950, H-280], [980, H-280], [1010, H-280],
      [1350, H-280], [1380, H-280],
      [1800, H-300], [1830, H-300], [1860, H-300],
      [2200, H-280], [2230, H-280],
    ].forEach(([x, y]) => this.coins.create(x, y, 'coin'));

    // ── Enemies ──────────────────────────────────────────────
    this.enemies = this.physics.add.group();
    [500, 1000, 1500, 2000].forEach(x => {
      const e = this.enemies.create(x, H - 100, 'enemy');
      e.setCollideWorldBounds(true);
      e.setBounce(1, 0);
      e.setVelocityX(60);
    });
    this.physics.add.collider(this.enemies, this.platforms);

    // ── HUD ──────────────────────────────────────────────────
    this.score = 0;
    this.lives = 3;

    this.scoreText = this.add.text(16, 16, 'Coins: 0', {
      fontSize: '20px', fill: '#fff', fontFamily: 'monospace'
    }).setScrollFactor(0).setDepth(10);

    this.livesText = this.add.text(W - 120, 16, 'Lives: 3', {
      fontSize: '20px', fill: '#fff', fontFamily: 'monospace'
    }).setScrollFactor(0).setDepth(10);

    // ── Collisions ───────────────────────────────────────────
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.overlap(this.player, this.coins,   this.collectCoin, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.hitEnemy,    null, this);

    // ── Keyboard ─────────────────────────────────────────────
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });

    // ── Touch controls ───────────────────────────────────────
    this.touch = { left: false, right: false, jump: false };
    this.createTouchControls(W, H);

    this.isInvincible = false;
    this.isPaused = false;
    this.isGameOver = false;
    this.createPauseButton(W);
  }

  createPauseButton(W) {
    this.pauseBtn = this.add.rectangle(W - 80, 48, 110, 40, 0x000000, 0.35)
      .setScrollFactor(0)
      .setDepth(30)
      .setInteractive({ useHandCursor: true });

    this.pauseText = this.add.text(W - 80, 48, 'Pause', {
      fontSize: '18px',
      fontFamily: 'monospace',
      fill: '#ffffff'
    })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(31);

    this.pauseBtn.on('pointerdown', () => this.togglePause());
  }

  togglePause() {
    if (this.isGameOver) return;

    this.isPaused = !this.isPaused;

    if (this.isPaused) {
      this.physics.world.pause();
      this.pauseText.setText('Resume');
      this.touch.left = false;
      this.touch.right = false;
      this.touch.jump = false;
    } else {
      this.physics.world.resume();
      this.pauseText.setText('Pause');
    }
  }

  // ── Touch buttons ─────────────────────────────────────────
  createTouchControls(W, H) {
    const btnY   = H - 55;
    const alpha  = 0.35;
    const radius = 38;

    const makeBtn = (x, y, label, onDown, onUp) => {
      const circle = this.add.circle(x, y, radius, 0xffffff, alpha)
        .setScrollFactor(0).setDepth(20)
        .setInteractive();
      this.add.text(x, y, label, {
        fontSize: '22px', fontFamily: 'monospace', fill: '#fff'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(21);

      circle.on('pointerdown',   onDown);
      circle.on('pointerup',     onUp);
      circle.on('pointerout',    onUp);
      circle.on('pointercancel', onUp);
    };

    makeBtn(60,  btnY, '◀', () => this.touch.left  = true,  () => this.touch.left  = false);
    makeBtn(148, btnY, '▶', () => this.touch.right = true,  () => this.touch.right = false);
    makeBtn(W - 70, btnY, '▲', () => this.touch.jump  = true,  () => this.touch.jump  = false);

    // Enable multi-touch
    this.input.addPointer(2);
  }

  // ── Coin pickup ───────────────────────────────────────────
  collectCoin(player, coin) {
    coin.destroy();
    this.score++;
    this.scoreText.setText('Coins: ' + this.score);
  }

  // ── Enemy collision ───────────────────────────────────────
  hitEnemy(player, enemy) {
    if (this.isInvincible) return;
    const stomping = player.body.velocity.y > 0
                  && player.body.bottom < enemy.body.top + 10;
    if (stomping) {
      enemy.destroy();
      player.setVelocityY(-JUMP_FORCE * 0.7);
    } else {
      this.takeDamage();
    }
  }

  // ── Take damage ───────────────────────────────────────────
  takeDamage() {
    if (this.isGameOver) return;

    this.lives--;
    this.livesText.setText('Lives: ' + this.lives);

    if (this.lives <= 0) {
      this.isGameOver = true;
      this.isPaused = false;
      this.physics.world.pause();
      this.touch.left = false;
      this.touch.right = false;
      this.touch.jump = false;
      this.scene.launch('GameOver');
      return;
    }

    this.player.setPosition(80, this.scale.height - 100);
    this.player.setVelocity(0, 0);
    this.isInvincible = true;

    this.tweens.add({
      targets: this.player,
      alpha: 0,
      duration: 100,
      yoyo: true,
      repeat: 9,
      onComplete: () => {
        this.player.setAlpha(1);
        this.isInvincible = false;
      }
    });
  }

  // ── Update (every frame) ──────────────────────────────────
  update() {
    const { cursors, wasd, player, touch } = this;
    if (this.isPaused || this.isGameOver) return;
    const onGround = player.body.blocked.down;

    const goLeft  = cursors.left.isDown  || wasd.left.isDown  || touch.left;
    const goRight = cursors.right.isDown || wasd.right.isDown || touch.right;

    if (goLeft) {
      player.setVelocityX(-MOVE_SPEED);
      player.setFlipX(true);
    } else if (goRight) {
      player.setVelocityX(MOVE_SPEED);
      player.setFlipX(false);
    } else {
      player.setVelocityX(0);
    }

    const jumpPressed = Phaser.Input.Keyboard.JustDown(cursors.up)
                     || Phaser.Input.Keyboard.JustDown(wasd.up)
                     || Phaser.Input.Keyboard.JustDown(wasd.space);

    // Touch jump: trigger once per press using a flag
    if (touch.jump && !this._touchJumpConsumed && onGround) {
      player.setVelocityY(-JUMP_FORCE);
      this._touchJumpConsumed = true;
    }
    if (!touch.jump) this._touchJumpConsumed = false;

    if (jumpPressed && onGround) {
      player.setVelocityY(-JUMP_FORCE);
    }

    // Fall death
    if (player.y > this.scale.height + 50) {
      this.takeDamage();
    }

    // Enemy patrol
    this.enemies.getChildren().forEach(e => {
      if (e.body.blocked.left)  e.setVelocityX( 60);
      if (e.body.blocked.right) e.setVelocityX(-60);
    });
  }
}

// ── Config ────────────────────────────────────────────────────
const config = {
  type: Phaser.AUTO,
  backgroundColor: '#1a1a2e',
  scale: {
    parent: 'game',
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: GRAVITY }, debug: false }
  },
  scene: [GameScene, GameOverScene]
};

new Phaser.Game(config);
