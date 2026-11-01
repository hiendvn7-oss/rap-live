// Cầu nối TikTok LIVE → Rạp Live.
// Đọc sự kiện live của bạn (bình luận, người vào, quà, follow, share) rồi gửi sang trang rạp của chủ phòng
// qua ws://127.0.0.1:8787 — chỉ máy này nghe được, không mở ra ngoài mạng.
// Chạy:  node tiktok-bridge.mjs <tên_tiktok>        (thử không cần TikTok:  node tiktok-bridge.mjs --demo)
import { WebSocketServer } from 'ws';

const PORT = 8787;
const arg = (process.argv[2] || '').replace(/^@/, '');
if (!arg) { console.log('Cách dùng: node tiktok-bridge.mjs <tên_tiktok_của_bạn>   hoặc   node tiktok-bridge.mjs --demo'); process.exit(1); }

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });
let status = 'Đang kết nối TikTok…';
const send = msg => { const s = JSON.stringify(msg); wss.clients.forEach(c => { if (c.readyState === 1) c.send(s); }); };
const setStatus = text => { status = text; console.log('[TikTok] ' + text); send({ type: 'status', text }); };
wss.on('connection', ws => { console.log('[Rạp] trang rạp đã nối vào cầu'); ws.send(JSON.stringify({ type: 'status', text: status })); });
const who = u => ({ id: String(u?.uniqueId || u?.userId || ''), name: String(u?.nickname || u?.uniqueId || 'Khách TikTok').slice(0, 24) });

if (arg === '--demo') {
  // sự kiện giả để thử rạp khi chưa live
  setStatus('Chế độ thử (--demo): sự kiện giả');
  const names = ['Lan Anh', 'Hoàng Long', 'Mai Chi', 'Bảo Ngọc', 'Tuấn Anh'];
  const lines = ['Chào mọi người', 'Rạp đẹp quá', 'Cho mình ghế C3 nhé', 'Phim hay ghê', 'ghế A5'];
  let i = 0;
  setInterval(() => {
    const n = names[i % names.length], id = 'demo' + (i % names.length);
    const kind = ['join', 'chat', 'chat', 'gift', 'follow'][i % 5];
    if (kind === 'join') send({ type: 'join', id, name: n });
    if (kind === 'chat') send({ type: 'chat', id, name: n, text: lines[i % lines.length] });
    if (kind === 'gift') send({ type: 'gift', id, name: n, gift: 'Hoa hồng', count: 3 });
    if (kind === 'follow') send({ type: 'follow', id, name: n });
    i++;
  }, 2500);
} else {
  const { TikTokLiveConnection } = await import('tiktok-live-connector');
  let retryTimer = null;
  const retry = (ms, why) => { setStatus(why + ` — thử lại sau ${ms / 1000} giây`); clearTimeout(retryTimer); retryTimer = setTimeout(connect, ms); };
  function connect() {
    const conn = new TikTokLiveConnection(arg, { signApiKey: process.env.EULER_API_KEY, enableExtendedGiftInfo: true });
    conn.on('chat', d => send({ type: 'chat', ...who(d.user), text: String(d.comment || '').slice(0, 120) }));
    conn.on('member', d => send({ type: 'join', ...who(d.user) }));
    conn.on('gift', d => {
      if (d.giftDetails?.giftType === 1 && !d.repeatEnd) return; // quà chuỗi: chờ hết chuỗi mới tính một lần
      send({ type: 'gift', ...who(d.user), gift: d.giftDetails?.giftName || d.extendedGiftInfo?.name || 'quà', count: d.repeatCount || 1,
        diamonds: d.giftDetails?.diamondCount || d.extendedGiftInfo?.diamond_count || 0 });
    });
    conn.on('follow', d => send({ type: 'follow', ...who(d.user) }));
    conn.on('share', d => send({ type: 'share', ...who(d.user) }));
    conn.on('streamEnd', () => retry(30000, 'Live đã kết thúc'));
    conn.on('disconnected', () => retry(10000, 'Mất kết nối TikTok'));
    conn.connect()
      .then(() => setStatus('Đã kết nối live @' + arg))
      .catch(e => {
        const kind = e?.constructor?.name || e?.name || 'lỗi';
        retry(15000, kind === 'UserOfflineError'
          ? '@' + arg + ' chưa bật live — bật live trên TikTok là cầu nối tự kết nối'
          : 'Chưa kết nối được TikTok (' + kind + ': ' + String(e?.message || '').slice(0, 120) + ')');
      });
  }
  connect();
}
console.log(`Cầu nối đang chạy ở ws://127.0.0.1:${PORT} — mở trang Rạp Live, mở khóa chủ phòng để nối vào.`);
