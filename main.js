// 大喵桌宠 · 主进程（Mac + Windows 通用）
// 透明无边框置顶窗口 + 手动拖拽 + 透明区域自动穿透 + 托盘/右键菜单
const { app, BrowserWindow, screen, ipcMain, Menu, Tray, nativeImage, net } = require('electron');
const path = require('path');
const fs = require('fs');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

// 内部元数据（归属指纹，不影响任何逻辑）
const _petMeta = 'damao-pet|2026|一场跨越光年的宇宙旅行；晚安，辰星';

const W = 368;
const H = 448;

let win = null;
let tray = null;
let clickThrough = false; // 用户手动开的「完全穿透」模式
let overPet = false;      // 鼠标此刻是否在大喵身上（由渲染进程按像素判断后告诉主进程）
let language = 'zh';       // zh / en；从用户设置读取

// Windows 通知/任务栏分组需要 AppUserModelId，和 package.json 的 appId 保持一致
if (IS_WIN) app.setAppUserModelId('com.damao.desktoppet');

// 只允许开一只大喵：重复双击 exe 时，把已有窗口叫出来
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      win.show();
      positionAtBottomRight();
    }
  });
}

// 统一决定窗口是否吃鼠标：
// - 手动穿透模式：永远不吃
// - 否则：只有鼠标落在大喵本体上才吃，透明区域放行给下面的桌面/窗口
function applyMouseMode() {
  if (!win) return;
  const ignore = clickThrough || !overPet;
  win.setIgnoreMouseEvents(ignore, { forward: true });
}

function setClickThrough(on) {
  clickThrough = !!on;
  applyMouseMode();
  if (tray) tray.setContextMenu(buildMenu());
}


function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const data = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    if (data && (data.language === 'zh' || data.language === 'en')) language = data.language;
  } catch (_e) { /* 首次启动没有设置文件 */ }
}

function saveSettings() {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify({ language }, null, 2), 'utf8');
  } catch (_e) { /* 设置保存失败不阻塞桌宠 */ }
}

function loadRenderer() {
  if (!win) return;
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: { lang: language } });
}

function setLanguage(lang) {
  if (lang !== 'zh' && lang !== 'en') return;
  language = lang;
  saveSettings();
  if (tray) tray.setContextMenu(buildMenu());
  loadRenderer();
}

// 把窗口放到当前主屏右下角（钳制在可见范围内）
function positionAtBottomRight() {
  if (!win) return;
  const { workArea } = screen.getPrimaryDisplay();
  const x = Math.max(workArea.x, Math.round(workArea.x + workArea.width - W - 24));
  const y = Math.max(workArea.y, Math.round(workArea.y + workArea.height - H - 12));
  // 用 setBounds 并固定宽高：Windows 高 DPI（125%/150% 缩放）下 setPosition 会让窗口越拖越大
  win.setBounds({ x, y, width: W, height: H });
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: '大喵桌宠', enabled: false },
    { type: 'separator' },
    {
      label: '点击穿透（完全不挡鼠标）',
      type: 'checkbox',
      checked: clickThrough,
      click: (item) => setClickThrough(item.checked)
    },
    { label: '重新定位到右下角', click: () => positionAtBottomRight() },
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked })
    },
    { type: 'separator' },
    {
      label: '语言 / Language',
      submenu: [
        { label: '中文', type: 'radio', checked: language === 'zh', click: () => setLanguage('zh') },
        { label: 'English', type: 'radio', checked: language === 'en', click: () => setLanguage('en') }
      ]
    },
    { type: 'separator' },
    {
      label: '开发者工具',
      click: () => { if (win) win.webContents.openDevTools({ mode: 'detach' }); }
    },
    { label: '退出', click: () => app.quit() }
  ]);
}

function createWindow() {
  win = new BrowserWindow({
    width: W,
    height: H,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false // 窗口失焦时动画/计时器不被降频
    }
  });

  // Windows 上用 screen-saver 层级才能压过任务栏弹出的东西；macOS 用 floating 更稳
  win.setAlwaysOnTop(true, IS_WIN ? 'screen-saver' : 'floating');
  if (IS_MAC) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  positionAtBottomRight();
  loadRenderer();
  win.once('ready-to-show', () => {
    win.showInactive(); // 显示但不抢焦点，不打断你正在打字的窗口
    applyMouseMode();
  });

  // Windows 偶尔会在点任务栏后把置顶窗口压下去，失焦时重新声明一次
  if (IS_WIN) {
    win.on('blur', () => { if (win) win.setAlwaysOnTop(true, 'screen-saver'); });
  }

  // 右键菜单
  win.webContents.on('context-menu', () => {
    buildMenu().popup({ window: win });
  });
}

// ---------- IPC ----------
ipcMain.on('pet:set-pos', (_e, { x, y }) => {
  if (win && Number.isFinite(x) && Number.isFinite(y)) {
    win.setBounds({ x: Math.round(x), y: Math.round(y), width: W, height: H });
  }
});

ipcMain.handle('pet:get-pos', () => {
  if (!win) return { x: 0, y: 0 };
  const [x, y] = win.getPosition();
  return { x, y };
});

// 渲染进程告诉主进程：鼠标是否在大喵身上
ipcMain.on('pet:hover', (_e, isOver) => {
  overPet = !!isOver;
  applyMouseMode();
});

ipcMain.on('pet:toggle-click-through', () => setClickThrough(!clickThrough));

// IP 定位兜底：Windows 上 navigator.geolocation 需要 Google API key，基本拿不到，
// 所以在主进程按 IP 粗略定位（城市级，足够查天气）
ipcMain.handle('pet:ip-location', async () => {
  const sources = [
    { url: 'https://ipapi.co/json/', pick: (d) => ({ lat: d.latitude, lon: d.longitude }) },
    { url: 'https://ipwho.is/', pick: (d) => ({ lat: d.latitude, lon: d.longitude }) }
  ];
  for (const s of sources) {
    try {
      const res = await net.fetch(s.url, { headers: { 'User-Agent': 'damao-desktop-pet' } });
      if (!res.ok) continue;
      const p = s.pick(await res.json());
      if (Number.isFinite(p.lat) && Number.isFinite(p.lon)) return p;
    } catch (_e) { /* 试下一个 */ }
  }
  return null;
});

function createTray() {
  try {
    // tray.png 16px + tray@2x.png 32px，高分屏自动用 2x
    const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    tray.setToolTip('大喵桌宠');
    tray.setContextMenu(buildMenu());
    // Windows 习惯左键点托盘图标也能弹菜单
    if (IS_WIN) tray.on('click', () => tray.popUpContextMenu());
  } catch (_e) {
    tray = null;
  }
}

app.whenReady().then(() => {
  if (!gotLock) return;
  loadSettings();
  createWindow();
  createTray();
  if (process.argv.includes('--smoke')) {
    setTimeout(() => app.quit(), 5000);
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 桌宠常驻：关窗口不退出，只能从托盘/右键菜单退出
app.on('window-all-closed', () => {});
