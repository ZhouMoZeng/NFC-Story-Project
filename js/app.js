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
    OPENING_DURATION: 640,
    INTRO_DURATION: 3650,
    CYCLE_DURATION: 4000,
    FLIGHT_DURATION: 760,
    HOLD_END: 2200,
    PROMOTE_END: 3200,
    MUSIC_VOLUME: 0.5,
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

  // ===== 状态变量 =====
  var container = null;
  var audioElement = null;
  var isMusicPlaying = false;
  var isInitialized = false;

  // 动画相关
  var flightFrame = null;
  var flightBaseTime = 0;
  var flightElapsed = 0;
  var isFlightPaused = true;
  var isOpeningDetail = false;

  // 定时器
  var pendingDetailTimer = null;
  var introTimer = null;
  var preloadTimeoutTimer = null;

  // DOM 缓存
  var domCache = {
    stage: null,
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
    splash: null
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
    window.addEventListener('beforeunload', cleanup);
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

      // 添加隐藏类（触发 CSS 过渡动画）
      splash.classList.add('splash-hidden');

      // 等待动画完成后彻底隐藏
      setTimeout(function () {
        splash.style.display = 'none';
        splash.style.visibility = 'hidden';
        splash.setAttribute('aria-hidden', 'true');
      }, 600);

      // 启动主场景
      showMainScene();
      startIntroSequence();
      initAndPlayMusic();
    });
  }

  // ===== 音乐初始化（添加错误处理） =====
  function initAndPlayMusic() {
    if (audioElement) return;

    try {
      audioElement = new Audio('./assets/music/bgm.mp3');
      audioElement.loop = true;
      audioElement.volume = CONFIG.MUSIC_VOLUME;

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
      (prefersReducedMotion ? '' : createIntroMarkup()) + // 减少动画模式下跳过开场
      '<div class="flight-shell">' +
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
      '</div>';
    container.appendChild(scene);
    domCache.mainScene = scene;
    renderMainNodes();
  }

  // ===== DOM 缓存 =====
  function cacheDomElements() {
    domCache.stage = document.getElementById('timelineStage');
    domCache.plane = document.getElementById('flightPlane');
    domCache.trail = document.getElementById('planeTrail');
    domCache.spinePulse = document.getElementById('timeSpinePulse');
    domCache.detailScene = document.getElementById('detailScene');
    domCache.detailImage = document.getElementById('detailImage');
    domCache.detailTitle = document.getElementById('detailTitle');
    domCache.detailDate = document.getElementById('detailDate');
    domCache.detailStory = document.getElementById('detailStory');
    domCache.detailBg = document.getElementById('detailBg');
    domCache.musicBtn = document.getElementById('musicBtn');
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
        '--intro-delay:' + (index * 45) + 'ms">' +
          '<div class="intro-photo-bg" style="background-image:url(' + item.image + ')"></div>' +
          '<img src="' + item.image + '" alt="">' +
        '</figure>';
    });

    html += '</div></div>';
    return html;
  }

  // ===== 氛围效果 =====
  function createAtmosphereMarkup() {
    // 减少动画模式下减少粒子数量
    var dustCount = prefersReducedMotion ? 8 : 16;
    var dustColors = ['warm', 'cyan', 'pink', 'gold'];
    var html = '<div class="memory-atmosphere" aria-hidden="true">' +
      '<div class="soft-glow soft-glow-pink"></div>' +
      '<div class="soft-glow soft-glow-gold"></div>' +
      '<div class="soft-glow soft-glow-cyan"></div>' +
      '<div class="dust-field">';

    for (var i = 0; i < dustCount; i++) {
      var left = (10 + (i * 80 / dustCount)) + '%';
      var top = (10 + (i * 70 / dustCount)) + '%';
      var delay = (i * 0.8) + 's';
      var duration = (18 + i * 0.5) + 's';
      html += '<span class="dust dust-' + dustColors[i % 4] + '" style="left:' + left + ';top:' + top + ';animation-delay:' + delay + ';animation-duration:' + duration + '"></span>';
    }

    html += '</div>';

    if (!prefersReducedMotion) {
      html += '<div class="heart-field">' +
        '<span class="heart-particle" style="left:18%;top:77%;animation-delay:0s;animation-duration:18s"></span>' +
        '<span class="heart-particle" style="left:78%;top:69%;animation-delay:6.2s;animation-duration:22s"></span>' +
        '</div>' +
        '<div class="streak-field">' +
        '<span class="memory-streak" style="left:8%;top:24%;animation-delay:1s;animation-duration:13s"></span>' +
        '</div>';
    }

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

    if (introTimer) {
      clearTimeout(introTimer);
    }
    introTimer = setTimeout(function () {
      scene.classList.remove('intro-active');
      scene.classList.add('intro-finished');
      layer.classList.remove('intro-running');
      flightElapsed = 0;
      startFlightAnimation();
    }, CONFIG.INTRO_DURATION);
  }

  // ===== 渲染节点 =====
  function renderMainNodes() {
    var stage = document.getElementById('timelineStage');
    if (!stage) return;

    stage.innerHTML = '';

    storyData.forEach(function (item, index) {
      var node = document.createElement('button');
      node.type = 'button';
      node.className = 'story-node';
      node.dataset.index = index;
      node.setAttribute('aria-label', item.title);

      var bg = document.createElement('div');
      bg.className = 'node-bg';
      bg.style.backgroundImage = 'url(' + item.image + ')';

      var img = document.createElement('img');
      img.className = 'node-image';
      img.src = item.image;
      img.alt = item.title;
      img.draggable = false;
      img.loading = 'eager'; // 优先加载

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

    // 减少动画模式下直接显示所有节点
    if (prefersReducedMotion) {
      var nodes = stage.querySelectorAll('.story-node');
      nodes.forEach(function(node, i) {
        node.style.display = 'block';
        node.style.opacity = '1';
        node.style.transform = 'translate3d(-50%, -50%, 0) scale(0.9)';
        // 静态布局位置
        var angle = (i / nodes.length) * Math.PI * 2;
        var radius = 120;
        var x = Math.cos(angle) * radius;
        var y = Math.sin(angle) * radius;
        node.style.left = 'calc(50% + ' + x + 'px)';
        node.style.top = 'calc(50% + ' + y + 'px)';
      });
    } else {
      applyFlightFrame(0);
    }
  }

  // ===== 飞行动画 =====
  function startFlightAnimation() {
    if (flightFrame || prefersReducedMotion) return;

    isFlightPaused = false;
    flightBaseTime = performance.now() - flightElapsed;

    flightFrame = requestAnimationFrame(function animate(timestamp) {
      flightElapsed = timestamp - flightBaseTime;
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

  function applyFlightFrame(elapsed) {
    var stage = domCache.stage;
    if (!stage) return;

    var rect = stage.getBoundingClientRect();
    var nodes = stage.querySelectorAll('.story-node');
    var total = nodes.length;
    if (!total) return;

    var cycleIndex = Math.floor(elapsed / CONFIG.CYCLE_DURATION) % total;
    var nextIndex = (cycleIndex + 1) % total;
    var phase = elapsed % CONFIG.CYCLE_DURATION;
    var positions = getSequencePositions(rect, cycleIndex);

    updatePlane(rect, phase, positions.main, positions.planeTarget);
    updateSpine(phase / CONFIG.CYCLE_DURATION);

    nodes.forEach(function (node, index) {
      if (node.classList.contains('node-opening')) return;

      if (index !== cycleIndex && index !== nextIndex) {
        hideNode(node);
        return;
      }

      var state = index === cycleIndex
        ? getCurrentNodeState(phase, positions, elapsed)
        : getNextNodeState(phase, positions, elapsed);

      node.style.display = 'block';
      node.style.pointerEvents = state.opacity > 0.2 ? 'auto' : 'none';
      node.style.transition = '';
      node.style.transform =
        'translate3d(calc(-50% + ' + Math.round(state.x - rect.width * 0.5) + 'px), calc(-50% + ' + Math.round(state.y - rect.height * 0.5) + 'px), ' +
        Math.round(state.z) + 'px) rotateX(' + state.rotateX.toFixed(2) + 'deg) rotateY(' + state.rotateY.toFixed(2) + 'deg) ' +
        'rotateZ(' + state.rotateZ.toFixed(2) + 'deg) scale(' + state.scale.toFixed(3) + ')';
      node.style.opacity = state.opacity.toFixed(3);
      node.style.filter = 'blur(' + state.blur.toFixed(2) + 'px)';
      node.style.zIndex = state.zIndex;
      node.style.setProperty('--node-focus', state.focus.toFixed(3));
      node.style.setProperty('--node-depth', state.depth.toFixed(3));
      node.style.setProperty('--plane-wake', state.wake.toFixed(3));
    });
  }

  function hideNode(node) {
    node.style.display = 'none';
    node.style.pointerEvents = 'none';
    node.style.opacity = '0';
    node.style.filter = 'blur(3px)';
    node.style.setProperty('--node-focus', '0');
    node.style.setProperty('--node-depth', '0');
    node.style.setProperty('--plane-wake', '0');
  }

  function getCurrentNodeState(phase, positions, elapsed) {
    var out = smoothstep(CONFIG.HOLD_END, CONFIG.PROMOTE_END, phase);
    var breathe = (Math.sin(elapsed * 0.0012) + 1) * 0.003 * (1 - out);
    var x = positions.main.x - out * 18;
    var y = positions.main.y + out * 24;
    var opacity = (0.99 + Math.sin(elapsed * 0.001 + 0.4) * 0.008) * (1 - out * 0.9);

    if (phase >= CONFIG.PROMOTE_END) {
      opacity = 0;
    }

    return {
      x: x,
      y: y,
      z: 38 - out * 16,
      scale: 0.994 + breathe - out * 0.18,
      opacity: opacity,
      blur: out * 1.8,
      rotateX: -1 + out * 2,
      rotateY: -2 + out * 5,
      rotateZ: -1.4 + out * 4.2,
      zIndex: Math.round(90 - out * 30),
      focus: 0.96 - out * 0.45,
      depth: 0.88 - out * 0.28,
      wake: 0
    };
  }

  function getNextNodeState(phase, positions, elapsed) {
    var reveal = smoothstep(120, CONFIG.FLIGHT_DURATION, phase);
    var promote = smoothstep(CONFIG.HOLD_END, CONFIG.PROMOTE_END, phase);
    var settle = smoothstep(CONFIG.PROMOTE_END, CONFIG.CYCLE_DURATION, phase);
    var summoned = Math.sin(clamp(phase / CONFIG.FLIGHT_DURATION, 0, 1) * Math.PI);
    var side = positions.next.x >= positions.spawn.x ? 1 : -1;
    var leafSway = Math.sin(reveal * Math.PI * 2) * 10 * (1 - reveal);
    var x = cubicBezier(positions.spawn.x, positions.spawn.x + side * 76, positions.next.x - side * 26, positions.next.x, reveal) + leafSway;
    var y = cubicBezier(positions.spawn.y, positions.spawn.y - 46, positions.next.y + 18, positions.next.y, reveal);

    x = lerp(x, positions.main.x, promote);
    y = lerp(y, positions.main.y, promote);

    var scale = lerp(0.52, 0.68, reveal) + summoned * 0.045;
    scale = lerp(scale, 0.99, promote);
    scale = lerp(scale, 0.994, settle);

    var opacity = reveal * 0.56;
    opacity = lerp(opacity, 1, promote);

    return {
      x: x,
      y: y,
      z: lerp(8, 34, promote),
      scale: scale,
      opacity: opacity,
      blur: lerp(1.65, 0.65, reveal) * (1 - promote),
      rotateX: lerp(-3, -1, promote),
      rotateY: lerp(5, -2, promote),
      rotateZ: lerp(side * 9, side * 2.4, reveal) * (1 - promote) + lerp(side * 2.4, -1.4, promote),
      zIndex: Math.round(50 + promote * 44),
      focus: lerp(0.34, 0.96, promote) + summoned * 0.14,
      depth: lerp(0.48, 0.9, promote),
      wake: summoned * 0.82 * (1 - promote * 0.5)
    };
  }

  function updatePlane(rect, phase, mainPoint, nextPoint) {
    var plane = domCache.plane;
    var trail = domCache.trail;
    if (!plane || !trail) return;

    var travel = smoothstep(0, CONFIG.FLIGHT_DURATION, phase);
    var point = getPlanePoint(mainPoint, nextPoint, travel);
    var ahead = getPlanePoint(mainPoint, nextPoint, clamp(travel + 0.03, 0, 1));
    var angle = Math.atan2(ahead.y - point.y, ahead.x - point.x) * 180 / Math.PI;
    var glow = Math.sin(travel * Math.PI);
    var idle = phase > CONFIG.FLIGHT_DURATION ? smoothstep(CONFIG.FLIGHT_DURATION, CONFIG.CYCLE_DURATION, phase) : 0;
    var scale = 0.62 + glow * 0.16 - idle * 0.04;
    var opacity = clamp(0.42 + glow * 0.5 - idle * 0.08, 0.36, 0.95);
    var bank = Math.sin(travel * Math.PI * 1.4) * 9;
    var dx = point.x - rect.width * 0.5;
    var dy = point.y - rect.height * 0.5;

    plane.style.transform =
      'translate3d(calc(-50% + ' + Math.round(dx) + 'px), calc(-50% + ' + Math.round(dy) + 'px), 140px) ' +
      'rotate(' + (angle + 4).toFixed(2) + 'deg) rotateY(' + bank.toFixed(2) + 'deg) scale(' + scale.toFixed(3) + ')';
    plane.style.opacity = opacity.toFixed(3);
    plane.style.zIndex = 150;

    trail.style.transform =
      'translate3d(calc(-100% + ' + Math.round(dx + rect.width * 0.5) + 'px), calc(-50% + ' + Math.round(dy + rect.height * 0.5) + 'px), 0) ' +
      'rotate(' + angle.toFixed(2) + 'deg) scaleX(' + (0.46 + glow * 0.34).toFixed(3) + ')';
    trail.style.opacity = clamp(0.03 + glow * 0.32 - idle * 0.1, 0.02, 0.35).toFixed(3);
  }

  function updateSpine(progress) {
    var pulse = domCache.spinePulse;
    if (!pulse) return;

    pulse.style.strokeDashoffset = String(80 - progress * 140);
    pulse.style.opacity = String(clamp(0.18 + Math.sin(progress * Math.PI) * 0.46, 0.18, 0.64));
  }

  function getSequencePositions(rect, index) {
    var side = index % 2 === 0 ? 1 : -1;
    var nextX = 0.5 + side * (0.2 + (index % 3) * 0.018);
    var nextY = 0.32 + (index % 2) * 0.035;
    var clampedNextX = clamp(nextX, 0.24, 0.76);
    return {
      main: {
        x: rect.width * 0.5,
        y: rect.height * 0.58
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
        x: rect.width * (0.5 + side * 0.05),
        y: rect.height * 0.5
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
      var nodes = stage.querySelectorAll('.story-node');
      nodes.forEach(function (currentNode) {
        if (currentNode !== node) currentNode.classList.add('node-dimmed');
      });
    }

    node.classList.add('node-opening');
    node.style.transition =
      'transform ' + CONFIG.OPENING_DURATION + 'ms cubic-bezier(0.2, 0.85, 0.16, 1), ' +
      'opacity ' + CONFIG.OPENING_DURATION + 'ms ease, filter ' + CONFIG.OPENING_DURATION + 'ms ease, box-shadow ' + CONFIG.OPENING_DURATION + 'ms ease';
    node.style.transform = 'translate3d(-50%, -50%, 180px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1.42)';
    node.style.opacity = '1';
    node.style.filter = 'blur(0px)';
    node.style.zIndex = 220;

    pendingDetailTimer = setTimeout(function () {
      populateDetail(item);
      if (domCache.mainScene) domCache.mainScene.style.display = 'none';
      if (domCache.detailScene) domCache.detailScene.style.display = 'flex';
      resetNodeOpeningState();
    }, CONFIG.OPENING_DURATION);
  }

  function resetNodeOpeningState() {
    var stage = domCache.stage;
    if (!stage) return;
    var nodes = stage.querySelectorAll('.story-node');
    nodes.forEach(function (node) {
      node.classList.remove('node-opening', 'node-dimmed');
      node.style.transition = '';
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
    if (domCache.detailImage) {
      domCache.detailImage.src = item.image;
      domCache.detailImage.alt = item.title;
    }
    if (domCache.detailTitle) domCache.detailTitle.textContent = item.title;
    if (domCache.detailDate) domCache.detailDate.textContent = item.date;
    if (domCache.detailStory) domCache.detailStory.textContent = item.story;
    if (domCache.detailBg) domCache.detailBg.style.backgroundImage = 'url(' + item.image + ')';
  }

  function closeDetail() {
    if (pendingDetailTimer) {
      clearTimeout(pendingDetailTimer);
      pendingDetailTimer = null;
    }

    if (domCache.detailScene) domCache.detailScene.style.display = 'none';
    if (domCache.mainScene) domCache.mainScene.style.display = 'block';

    isOpeningDetail = false;
    resetNodeOpeningState();
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
    if (preloadTimeoutTimer) clearTimeout(preloadTimeoutTimer);

    // 停止动画
    if (flightFrame) cancelAnimationFrame(flightFrame);

    // 停止音乐
    if (audioElement) {
      audioElement.pause();
      audioElement = null;
    }
  }

  // ===== 数学工具函数 =====
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(edge0, edge1, value) {
    var x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return x * x * (3 - 2 * x);
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
