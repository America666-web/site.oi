/* ==========================================================================
   SiteMarket — auth.js (полный, с ролью author)
   ========================================================================== */

const SM_ADMIN_L = atob('Zm9ydHRlcg==');
const SM_ADMIN_P = atob('NDIwNQ==');

function smApplyProtection() {
  const s = smGetSession();
  if (!s || s.role === 'user' || s.role === 'author') {
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('keydown', function (e) {
      const k = e.key.toUpperCase();
      const blocked =
        k === 'F12' ||
        (e.ctrlKey && e.shiftKey && (k === 'I' || k === 'J' || k === 'C')) ||
        (e.ctrlKey && k === 'U') ||
        (e.ctrlKey && k === 'S');
      if (blocked) e.preventDefault();
    });
    document.addEventListener('dragstart', function (e) {
      if (e.target && e.target.tagName === 'IMG') e.preventDefault();
    });
  }
}

function smHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return 'h' + Math.abs(h).toString(36) + btoa(unescape(encodeURIComponent(str))).slice(0, 6);
}

function smRegister(name, email, password) {
  name = name.trim();
  email = email.trim();
  if (!name || !email || !password) {
    return { ok: false, error: 'Заполните все поля.' };
  }
  if (password.length < 4) {
    return { ok: false, error: 'Пароль должен быть не короче 4 символов.' };
  }
  if (email.toLowerCase() === SM_ADMIN_L) {
    return { ok: false, error: 'Этот логин зарезервирован.' };
  }
  if (smFindUserByEmail(email)) {
    return { ok: false, error: 'Пользователь с таким email уже зарегистрирован.' };
  }
  const user = smAddUser({
    name: name,
    email: email,
    passHash: smHash(password),
    purchases: [],
    createdAt: Date.now(),
    role: 'user'
  });
  return { ok: true, uid: user.uid };
}

function smAdminCreateUser(name, email, password, role, permissions) {
  name = name.trim();
  email = email.trim();
  role = (role === 'admin') ? 'admin' : 'user';
  if (role === 'admin' && !permissions) permissions = [];
  if (!name || !email || !password) {
    return { ok: false, error: 'Заполните все поля.' };
  }
  if (password.length < 4) {
    return { ok: false, error: 'Пароль должен быть не короче 4 символов.' };
  }
  if (email.toLowerCase() === SM_ADMIN_L) {
    return { ok: false, error: 'Этот логин зарезервирован.' };
  }
  if (smFindUserByEmail(email)) {
    return { ok: false, error: 'Пользователь с таким email уже существует.' };
  }
  const user = smAddUser({
    name: name,
    email: email,
    passHash: smHash(password),
    purchases: [],
    createdAt: Date.now(),
    role: role,
    permissions: role === 'admin' ? permissions : undefined
  });
  return { ok: true, uid: user.uid };
}

function smLogin(login, password) {
  login = (login || '').trim();
  const lockedFor = smIsLocked(login);
  if (lockedFor > 0) {
    return { ok: false, error: 'Слишком много попыток. Повторите через ' + lockedFor + ' сек.' };
  }
  if (login.toLowerCase() === SM_ADMIN_L && password === SM_ADMIN_P) {
    smClearFailedAttempts(login);
    smSetSession({ role: 'owner', uid: 0, name: 'Owner', email: SM_ADMIN_L });
    return { ok: true, role: 'owner' };
  }
  const user = smFindUserByEmail(login);
  if (!user || user.passHash !== smHash(password)) {
    smRegisterFailedAttempt(login);
    return { ok: false, error: 'Неверный логин или пароль.' };
  }
  if (user.banned) {
    let message = 'Ваш аккаунт заблокирован.';
    if (user.banReason) {
      message += ' Причина: ' + user.banReason;
    }
    if (user.banExpires) {
      const remaining = Math.ceil((user.banExpires - Date.now()) / (1000 * 60 * 60 * 24));
      if (remaining > 0) {
        message += ' Блокировка снимется через ' + remaining + ' дн.';
      } else {
        smSetBanned(login, false);
        return smLogin(login, password);
      }
    } else {
      message += ' Блокировка бессрочная.';
    }
    return { ok: false, error: message };
  }
  smClearFailedAttempts(login);
  const role = user.role || 'user';
  const permissions = (role === 'owner') ? SM_ALL_PERMISSIONS.slice() : (user.permissions || []);
  smSetSession({ role: role, uid: user.uid, name: user.name, email: user.email, permissions: permissions });
  return { ok: true, role: role };
}

function smLogout() {
  smClearSession();
  window.location.href = 'index.html';
}

function smRequireRole(requiredRole) {
  const s = smGetSession();
  if (!s) {
    window.location.href = 'login.html';
    return null;
  }
  const roleHierarchy = { 'owner': 4, 'admin': 3, 'author': 2, 'user': 1 };
  if ((roleHierarchy[s.role] || 0) < (roleHierarchy[requiredRole] || 0)) {
    window.location.href = 'login.html';
    return null;
  }
  if (s.role !== 'owner') {
    const user = smFindUserByEmail(s.email);
    if (!user || user.banned) {
      smClearSession();
      window.location.href = 'login.html';
      return null;
    }
  }
  return s;
}

function smCanPerform(action) {
  const s = smGetSession();
  if (!s) return false;
  if (s.role === 'owner') return true;
  if (s.role === 'admin') {
    return (s.permissions && s.permissions.includes(action)) || false;
  }
  if (s.role === 'author') {
    return action === 'add_listings';
  }
  return false;
}

function smChangePasswordAny(email, oldPassword, newPassword) {
  if (email.toLowerCase() === SM_ADMIN_L) {
    if (oldPassword !== SM_ADMIN_P) {
      return { ok: false, error: 'Текущий пароль указан неверно.' };
    }
    if (!newPassword || newPassword.length < 4) {
      return { ok: false, error: 'Новый пароль должен быть не короче 4 символов.' };
    }
    return { ok: false, error: 'Пароль встроенного владельца нельзя изменить.' };
  }
  const user = smFindUserByEmail(email);
  if (!user || user.passHash !== smHash(oldPassword)) {
    return { ok: false, error: 'Текущий пароль указан неверно.' };
  }
  if (!newPassword || newPassword.length < 4) {
    return { ok: false, error: 'Новый пароль должен быть не короче 4 символов.' };
  }
  smUpdateUser(email, { passHash: smHash(newPassword) });
  return { ok: true };
}

function smUpdateProfileInfo(email, name, avatarUrl) {
  const patch = {};
  if (name && name.trim()) patch.name = name.trim();
  if (avatarUrl !== undefined) patch.avatarUrl = avatarUrl;
  smUpdateUser(email, patch);
  const s = smGetSession();
  if (s && s.email.toLowerCase() === email.toLowerCase()) {
    if (patch.name) s.name = patch.name;
    smSetSession(s);
  }
  return { ok: true };
}

function smChangePassword(email, oldPassword, newPassword) {
  const user = smFindUserByEmail(email);
  if (!user || user.passHash !== smHash(oldPassword)) {
    return { ok: false, error: 'Текущий пароль указан неверно.' };
  }
  if (!newPassword || newPassword.length < 4) {
    return { ok: false, error: 'Новый пароль должен быть не короче 4 символов.' };
  }
  smUpdateUser(email, { passHash: smHash(newPassword) });
  return { ok: true };
}

document.addEventListener('DOMContentLoaded', function() {
  smApplyProtection();
});