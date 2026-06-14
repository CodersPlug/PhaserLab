// =============================================================
//  PhaserLab — Mario-like starter
//  Arrow keys / WASD to move, Up / W / Space to jump
// =============================================================

// ── Constants ─────────────────────────────────────────────────
const GAME_WIDTH   = 800;
const GAME_HEIGHT  = 450;
const GRAVITY      = 800;
const MOVE_SPEED   = 220;
const JUMP_FORCE   = 480;

// ── Scene ─────────────────────────────────────────────────────
class GameScene extends Phaser.Scene {

  constructor() { super('GameScene'); }

  // ----------------------------------------------------------
  // preload() — load assets before the scene starts
  // We generate everything from colored rectangles so there are
  // zero external files to manage.
  // ----------------------------------------------------------
  preload() {
    // Helper: draw a solid-color rectangle into the texture cache
    const makeRect = (key, w, h, color) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(color);
      g.fillRect(0, 0, w, h);
      g.generateTexture(key, w, h);
      g.destroy();
    };

    makeRect('player',    24, 32, 0x4a90e2);   // blue
    makeRect('ground',   800, 20, 0x5cb85c);   // green
    makeRect('platform', 120, 16, 0xa0724a);   // brown
    makeRect('coin',      16, 16, 0xf5c518);   // gold
    makeRect('enemy',     24, 24, 0xe74c3c);   // red
  }

  // ----------------------------------------------------------
  // create() — build the scene once assets are ready
  // ----------------------------------------------------------
  create() {

    // ── Background ──────────────────────────────────────────
    this.cameras.main.setBackgroundColor('#3a7bd5');

    // ── World bounds (wider than screen for scrolling) ──────
    const WORLD_W = 2400;
    this.physics.world.setBounds(0, 0, WORLD_W, GAME_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_W, GAME_HEIGHT);

    // ── Ground ──────────────────────────────────────────────
    // staticGroup = things that never move (ground, platforms)
    this.platforms = this.physics.add.staticGroup();

    // Full-width ground tiles
    for (let x = 0; x < WORLD_W; x += 800) {
      this.platforms.create(x + 400, GAME_HEIGHT - 10, 'ground')
        .setScale(1, 1).refreshBody();
    }

    // Elevated platforms  [x, y]
    const platPositions = [
      [300, 310], [500, 240], [750, 310],
      [950, 200], [1150, 290], [1350, 200],
      [1600, 260], [1800, 180], [2000, 280],
      [2200, 200], [2350, 310],
    ];
    platPositions.forEach(([x, y]) => {
      this.platforms.create(x, y, 'platform').refreshBody();
    });

    // ── Player ──────────────────────────────────────────────
    this.player = this.physics.add.sprite(80, 300, 'player');
    this.player.setCollideWorldBounds(true);  // can't leave the world
    this.player.setBounce(0.1);

    // Camera follows the player
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // ── Coins ───────────────────────────────────────────────
    this.coins = this.physics.add.staticGroup();
    const coinPositions = [
      [300, 280], [330, 280], [360, 280],
      [500, 210], [530, 210],
      [950, 170], [980, 170], [1010, 170],
      [1350, 170], [1380, 170],
      [1800, 150], [1830, 150], [1860, 150],
      [2200, 170], [2230, 170],
    ];
    coinPositions.forEach(([x, y]) => {
      this.coins.create(x, y, 'coin');
    });

    // ── Enemy ───────────────────────────────────────────────
    this.enemies = this.physics.add.group();
    const enemyPositions = [500, 1000, 1500, 2000];
    enemyPositions.forEach(x => {
      const e = this.enemies.create(x, 200, 'enemy');
      e.setCollideWorldBounds(true);
      e.setBounce(1, 0);          // bounces off world walls → patrols
      e.setVelocityX(Phaser.Math.Between(-80, 80) || 60);
      e.patrolDir = 1;
    });
    this.physics.add.collider(this.enemies, this.platforms);

    // ── Score ───────────────────────────────────────────────
    this.score = 0;
    this.lives = 3;

    // setScrollFactor(0) pins UI text to the camera, not the world
    this.scoreText = this.add.text(16, 16, 'Coins: 0', {
      fontSize: '20px', fill: '#fff', fontFamily: 'monospace'
    }).setScrollFactor(0);

    this.livesText = this.add.text(GAME_WIDTH - 120, 16, 'Lives: 3', {
      fontSize: '20px', fill: '#fff', fontFamily: 'monospace'
    }).setScrollFactor(0);

    // ── Input ───────────────────────────────────────────────
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });

    // ── Collisions & Overlaps ────────────────────────────────
    // Collider  = solid physics collision
    // Overlap   = detection only, no bounce
    this.physics.add.collider(this.player, this.platforms);

    // Collect coin
    this.physics.add.overlap(
      this.player, this.coins, this.collectCoin, null, this
    );

    // Hit enemy
    this.physics.add.overlap(
      this.player, this.enemies, this.hitEnemy, null, this
    );

    // ── Invincibility flag ───────────────────────────────────
    this.isInvincible = false;
  }

  // ----------------------------------------------------------
  // collectCoin(player, coin)
  // Called by Phaser when player overlaps a coin
  // ----------------------------------------------------------
  collectCoin(player, coin) {
    coin.destroy();               // remove from scene
    this.score++;
    this.scoreText.setText('Coins: ' + this.score);
  }

  // ----------------------------------------------------------
  // hitEnemy(player, enemy)
  // Stomp from above → kill enemy + bounce player
  // Side hit → player loses a life
  // ----------------------------------------------------------
  hitEnemy(player, enemy) {
    if (this.isInvincible) return;

    const stomping = player.body.velocity.y > 0            // falling
                  && player.body.bottom < enemy.body.top + 10;  // above

    if (stomping) {
      enemy.destroy();
      // Bounce player upward
      player.setVelocityY(-JUMP_FORCE * 0.7);
    } else {
      this.takeDamage();
    }
  }

  // ----------------------------------------------------------
  // takeDamage() — lose a life, respawn or game over
  // ----------------------------------------------------------
  takeDamage() {
    this.lives--;
    this.livesText.setText('Lives: ' + this.lives);

    if (this.lives <= 0) {
      // Restart the scene — full reset
      this.scene.restart();
      return;
    }

    // Teleport back to start, grant 2s invincibility
    this.player.setPosition(80, 300);
    this.player.setVelocity(0, 0);
    this.isInvincible = true;

    // Blink effect using a repeating tween
    this.tweens.add({
      targets: this.player,
      alpha: 0,
      duration: 100,
      yoyo: true,           // ping-pong: 0 → 1 → 0 → ...
      repeat: 9,            // 10 blinks = ~2s
      onComplete: () => {
        this.player.setAlpha(1);
        this.isInvincible = false;
      }
    });
  }

  // ----------------------------------------------------------
  // update() — runs every frame
  // ----------------------------------------------------------
  update() {
    const { cursors, wasd, player } = this;

    // Grounded check: player is touching the floor
    const onGround = player.body.blocked.down;

    // ── Horizontal movement ──────────────────────────────────
    const goLeft  = cursors.left.isDown  || wasd.left.isDown;
    const goRight = cursors.right.isDown || wasd.right.isDown;

    if (goLeft) {
      player.setVelocityX(-MOVE_SPEED);
      player.setFlipX(true);        // face left
    } else if (goRight) {
      player.setVelocityX(MOVE_SPEED);
      player.setFlipX(false);       // face right
    } else {
      player.setVelocityX(0);       // stop immediately (arcade style)
    }

    // ── Jump ────────────────────────────────────────────────
    const jumpPressed = Phaser.Input.Keyboard.JustDown(cursors.up)
                     || Phaser.Input.Keyboard.JustDown(wasd.up)
                     || Phaser.Input.Keyboard.JustDown(wasd.space);

    if (jumpPressed && onGround) {
      player.setVelocityY(-JUMP_FORCE);
    }

    // ── Fall death (below world) ─────────────────────────────
    if (player.y > GAME_HEIGHT + 50) {
      this.takeDamage();
    }

    // ── Enemy patrol flip ────────────────────────────────────
    // Reverse direction when touching world bounds
    this.enemies.getChildren().forEach(e => {
      if (e.body.blocked.left)  e.setVelocityX( 60);
      if (e.body.blocked.right) e.setVelocityX(-60);
    });
  }
}

// ── Game config ───────────────────────────────────────────────
const config = {
  type: Phaser.AUTO,          // auto-pick WebGL or Canvas
  width:  GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#3a7bd5',
  physics: {
    default: 'arcade',        // simple AABB physics — perfect for platformers
    arcade: {
      gravity: { y: GRAVITY },
      debug: false            // set true to see hitboxes
    }
  },
  scene: GameScene
};

// Boot the game
new Phaser.Game(config);
