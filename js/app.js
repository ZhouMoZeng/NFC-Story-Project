/**
 * 旋律时间线故事集 - Solo 优化版
 * 优化内容：
 * 1. 修复启动层隐藏问题
 * 2. 添加数据检查和错误处理
 * 3. 优化 DOM 缓存和性能
 * 4. 添加音频错误处理
 * 5. 支持减少动画偏好
 * 6. 图片预加载等待
 * 7. 内存泄漏防护
 */

(function () {
  'use strict';

  // ===== 配置常量 =====
  var CONFIG = {
    OPENING_DURATION: 420,
    BEAT_DURATION: 465,
    BEAT_REVEAL_LEAD: 90,
    INTRO_DURATION: 3720,
    LOVE_BURST_DURATION: 1780,
    ENTRY_CYCLE_DURATION: 2325,
    ENTRY_HOLD_END: 1395,
    ENTRY_PROMOTE_END: 1860,
    ENTRY_NEXT_DELAY: 930,
    FIRST_NORMAL_CYCLE_DURATION: 2325,
    FIRST_NORMAL_NEXT_DELAY: 930,
    FIRST_NORMAL_HOLD_END: 1395,
    FIRST_NORMAL_PROMOTE_END: 1860,
    CYCLE_DURATION: 2790,
    FLIGHT_DURATION: 465,
    NEXT_DELAY: 1395,
    HOLD_END: 1860,
    PROMOTE_END: 2325,
    MUSIC_VOLUME: 0.68,
    MUSIC_SRC: './assets/music/bgm-finale.mp3?v=finale-arc-1',
    MUSIC_LOOP: false,
    STORY_LOOP: false,
    FINAL_FREEZE_BEFORE_NEXT: 60,
    FINALE_WALL_START_OFFSET: 2480,
    FINALE_WALL_REVEAL_DURATION: 2600,
    FINALE_WALL_TILE_STAGGER: 58,
    DETAIL_EXIT_DURATION: 320,
    AUDIO_VISUAL_OFFSET: 0,
    CRITICAL_IMAGE_COUNT: 6,
    IMAGE_PRELOAD_GAP: 140,
    BACKGROUND_PRELOAD_DELAY: 650,
    PRELOAD_TIMEOUT: 10000 // 图片预加载超时时间
  };

  // ===== 文本常量 =====
  var TEXT = {
    splash: '\u8f7b\u89e6\u5f00\u542f\u6545\u4e8b',
    back: '\u8fd4\u56de',
    musicLabel: '\u64ad\u653e\u6216\u6682\u505c\u97f3\u4e50',
    musicOn: '\u266a',
    musicOff: '\u00b7',
    dataError: '\u6570\u636e\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u5237\u65b0\u9875\u9762\u91cd\u8bd5',
    loading: '\u52a0\u8f7d\u4e2d...'
  };

  var SCENE_PALETTES = [
    { accent: '255, 107, 157', second: '76, 201, 240', warm: '255, 214, 142' },
    { accent: '76, 201, 240', second: '255, 132, 188', warm: '255, 222, 158' },
    { accent: '255, 188, 112', second: '142, 246, 236', warm: '255, 107, 157' },
    { accent: '255, 88, 150', second: '181, 146, 255', warm: '255, 213, 140' }
  ];

  // ===== 状态变量 =====
  var container = null;
  var audioElement = null;
  var isMusicPlaying = false;
  var isInitialized = false;
  var gsapCore = window.gsap || null;

  // 动画相关
  var flightFrame = null;
  var flightBaseTime = 0;
  var flightElapsed = 0;
  var isFlightPaused = true;
  var isOpeningDetail = false;
  var stageRect = null;
  var introTimeline = null;
  var detailTimeline = null;
  var mainClockPrimed = false;
  var mainAudioAnchor = 0;
  var mainVisualAnchor = 0;

  // 定时器
  var pendingDetailTimer = null;
  var introTimer = null;
  var loveBurstTimer = null;
  var preloadTimeoutTimer = null;
  var preloadQueueTimer = null;
  var preloadedImages = {};
  var remainingPreloadStarted = false;

  // DOM 缓存
  var domCache = {
    stage: null,
    memoryStage: null,
    plane: null,
    trail: null,
    spinePulse: null,
    mainScene: null,
    detailScene: null,
    detailImage: null,
    detailTitle: null,
    detailDate: null,
    detailStory: null,
    detailBg: null,
    musicBtn: null,
    splash: null,
    finaleWall: null,
    finaleTiles: [],
    nodes: []
  };

  // 检测用户偏好
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

  // ===== 初始化 =====
  function init() {
    if (isInitialized) return;

    container = document.getElementById('app-container');
    if (!container) {
      console.error('App container not found');
      return;
    }

    prepareGsap();

    if (!validateData()) {
      showError(TEXT.dataError);
      return;
    }

    createSplashScreen();
    createMusicButton();
    scheduleCriticalImagePreload();
    isInitialized = true;

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    window.addEventListener('beforeunload', cleanup);
    return;

    // 数据检查
    if (!validateData()) {
      showError(TEXT.dataError);
      return;
    }

    // 创建加载提示
    createLoadingScreen();

    // 预加载图片
    preloadImages().then(function() {
      removeLoadingScreen();
      createSplashScreen();
      createMainScene();
      createDetailScene();
      createMusicButton();
      cacheDomElements();
      isInitialized = true;
    }).catch(function(err) {
      console.warn('Image preload warning:', err);
      // 即使预加载失败也继续
      removeLoadingScreen();
      createSplashScreen();
      createMainScene();
      createDetailScene();
      createMusicButton();
      cacheDomElements();
      isInitialized = true;
    });

    // 页面卸载时清理
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    window.addEventListener('beforeunload', cleanup);
  }

  function prepareGsap() {
    if (!canUseGsap()) return;

    container.classList.add('gsap-enhanced');
    gsapCore.defaults({
      ease: 'power2.out',
      overwrite: 'auto'
    });
  }

  function canUseGsap() {
    return !!gsapCore && !prefersReducedMotion;
  }

  // ===== 数据验证 =====
  function validateData() {
    if (typeof storyData === 'undefined') {
      console.error('storyData is not defined');
      return false;
    }
    if (!Array.isArray(storyData)) {
      console.error('storyData is not an array');
      return false;
    }
    if (storyData.length === 0) {
      console.error('storyData is empty');
      return false;
    }
    // 验证每个节点的必要字段
    for (var i = 0; i < storyData.length; i++) {
      var item = storyData[i];
      if (!item.title || !item.image) {
        console.error('storyData[' + i + '] missing required fields');
        return false;
      }
    }
    return true;
  }

  // ===== 错误显示 =====
  function showError(message) {
    container.innerHTML = '<div style="color:white;text-align:center;padding-top:40vh;font-size:16px;letter-spacing:2px;">' + message + '</div>';
  }

  // ===== 加载界面 =====
  function createLoadingScreen() {
    var loading = document.createElement('div');
    loading.id = 'loadingScreen';
    loading.className = 'loading-screen';
    loading.innerHTML = '<div class="loading-text">' + TEXT.loading + '</div>';
    loading.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#030304;z-index:2000;color:rgba(255,255,255,0.6);font-size:14px;letter-spacing:4px;';
    container.appendChild(loading);
  }

  function removeLoadingScreen() {
    var loading = document.getElementById('loadingScreen');
    if (loading) {
      loading.style.opacity = '0';
      loading.style.transition = 'opacity 0.3s ease';
      setTimeout(function() {
        if (loading.parentNode) loading.parentNode.removeChild(loading);
      }, 300);
    }
  }

  // ===== 启动层（修复隐藏问题） =====
  function runWhenIdle(callback, timeout) {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(callback, { timeout: timeout || 1200 });
      return;
    }
    window.setTimeout(callback, Math.min(timeout || 1200, 800));
  }

  function ensureMainExperience() {
    if (domCache.mainScene) return;

    createMainScene();
    createDetailScene();
    cacheDomElements();
  }

  function preloadImage(src) {
    if (!src || preloadedImages[src]) return Promise.resolve();
    preloadedImages[src] = 'loading';

    return new Promise(function (resolve) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        preloadedImages[src] = true;
        resolve();
      };
      img.onerror = function () {
        preloadedImages[src] = 'error';
        resolve();
      };
      img.src = src;
    });
  }

  function preloadImagesInOrder(items, startIndex) {
    var index = startIndex || 0;
    if (!items || index >= items.length) return;

    preloadImage(items[index].image).then(function () {
      preloadQueueTimer = window.setTimeout(function () {
        preloadImagesInOrder(items, index + 1);
      }, CONFIG.IMAGE_PRELOAD_GAP);
    });
  }

  function scheduleCriticalImagePreload() {
    runWhenIdle(function () {
      preloadImagesInOrder(storyData.slice(0, CONFIG.CRITICAL_IMAGE_COUNT), 0);
    }, CONFIG.BACKGROUND_PRELOAD_DELAY);
  }

  function scheduleRemainingImagePreload() {
    if (remainingPreloadStarted) return;
    remainingPreloadStarted = true;

    runWhenIdle(function () {
      preloadImagesInOrder(storyData.slice(CONFIG.CRITICAL_IMAGE_COUNT), 0);
    }, 1800);
  }

  function ensureNodeAssets(index) {
    var item = storyData[index];
    var node = domCache.nodes[index];
    if (!item || !node || node.dataset.assetsReady === '1') return;

    var bg = node.querySelector('.node-bg');
    var img = node.querySelector('.node-image');
    if (bg) bg.style.backgroundImage = 'url(' + item.image + ')';
    if (img && img.getAttribute('src') !== item.image) img.src = item.image;
    node.dataset.assetsReady = '1';
  }

  function createSplashScreen() {
    var splash = document.createElement('div');
    splash.id = 'splash';
    splash.className = 'splash-screen';
    splash.innerHTML = '<div class="splash-text">' + TEXT.splash + '</div>';
    container.appendChild(splash);
    domCache.splash = splash;

    var isClicked = false;

    splash.addEventListener('click', function () {
      if (isClicked) return;
      isClicked = true;

      // 立即禁用点击事件，防止重复触发
      splash.style.pointerEvents = 'none';

      playSplashExit(splash);
      ensureMainExperience();

      // 启动主场景
      showMainScene();
      startIntroSequence();
      initAndPlayMusic();
      scheduleRemainingImagePreload();
    });
  }

  function playSplashExit(splash) {
    splash.setAttribute('aria-hidden', 'true');

    if (!canUseGsap()) {
      // 添加隐藏类（触发 CSS 过渡动画）
      splash.classList.add('splash-hidden');

      // 等待动画完成后彻底隐藏
      setTimeout(function () {
        splash.style.display = 'none';
        splash.style.visibility = 'hidden';
      }, 600);
      return;
    }

    gsapCore.to(splash, {
      autoAlpha: 0,
      scale: 1.08,
      filter: 'blur(14px)',
      duration: 0.42,
      ease: 'power2.inOut',
      onComplete: function () {
        splash.style.display = 'none';
        splash.style.visibility = 'hidden';
      }
    });
  }

  // ===== 音乐初始化（添加错误处理） =====
  function initAndPlayMusic() {
    if (audioElement) return;

    try {
      audioElement = new Audio(CONFIG.MUSIC_SRC);
      audioElement.loop = CONFIG.MUSIC_LOOP;
      audioElement.volume = CONFIG.MUSIC_VOLUME;
      audioElement.preload = 'auto';
      audioElement.setAttribute('playsinline', '');

      // 添加错误监听
      audioElement.addEventListener('error', function(e) {
        console.warn('Audio error:', e);
        setMusicState(false);
      });

      audioElement.play().then(function () {
        setMusicState(true);
      }).catch(function (err) {
        console.warn('Audio play failed:', err);
        setMusicState(false);
      });
    } catch (err) {
      console.error('Audio initialization failed:', err);
      setMusicState(false);
    }
  }

  // ===== 主场景 =====
  function createMainScene() {
    var scene = document.createElement('div');
    scene.id = 'mainScene';
    scene.className = 'main-scene';
    scene.style.display = 'none';
    scene.innerHTML =
      '<div class="space-grain"></div>' +
      '<div class="star-field star-field-a"></div>' +
      '<div class="star-field star-field-b"></div>' +
      createAtmosphereMarkup() +
      createBeatMarkup() +
      (prefersReducedMotion ? '' : createIntroMarkup()) +
      (prefersReducedMotion ? '' : createLoveBurstMarkup()) +
      '<div class="flight-shell">' +
        createMemoryStageMarkup() +
        '<svg class="flight-path-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
          '<path class="time-spine time-spine-shadow" d="M50 60 C65 50 35 42 66 30"></path>' +
          '<path class="time-spine time-spine-line" d="M50 60 C65 50 35 42 66 30"></path>' +
          '<path class="time-spine time-spine-pulse" id="timeSpinePulse" d="M50 60 C65 50 35 42 66 30"></path>' +
        '</svg>' +
        '<div class="quiet-core" aria-hidden="true">' +
          '<div class="quiet-core-ring"></div>' +
          '<div class="quiet-core-dot"></div>' +
        '</div>' +
        '<div class="timeline-stage" id="timelineStage"></div>' +
        '<div class="plane-trail" id="planeTrail" aria-hidden="true"></div>' +
        '<div class="flight-plane" id="flightPlane" aria-hidden="true">' +
          '<div class="plane-glow"></div>' +
          '<svg viewBox="0 0 72 72" focusable="false">' +
            '<path class="plane-wing-main" d="M6 35 L64 8 L47 64 L34 43 L19 56 L25 39 Z"></path>' +
            '<path class="plane-wing-fold" d="M25 39 L64 8 L34 43 L47 64"></path>' +
            '<path class="plane-keel" d="M19 56 L34 43"></path>' +
          '</svg>' +
        '</div>' +
        createFinaleWallMarkup() +
      '</div>';
    container.appendChild(scene);
    domCache.mainScene = scene;
    renderMainNodes();
  }

  // ===== DOM 缓存 =====
  function cacheDomElements() {
    domCache.stage = document.getElementById('timelineStage');
    domCache.memoryStage = document.getElementById('memoryStage');
    domCache.plane = document.getElementById('flightPlane');
    domCache.trail = document.getElementById('planeTrail');
    domCache.spinePulse = document.getElementById('timeSpinePulse');
    domCache.nodes = Array.prototype.slice.call(document.querySelectorAll('.story-node'));
    domCache.detailScene = document.getElementById('detailScene');
    domCache.detailImage = document.getElementById('detailImage');
    domCache.detailTitle = document.getElementById('detailTitle');
    domCache.detailDate = document.getElementById('detailDate');
    domCache.detailStory = document.getElementById('detailStory');
    domCache.detailBg = document.getElementById('detailBg');
    domCache.musicBtn = document.getElementById('musicBtn');
    domCache.finaleWall = document.getElementById('finaleWall');
    domCache.finaleTiles = Array.prototype.slice.call(document.querySelectorAll('.finale-tile'));
    bindFinaleWallEvents();
    updateStageRect();
  }

  function updateStageRect() {
    stageRect = domCache.stage ? domCache.stage.getBoundingClientRect() : null;
  }

  function handleResize() {
    stageRect = null;
    updateStageRect();

    if (prefersReducedMotion) {
      applyReducedMotionLayout();
      return;
    }

    if (!isFlightPaused) {
      applyFlightFrame(flightElapsed);
    }
  }

  // ===== 开场动画 =====
  function createIntroMarkup() {
    var faces = [
      { face: 'translate3d(-50%, -50%, 58px) rotateY(0deg)', start: '-185px,-230px,-11deg', scatter: '0px,65px,-1deg' },
      { face: 'translate3d(-50%, -50%, 58px) rotateY(90deg)', start: '190px,-198px,9deg', scatter: '78px,-145px,4deg' },
      { face: 'translate3d(-50%, -50%, 58px) rotateY(180deg)', start: '-210px,36px,13deg', scatter: '-162px,-96px,-9deg' },
      { face: 'translate3d(-50%, -50%, 58px) rotateY(-90deg)', start: '204px,68px,-8deg', scatter: '164px,30px,10deg' },
      { face: 'translate3d(-50%, -50%, 58px) rotateX(90deg)', start: '-96px,250px,8deg', scatter: '-126px,168px,7deg' },
      { face: 'translate3d(-50%, -50%, 58px) rotateX(-90deg)', start: '104px,238px,-12deg', scatter: '124px,156px,-8deg' }
    ];
    var html = '<div class="intro-layer" id="introLayer" aria-hidden="true">' +
      '<div class="intro-veil"></div>' +
      '<div class="intro-rhythm-ring intro-rhythm-ring-a"></div>' +
      '<div class="intro-rhythm-ring intro-rhythm-ring-b"></div>' +
      '<div class="intro-burst"></div>' +
      '<div class="intro-cube">';

    faces.forEach(function (face, index) {
      var item = storyData[index % storyData.length];
      var start = face.start.split(',');
      var scatter = face.scatter.split(',');
      html += '<figure class="intro-photo intro-photo-' + index + '" style="' +
        '--face-transform:' + face.face + ';' +
        '--start-x:' + start[0] + ';--start-y:' + start[1] + ';--start-rot:' + start[2] + ';' +
        '--scatter-x:' + scatter[0] + ';--scatter-y:' + scatter[1] + ';--scatter-rot:' + scatter[2] + ';' +
        '--intro-delay:' + (index * 32) + 'ms">' +
          '<div class="intro-photo-bg" style="background-image:url(' + item.image + ')"></div>' +
          '<img src="' + item.image + '" alt="" decoding="async" fetchpriority="' + (index < 2 ? 'high' : 'low') + '">' +
        '</figure>';
    });

    html += '</div></div>';
    return html;
  }

  // ===== 氛围效果 =====
  function createLoveBurstMarkup() {
    var palettes = ['pink', 'rose', 'gold', 'white', 'cyan'];
    var heartRings = [
      { count: 14, x: 26, y: 30, size: 22, delay: 0.08, offset: -90 },
      { count: 16, x: 39, y: 38, size: 17, delay: 0.16, offset: -76 },
      { count: 18, x: 55, y: 48, size: 13, delay: 0.25, offset: -88 }
    ];
    var sparkCount = 28;
    var petalCount = 14;
    var html = '<div class="love-burst-layer" id="loveBurstLayer" aria-hidden="true">' +
      '<div class="love-burst-vignette"></div>' +
      '<div class="love-beat-halo love-beat-halo-a"></div>' +
      '<div class="love-beat-halo love-beat-halo-b"></div>' +
      '<div class="love-burst-wash"></div>' +
      '<div class="love-burst-core"><span></span></div>' +
      '<div class="love-burst-ring love-burst-ring-a"></div>' +
      '<div class="love-burst-ring love-burst-ring-b"></div>';

    heartRings.forEach(function (ring, ringIndex) {
      for (var i = 0; i < ring.count; i++) {
        var progress = i / ring.count;
        var angle = (ring.offset + progress * 360 + ringIndex * 7) * Math.PI / 180;
        var wobble = 0.86 + ((i % 5) * 0.055);
        var x = Math.cos(angle) * ring.x * wobble;
        var y = Math.sin(angle) * ring.y * (1.02 - (i % 4) * 0.035);
        var size = ring.size + ((i + ringIndex) % 5) * 3;
        var delay = ring.delay + (i % 6) * 0.026 + ringIndex * 0.025;
        var rot = -34 + ((i * 29 + ringIndex * 13) % 68);
        var color = palettes[(i + ringIndex * 2) % palettes.length];

        html += '<span class="love-heart love-heart-' + color + '" style="' +
          '--heart-x:' + x.toFixed(2) + 'vw;' +
          '--heart-y:' + y.toFixed(2) + 'vh;' +
          '--heart-size:' + size + 'px;' +
          '--heart-delay:' + delay.toFixed(3) + 's;' +
          '--heart-rot:' + rot + 'deg;' +
          '--heart-spin:' + (rot * -0.8 + (i % 2 ? 18 : -18)).toFixed(1) + 'deg;' +
          '--heart-z:' + ((i + ringIndex) % 6) + '">' +
          '</span>';
      }
    });

    for (var sparkIndex = 0; sparkIndex < sparkCount; sparkIndex++) {
      var sparkAngle = (-96 + sparkIndex * (360 / sparkCount) + (sparkIndex % 3) * 5) * Math.PI / 180;
      var sparkRadiusX = 44 + (sparkIndex % 4) * 6;
      var sparkRadiusY = 39 + (sparkIndex % 5) * 4;
      var sparkX = Math.cos(sparkAngle) * sparkRadiusX;
      var sparkY = Math.sin(sparkAngle) * sparkRadiusY;
      var sparkRot = sparkAngle * 180 / Math.PI;

      html += '<span class="love-spark" style="' +
        '--spark-x:' + sparkX.toFixed(2) + 'vw;' +
        '--spark-y:' + sparkY.toFixed(2) + 'vh;' +
        '--spark-rot:' + sparkRot.toFixed(1) + 'deg;' +
        '--spark-delay:' + (0.08 + (sparkIndex % 8) * 0.024).toFixed(3) + 's;' +
        '--spark-len:' + (72 + (sparkIndex % 5) * 18) + 'px">' +
        '</span>';
    }

    for (var petalIndex = 0; petalIndex < petalCount; petalIndex++) {
      var petalAngle = (-80 + petalIndex * (360 / petalCount) + (petalIndex % 2) * 8) * Math.PI / 180;
      var petalX = Math.cos(petalAngle) * (30 + (petalIndex % 4) * 6);
      var petalY = Math.sin(petalAngle) * (34 + (petalIndex % 5) * 5);
      var petalRot = -55 + ((petalIndex * 31) % 110);

      html += '<span class="love-petal love-petal-' + palettes[petalIndex % palettes.length] + '" style="' +
        '--petal-x:' + petalX.toFixed(2) + 'vw;' +
        '--petal-y:' + petalY.toFixed(2) + 'vh;' +
        '--petal-rot:' + petalRot + 'deg;' +
        '--petal-delay:' + (0.18 + (petalIndex % 6) * 0.04).toFixed(3) + 's">' +
        '</span>';
    }

    html += '</div>';
    return html;
  }

  function createMemoryStageMarkup() {
    var html = '<div class="memory-stage" id="memoryStage" aria-hidden="true">' +
      '<div class="chapter-wash"></div>' +
      '<div class="chapter-orbit chapter-orbit-a"></div>' +
      '<div class="chapter-orbit chapter-orbit-b"></div>' +
      '<div class="memory-ribbon memory-ribbon-a"></div>' +
      '<div class="memory-ribbon memory-ribbon-b"></div>' +
      '<div class="memory-comets">';

    for (var i = 0; i < 16; i++) {
      html += '<span class="memory-comet" style="' +
        '--comet-left:' + (6 + (i * 11) % 86) + '%;' +
        '--comet-top:' + (12 + (i * 19) % 74) + '%;' +
        '--comet-delay:' + (i * 0.16) + 's;' +
        '--comet-duration:' + (2.9 + (i % 5) * 0.24) + 's">' +
        '</span>';
    }

    html += '</div><div class="romance-particles">';

    for (var j = 0; j < 24; j++) {
      html += '<span class="romance-sparkle" style="' +
        '--spark-left:' + (4 + (j * 13) % 92) + '%;' +
        '--spark-top:' + (10 + (j * 23) % 76) + '%;' +
        '--spark-delay:' + (j * 0.21).toFixed(2) + 's;' +
        '--spark-duration:' + (3.6 + (j % 6) * 0.34).toFixed(2) + 's;' +
        '--spark-size:' + (2 + (j % 4)) + 'px">' +
        '</span>';
    }

    for (var k = 0; k < 12; k++) {
      html += '<span class="romance-petal" style="' +
        '--petal-left:' + (8 + (k * 17) % 84) + '%;' +
        '--petal-top:' + (18 + (k * 29) % 64) + '%;' +
        '--petal-delay:' + (k * 0.46).toFixed(2) + 's;' +
        '--petal-duration:' + (6.4 + (k % 5) * 0.44).toFixed(2) + 's;' +
        '--petal-rot:' + ((k * 37) % 180 - 90) + 'deg">' +
        '</span>';
    }

    html += '</div></div>';
    return html;
  }

  function createFinaleWallMarkup() {
    var html = '<div class="finale-wall" id="finaleWall" aria-hidden="true">' +
      '<div class="finale-wall-field">';

    storyData.forEach(function (item, index) {
      var layout = getFinaleTileLayout(index);
      var frame = item.frame || '3 / 4';
      html += '<button class="finale-tile finale-float-' + layout.float + '" type="button" data-index="' + index + '" aria-label="' + item.title + '" style="' +
        '--tile-x:' + layout.x + '%;' +
        '--tile-y:' + layout.y + '%;' +
        '--tile-w:' + layout.w + ';' +
        '--tile-ar:' + frame + ';' +
        '--tile-rot:' + layout.rot + 'deg;' +
        '--tile-yrot:' + layout.yrot + 'deg;' +
        '--tile-z:' + layout.z + 'px;' +
        '--tile-layer:' + layout.layer + ';' +
        '--float-duration:' + layout.duration + 's;' +
        '--float-delay:' + layout.delay + 's;">' +
        '<span class="finale-tile-drift">' +
          '<span class="finale-tile-frame">' +
            '<img src="' + item.image + '" alt="" loading="lazy" decoding="async" fetchpriority="low">' +
            '<span class="finale-tile-shine"></span>' +
            '<span class="finale-tile-meta">' +
              '<span class="finale-tile-index">' + String(index + 1).padStart(2, '0') + '</span>' +
              '<span class="finale-tile-date">' + item.date + '</span>' +
            '</span>' +
          '</span>' +
        '</span>' +
      '</button>';
    });

    html += '</div></div>';
    return html;
  }

  function getFinaleTileLayout(index) {
    var layouts = [
      { x: 14, y: 17, w: 'clamp(52px, 14.5vw, 78px)', rot: -8, yrot: 12, z: 0, layer: 11, float: 'a', duration: 7.6, delay: -0.8 },
      { x: 32, y: 13, w: 'clamp(70px, 20vw, 104px)', rot: 4, yrot: 7, z: 22, layer: 14, float: 'b', duration: 8.8, delay: -2.1 },
      { x: 52, y: 16, w: 'clamp(56px, 15.5vw, 84px)', rot: -3, yrot: 0, z: 36, layer: 16, float: 'c', duration: 7.9, delay: -1.2 },
      { x: 70, y: 14, w: 'clamp(54px, 15vw, 82px)', rot: 6, yrot: -7, z: 18, layer: 13, float: 'd', duration: 9.2, delay: -3.4 },
      { x: 87, y: 19, w: 'clamp(52px, 14.5vw, 78px)', rot: -7, yrot: -12, z: 0, layer: 10, float: 'a', duration: 7.2, delay: -1.9 },
      { x: 18, y: 43, w: 'clamp(58px, 16vw, 88px)', rot: 5, yrot: 10, z: 14, layer: 12, float: 'b', duration: 8.4, delay: -4.1 },
      { x: 35, y: 48, w: 'clamp(76px, 22vw, 112px)', rot: -5, yrot: 5, z: 34, layer: 15, float: 'c', duration: 9.4, delay: -2.8 },
      { x: 54, y: 44, w: 'clamp(78px, 23vw, 118px)', rot: 3, yrot: 0, z: 56, layer: 18, float: 'a', duration: 7.7, delay: -1.5 },
      { x: 73, y: 50, w: 'clamp(58px, 16vw, 88px)', rot: -7, yrot: -6, z: 32, layer: 15, float: 'd', duration: 8.9, delay: -3.7 },
      { x: 89, y: 45, w: 'clamp(54px, 15vw, 82px)', rot: 6, yrot: -11, z: 10, layer: 12, float: 'b', duration: 7.5, delay: -2.5 },
      { x: 15, y: 73, w: 'clamp(54px, 15vw, 82px)', rot: 7, yrot: 12, z: 0, layer: 10, float: 'd', duration: 9.8, delay: -1.1 },
      { x: 32, y: 78, w: 'clamp(56px, 15.5vw, 84px)', rot: -5, yrot: 7, z: 20, layer: 13, float: 'c', duration: 8.5, delay: -0.6 },
      { x: 52, y: 75, w: 'clamp(54px, 15vw, 82px)', rot: 4, yrot: 0, z: 34, layer: 15, float: 'a', duration: 7.3, delay: -4.5 },
      { x: 70, y: 80, w: 'clamp(58px, 16vw, 88px)', rot: -6, yrot: -7, z: 18, layer: 13, float: 'b', duration: 8.2, delay: -3.2 },
      { x: 87, y: 76, w: 'clamp(62px, 17.5vw, 94px)', rot: 5, yrot: -12, z: 10, layer: 12, float: 'c', duration: 7.1, delay: -2.3 }
    ];

    return layouts[index % layouts.length];
  }

  function bindFinaleWallEvents() {
    if (!domCache.finaleTiles || !domCache.finaleTiles.length) return;

    domCache.finaleTiles.forEach(function (tile) {
      tile.addEventListener('pointerdown', function (event) {
        event.preventDefault();
        openFinaleDetail(Number(tile.dataset.index), tile);
      });

      tile.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openFinaleDetail(Number(tile.dataset.index), tile);
        }
      });
    });
  }

  function createAtmosphereMarkup() {
    // 减少动画模式下减少粒子数量
    var dustCount = prefersReducedMotion ? 8 : 18;
    var dustColors = ['warm', 'cyan', 'pink', 'gold'];
    var html = '<div class="memory-atmosphere" aria-hidden="true">' +
      '<div class="soft-glow soft-glow-pink"></div>' +
      '<div class="soft-glow soft-glow-gold"></div>' +
      '<div class="soft-glow soft-glow-cyan"></div>' +
      '<div class="dust-field">';

    for (var i = 0; i < dustCount; i++) {
      var left = (10 + (i * 80 / dustCount)) + '%';
      var top = (10 + (i * 70 / dustCount)) + '%';
      var delay = (i * 0.45) + 's';
      var duration = (12 + i * 0.35) + 's';
      html += '<span class="dust dust-' + dustColors[i % 4] + '" style="left:' + left + ';top:' + top + ';animation-delay:' + delay + ';animation-duration:' + duration + '"></span>';
    }

    html += '</div>';

    if (!prefersReducedMotion) {
      html += createButterflyMarkup();
      html += '<div class="heart-field">' +
        '<span class="heart-particle" style="left:18%;top:77%;animation-delay:0s;animation-duration:13s"></span>' +
        '<span class="heart-particle" style="left:78%;top:69%;animation-delay:4.2s;animation-duration:15s"></span>' +
        '</div>' +
        '<div class="streak-field">' +
        '<span class="memory-streak" style="left:8%;top:24%;animation-delay:0.4s;animation-duration:8s"></span>' +
        '<span class="memory-streak memory-streak-short" style="left:58%;top:38%;animation-delay:2.6s;animation-duration:7s"></span>' +
        '</div>';
    }

    html += '</div>';
    return html;
  }

  function createBeatMarkup() {
    if (prefersReducedMotion) return '';

    var html = '<div class="beat-field" aria-hidden="true">' +
      '<div class="beat-grid"></div>' +
      '<div class="beat-scanline"></div>' +
      '<div class="beat-stack beat-stack-a">';

    for (var i = 0; i < 9; i++) {
      html += '<span class="beat-line" style="--beat-i:' + i + ';--beat-delay:' + (i * 0.08).toFixed(2) + 's"></span>';
    }

    html += '</div><div class="beat-stack beat-stack-b">';
    for (var j = 0; j < 7; j++) {
      html += '<span class="beat-line" style="--beat-i:' + j + ';--beat-delay:' + (0.28 + j * 0.1).toFixed(2) + 's"></span>';
    }
    html += '</div></div>';
    return html;
  }

  function createButterflyMarkup() {
    var butterflies = [
      { left: '8%', top: '34%', delay: '0s', duration: '6.8s', scale: '0.84' },
      { left: '72%', top: '28%', delay: '1.2s', duration: '7.4s', scale: '0.62' },
      { left: '16%', top: '70%', delay: '2.4s', duration: '6.4s', scale: '0.7' },
      { left: '82%', top: '62%', delay: '3.1s', duration: '8.2s', scale: '0.78' },
      { left: '44%', top: '18%', delay: '4.0s', duration: '7.8s', scale: '0.55' },
      { left: '32%', top: '48%', delay: '4.7s', duration: '6.6s', scale: '0.68' }
    ];
    var html = '<div class="butterfly-field" aria-hidden="true">';

    butterflies.forEach(function (item, index) {
      html += '<span class="butterfly butterfly-' + index + '" style="' +
        'left:' + item.left + ';top:' + item.top + ';' +
        'animation-delay:' + item.delay + ';animation-duration:' + item.duration + ';' +
        '--butterfly-scale:' + item.scale + '">' +
          '<span class="butterfly-wing butterfly-wing-left"></span>' +
          '<span class="butterfly-body"></span>' +
          '<span class="butterfly-wing butterfly-wing-right"></span>' +
        '</span>';
    });

    html += '</div>';
    return html;
  }

  // ===== 显示主场景 =====
  function showMainScene() {
    if (domCache.mainScene) {
      domCache.mainScene.style.display = 'block';
    }
  }

  // ===== 开场序列 =====
  function startIntroSequence() {
    if (prefersReducedMotion) {
      // 减少动画模式下直接开始飞行动画
      flightElapsed = 0;
      startFlightAnimation();
      return;
    }

    var scene = domCache.mainScene;
    var layer = document.getElementById('introLayer');
    if (!scene || !layer) {
      startFlightAnimation();
      return;
    }

    pauseFlightAnimation();
    flightElapsed = 0;
    scene.classList.remove('intro-finished');
    scene.classList.add('intro-active');
    layer.classList.remove('intro-running');
    void layer.offsetWidth;
    layer.classList.add('intro-running');

    if (canUseGsap()) {
      playGsapIntro(scene, layer);
      return;
    }

    if (introTimer) {
      clearTimeout(introTimer);
    }
    introTimer = setTimeout(function () {
      finishIntroSequence(scene, layer);
    }, CONFIG.INTRO_DURATION);
  }

  function playGsapIntro(scene, layer) {
    var photos = Array.prototype.slice.call(layer.querySelectorAll('.intro-photo'));
    var burst = layer.querySelector('.intro-burst');

    if (introTimeline) {
      introTimeline.kill();
      introTimeline = null;
    }

    if (!photos.length) {
      finishIntroSequence(scene, layer);
      return;
    }

    introTimeline = gsapCore.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: function () {
        introTimeline = null;
        finishIntroSequence(scene, layer);
      }
    });

    gsapCore.set(layer, { autoAlpha: 1 });
    gsapCore.set(photos, {
      xPercent: -50,
      yPercent: -50,
      autoAlpha: 0,
      scale: 0.45,
      filter: 'blur(10px)',
      transformOrigin: '50% 50%'
    });

    if (burst) {
      introTimeline.fromTo(burst,
        { autoAlpha: 0, scale: 0.4 },
        { autoAlpha: 0.94, scale: 1.08, duration: 0.62, ease: 'power2.out' },
        0.12
      ).to(burst, {
        scale: 1.24,
        duration: 0.24,
        repeat: 3,
        yoyo: true,
        ease: 'power1.inOut'
      }, 1.08
      ).to(burst, {
        autoAlpha: 0,
        scale: 2.05,
        duration: 0.52,
        ease: 'power2.in'
      }, 3.1);
    }

    photos.forEach(function (photo, index) {
      var style = getComputedStyle(photo);
      var startX = style.getPropertyValue('--start-x') || '0px';
      var startY = style.getPropertyValue('--start-y') || '0px';
      var startRot = style.getPropertyValue('--start-rot') || '0deg';
      var scatterX = style.getPropertyValue('--scatter-x') || '0px';
      var scatterY = style.getPropertyValue('--scatter-y') || '0px';
      var scatterRot = style.getPropertyValue('--scatter-rot') || '0deg';
      var delay = index * 0.055;

      gsapCore.set(photo, {
        x: startX,
        y: startY,
        rotation: startRot
      });

      introTimeline
        .to(photo, {
          autoAlpha: 1,
          x: scatterX,
          y: scatterY,
          rotation: scatterRot,
          scale: 0.9,
          filter: 'blur(0px)',
          duration: 0.54,
          ease: 'back.out(1.7)'
        }, 0.12 + delay)
        .to(photo, {
          scale: 0.94,
          duration: 0.18,
          ease: 'power2.out'
        }, 1.16 + delay * 0.35)
        .to(photo, {
          scale: 0.88,
          duration: 0.28,
          ease: 'power2.inOut'
        }, 1.34 + delay * 0.35)
        .to(photo, {
          scale: 0.93,
          duration: 0.18,
          ease: 'power2.out'
        }, 2.04 + delay * 0.25)
        .to(photo, {
          scale: 0.88,
          duration: 0.28,
          ease: 'power2.inOut'
        }, 2.22 + delay * 0.25)
        .to(photo, {
          x: 0,
          y: 0,
          rotation: 0,
          scale: 0.74,
          duration: 0.68,
          ease: 'power2.inOut'
        }, 2.74 + delay * 0.45)
        .to(photo, {
          autoAlpha: 0,
          scale: 0.22,
          filter: 'blur(14px)',
          duration: 0.44,
          ease: 'power2.in'
        }, 3.2 + delay * 0.3);
    });
  }

  function finishIntroSequence(scene, layer) {
    scene.classList.remove('intro-active');
    scene.classList.add('intro-finished');
    layer.classList.remove('intro-running');
    if (canUseGsap()) {
      gsapCore.set(layer, { clearProps: 'opacity,visibility' });
    }
    playLoveBurstTransition(scene);
  }

  function playLoveBurstTransition(scene) {
    var loveBurstLayer = document.getElementById('loveBurstLayer');

    if (!scene || !loveBurstLayer || prefersReducedMotion) {
      beginMainFlight();
      return;
    }

    scene.classList.remove('love-burst-done');
    scene.classList.add('love-burst-active');
    loveBurstLayer.classList.remove('love-burst-running');
    void loveBurstLayer.offsetWidth;
    loveBurstLayer.classList.add('love-burst-running');

    if (loveBurstTimer) {
      clearTimeout(loveBurstTimer);
    }

    loveBurstTimer = setTimeout(function () {
      loveBurstTimer = null;
      scene.classList.remove('love-burst-active');
      scene.classList.add('love-burst-done');
      loveBurstLayer.classList.remove('love-burst-running');
      beginMainFlight();
    }, CONFIG.LOVE_BURST_DURATION);
  }

  function beginMainFlight() {
    primeMainClock(0);
    flightElapsed = 0;
    updateStageRect();
    startFlightAnimation();
  }

  // ===== 渲染节点 =====
  function renderMainNodes() {
    var stage = document.getElementById('timelineStage');
    if (!stage) return;

    stage.innerHTML = '';

    storyData.forEach(function (item, index) {
      var node = document.createElement('button');
      node.type = 'button';
      node.className = 'story-node node-motion-' + (index % 4);
      node.dataset.index = index;
      node.dataset.motion = String(index % 4);
      node.setAttribute('aria-label', item.title);

      var bg = document.createElement('div');
      bg.className = 'node-bg';
      bg.dataset.src = item.image;

      var img = document.createElement('img');
      img.className = 'node-image';
      img.dataset.src = item.image;
      img.alt = item.title;
      img.draggable = false;
      img.loading = 'eager'; // 优先加载

      img.decoding = 'async';
      img.loading = index < 2 ? 'eager' : 'lazy';
      img.fetchPriority = index < 2 ? 'high' : 'low';

      var shine = document.createElement('div');
      shine.className = 'node-shine';

      var overlay = document.createElement('div');
      overlay.className = 'node-overlay';

      var titleEl = document.createElement('div');
      titleEl.className = 'node-title';
      titleEl.textContent = item.title;

      var dateEl = document.createElement('div');
      dateEl.className = 'node-date';
      dateEl.textContent = item.date;

      overlay.appendChild(titleEl);
      overlay.appendChild(dateEl);
      node.appendChild(bg);
      node.appendChild(img);
      node.appendChild(shine);
      node.appendChild(overlay);

      // 使用 pointerdown 替代 click 以获得更快响应
      node.addEventListener('pointerdown', function (event) {
        event.preventDefault();
        openDetail(index, node);
      });

      node.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDetail(index, node);
        }
      });

      stage.appendChild(node);
    });

    domCache.nodes = Array.prototype.slice.call(stage.querySelectorAll('.story-node'));

    // 减少动画模式下直接显示所有节点
    if (prefersReducedMotion) {
      applyReducedMotionLayout();
    } else {
      applyFlightFrame(0);
    }
  }

  function applyReducedMotionLayout() {
    var nodes = domCache.nodes;
    if (!nodes || !nodes.length) return;

    nodes.forEach(function(node, i) {
      node.style.display = 'block';
      node.style.opacity = '1';
      node.style.filter = 'blur(0px)';
      node.style.transform = 'translate3d(-50%, -50%, 0) scale(0.9)';
      // 静态布局位置
      var angle = (i / nodes.length) * Math.PI * 2;
      var radius = 120;
      var x = Math.cos(angle) * radius;
      var y = Math.sin(angle) * radius;
      node.style.left = 'calc(50% + ' + x + 'px)';
      node.style.top = 'calc(50% + ' + y + 'px)';
      node.style.pointerEvents = 'auto';
      node.style.setProperty('--node-focus', '0.85');
      node.style.setProperty('--node-depth', '0.75');
      node.style.setProperty('--plane-wake', '0');
      node.style.setProperty('--beat-kick', '0');
    });
  }

  // ===== 飞行动画 =====
  function startFlightAnimation() {
    if (flightFrame || prefersReducedMotion) return;

    isFlightPaused = false;
    updateStageRect();
    flightElapsed = getSyncedElapsed(flightElapsed);
    flightBaseTime = performance.now() - flightElapsed;

    flightFrame = requestAnimationFrame(function animate(timestamp) {
      flightElapsed = getSyncedElapsed(timestamp - flightBaseTime);
      applyFlightFrame(flightElapsed);

      if (!isFlightPaused) {
        flightFrame = requestAnimationFrame(animate);
      }
    });
  }

  function pauseFlightAnimation() {
    isFlightPaused = true;

    if (flightFrame) {
      cancelAnimationFrame(flightFrame);
      flightFrame = null;
    }
  }

  function getSyncedElapsed(fallbackElapsed) {
    if (isMusicPlaying && audioElement && isFinite(audioElement.currentTime)) {
      if (!mainClockPrimed) {
        primeMainClock(fallbackElapsed);
      }

      return Math.max(0, (audioElement.currentTime - mainAudioAnchor) * 1000 + mainVisualAnchor + CONFIG.AUDIO_VISUAL_OFFSET);
    }

    return fallbackElapsed;
  }

  function primeMainClock(visualElapsed) {
    mainClockPrimed = true;
    mainVisualAnchor = visualElapsed || 0;
    mainAudioAnchor = audioElement && isFinite(audioElement.currentTime) ? audioElement.currentTime : 0;
  }

  function applyFlightFrame(elapsed) {
    var stage = domCache.stage;
    if (!stage) return;

    var rect = stageRect;
    if (!rect) {
      updateStageRect();
      rect = stageRect;
    }
    if (!rect) return;

    var nodes = domCache.nodes;
    var total = nodes.length;
    if (!total) return;

    var renderElapsed = CONFIG.STORY_LOOP ? elapsed : Math.min(elapsed, getFinalFreezeElapsed(total));
    var timing = getCycleTiming(renderElapsed);
    var cycleIndex = CONFIG.STORY_LOOP ? timing.cycleIndex % total : clamp(timing.cycleIndex, 0, total - 1);
    var nextIndex = CONFIG.STORY_LOOP || cycleIndex < total - 1 ? (cycleIndex + 1) % total : -1;
    var prevIndex = cycleIndex > 0 ? cycleIndex - 1 : (CONFIG.STORY_LOOP ? total - 1 : -1);
    var phase = timing.phase;
    var positions = getSequencePositions(rect, cycleIndex);
    var showPrevious = prevIndex !== -1 && !timing.isEntry && phase < timing.flightDuration + 360;

    ensureNodeAssets(cycleIndex);
    if (nextIndex !== -1) ensureNodeAssets(nextIndex);
    if (showPrevious && prevIndex !== -1) ensureNodeAssets(prevIndex);

    updateSceneTone(cycleIndex, phase, timing);
    updateFinaleWall(elapsed, total);
    updatePlane(rect, phase, positions.main, positions.planeTarget, timing);
    updateSpine(phase / timing.cycleDuration);

    nodes.forEach(function (node, index) {
      if (node.classList.contains('node-opening')) return;

      if (index !== cycleIndex && index !== nextIndex && (!showPrevious || index !== prevIndex)) {
        hideNode(node);
        return;
      }

      var state = index === cycleIndex
        ? getCurrentNodeState(phase, positions, renderElapsed, timing)
        : (index === nextIndex
          ? getNextNodeState(phase, positions, renderElapsed, timing)
          : getPreviousNodeState(phase, positions, renderElapsed, timing));

      node.dataset.hidden = '0';
      node.style.display = 'block';
      node.classList.toggle('node-current', state.role === 'current');
      node.classList.toggle('node-next', state.role === 'next');
      node.classList.toggle('node-echo', state.role === 'previous');
      node.style.pointerEvents = state.role !== 'previous' && state.opacity > 0.28 ? 'auto' : 'none';
      node.style.transition = '';
      node.style.transform =
        'translate3d(calc(-50% + ' + Math.round(state.x - rect.width * 0.5) + 'px), calc(-50% + ' + Math.round(state.y - rect.height * 0.5) + 'px), ' +
        Math.round(state.z) + 'px) rotateX(' + state.rotateX.toFixed(2) + 'deg) rotateY(' + state.rotateY.toFixed(2) + 'deg) ' +
        'rotateZ(' + state.rotateZ.toFixed(2) + 'deg) scale(' + state.scale.toFixed(3) + ')';
      node.style.opacity = state.opacity.toFixed(3);
      node.style.filter = state.blur < 0.05 ? 'none' : 'blur(' + state.blur.toFixed(1) + 'px)';
      node.style.zIndex = state.zIndex;
      node.style.setProperty('--node-focus', state.focus.toFixed(3));
      node.style.setProperty('--node-depth', state.depth.toFixed(3));
      node.style.setProperty('--plane-wake', state.wake.toFixed(3));
      node.style.setProperty('--beat-kick', state.kick.toFixed(3));
      node.style.setProperty('--node-pan-x', state.panX.toFixed(2) + 'px');
      node.style.setProperty('--node-pan-y', state.panY.toFixed(2) + 'px');
      node.style.setProperty('--node-bg-pan-x', (-state.panX * 0.55).toFixed(2) + 'px');
      node.style.setProperty('--node-bg-pan-y', (-state.panY * 0.55).toFixed(2) + 'px');
      node.style.setProperty('--node-image-scale', (1 + state.focus * 0.018).toFixed(3));
      node.style.setProperty('--node-bg-scale', (1.16 + state.wake * 0.035).toFixed(3));
      node.style.setProperty('--node-shimmer', state.shimmer.toFixed(3));
      node.style.setProperty('--node-shimmer-x', (state.shimmer * 320).toFixed(1) + '%');
      node.style.setProperty('--node-shimmer-opacity', (state.shimmer * 0.65).toFixed(3));
      node.style.setProperty('--node-caption-lift', (-state.captionLift).toFixed(2) + 'px');
    });
  }

  function hideNode(node) {
    if (node.dataset.hidden === '1') return;

    node.dataset.hidden = '1';
    node.style.display = 'none';
    node.style.pointerEvents = 'none';
    node.style.opacity = '0';
    node.style.filter = 'blur(3px)';
    node.style.setProperty('--node-focus', '0');
    node.style.setProperty('--node-depth', '0');
    node.style.setProperty('--plane-wake', '0');
    node.style.setProperty('--beat-kick', '0');
    node.style.setProperty('--node-pan-x', '0px');
    node.style.setProperty('--node-pan-y', '0px');
    node.style.setProperty('--node-bg-pan-x', '0px');
    node.style.setProperty('--node-bg-pan-y', '0px');
    node.style.setProperty('--node-image-scale', '1');
    node.style.setProperty('--node-bg-scale', '1.16');
    node.style.setProperty('--node-shimmer', '0');
    node.style.setProperty('--node-shimmer-x', '0%');
    node.style.setProperty('--node-shimmer-opacity', '0');
    node.style.setProperty('--node-caption-lift', '0px');
    node.classList.remove('node-current', 'node-next', 'node-echo');
  }

  function getCycleStartForIndex(index) {
    if (index <= 0) return 0;
    if (index === 1) return CONFIG.ENTRY_CYCLE_DURATION;
    if (index === 2) return CONFIG.ENTRY_CYCLE_DURATION + CONFIG.FIRST_NORMAL_CYCLE_DURATION;
    return CONFIG.ENTRY_CYCLE_DURATION + CONFIG.FIRST_NORMAL_CYCLE_DURATION + (index - 2) * CONFIG.CYCLE_DURATION;
  }

  function getFinalFreezeElapsed(total) {
    var finalStart = getCycleStartForIndex(total - 1);
    var freezePhase = Math.max(0, CONFIG.NEXT_DELAY - CONFIG.FINAL_FREEZE_BEFORE_NEXT);
    return finalStart + freezePhase;
  }

  function getFinaleWallStartElapsed(total) {
    return getCycleStartForIndex(total - 1) + CONFIG.FINALE_WALL_START_OFFSET;
  }

  function updateFinaleWall(elapsed, total) {
    var wall = domCache.finaleWall;
    var tiles = domCache.finaleTiles;
    var scene = domCache.mainScene;
    if (!wall || !tiles || !tiles.length || !scene) return;

    var start = getFinaleWallStartElapsed(total);
    var revealDuration = CONFIG.FINALE_WALL_REVEAL_DURATION;
    var progress = smoothstep(start, start + revealDuration, elapsed);
    var isActive = progress > 0;
    var isReady = progress > 0.92;

    if (!isActive) {
      if (wall.dataset.finaleState !== 'idle') {
        scene.classList.remove('finale-wall-active');
        wall.classList.remove('finale-wall-ready');
        wall.setAttribute('aria-hidden', 'true');
        wall.style.opacity = '0';
        wall.style.pointerEvents = 'none';
        scene.style.setProperty('--finale-stage-opacity', '1');
        wall.dataset.finaleState = 'idle';
      }
      return;
    }

    wall.dataset.finaleState = isReady ? 'ready' : 'active';

    scene.classList.toggle('finale-wall-active', isActive);
    wall.classList.toggle('finale-wall-ready', isReady);
    wall.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    wall.style.opacity = progress.toFixed(3);
    wall.style.pointerEvents = isReady ? 'auto' : 'none';
    scene.style.setProperty('--finale-stage-opacity', (1 - progress * 0.74).toFixed(3));

    tiles.forEach(function (tile, index) {
      var localElapsed = elapsed - start - index * CONFIG.FINALE_WALL_TILE_STAGGER;
      var local = smoothstep(0, 920, localElapsed);
      var driftX = (0.5 - (index % 5) / 4) * 26 * (1 - local);
      var driftY = (1 - local) * (index % 2 ? 34 : 26);
      var scale = 0.72 + local * 0.28;
      tile.style.opacity = (local * 0.98).toFixed(3);
      var tileBlur = (1 - local) * 5;
      tile.style.filter = tileBlur < 0.08 ? 'none' : 'blur(' + tileBlur.toFixed(1) + 'px)';
      tile.style.zIndex = String(100 + Math.round(local * (Number(tile.style.getPropertyValue('--tile-layer')) || 10)));
      tile.style.transform =
        'translate3d(calc(-50% + ' + driftX.toFixed(1) + 'px), calc(-50% + ' + driftY.toFixed(1) + 'px), calc(var(--tile-z, 0px) * ' + local.toFixed(3) + ')) ' +
        'rotateY(calc(var(--tile-yrot, 0deg) * ' + local.toFixed(3) + ')) rotateZ(calc(var(--tile-rot, 0deg) * ' + local.toFixed(3) + ')) scale(' + scale.toFixed(3) + ')';
    });
  }

  function getCycleTiming(elapsed) {
    if (elapsed < CONFIG.ENTRY_CYCLE_DURATION) {
      return {
        cycleIndex: 0,
        phase: elapsed,
        cycleDuration: CONFIG.ENTRY_CYCLE_DURATION,
        flightDuration: CONFIG.FLIGHT_DURATION,
        holdEnd: CONFIG.ENTRY_HOLD_END,
        promoteEnd: CONFIG.ENTRY_PROMOTE_END,
        isEntry: true
      };
    }

    var normalElapsed = elapsed - CONFIG.ENTRY_CYCLE_DURATION;
    if (normalElapsed < CONFIG.FIRST_NORMAL_CYCLE_DURATION) {
      return {
        cycleIndex: 1,
        phase: normalElapsed,
        cycleDuration: CONFIG.FIRST_NORMAL_CYCLE_DURATION,
        flightDuration: CONFIG.FLIGHT_DURATION,
        holdEnd: CONFIG.FIRST_NORMAL_HOLD_END,
        promoteEnd: CONFIG.FIRST_NORMAL_PROMOTE_END,
        isEntry: false,
        isFirstNormal: true
      };
    }

    normalElapsed -= CONFIG.FIRST_NORMAL_CYCLE_DURATION;
    return {
      cycleIndex: 2 + Math.floor(normalElapsed / CONFIG.CYCLE_DURATION),
      phase: normalElapsed % CONFIG.CYCLE_DURATION,
      cycleDuration: CONFIG.CYCLE_DURATION,
      flightDuration: CONFIG.FLIGHT_DURATION,
      holdEnd: CONFIG.HOLD_END,
      promoteEnd: CONFIG.PROMOTE_END,
      isEntry: false,
      isFirstNormal: false
    };
  }

  function getCurrentNodeState(phase, positions, elapsed, timing) {
    var out = smoothstep(timing.holdEnd, timing.promoteEnd, phase);
    var kick = beatPulse(phase, CONFIG.BEAT_DURATION, 3.2) * (1 - out);
    var halfKick = beatPulse(phase + CONFIG.BEAT_DURATION * 0.5, CONFIG.BEAT_DURATION, 4.2) * 0.22 * (1 - out);
    var beatKick = clamp(kick + halfKick, 0, 1);
    var pulseKick = 0;
    var glowKick = timing.isEntry ? beatKick * 0.14 : beatKick * 0.1;
    var driftSize = timing.isEntry ? 1.45 : 1.15;
    var breathe = (Math.sin(elapsed * 0.0022) + 1) * (timing.isEntry ? 0.0022 : 0.0016) * (1 - out);
    var x = positions.main.x + Math.sin(elapsed * 0.0018) * driftSize * (1 - out) - out * 30;
    var y = positions.main.y + Math.cos(elapsed * 0.002) * (driftSize * 0.58) * (1 - out) + out * 34;
    var opacity = (0.99 + glowKick * 0.012) * (1 - out * 0.94);

    if (phase >= timing.promoteEnd) {
      opacity = 0;
    }

    return {
      role: 'current',
      x: x,
      y: y,
      z: 48 - out * 20,
      scale: 1.012 + breathe + pulseKick * 0.025 - out * 0.2,
      opacity: opacity,
      blur: out * 2.2,
      rotateX: -0.8 + pulseKick * 0.8 + out * 1.8,
      rotateY: -1.35 + pulseKick * 1.1 + out * 3.8,
      rotateZ: -0.75 + pulseKick * 0.9 + out * 3.6,
      zIndex: Math.round(90 - out * 30),
      focus: 0.96 + glowKick * 0.16 - out * 0.45,
      depth: 0.9 + glowKick * 0.06 - out * 0.28,
      wake: glowKick * 0.16,
      kick: glowKick,
      panX: Math.sin(elapsed * 0.0007 + timing.cycleIndex) * 1.7 * (1 - out),
      panY: Math.cos(elapsed * 0.00065 + timing.cycleIndex * 0.7) * 1.25 * (1 - out),
      shimmer: clamp(glowKick * 1.8 + out * 0.4, 0, 1),
      captionLift: (1 - out) * (1.4 + glowKick * 3.2)
    };
  }

  function getNextNodeState(phase, positions, elapsed, timing) {
    var entryDelay = timing.isEntry ? CONFIG.ENTRY_NEXT_DELAY : (timing.isFirstNormal ? CONFIG.FIRST_NORMAL_NEXT_DELAY : CONFIG.NEXT_DELAY);
    var localPhase = Math.max(0, phase - entryDelay);
    var reveal = smoothstep(-CONFIG.BEAT_REVEAL_LEAD, timing.flightDuration - CONFIG.BEAT_REVEAL_LEAD, localPhase);
    var snapPop = phase >= entryDelay && localPhase < CONFIG.BEAT_DURATION ? beatPulse(localPhase, CONFIG.BEAT_DURATION, 2.4) : 0;
    var promote = smoothstep(timing.holdEnd, timing.promoteEnd, phase);
    var settle = smoothstep(timing.promoteEnd, timing.cycleDuration, phase);
    var summoned = Math.sin(clamp(localPhase / timing.flightDuration, 0, 1) * Math.PI);
    var beatKick = beatPulse(localPhase, CONFIG.BEAT_DURATION, 3) * (1 - promote * 0.72);
    var side = positions.next.x >= positions.spawn.x ? 1 : -1;
    var variant = timing.cycleIndex % 4;
    var leafSway = Math.sin(reveal * Math.PI * (variant === 2 ? 3.2 : 2.8)) * (variant === 1 ? 7 : 12) * (1 - reveal);
    var controlA = positions.spawn.x + side * (variant === 2 ? 156 : 112);
    var controlB = positions.next.x - side * (variant === 3 ? 72 : 42);
    var liftA = variant === 1 ? 34 : (variant === 2 ? 96 : 68);
    var liftB = variant === 3 ? 52 : 26;
    var x = cubicBezier(positions.spawn.x, controlA, controlB, positions.next.x, reveal) + leafSway;
    var y = cubicBezier(positions.spawn.y, positions.spawn.y - liftA, positions.next.y + liftB, positions.next.y, reveal);

    if (variant === 1) {
      y += Math.cos(reveal * Math.PI) * 9 * (1 - reveal);
    } else if (variant === 2) {
      x += Math.sin(reveal * Math.PI) * side * 16;
    } else if (variant === 3) {
      y -= Math.sin(reveal * Math.PI * 1.1) * 13;
    }

    x = lerp(x, positions.main.x, promote);
    y = lerp(y, positions.main.y, promote);

    var scale = lerp(0.28, variant === 1 ? 0.78 : 0.84, reveal) + summoned * (variant === 2 ? 0.1 : 0.085) + beatKick * 0.026 + snapPop * 0.018;
    scale = lerp(scale, 1.02, promote);
    scale = lerp(scale, 1.012, settle);

    var opacity = Math.max(reveal * 0.82, snapPop * 0.28);
    opacity = lerp(opacity, 1, promote);
    if (phase < entryDelay) {
      opacity = 0;
    }

    return {
      role: 'next',
      x: x,
      y: y,
      z: lerp(14, 48, promote),
      scale: scale,
      opacity: opacity,
      blur: lerp(2.4, 0.24, reveal) * (1 - promote),
      rotateX: lerp(variant === 3 ? -8 : -5, -0.8, promote),
      rotateY: lerp(side * (variant === 2 ? 18 : 12), -1.2, promote),
      rotateZ: lerp(side * (variant === 1 ? 5 : 10), side * (variant === 3 ? 4 : 2.2), reveal) * (1 - promote) + lerp(side * 2.2, -0.75, promote),
      zIndex: Math.round(50 + promote * 44),
      focus: lerp(0.38, 0.99, promote) + summoned * 0.24 + beatKick * 0.08 + snapPop * 0.12,
      depth: lerp(0.48, 0.94, promote),
      wake: (summoned * 0.9 + beatKick * 0.35) * (1 - promote * 0.42),
      kick: clamp(summoned * (1 - promote * 0.2) + beatKick * 0.48 + snapPop * 0.32, 0, 1),
      panX: side * (1 - promote) * (variant === 2 ? 4 : 2.8),
      panY: -summoned * 2.4 + promote,
      shimmer: clamp(reveal * 0.62 + summoned * 0.7 + beatKick * 0.36 + snapPop * 0.3, 0, 1),
      captionLift: reveal * 5 + promote * 1.4
    };
  }

  function getPreviousNodeState(phase, positions, elapsed, timing) {
    var life = smoothstep(0, timing.flightDuration + 360, phase);
    var fade = 1 - life;
    var side = positions.side || 1;
    var arc = Math.sin(life * Math.PI);

    return {
      role: 'previous',
      x: positions.main.x - side * (42 + life * 130) + arc * side * 22,
      y: positions.main.y + 24 + life * 76 - arc * 18,
      z: 22 - life * 28,
      scale: 0.86 - life * 0.22,
      opacity: fade * 0.22,
      blur: 1.4 + life * 5.2,
      rotateX: -1 + life * 5,
      rotateY: -side * (7 + life * 10),
      rotateZ: -side * (3 + life * 6),
      zIndex: Math.round(34 - life * 8),
      focus: fade * 0.48,
      depth: fade * 0.46,
      wake: fade * 0.4,
      kick: fade * 0.18,
      panX: -side * (6 + life * 6),
      panY: life * 7,
      shimmer: fade * 0.45,
      captionLift: 0
    };
  }

  function updatePlane(rect, phase, mainPoint, nextPoint, timing) {
    var plane = domCache.plane;
    var trail = domCache.trail;
    if (!plane || !trail) return;

    var travel = smoothstep(0, timing.flightDuration, phase);
    var point = getPlanePoint(mainPoint, nextPoint, travel);
    var ahead = getPlanePoint(mainPoint, nextPoint, clamp(travel + 0.03, 0, 1));
    var angle = Math.atan2(ahead.y - point.y, ahead.x - point.x) * 180 / Math.PI;
    var glow = Math.sin(travel * Math.PI);
    var idle = phase > timing.flightDuration ? smoothstep(timing.flightDuration, timing.cycleDuration, phase) : 0;
    var beatKick = beatPulse(phase, CONFIG.BEAT_DURATION, 2.8);
    var scale = 0.62 + glow * 0.3 + beatKick * 0.07 - idle * 0.04;
    var opacity = clamp(0.54 + glow * 0.5 + beatKick * 0.16 - idle * 0.12, 0.32, 1);
    var bank = Math.sin(travel * Math.PI * 2) * 18;
    var dx = point.x - rect.width * 0.5;
    var dy = point.y - rect.height * 0.5;

    plane.style.transform =
      'translate3d(calc(-50% + ' + Math.round(dx) + 'px), calc(-50% + ' + Math.round(dy) + 'px), 140px) ' +
      'rotate(' + (angle + 4).toFixed(2) + 'deg) rotateY(' + bank.toFixed(2) + 'deg) scale(' + scale.toFixed(3) + ')';
    plane.style.opacity = opacity.toFixed(3);
    plane.style.zIndex = 150;

    trail.style.transform =
      'translate3d(calc(-100% + ' + Math.round(dx + rect.width * 0.5) + 'px), calc(-50% + ' + Math.round(dy + rect.height * 0.5) + 'px), 0) ' +
      'rotate(' + angle.toFixed(2) + 'deg) scaleX(' + (0.58 + glow * 0.62 + beatKick * 0.18).toFixed(3) + ')';
    trail.style.opacity = clamp(0.06 + glow * 0.48 + beatKick * 0.18 - idle * 0.14, 0.02, 0.6).toFixed(3);
  }

  function updateSpine(progress) {
    var pulse = domCache.spinePulse;
    if (!pulse) return;

    pulse.style.strokeDashoffset = String(80 - progress * 140);
    pulse.style.opacity = String(clamp(0.18 + Math.sin(progress * Math.PI) * 0.46, 0.18, 0.64));
  }

  function updateSceneTone(cycleIndex, phase, timing) {
    var scene = domCache.mainScene;
    if (!scene) return;

    var palette = SCENE_PALETTES[cycleIndex % SCENE_PALETTES.length];
    var progress = clamp(phase / timing.cycleDuration, 0, 1);
    var beat = beatPulse(phase, CONFIG.BEAT_DURATION, 2.8);
    var travel = Math.sin(clamp(phase / timing.flightDuration, 0, 1) * Math.PI);
    var energy = clamp(0.32 + beat * 0.38 + travel * 0.28, 0.24, 1);

    scene.style.setProperty('--scene-accent-rgb', palette.accent);
    scene.style.setProperty('--scene-second-rgb', palette.second);
    scene.style.setProperty('--scene-warm-rgb', palette.warm);
    scene.style.setProperty('--scene-energy', energy.toFixed(3));
    scene.style.setProperty('--scene-beat', beat.toFixed(3));
    scene.style.setProperty('--scene-progress', progress.toFixed(3));
    scene.style.setProperty('--scene-wash-opacity', (0.16 + energy * 0.28).toFixed(3));
    scene.style.setProperty('--scene-stage-opacity', (0.45 + energy * 0.3).toFixed(3));
    scene.style.setProperty('--scene-sparkle-opacity', (0.24 + energy * 0.34).toFixed(3));
    scene.style.setProperty('--scene-sparkle-fade-opacity', (0.12 + energy * 0.2).toFixed(3));
    scene.style.setProperty('--scene-petal-opacity', (0.18 + energy * 0.22).toFixed(3));
    scene.style.setProperty('--scene-petal-fade-opacity', (0.12 + energy * 0.18).toFixed(3));
    scene.style.setProperty('--scene-orbit-opacity', (0.22 + energy * 0.24).toFixed(3));
    scene.style.setProperty('--scene-orbit-b-opacity', (0.16 + energy * 0.2).toFixed(3));
    scene.style.setProperty('--scene-ribbon-opacity', (0.18 + energy * 0.42).toFixed(3));
    scene.style.setProperty('--scene-comet-opacity', (0.18 + energy * 0.44).toFixed(3));
    scene.style.setProperty('--scene-pulse-scale', (1 + beat * 0.035 + travel * 0.025).toFixed(3));
    var ribbonShift = Math.round((progress - 0.5) * 52);
    var ringRot = cycleIndex * 28 + progress * 120;
    scene.style.setProperty('--scene-ribbon-shift', ribbonShift + 'px');
    scene.style.setProperty('--scene-ribbon-shift-back', -ribbonShift + 'px');
    scene.style.setProperty('--scene-ring-rot', ringRot.toFixed(2) + 'deg');
    scene.style.setProperty('--scene-ring-rot-back', (-ringRot).toFixed(2) + 'deg');
  }

  function getSequencePositions(rect, index) {
    var variant = index % 4;
    var side = index % 2 === 0 ? 1 : -1;
    var nextSpread = [0.22, 0.18, 0.24, 0.2][variant];
    var nextX = 0.5 + side * (nextSpread + (index % 3) * 0.014);
    var nextY = [0.3, 0.365, 0.285, 0.345][variant];
    var clampedNextX = clamp(nextX, 0.24, 0.76);
    var spawnX = 0.5 + side * [0.06, -0.08, 0.12, 0.02][variant];
    var spawnY = [0.52, 0.58, 0.47, 0.62][variant];
    return {
      side: side,
      variant: variant,
      main: {
        x: rect.width * 0.5,
        y: rect.height * (0.575 + (variant === 1 ? 0.012 : 0))
      },
      next: {
        x: rect.width * clampedNextX,
        y: rect.height * nextY
      },
      planeTarget: {
        x: rect.width * clamp(clampedNextX - side * 0.11, 0.18, 0.82),
        y: rect.height * (nextY + 0.025)
      },
      spawn: {
        x: rect.width * clamp(spawnX, 0.28, 0.72),
        y: rect.height * spawnY
      }
    };
  }

  function getPlanePoint(start, end, progress) {
    var t = clamp(progress, 0, 1);
    var lift = Math.sin(t * Math.PI) * 46;
    var curve = Math.sin(t * Math.PI * 1.2) * 20;
    return {
      x: lerp(start.x, end.x, t) + curve,
      y: lerp(start.y, end.y, t) - lift
    };
  }

  // ===== 详情页 =====
  function openDetail(index, node) {
    if (isOpeningDetail) return;

    isOpeningDetail = true;
    pauseFlightAnimation();

    var item = storyData[index];
    var stage = domCache.stage;
    if (stage) {
      var nodes = domCache.nodes;
      nodes.forEach(function (currentNode) {
        if (currentNode !== node) currentNode.classList.add('node-dimmed');
      });
    }

    node.classList.add('node-opening');
    node.style.zIndex = 220;

    if (canUseGsap()) {
      if (detailTimeline) {
        detailTimeline.kill();
        detailTimeline = null;
      }

      detailTimeline = gsapCore.timeline({
        defaults: { ease: 'power3.out' },
        onComplete: function () {
          detailTimeline = null;
          showDetailScene(item);
          resetNodeOpeningState();
        }
      });

      detailTimeline.to(node, {
        duration: CONFIG.OPENING_DURATION / 1000,
        transform: 'translate3d(-50%, -50%, 180px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1.42)',
        opacity: 1,
        filter: 'blur(0px)',
        boxShadow: '0 24px 70px rgba(0, 0, 0, 0.72), 0 0 70px rgba(0, 212, 170, 0.36), 0 0 100px rgba(255, 107, 157, 0.24)'
      });
      return;
    }

    node.style.transition =
      'transform ' + CONFIG.OPENING_DURATION + 'ms cubic-bezier(0.2, 0.85, 0.16, 1), ' +
      'opacity ' + CONFIG.OPENING_DURATION + 'ms ease, filter ' + CONFIG.OPENING_DURATION + 'ms ease, box-shadow ' + CONFIG.OPENING_DURATION + 'ms ease';
    node.style.transform = 'translate3d(-50%, -50%, 180px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1.42)';
    node.style.opacity = '1';
    node.style.filter = 'blur(0px)';

    pendingDetailTimer = setTimeout(function () {
      showDetailScene(item);
      resetNodeOpeningState();
    }, CONFIG.OPENING_DURATION);
  }

  function openFinaleDetail(index, tile) {
    if (isOpeningDetail) return;

    isOpeningDetail = true;
    pauseFlightAnimation();

    var item = storyData[index];
    if (!item) {
      isOpeningDetail = false;
      return;
    }

    if (canUseGsap() && tile) {
      tile.classList.add('finale-tile-opening');
      detailTimeline = gsapCore.timeline({
        defaults: { ease: 'power2.out' },
        onComplete: function () {
          tile.classList.remove('finale-tile-opening');
          gsapCore.set(tile, { clearProps: 'filter' });
          detailTimeline = null;
          showDetailScene(item);
        }
      });

      detailTimeline
        .to(tile, { scale: 1.04, filter: 'brightness(1.14)', duration: 0.16 }, 0)
        .to(tile, { scale: 0.99, filter: 'brightness(0.92)', duration: 0.12 }, 0.16);
      return;
    }

    pendingDetailTimer = setTimeout(function () {
      showDetailScene(item);
    }, 120);
  }

  function resetNodeOpeningState() {
    var stage = domCache.stage;
    if (!stage) return;
    var nodes = domCache.nodes;
    nodes.forEach(function (node) {
      node.classList.remove('node-opening', 'node-dimmed');
      node.style.transition = '';
      if (canUseGsap()) {
        gsapCore.set(node, { clearProps: 'boxShadow' });
      }
    });
  }

  function createDetailScene() {
    var detail = document.createElement('div');
    detail.id = 'detailScene';
    detail.className = 'detail-scene';
    detail.style.display = 'none';
    detail.innerHTML =
      '<button class="detail-back" id="detailBack" type="button">' + TEXT.back + '</button>' +
      '<div class="detail-content">' +
        '<div class="detail-card">' +
          '<div class="detail-image-wrapper" id="detailImageWrapper">' +
            '<div class="detail-bg" id="detailBg"></div>' +
            '<img class="detail-image" id="detailImage" src="" alt="" loading="eager">' +
          '</div>' +
          '<div class="detail-info">' +
            '<h2 class="detail-title" id="detailTitle"></h2>' +
            '<p class="detail-date" id="detailDate"></p>' +
            '<p class="detail-story" id="detailStory"></p>' +
          '</div>' +
        '</div>' +
      '</div>';
    container.appendChild(detail);

    var backBtn = document.getElementById('detailBack');
    if (backBtn) {
      backBtn.addEventListener('click', closeDetail);
    }
  }

  function populateDetail(item) {
    var detailImageWrapper = document.getElementById('detailImageWrapper');
    if (detailImageWrapper) {
      detailImageWrapper.style.aspectRatio = item.frame || '3 / 4';
    }
    if (domCache.detailImage) {
      domCache.detailImage.src = item.image;
      domCache.detailImage.alt = item.title;
    }
    if (domCache.detailTitle) domCache.detailTitle.textContent = item.title;
    if (domCache.detailDate) domCache.detailDate.textContent = item.date;
    if (domCache.detailStory) domCache.detailStory.textContent = item.story;
    if (domCache.detailBg) domCache.detailBg.style.backgroundImage = 'url(' + item.image + ')';
  }

  function showDetailScene(item) {
    populateDetail(item);
    container.classList.add('detail-open');
    if (domCache.mainScene) domCache.mainScene.style.display = 'none';
    if (domCache.detailScene) domCache.detailScene.style.display = 'flex';

    if (!canUseGsap()) return;

    var detail = domCache.detailScene;
    var card = detail ? detail.querySelector('.detail-card') : null;
    var imageWrapper = detail ? detail.querySelector('.detail-image-wrapper') : null;
    var info = detail ? detail.querySelector('.detail-info') : null;

    gsapCore.set(detail, { autoAlpha: 0 });
    if (card) gsapCore.set(card, { autoAlpha: 0, y: 26, scale: 0.965 });
    if (imageWrapper) gsapCore.set(imageWrapper, { autoAlpha: 0, y: 18, scale: 0.98, filter: 'blur(8px)' });
    if (info) gsapCore.set(info, { autoAlpha: 0, y: 18 });

    detailTimeline = gsapCore.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: function () {
        detailTimeline = null;
      }
    });

    detailTimeline
      .to(detail, { autoAlpha: 1, duration: 0.22 });

    if (card) detailTimeline.to(card, { autoAlpha: 1, y: 0, scale: 1, duration: 0.52 }, 0.04);
    if (imageWrapper) detailTimeline.to(imageWrapper, { autoAlpha: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.56 }, 0.08);
    if (info) detailTimeline.to(info, { autoAlpha: 1, y: 0, duration: 0.44 }, 0.24);
  }

  function closeDetail() {
    if (pendingDetailTimer) {
      clearTimeout(pendingDetailTimer);
      pendingDetailTimer = null;
    }

    if (canUseGsap() && domCache.detailScene) {
      if (detailTimeline) {
        detailTimeline.kill();
        detailTimeline = null;
      }

      var detail = domCache.detailScene;
      var card = detail.querySelector('.detail-card');
      detailTimeline = gsapCore.timeline({
        defaults: { ease: 'power2.in' },
        onComplete: function () {
          detailTimeline = null;
          hideDetailAndResume();
        }
      });
      if (card) {
        detailTimeline.to(card, { autoAlpha: 0, y: 24, scale: 0.97, duration: CONFIG.DETAIL_EXIT_DURATION / 1000 }, 0);
      }
      detailTimeline.to(detail, { autoAlpha: 0, duration: 0.24 }, 0.05);
      return;
    }

    hideDetailAndResume();
  }

  function hideDetailAndResume() {
    container.classList.remove('detail-open');
    if (domCache.detailScene) {
      domCache.detailScene.style.display = 'none';
      if (canUseGsap()) {
        gsapCore.set(domCache.detailScene, { clearProps: 'opacity,visibility' });
      }
    }
    if (domCache.mainScene) domCache.mainScene.style.display = 'block';

    isOpeningDetail = false;
    resetNodeOpeningState();
    updateStageRect();
    startFlightAnimation();
  }

  // ===== 音乐控制 =====
  function createMusicButton() {
    var btn = document.createElement('button');
    btn.id = 'musicBtn';
    btn.className = 'music-button';
    btn.type = 'button';
    btn.textContent = TEXT.musicOn;
    btn.setAttribute('aria-label', TEXT.musicLabel);
    container.appendChild(btn);
    domCache.musicBtn = btn;

    btn.addEventListener('click', function () {
      if (!audioElement) {
        // 如果音频未初始化，尝试初始化
        initAndPlayMusic();
        return;
      }

      if (isMusicPlaying) {
        audioElement.pause();
        setMusicState(false);
      } else {
        audioElement.play().then(function () {
          setMusicState(true);
        }).catch(function (err) {
          console.warn('Audio play failed:', err);
          setMusicState(false);
        });
      }
    });
  }

  function setMusicState(isPlaying) {
    var btn = domCache.musicBtn;
    isMusicPlaying = isPlaying;

    if (!btn) return;
    btn.textContent = isPlaying ? TEXT.musicOn : TEXT.musicOff;
    btn.classList.toggle('music-on', isPlaying);

    if (canUseGsap()) {
      gsapCore.fromTo(btn,
        { scale: 0.9 },
        { scale: 1, duration: 0.34, ease: 'back.out(2.2)' }
      );
    }
  }

  // ===== 图片预加载（Promise 版） =====
  function preloadImages() {
    return new Promise(function(resolve, reject) {
      var loaded = 0;
      var total = storyData.length;
      var hasError = false;

      if (total === 0) {
        resolve();
        return;
      }

      // 设置超时
      preloadTimeoutTimer = setTimeout(function() {
        console.warn('Image preload timeout');
        resolve(); // 超时也继续
      }, CONFIG.PRELOAD_TIMEOUT);

      storyData.forEach(function (item) {
        var img = new Image();

        img.onload = function() {
          loaded++;
          if (loaded === total) {
            clearTimeout(preloadTimeoutTimer);
            resolve();
          }
        };

        img.onerror = function() {
          loaded++;
          hasError = true;
          console.warn('Failed to load image:', item.image);
          if (loaded === total) {
            clearTimeout(preloadTimeoutTimer);
            resolve(); // 即使有错误也继续
          }
        };

        img.src = item.image;
      });
    });
  }

  // ===== 清理函数 =====
  function cleanup() {
    // 清理定时器
    if (introTimer) clearTimeout(introTimer);
    if (pendingDetailTimer) clearTimeout(pendingDetailTimer);
    if (loveBurstTimer) clearTimeout(loveBurstTimer);
    if (preloadTimeoutTimer) clearTimeout(preloadTimeoutTimer);
    if (preloadQueueTimer) clearTimeout(preloadQueueTimer);

    // 停止动画
    if (flightFrame) cancelAnimationFrame(flightFrame);
    if (introTimeline) introTimeline.kill();
    if (detailTimeline) detailTimeline.kill();
    if (canUseGsap()) {
      gsapCore.killTweensOf('*');
    }

    // 停止音乐
    if (audioElement) {
      audioElement.pause();
      audioElement = null;
    }

    window.removeEventListener('resize', handleResize);
    window.removeEventListener('orientationchange', handleResize);
  }

  // ===== 数学工具函数 =====
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(edge0, edge1, value) {
    var x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return x * x * (3 - 2 * x);
  }

  function beatPulse(value, interval, decay) {
    var phase = ((value % interval) + interval) % interval;
    return Math.pow(1 - phase / interval, decay || 3);
  }

  function cubicBezier(p0, p1, p2, p3, t) {
    var inv = 1 - t;
    return inv * inv * inv * p0 + 3 * inv * inv * t * p1 + 3 * inv * t * t * p2 + t * t * t * p3;
  }

  function lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  function circularDistance(a, b) {
    var diff = Math.abs(a - b);
    return Math.min(diff, 1 - diff);
  }

  // ===== 启动 =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
