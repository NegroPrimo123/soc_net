// GoSocial Client-side Application Logic v8.0 (Cozy Modern Edition)

document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initComposer();
    formatAllPostContents();
    initSSE();
    initFeedInfiniteScroll();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'login') openAuthModal('login');
    if (urlParams.get('auth') === 'register') openAuthModal('register');

    // Routing by view/user
    const viewParam = urlParams.get('view');
    const userParam = urlParams.get('user');
    const sendGiftParam = urlParams.get('send_gift');
    const giftDetailParam = urlParams.get('gift_detail');

    if (viewParam === 'showcase') {
        navigateTo('showcase');
    } else if (viewParam === 'messages') {
        navigateTo('messages');
        const chatWith = urlParams.get('chat_with');
        if (chatWith) {
            setTimeout(() => openChatWithUser(parseInt(chatWith, 10)), 300);
        } else {
            setTimeout(() => {
                const firstItem = document.querySelector('.conversation-item');
                if (firstItem && firstItem.dataset.userId) {
                    firstItem.click();
                }
            }, 300);
        }
    } else if (userParam || viewParam === 'profile') {
        const uid = parseInt(userParam || window.CURRENT_USER_ID, 10);
        navigateTo('profile', uid);
    }

    if (sendGiftParam) {
        openSendGiftModal(parseInt(sendGiftParam, 10), 'Пользователь', 'user');
    } else if (giftDetailParam) {
        openGiftDetailById(parseInt(giftDetailParam, 10));
    }

    // Close modals on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAuthModal();
            closeSendGiftModal();
            closeGiftDetailModal();
            closeEditProfileModal();
            closeNotificationsPanel();
        }
    });

    // Update unread badges periodically
    updateUnreadNotifsBadges();
    updateUnreadMessagesCountBadge();
});

// ==========================================
// CLOCK
// ==========================================
function initClock() {
    const el = document.getElementById('telemetryClock');
    if (!el) return;
    const update = () => {
        const now = new Date();
        const timeStr = now.toTimeString().split(' ')[0];
        el.textContent = `GoSocial • ${timeStr}`;
    };
    update();
    setInterval(update, 1000);
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✓' : '✕';
    toast.innerHTML = `<span style="font-weight: bold; color: ${type==='success'?'#10b981':'#f43f5e'};">${icon}</span><span>${escapeHtml(message)}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-8px)';
        setTimeout(() => toast.remove(), 250);
    }, 3200);
}

// ==========================================
// AUTHENTICATION MODALS & ACTIONS
// ==========================================
function openAuthModal(tab = 'login') {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    modal.style.display = 'flex';
    switchAuthTab(tab);
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.style.display = 'none';
}

function switchAuthTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabLoginBtn = document.getElementById('tabLoginBtn');
    const tabRegisterBtn = document.getElementById('tabRegisterBtn');

    if (tab === 'login') {
        loginForm.style.display = 'flex';
        loginForm.style.flexDirection = 'column';
        registerForm.style.display = 'none';
        tabLoginBtn.classList.add('active');
        tabRegisterBtn.classList.remove('active');
        const userInp = document.getElementById('loginUsername');
        if (userInp) userInp.focus();
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'flex';
        registerForm.style.flexDirection = 'column';
        tabLoginBtn.classList.remove('active');
        tabRegisterBtn.classList.add('active');
        const regInp = document.getElementById('regUsername');
        if (regInp) regInp.focus();
    }
}

async function fillAndLogin(username, password) {
    document.getElementById('loginUsername').value = username;
    document.getElementById('loginPassword').value = password;
    await submitLogin(username, password);
}

async function quickLoginAs(username) {
    await fillAndLogin(username, 'password123');
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    await submitLogin(username, password);
}

async function submitLogin(username, password) {
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Ошибка авторизации');
        }

        showToast(`Добро пожаловать, ${data.user.display_name}! 🌟`, 'success');
        closeAuthModal();
        setTimeout(() => {
            window.location.reload();
        }, 300);
    } catch (err) {
        showToast(err.message === 'Failed to fetch' ? 'Ошибка связи с сервером!' : err.message, 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('regUsername').value.trim();
    const displayName = document.getElementById('regDisplayName').value.trim();
    const password = document.getElementById('regPassword').value.trim();
    const bio = document.getElementById('regBio').value.trim();
    const avatarUrl = document.getElementById('regAvatar').value.trim();

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username,
                display_name: displayName,
                password: password,
                bio: bio,
                avatar_url: avatarUrl
            })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Ошибка регистрации');
        }

        showToast('Аккаунт успешно создан! Авторизация...', 'success');
        closeAuthModal();
        setTimeout(() => {
            window.location.reload();
        }, 300);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        showToast('Сессия завершена', 'success');
        setTimeout(() => {
            window.location.href = '/';
        }, 300);
    } catch (err) {
        window.location.reload();
    }
}

// ==========================================
// COMPOSER & FILE UPLOAD FROM DISK
// ==========================================
let currentUploadedFileUrl = '';

function initComposer() {
    const textarea = document.getElementById('postContent');
    if (!textarea) return;

    textarea.addEventListener('input', () => {
        handleComposerInput();
    });

    // Drag-and-drop файлов на карточку композитора
    const card = document.getElementById('composerCard');
    if (card) {
        ['dragenter', 'dragover'].forEach(eventName => {
            card.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                card.style.borderColor = '#e26d5c';
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            card.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                card.style.borderColor = '';
            }, false);
        });

        card.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                uploadSingleFile(files[0]);
            }
        });
    }

    // Вставка из буфера обмена (Ctrl+V скриншота)
    document.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                if (blob) {
                    expandComposer();
                    uploadSingleFile(blob);
                }
            }
        }
    });
}

function handleComposerInput() {
    const textarea = document.getElementById('postContent');
    const charCount = document.getElementById('charCount');
    if (!textarea || !charCount) return;

    charCount.textContent = `${textarea.value.length} / 500`;
    if (textarea.value.length > 500) {
        charCount.style.color = '#f43f5e';
    } else {
        charCount.style.color = '#94a3b8';
    }
}

function expandComposer() {
    const drawer = document.getElementById('composerDrawer');
    if (drawer) drawer.style.display = 'block';
    const textarea = document.getElementById('postContent');
    if (textarea && textarea.rows < 3) textarea.rows = 3;
}

function focusMainComposer() {
    navigateTo('feed');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const textarea = document.getElementById('postContent');
    if (textarea) {
        expandComposer();
        textarea.focus();
    }
}

function toggleImageBox() {
    const box = document.getElementById('composerImageBox');
    if (!box) return;
    box.style.display = (box.style.display === 'none') ? 'block' : 'none';
}

function updateImagePreview() {
    const input = document.getElementById('postImageUrl');
    if (!input) return;
    const url = input.value.trim();
    if (url) {
        currentUploadedFileUrl = url;
    }
}

async function handleComposerFileUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    await uploadSingleFile(file);
    e.target.value = '';
}

async function uploadSingleFile(file) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Пожалуйста, войдите в аккаунт для загрузки файлов 🔐', 'error');
        openAuthModal('login');
        return;
    }

    if (file.size > 30 * 1024 * 1024) {
        showToast('Размер файла не должен превышать 30 МБ', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    showToast('Загрузка файла с диска...', 'success');

    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Ошибка загрузки файла');
        }

        const data = await res.json();
        currentUploadedFileUrl = data.url;

        const previewBox = document.getElementById('composerUploadPreview');
        const previewImg = document.getElementById('composerPreviewImg');
        const previewName = document.getElementById('composerPreviewName');
        const previewSize = document.getElementById('composerPreviewSize');

        if (previewBox && previewName && previewSize) {
            previewName.textContent = data.filename;
            previewSize.textContent = formatBytes(data.size);
            if (data.is_image && previewImg) {
                previewImg.src = data.url;
                previewImg.style.display = 'block';
            } else if (previewImg) {
                previewImg.style.display = 'none';
            }
            previewBox.style.display = 'block';
        }

        expandComposer();
        showToast('Файл успешно прикреплен с диска! 📎', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function clearComposerFile() {
    currentUploadedFileUrl = '';
    const fileInput = document.getElementById('composerFileInput');
    if (fileInput) fileInput.value = '';
    const urlInput = document.getElementById('postImageUrl');
    if (urlInput) urlInput.value = '';
    const previewBox = document.getElementById('composerUploadPreview');
    if (previewBox) previewBox.style.display = 'none';
}

function insertTag(tag) {
    const textarea = document.getElementById('postContent');
    if (!textarea) return;
    expandComposer();
    const cur = textarea.value.trim();
    textarea.value = cur ? `${cur} ${tag}` : tag;
    handleComposerInput();
    textarea.focus();
}

async function createPost() {
    if (!window.IS_AUTHENTICATED) {
        showToast('Пожалуйста, войдите в аккаунт для публикации 🔐', 'error');
        openAuthModal('login');
        return;
    }

    const textarea = document.getElementById('postContent');
    let content = textarea.value.trim();
    const urlInput = document.getElementById('postImageUrl');
    const imageUrl = currentUploadedFileUrl || (urlInput ? urlInput.value.trim() : '');

    // Если в тексте поста указан только URL изображения, очищаем текст, чтобы не дублировать
    if (imageUrl && content === imageUrl) {
        content = '';
    }

    if (!content && !imageUrl) {
        showToast('Введите текст публикации или прикрепите файл', 'error');
        return;
    }

    if (content.length > 500) {
        showToast('Длина текста превышает 500 символов', 'error');
        return;
    }

    try {
        const response = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.CURRENT_USER_ID,
                content: content,
                image_url: imageUrl
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Ошибка при публикации');
        }

        const post = await response.json();
        textarea.value = '';
        handleComposerInput();
        clearComposerFile();
        const imageBox = document.getElementById('composerImageBox');
        if (imageBox) imageBox.style.display = 'none';

        renderPostAtTop(post);

        const emptyNotice = document.querySelector('.cyber-empty-card');
        if (emptyNotice) emptyNotice.remove();

        showToast('Публикация успешно размещена! 🌟', 'success');
    } catch (err) {
        showToast(err.message === 'Failed to fetch' ? 'Ошибка связи с сервером Go!' : err.message, 'error');
    }
}

// ==========================================

// ==========================================
// МОДАЛЬНОЕ ОКНО РЕДАКТИРОВАНИЯ ПОСТА И ФОТО
// ==========================================
function openEditPostModal(postId, clickedBtn) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите в аккаунт для редактирования', 'error');
        openAuthModal('login');
        return;
    }
    closeAllPostDropdowns();

    let postEl = null;
    if (clickedBtn && clickedBtn.closest) {
        postEl = clickedBtn.closest('.post-card');
    }
    if (!postEl) {
        const allCards = document.querySelectorAll(`[id="post-${postId}"]`);
        for (const card of allCards) {
            const vp = card.closest('.view-panel');
            if (vp && vp.style.display !== 'none') {
                postEl = card;
                break;
            }
        }
        if (!postEl && allCards.length > 0) postEl = allCards[0];
    }
    if (!postEl) return;

    const contentEl = postEl.querySelector('.post-content');
    let text = contentEl ? contentEl.innerText.trim() : '';

    const imgEl = postEl.querySelector('.post-media img');
    let imgSrc = imgEl ? (imgEl.getAttribute('src') || '').trim() : '';

    const modal = document.getElementById('editPostModal');
    const idInput = document.getElementById('editPostId');
    const contentInput = document.getElementById('editPostContentInput');
    const imgUrlInput = document.getElementById('editPostImageUrl');
    const previewWrap = document.getElementById('editPostPhotoPreviewWrap');
    const photoImg = document.getElementById('editPostPhotoImg');
    const btnLabel = document.getElementById('btnEditPhotoLabel');
    const statusText = document.getElementById('editPhotoStatus');

    if (idInput) idInput.value = postId;
    if (contentInput) contentInput.value = text;
    if (imgUrlInput) imgUrlInput.value = imgSrc;
    if (statusText) statusText.textContent = '';

    if (imgSrc) {
        if (photoImg) photoImg.src = imgSrc;
        if (previewWrap) previewWrap.style.display = 'block';
        if (btnLabel) btnLabel.textContent = 'Заменить фото';
    } else {
        if (photoImg) photoImg.src = '';
        if (previewWrap) previewWrap.style.display = 'none';
        if (btnLabel) btnLabel.textContent = 'Прикрепить фото';
    }

    if (modal) modal.style.display = 'flex';
}

function openEditPost(postId) {
    openEditPostModal(postId);
}

function closeEditPostModal() {
    const modal = document.getElementById('editPostModal');
    if (modal) modal.style.display = 'none';
}

function removeEditPostPhoto() {
    const imgUrlInput = document.getElementById('editPostImageUrl');
    const previewWrap = document.getElementById('editPostPhotoPreviewWrap');
    const photoImg = document.getElementById('editPostPhotoImg');
    const btnLabel = document.getElementById('btnEditPhotoLabel');
    const statusText = document.getElementById('editPhotoStatus');

    if (imgUrlInput) imgUrlInput.value = '';
    if (photoImg) photoImg.src = '';
    if (previewWrap) previewWrap.style.display = 'none';
    if (btnLabel) btnLabel.textContent = 'Прикрепить фото';
    if (statusText) statusText.textContent = 'Фото удалено';
}

async function handleEditPostPhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const statusText = document.getElementById('editPhotoStatus');
    if (statusText) statusText.textContent = 'Загрузка фото...';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Ошибка загрузки фото');
        }
        const data = await res.json();
        const url = data.url;

        const imgUrlInput = document.getElementById('editPostImageUrl');
        const previewWrap = document.getElementById('editPostPhotoPreviewWrap');
        const photoImg = document.getElementById('editPostPhotoImg');
        const btnLabel = document.getElementById('btnEditPhotoLabel');

        if (imgUrlInput) imgUrlInput.value = url;
        if (photoImg) photoImg.src = url;
        if (previewWrap) previewWrap.style.display = 'block';
        if (btnLabel) btnLabel.textContent = 'Заменить фото';
        if (statusText) statusText.textContent = 'Фото готово к сохранению';
    } catch (err) {
        if (statusText) statusText.textContent = '';
        showToast(err.message, 'error');
    }
}

async function saveEditedPostModal() {
    const idInput = document.getElementById('editPostId');
    const contentInput = document.getElementById('editPostContentInput');
    const imgUrlInput = document.getElementById('editPostImageUrl');
    const saveBtn = document.getElementById('btnSaveEditedPost');

    if (!idInput || !idInput.value) return;
    const postId = parseInt(idInput.value);
    const content = contentInput ? contentInput.value.trim() : '';
    const imageUrl = imgUrlInput ? imgUrlInput.value.trim() : '';

    if (!content && !imageUrl) {
        showToast('Публикация не может быть полностью пустой', 'error');
        return;
    }

    if (saveBtn) saveBtn.disabled = true;

    try {
        const payload = {
            content: content,
            image_url: imageUrl
        };

        const res = await fetch(`/api/posts/${postId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Ошибка сохранения публикации');
        }

        const post = await res.json();

        // Обновляем текст и медиа во ВСЕХ карточках этого поста на странице (в ленте и в профиле)
        const allCards = document.querySelectorAll(`[id="post-${postId}"]`);
        allCards.forEach(postCard => {
            const contentEl = postCard.querySelector('.post-content');
            if (contentEl) {
                contentEl.innerHTML = formatHashtags(post.content);
                contentEl.style.display = post.content ? 'block' : 'none';
            }

            let mediaBox = postCard.querySelector('.post-media');
            if (imageUrl) {
                if (mediaBox) {
                    const img = mediaBox.querySelector('img');
                    if (img) img.src = imageUrl;
                } else {
                    mediaBox = document.createElement('div');
                    mediaBox.className = 'post-media';
                    mediaBox.id = `post-media-${postId}`;
                    mediaBox.innerHTML = `<img src="${escapeHtml(imageUrl)}" alt="Медиа" loading="lazy">`;
                    const actionsBar = postCard.querySelector('.post-actions-bar');
                    if (actionsBar) {
                        postCard.insertBefore(mediaBox, actionsBar);
                    } else {
                        postCard.appendChild(mediaBox);
                    }
                }
            } else if (mediaBox) {
                mediaBox.remove();
            }

            const metaLine = postCard.querySelector('.meta-line');
            if (metaLine && !metaLine.querySelector('.edited-badge')) {
                const badge = document.createElement('span');
                badge.className = 'edited-badge';
                badge.textContent = '• (ред.)';
                metaLine.appendChild(badge);
            }
        });

        closeEditPostModal();
        showToast('Публикация обновлена', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

// ==========================================
// МОДАЛЬНОЕ ОКНО «ПОДЕЛИТЬСЯ ПУБЛИКАЦИЕЙ»
// ==========================================
function openSharePostModal(postId) {
    closeAllPostDropdowns();
    const modal = document.getElementById('sharePostModal');
    const idInput = document.getElementById('sharePostId');
    const urlInput = document.getElementById('sharePostUrlInput');
    const dialogsList = document.getElementById('shareRecentDialogsList');

    const url = `${window.location.origin}/?post=${postId}`;
    if (idInput) idInput.value = postId;
    if (urlInput) urlInput.value = url;

    if (dialogsList) {
        dialogsList.innerHTML = '<div style="font-size: 0.82rem; color: var(--text-dim); text-align: center; padding: 10px;">Загрузка списка диалогов...</div>';
        loadShareDialogs(postId);
    }

    if (modal) modal.style.display = 'flex';
}

function sharePost(postId) {
    openSharePostModal(postId);
}

function closeSharePostModal() {
    const modal = document.getElementById('sharePostModal');
    if (modal) modal.style.display = 'none';
}

function copyShareModalLink() {
    const urlInput = document.getElementById('sharePostUrlInput');
    const url = urlInput ? urlInput.value : '';
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Ссылка скопирована в буфер обмена', 'success');
    }).catch(() => {
        showToast('Не удалось скопировать ссылку', 'error');
    });
}

async function loadShareDialogs(postId) {
    const dialogsList = document.getElementById('shareRecentDialogsList');
    if (!dialogsList) return;

    if (!window.IS_AUTHENTICATED) {
        dialogsList.innerHTML = '<div style="font-size: 0.82rem; color: var(--text-dim); text-align: center; padding: 10px;">Войдите в аккаунт, чтобы отправлять в диалоги</div>';
        return;
    }

    try {
        const res = await fetch('/api/messages/conversations');
        if (!res.ok) throw new Error('Ошибка загрузки диалогов');
        const convos = await res.json();

        dialogsList.innerHTML = '';
        if (!convos || convos.length === 0) {
            dialogsList.innerHTML = '<div style="font-size: 0.82rem; color: var(--text-dim); text-align: center; padding: 10px;">Нет активных диалогов</div>';
            return;
        }

        convos.forEach(c => {
            const u = c.user;
            const item = document.createElement('div');
            item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);';
            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                    <img src="${escapeHtml(u.avatar_url)}" alt="avatar" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;">
                    <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        <span style="font-size: 0.85rem; font-weight: 600; color: #fff;">${escapeHtml(u.display_name)}</span>
                        <span style="font-size: 0.78rem; color: var(--text-dim); margin-left: 4px;">@${escapeHtml(u.username)}</span>
                    </div>
                </div>
                <button type="button" class="btn btn-secondary btn-xs" onclick="sendPostToUserDirect(${u.id}, ${postId})">
                    Отправить
                </button>
            `;
            dialogsList.appendChild(item);
        });
    } catch (e) {
        dialogsList.innerHTML = `<div style="font-size: 0.82rem; color: var(--text-dim); text-align: center; padding: 10px;">${escapeHtml(e.message)}</div>`;
    }
}

async function sendPostToUserDirect(targetUserId, postId) {
    if (!postId) {
        const idInput = document.getElementById('sharePostId');
        postId = idInput ? parseInt(idInput.value) : 0;
    }

    const postContentEl = document.getElementById(`post-content-${postId}`);
    const snippet = postContentEl ? postContentEl.innerText.trim().slice(0, 60) : '';
    const postUrl = `${window.location.origin}/?post=${postId}`;
    const messageContent = snippet ? `Поделился публикацией: "${snippet}..."\n${postUrl}` : `Поделился публикацией:\n${postUrl}`;

    try {
        const res = await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                receiver_id: targetUserId,
                content: messageContent
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Ошибка отправки сообщения');
        }

        closeSharePostModal();
        showToast('Публикация отправлена в личные сообщения', 'success');
        loadConversations();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ==========================================
// КОНТЕКСТНОЕ МЕНЮ ЛИЧНЫХ СООБЩЕНИЙ (ПРАВЫЙ КЛИК)
// ==========================================
let activeContextMsgId = null;
let activeContextIsOut = false;

function initChatContextMenu() {
    updateChatSoundIcon();
    const container = document.getElementById('chatMessagesContainer');
    if (!container) return;

    container.addEventListener('contextmenu', (e) => {
        const row = e.target.closest('.chat-bubble-row');
        if (!row) return;

        e.preventDefault();
        const msgId = parseInt(row.getAttribute('data-msg-id'));
        const isOut = row.getAttribute('data-is-out') === '1';

        activeContextMsgId = msgId;
        activeContextIsOut = isOut;

        const menu = document.getElementById('chatContextMenu');
        if (!menu) return;

        const btnEdit = document.getElementById('ctxBtnEdit');
        if (btnEdit) {
            const hasMedia = row.querySelector('.chat-media-preview-box, .chat-file-attachment');
            btnEdit.style.display = (isOut && !hasMedia) ? 'flex' : 'none';
        }

        menu.style.display = 'flex';
        let x = e.clientX;
        let y = e.clientY;
        const menuWidth = 190;
        const menuHeight = 160;
        if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
        if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;

        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
    });
}

function closeChatContextMenu() {
    const menu = document.getElementById('chatContextMenu');
    if (menu) menu.style.display = 'none';
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.chat-context-menu')) {
        closeChatContextMenu();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeChatContextMenu();
        closeImageLightbox();
        closeChatSoundSettingsModal();
    }
});

function onContextEditMessage() {
    closeChatContextMenu();
    if (activeContextMsgId) {
        startEditChatMessage(activeContextMsgId);
    }
}

function onContextDeleteMessage() {
    closeChatContextMenu();
    if (activeContextMsgId) {
        openDeleteMessageModal(activeContextMsgId, activeContextIsOut);
    }
}

function onContextCopyMessage() {
    closeChatContextMenu();
    if (!activeContextMsgId) return;
    const row = document.getElementById(`chat-msg-${activeContextMsgId}`);
    if (!row) return;
    const contentEl = row.querySelector('.chat-bubble-content');
    const text = contentEl ? contentEl.innerText.trim() : '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Текст скопирован в буфер обмена', 'success');
    }).catch(() => {
        showToast('Не удалось скопировать', 'error');
    });
}

function onContextSelectMessage() {
    closeChatContextMenu();
    if (!isChatSelectionMode) {
        toggleChatSelectionMode();
    }
    if (activeContextMsgId) {
        const cb = document.querySelector(`.chat-msg-checkbox[data-msg-id="${activeContextMsgId}"]`);
        if (cb) {
            cb.checked = true;
            updateSelectedMessagesCount();
        }
    }
}

// EDIT & DELETE POSTS
// ==========================================
function openEditPost(postId) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите в аккаунт для редактирования', 'error');
        openAuthModal('login');
        return;
    }
    const contentEl = document.getElementById(`post-content-${postId}`);
    const editBox = document.getElementById(`post-edit-box-${postId}`);
    if (contentEl && editBox) {
        contentEl.style.display = 'none';
        editBox.style.display = 'flex';
        const textarea = document.getElementById(`edit-textarea-${postId}`);
        if (textarea) textarea.focus();
    }
}

function cancelEditPost(postId) {
    const contentEl = document.getElementById(`post-content-${postId}`);
    const editBox = document.getElementById(`post-edit-box-${postId}`);
    if (contentEl && editBox) {
        contentEl.style.display = 'block';
        editBox.style.display = 'none';
    }
}

async function saveEditPost(postId) {
    const textarea = document.getElementById(`edit-textarea-${postId}`);
    const newContent = textarea.value.trim();

    if (!newContent) {
        showToast('Текст не может быть пустым', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/posts/${postId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.CURRENT_USER_ID,
                content: newContent
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Ошибка сохранения');
        }

        const post = await response.json();
        const contentEl = document.getElementById(`post-content-${postId}`);
        contentEl.innerHTML = formatHashtags(post.content);
        contentEl.style.display = 'block';

        const editBox = document.getElementById(`post-edit-box-${postId}`);
        if (editBox) editBox.style.display = 'none';

        const metaLine = document.querySelector(`#post-${postId} .meta-line`);
        if (metaLine && !metaLine.querySelector('.edited-badge')) {
            const badge = document.createElement('span');
            badge.className = 'edited-badge';
            badge.textContent = '• (ред.)';
            metaLine.appendChild(badge);
        }

        showToast('Публикация обновлена', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deletePost(postId) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите в аккаунт для удаления публикации', 'error');
        openAuthModal('login');
        return;
    }
    if (!confirm('Удалить эту публикацию?')) return;

    try {
        const response = await fetch(`/api/posts/${postId}?user_id=${window.CURRENT_USER_ID}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Ошибка удаления');
        }

        const allCards = document.querySelectorAll(`[id="post-${postId}"]`);
        allCards.forEach(card => card.remove());

        if (typeof feedOffset !== 'undefined' && feedOffset > 0) feedOffset--;
        const pill = document.getElementById('feedCountPill');
        if (pill) {
            const totalInDom = document.querySelectorAll('#postsContainer .post-card').length;
            pill.textContent = `${totalInDom} постов`;
        }

        const stat = document.getElementById('heroStatPosts');
        if (stat) {
            const current = parseInt(stat.textContent || '0');
            stat.textContent = Math.max(0, current - 1);
        }
        const badge = document.getElementById('badgeProfPosts');
        if (badge) {
            const current = parseInt(badge.textContent || '0');
            badge.textContent = Math.max(0, current - 1);
        }

        showToast('Публикация удалена', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ==========================================
// LIKES & COMMENTS (OPTIMISTIC UI UPDATES)
// ==========================================
async function toggleLike(postId, event) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите в аккаунт, чтобы ставить лайки', 'error');
        openAuthModal('login');
        return;
    }

    const cards = document.querySelectorAll(`[id="post-${postId}"]`);
    let wasLiked = false;
    let currentCount = 0;

    let clickedCard = event ? (event.currentTarget || event.target).closest('.post-card') : null;
    if (!clickedCard && cards.length > 0) {
        for (const c of cards) {
            const vp = c.closest('.view-panel');
            if (vp && vp.style.display !== 'none') {
                clickedCard = c;
                break;
            }
        }
        if (!clickedCard) clickedCard = cards[0];
    }

    if (clickedCard) {
        const btn = clickedCard.querySelector('.like-btn');
        wasLiked = btn ? btn.classList.contains('active') : false;
        const countEl = clickedCard.querySelector(`[id="likes-${postId}"]`) || (btn ? btn.querySelector('span') : null);
        currentCount = parseInt(countEl ? countEl.textContent || '0' : '0', 10);
    }

    const newLiked = !wasLiked;
    const newCount = newLiked ? currentCount + 1 : Math.max(0, currentCount - 1);

    // Оптимистичное обновление во всех представлениях (лента и профиль)
    cards.forEach(card => {
        const btn = card.querySelector('.like-btn');
        const countEl = card.querySelector(`[id="likes-${postId}"]`) || (btn ? btn.querySelector('span') : null);
        const heart = btn ? btn.querySelector('.heart-icon') : null;
        if (countEl) countEl.textContent = newCount;
        if (btn) btn.classList.toggle('active', newLiked);
        if (heart) heart.setAttribute('fill', newLiked ? 'currentColor' : 'none');
    });

    try {
        const response = await fetch(`/api/posts/${postId}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.CURRENT_USER_ID
            })
        });

        if (!response.ok) throw new Error('Ошибка при лайке');

        const data = await response.json();
        cards.forEach(card => {
            const btn = card.querySelector('.like-btn');
            const countEl = card.querySelector(`[id="likes-${postId}"]`) || (btn ? btn.querySelector('span') : null);
            const heart = btn ? btn.querySelector('.heart-icon') : null;
            if (countEl) countEl.textContent = data.likes_count;
            if (btn) btn.classList.toggle('active', data.is_liked);
            if (heart) heart.setAttribute('fill', data.is_liked ? 'currentColor' : 'none');
        });
    } catch (err) {
        // Откат при сбое сети
        cards.forEach(card => {
            const btn = card.querySelector('.like-btn');
            const countEl = card.querySelector(`[id="likes-${postId}"]`) || (btn ? btn.querySelector('span') : null);
            const heart = btn ? btn.querySelector('.heart-icon') : null;
            if (countEl) countEl.textContent = currentCount;
            if (btn) btn.classList.toggle('active', wasLiked);
            if (heart) heart.setAttribute('fill', wasLiked ? 'currentColor' : 'none');
        });
        showToast('Ошибка при обновлении лайка', 'error');
    }
}

function toggleComments(postId, event) {
    let section = null;
    if (event) {
        const target = event.currentTarget || event.target;
        const card = target ? target.closest('.post-card') : null;
        if (card) {
            section = card.querySelector('.comments-section');
        }
    }
    if (!section) {
        const allSections = document.querySelectorAll(`[id="comments-section-${postId}"]`);
        for (const s of allSections) {
            const vp = s.closest('.view-panel');
            if (vp && vp.style.display !== 'none') {
                section = s;
                break;
            }
        }
        if (!section && allSections.length > 0) section = allSections[0];
    }
    if (!section) return;

    section.style.display = (section.style.display === 'none' || !section.style.display) ? 'block' : 'none';
    if (section.style.display === 'block') {
        const inp = section.querySelector('.comment-input-row input');
        if (inp) inp.focus();
    }
}

async function addComment(postId, event) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите в аккаунт, чтобы оставить комментарий', 'error');
        openAuthModal('login');
        return;
    }

    let input = null;
    if (event) {
        const target = event.currentTarget || event.target;
        const card = target ? target.closest('.post-card') : null;
        if (card) {
            input = card.querySelector('.comment-input-row input');
        }
    }
    if (!input) {
        const allInputs = document.querySelectorAll(`[id="comment-input-${postId}"]`);
        for (const inp of allInputs) {
            const vp = inp.closest('.view-panel');
            if (vp && vp.style.display !== 'none') {
                input = inp;
                break;
            }
        }
        if (!input && allInputs.length > 0) input = allInputs[0];
    }

    const content = input ? input.value.trim() : '';
    if (!content) return;

    try {
        const response = await fetch(`/api/posts/${postId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.CURRENT_USER_ID,
                content: content
            })
        });

        if (!response.ok) throw new Error('Ошибка комментирования');

        const comment = await response.json();

        // Очищаем инпуты во всех копиях этой карточки
        document.querySelectorAll(`[id="comment-input-${postId}"]`).forEach(inp => {
            inp.value = '';
        });

        // Добавляем комментарий во все отображаемые списки комментариев этого поста (в ленте и в профиле)
        const allCards = document.querySelectorAll(`[id="post-${postId}"]`);
        allCards.forEach(card => {
            const commentsList = card.querySelector('.comments-list');
            if (commentsList) {
                const postOwnerId = parseInt(card.getAttribute('data-owner-id') || '0');
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = renderCommentItemHtml(comment, postOwnerId);
                if (tempDiv.firstElementChild) {
                    commentsList.appendChild(tempDiv.firstElementChild);
                }
            }
            const countEl = card.querySelector(`[id="comment-count-${postId}"]`) || card.querySelector('.comment-btn span');
            if (countEl) {
                countEl.textContent = parseInt(countEl.textContent || '0') + 1;
            }
        });

        showToast('Комментарий отправлен', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function sharePost(postId) {
    const url = `${window.location.origin}/?post=${postId}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Ссылка скопирована в буфер обмена', 'success');
    }).catch(() => {
        showToast('Публикация #' + postId, 'success');
    });
}

// ==========================================
// FOLLOW / UNFOLLOW (OPTIMISTIC)
// ==========================================
async function toggleFollow(targetUserId) {
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите в аккаунт, чтобы подписываться 👥', 'error');
        openAuthModal('login');
        return;
    }

    const userRow = document.getElementById(`user-row-${targetUserId}`);
    const followBtn = userRow ? userRow.querySelector('button') : null;
    const wasFollowing = followBtn ? followBtn.classList.contains('btn-following') : false;

    // Оптимистичное обновление интерфейса
    if (followBtn) {
        if (!wasFollowing) {
            followBtn.textContent = 'Читаю';
            followBtn.classList.add('btn-following');
        } else {
            followBtn.textContent = 'Читать';
            followBtn.classList.remove('btn-following');
        }
    }

    try {
        const response = await fetch('/api/users/follow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                follower_id: window.CURRENT_USER_ID,
                following_id: targetUserId
            })
        });

        if (!response.ok) throw new Error('Ошибка подписки');

        const data = await response.json();
        if (followBtn) {
            if (data.is_following) {
                followBtn.textContent = 'Читаю';
                followBtn.classList.add('btn-following');
                showToast('Вы подписались на автора! 👥', 'success');
            } else {
                followBtn.textContent = 'Читать';
                followBtn.classList.remove('btn-following');
                showToast('Вы отписались', 'success');
            }
        }
    } catch (err) {
        if (followBtn) {
            if (wasFollowing) {
                followBtn.textContent = 'Читаю';
                followBtn.classList.add('btn-following');
            } else {
                followBtn.textContent = 'Читать';
                followBtn.classList.remove('btn-following');
            }
        }
        showToast(err.message, 'error');
    }
}

// ==========================================
// POST RENDERING HELPERS
// ==========================================
function renderPostAtTop(post) {
    const container = document.getElementById('postsContainer');
    if (!container) return;
    const postEl = createPostElement(post);
    container.insertBefore(postEl, container.firstChild);
    if (typeof feedOffset !== 'undefined') feedOffset++;
    const pill = document.getElementById('feedCountPill');
    if (pill) {
        const total = container.querySelectorAll('.post-card').length;
        pill.textContent = `${total} постов`;
    }
}


// ==========================================
// ПОСТЫ: МЕНЮ 3 ТОЧКИ И ДЕЙСТВИЯ
// ==========================================
function togglePostDropdown(postId, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    let menu = null;
    if (event) {
        const target = event.currentTarget || event.target;
        const wrap = target ? target.closest('.post-kebab-wrap') : null;
        if (wrap) {
            menu = wrap.querySelector('.post-dropdown-menu');
        }
    }
    if (!menu) {
        const allMenus = document.querySelectorAll(`[id="post-dropdown-${postId}"]`);
        for (const m of allMenus) {
            const viewPanel = m.closest('.view-panel');
            if (viewPanel && viewPanel.style.display !== 'none') {
                menu = m;
                break;
            }
        }
        if (!menu && allMenus.length > 0) menu = allMenus[allMenus.length - 1];
    }
    if (!menu) return;

    const isShown = (menu.style.display === 'flex');
    closeAllPostDropdowns();
    if (!isShown) {
        menu.style.display = 'flex';
        const card = menu.closest('.post-card');
        if (card) card.style.zIndex = '100';
    }
}

function closeAllPostDropdowns() {
    document.querySelectorAll('.post-dropdown-menu').forEach(m => {
        m.style.display = 'none';
        const card = m.closest('.post-card');
        if (card) card.style.zIndex = '';
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.post-kebab-wrap')) {
        closeAllPostDropdowns();
    }
});

function downloadPostImage(imageUrl) {
    closeAllPostDropdowns();
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = imageUrl.split('/').pop() || 'photo.png';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Фото сохраняется', 'success');
}

function copyPostText(postId, clickedBtn) {
    closeAllPostDropdowns();
    let contentEl = null;
    if (clickedBtn && clickedBtn.closest) {
        const card = clickedBtn.closest('.post-card');
        if (card) contentEl = card.querySelector('.post-content');
    }
    if (!contentEl) {
        contentEl = document.getElementById(`post-content-${postId}`);
    }
    const text = contentEl ? contentEl.textContent.trim() : '';
    if (!text) {
        showToast('Текст публикации пуст', 'error');
        return;
    }
    navigator.clipboard.writeText(text).then(() => {
        showToast('Текст скопирован в буфер обмена', 'success');
    }).catch(() => {
        showToast('Не удалось скопировать текст', 'error');
    });
}

// ==========================================
// КОММЕНТАРИИ: РЕНДЕРИНГ, РЕДАКТИРОВАНИЕ И УДАЛЕНИЕ
// ==========================================
function renderCommentItemHtml(c, postOwnerId) {
    const isCommentAuthor = window.IS_AUTHENTICATED && (window.CURRENT_USER_ID === c.user.id);
    const canDeleteComment = window.IS_AUTHENTICATED && (isCommentAuthor || window.CURRENT_USER_ID === postOwnerId);
    const editedHtml = c.is_edited ? '<span class="edited-badge">• (ред.)</span>' : '';

    return `
        <div class="comment-item" id="comment-item-${c.id}">
            <img src="${escapeHtml(c.user.avatar_url)}" alt="avatar" class="comment-avatar">
            <div class="comment-bubble">
                <div class="comment-author-line">
                    <div class="comment-author-meta" id="comment-meta-${c.id}">
                        <span class="comment-author">${escapeHtml(c.user.display_name)}</span>
                        <span class="comment-time">${formatTime(c.created_at)}</span>
                        ${editedHtml}
                    </div>
                    ${(isCommentAuthor || canDeleteComment) ? `
                        <div class="comment-item-actions">
                            ${isCommentAuthor ? `
                                <button type="button" class="comment-action-btn" onclick="startEditComment(${c.id}, ${c.post_id})" title="Редактировать">Ред.</button>
                            ` : ''}
                            ${canDeleteComment ? `
                                <button type="button" class="comment-action-btn" onclick="deleteComment(${c.id}, ${c.post_id})" title="Удалить">✕</button>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
                <div class="comment-text" id="comment-text-${c.id}">${escapeHtml(c.content)}</div>
                <div class="comment-edit-box" id="comment-edit-box-${c.id}" style="display: none;">
                    <input type="text" id="comment-edit-input-${c.id}" class="comment-edit-input" value="${escapeHtml(c.content)}" onkeydown="if(event.key==='Enter')saveEditComment(${c.id}, ${c.post_id}); if(event.key==='Escape')cancelEditComment(${c.id});">
                    <div class="comment-edit-actions">
                        <button type="button" class="btn btn-secondary btn-xs" onclick="cancelEditComment(${c.id})">Отмена</button>
                        <button type="button" class="btn btn-primary btn-xs" onclick="saveEditComment(${c.id}, ${c.post_id})">Сохранить</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function startEditComment(commentId, postId) {
    const textEl = document.getElementById(`comment-text-${commentId}`);
    const editBox = document.getElementById(`comment-edit-box-${commentId}`);
    const input = document.getElementById(`comment-edit-input-${commentId}`);
    if (textEl && editBox) {
        textEl.style.display = 'none';
        editBox.style.display = 'block';
        if (input) {
            input.focus();
            input.select();
        }
    }
}

function cancelEditComment(commentId) {
    const textEl = document.getElementById(`comment-text-${commentId}`);
    const editBox = document.getElementById(`comment-edit-box-${commentId}`);
    if (textEl && editBox) {
        textEl.style.display = 'block';
        editBox.style.display = 'none';
    }
}

async function saveEditComment(commentId, postId) {
    const input = document.getElementById(`comment-edit-input-${commentId}`);
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;

    try {
        const res = await fetch(`/api/comments/${commentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: content })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Ошибка редактирования комментария');
        }
        const updated = await res.json();
        const textEl = document.getElementById(`comment-text-${commentId}`);
        if (textEl) {
            textEl.textContent = updated.content;
            textEl.style.display = 'block';
        }
        const editBox = document.getElementById(`comment-edit-box-${commentId}`);
        if (editBox) editBox.style.display = 'none';

        const metaEl = document.getElementById(`comment-meta-${commentId}`);
        if (metaEl && !metaEl.querySelector('.edited-badge')) {
            const badge = document.createElement('span');
            badge.className = 'edited-badge';
            badge.textContent = ' • (ред.)';
            metaEl.appendChild(badge);
        }
        showToast('Комментарий отредактирован', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteComment(commentId, postId) {
    if (!confirm('Вы уверены, что хотите удалить этот комментарий?')) return;

    try {
        const res = await fetch(`/api/comments/${commentId}`, {
            method: 'DELETE'
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Ошибка удаления комментария');
        }

        // Удаляем элемент комментария во всех копиях карточки
        document.querySelectorAll(`[id="comment-item-${commentId}"]`).forEach(item => item.remove());

        // Уменьшаем счетчик во всех копиях карточки
        document.querySelectorAll(`[id="post-${postId}"]`).forEach(card => {
            const countEl = card.querySelector(`[id="comment-count-${postId}"]`) || card.querySelector('.comment-btn span');
            if (countEl) {
                const current = parseInt(countEl.textContent || '1');
                countEl.textContent = Math.max(0, current - 1);
            }
        });

        showToast('Комментарий удален', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function createPostElement(post) {
    const article = document.createElement('article');
    article.className = 'post-card';
    article.id = `post-${post.id}`;

    const formattedDate = formatFullDate(post.created_at);
    const isLiked = post.is_liked;

    let finalImageUrl = (post.image_url || '').trim();
    let rawContent = (post.content || '').trim();
    const isImagePattern = /\.(jpeg|jpg|gif|png|webp)($|\?)/i;

    if (!finalImageUrl && rawContent.startsWith('/uploads/') && isImagePattern.test(rawContent)) {
        finalImageUrl = rawContent;
        rawContent = '';
    } else if (finalImageUrl && (rawContent === finalImageUrl || (rawContent.startsWith('/uploads/') && isImagePattern.test(rawContent)))) {
        rawContent = '';
    }

    let mediaHtml = '';
    if (finalImageUrl) {
        mediaHtml = `
            <div class="post-media" id="post-media-${post.id}">
                <img src="${escapeHtml(finalImageUrl)}" alt="Медиа" loading="lazy">
            </div>
        `;
    }

    let editedHtml = post.is_edited ? `<span class="edited-badge">• (ред.)</span>` : '';

    let commentsHtml = '';
    const actualCommentsCount = (post.comments && post.comments.length > (post.comments_count || 0))
        ? post.comments.length
        : (post.comments_count || 0);
    if (post.comments && post.comments.length > 0) {
        commentsHtml = post.comments.map(c => renderCommentItemHtml(c, post.user_id)).join('');
    }

    const isOwner = (window.IS_AUTHENTICATED && (window.CURRENT_USER_ID == post.user_id || (post.user && window.CURRENT_USER_ID == post.user.id)));
    const postMenuHtml = `
        <div class="post-kebab-wrap">
            <button type="button" class="post-kebab-btn" onclick="togglePostDropdown(${post.id}, event)" title="Действия с постом">
                ⋮
            </button>
            <div class="post-dropdown-menu" id="post-dropdown-${post.id}" style="display: none;">
                ${isOwner ? `
                    <button type="button" class="post-dropdown-item" onclick="openEditPostModal(${post.id}, this)">
                        <span>Редактировать</span>
                    </button>
                    <button type="button" class="post-dropdown-item text-danger" onclick="deletePost(${post.id})">
                        <span>Удалить</span>
                    </button>
                    <div class="post-dropdown-divider"></div>
                ` : ''}
                ${finalImageUrl ? `
                    <button type="button" class="post-dropdown-item" onclick="downloadPostImage('${escapeHtml(finalImageUrl)}')">
                        <span>Сохранить фото</span>
                    </button>
                ` : ''}
                ${rawContent ? `
                    <button type="button" class="post-dropdown-item" onclick="copyPostText(${post.id}, this)">
                        <span>Скопировать текст</span>
                    </button>
                ` : ''}
                <button type="button" class="post-dropdown-item" onclick="openSharePostModal(${post.id})">
                    <span>Поделиться</span>
                </button>
            </div>
        </div>
    `;

    article.setAttribute('data-owner-id', post.user_id);
    article.innerHTML = `
        <div class="post-header">
            <div class="author-block">
                <img src="${escapeHtml(post.user.avatar_url)}" alt="avatar" class="author-avatar cursor-pointer" onclick="openUserProfile(${post.user.id})">
                <div class="author-meta">
                    <div class="author-name-row">
                        <span class="author-name cursor-pointer" onclick="openUserProfile(${post.user.id})">${escapeHtml(post.user.display_name)}</span>
                        <span class="author-handle cursor-pointer" onclick="openUserProfile(${post.user.id})">@${escapeHtml(post.user.username)}</span>
                    </div>
                    <div class="meta-line">
                        <time class="post-time">${formattedDate}</time>
                        ${editedHtml}
                    </div>
                </div>
            </div>
            ${postMenuHtml}
        </div>

        <div class="post-content" id="post-content-${post.id}" ${rawContent ? '' : 'style="display:none;"'}>${formatHashtags(rawContent)}</div>

        <div class="post-edit-box" id="post-edit-box-${post.id}" style="display: none;">
            <textarea id="edit-textarea-${post.id}" rows="3">${escapeHtml(post.content)}</textarea>
            <div class="edit-actions-row">
                <button class="btn btn-secondary btn-xs" onclick="cancelEditPost(${post.id})">Отмена</button>
                <button class="btn btn-primary btn-xs" onclick="saveEditPost(${post.id})">Сохранить</button>
            </div>
        </div>

        ${mediaHtml}

        <div class="post-actions-bar">
            <button class="action-btn like-btn ${isLiked ? 'active' : ''}" onclick="toggleLike(${post.id}, event)">
                <svg class="heart-icon" width="18" height="18" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
                <span id="likes-${post.id}">${post.likes_count}</span>
            </button>

            <button class="action-btn comment-btn" onclick="toggleComments(${post.id}, event)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                </svg>
                <span id="comment-count-${post.id}">${actualCommentsCount}</span>
            </button>

            <button class="action-btn share-btn" onclick="sharePost(${post.id})" title="Поделиться">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="18" cy="5" r="3"></circle>
                    <circle cx="6" cy="12" r="3"></circle>
                    <circle cx="18" cy="19" r="3"></circle>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
            </button>
        </div>

        <div class="comments-section" id="comments-section-${post.id}" style="display: none;">
            <div class="comments-list" id="comments-list-${post.id}">
                ${commentsHtml}
            </div>

            <div class="comment-input-row">
                <input type="text" id="comment-input-${post.id}" placeholder="Напишите комментарий..." onkeydown="if(event.key==='Enter')addComment(${post.id}, event)">
                <button class="btn btn-secondary btn-sm" onclick="addComment(${post.id}, event)">Отправить</button>
            </div>
        </div>
    `;

    return article;
}

function formatAllPostContents() {
    document.querySelectorAll('.post-card').forEach(card => {
        const contentEl = card.querySelector('.post-content');
        const mediaImg = card.querySelector('.post-media img');
        if (contentEl && mediaImg) {
            const text = contentEl.textContent.trim();
            const imgSrc = mediaImg.getAttribute('src') ? mediaImg.getAttribute('src').trim() : '';
            if (text && imgSrc && text === imgSrc) {
                contentEl.style.display = 'none';
            }
        }
    });
    document.querySelectorAll('.post-content').forEach(el => {
        el.innerHTML = formatHashtags(el.textContent);
    });
}

function formatHashtags(text) {
    if (!text) return '';
    return escapeHtml(text).replace(/(#[\w\u0400-\u04FF]+)/gi, (tag) => {
        return `<span class="hashtag-inline cursor-pointer" style="color: #e26d5c; font-weight: 600;" onclick="event.stopPropagation(); filterByTag('${tag}')">${tag}</span>`;
    });
}

function formatTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFullDate(isoString) {
    const d = new Date(isoString);
    return `${formatTime(isoString)} • ${d.toLocaleDateString()}`;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// ==========================================
// SEARCH & FEED FILTER
// ==========================================
function executeSearch() {
    const query = document.getElementById('searchInput')?.value.trim();
    reloadFeedAsync({ q: query });
}

function clearSearch() {
    const input = document.getElementById('searchInput');
    if (input) input.value = '';
    reloadFeedAsync({ q: '', tag: '' });
}

function filterByTag(tag) {
    reloadFeedAsync({ tag: tag });
}

function switchFeedTab(type) {
    reloadFeedAsync({ feed_type: type });
}

const FEED_PAGE_SIZE = 10;
let feedOffset = 10;
let isFeedLoading = false;
let hasMoreFeedPosts = true;

async function reloadFeedAsync(params = {}) {
    const container = document.getElementById('postsContainer');
    if (!container) return;

    navigateTo('feed');

    const spinner = document.getElementById('feedSpinner');
    const endMsg = document.getElementById('feedEndOfList');
    if (endMsg) endMsg.style.display = 'none';
    if (spinner) spinner.style.display = 'inline-flex';

    const url = new URL(window.location.href);
    if ('feed_type' in params) {
        if (params.feed_type === 'all') url.searchParams.delete('feed_type');
        else url.searchParams.set('feed_type', params.feed_type);
    }
    if ('q' in params) {
        if (!params.q) url.searchParams.delete('q');
        else url.searchParams.set('q', params.q);
    }
    if ('tag' in params) {
        if (!params.tag) url.searchParams.delete('tag');
        else url.searchParams.set('tag', params.tag);
    }

    window.history.pushState({}, '', url.toString());

    const currentFeedType = url.searchParams.get('feed_type') || 'all';
    document.querySelectorAll('.segmented-control .seg-btn').forEach(btn => {
        const isFollow = btn.getAttribute('onclick') && btn.getAttribute('onclick').includes('following');
        btn.classList.toggle('active', isFollow ? currentFeedType === 'following' : currentFeedType === 'all');
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput && 'q' in params) searchInput.value = params.q || '';

    feedOffset = 0;
    hasMoreFeedPosts = true;

    try {
        const fetchParams = new URLSearchParams({
            feed_type: currentFeedType,
            limit: FEED_PAGE_SIZE,
            offset: 0
        });
        if (url.searchParams.get('q')) fetchParams.set('q', url.searchParams.get('q'));
        if (url.searchParams.get('tag')) fetchParams.set('tag', url.searchParams.get('tag'));
        if (window.CURRENT_USER_ID) fetchParams.set('user_id', window.CURRENT_USER_ID);

        const res = await fetch(`/api/feed?${fetchParams.toString()}`);
        if (!res.ok) throw new Error('Ошибка загрузки ленты');

        const posts = await res.json();
        container.innerHTML = '';

        if (!posts || posts.length === 0) {
            hasMoreFeedPosts = false;
            container.innerHTML = `
                <div class="cyber-empty-card">
                    <span class="empty-glyph">📝</span>
                    <h3>Ничего не найдено</h3>
                    <p>Попробуйте изменить поисковый запрос или сбросить фильтры.</p>
                </div>
            `;
        } else {
            posts.forEach(post => {
                const postEl = createPostElement(post);
                container.appendChild(postEl);
            });

            feedOffset = posts.length;
            if (posts.length < FEED_PAGE_SIZE) {
                hasMoreFeedPosts = false;
                if (endMsg) endMsg.style.display = 'block';
            }
        }

        const pill = document.getElementById('feedCountPill');
        if (pill) {
            const total = container.querySelectorAll('.post-card').length;
            pill.textContent = `${total} постов`;
        }
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        if (spinner) spinner.style.display = 'none';
    }
}

// Lazy loading infinite scroll
function initFeedInfiniteScroll() {
    const sentinel = document.getElementById('feedLoadingSentinel');
    if (!sentinel) return;

    const observer = new IntersectionObserver(async (entries) => {
        const first = entries[0];
        if (first.isIntersecting && !isFeedLoading && hasMoreFeedPosts) {
            await loadMoreFeedPosts();
        }
    }, { rootMargin: '300px' });

    observer.observe(sentinel);
}

async function loadMoreFeedPosts() {
    if (isFeedLoading || !hasMoreFeedPosts) return;
    isFeedLoading = true;

    const spinner = document.getElementById('feedSpinner');
    const endMsg = document.getElementById('feedEndOfList');
    if (spinner) spinner.style.display = 'inline-flex';

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const feedType = urlParams.get('feed_type') || 'all';
        const searchQuery = urlParams.get('q') || '';
        const tagQuery = urlParams.get('tag') || '';

        const params = new URLSearchParams({
            feed_type: feedType,
            limit: FEED_PAGE_SIZE,
            offset: feedOffset
        });
        if (searchQuery) params.set('q', searchQuery);
        if (tagQuery) params.set('tag', tagQuery);
        if (window.CURRENT_USER_ID) params.set('user_id', window.CURRENT_USER_ID);

        const res = await fetch(`/api/feed?${params.toString()}`);
        if (!res.ok) throw new Error('Ошибка загрузки постов');

        const posts = await res.json();
        const container = document.getElementById('postsContainer');

        if (!posts || posts.length === 0) {
            hasMoreFeedPosts = false;
            if (endMsg) endMsg.style.display = 'block';
        } else {
            posts.forEach(post => {
                const el = createPostElement(post);
                container.appendChild(el);
            });
            feedOffset += posts.length;
            if (posts.length < FEED_PAGE_SIZE) {
                hasMoreFeedPosts = false;
                if (endMsg) endMsg.style.display = 'block';
            }

            const pill = document.getElementById('feedCountPill');
            if (pill) {
                const totalInDom = container.querySelectorAll('.post-card').length;
                pill.textContent = `${totalInDom} постов`;
            }
        }
    } catch (err) {
        console.error('Lazy loading feed error:', err);
    } finally {
        isFeedLoading = false;
        if (spinner) spinner.style.display = 'none';
    }
}

// ==========================================
// NAVIGATION (SPA ROUTING)
// ==========================================
let currentProfileUserId = null;
let currentProfileUserData = null;

function navigateTo(view, userId = null) {
    ['feed', 'profile', 'showcase', 'messages'].forEach(v => {
        const el = document.getElementById(`${v}View`);
        if (el) el.style.display = 'none';
    });

    ['Feed', 'Profile', 'Gifts', 'Messages'].forEach(t => {
        const btn = document.getElementById(`tabNav${t}`);
        if (btn) btn.classList.remove('active');
    });

    if (view === 'feed') {
        const el = document.getElementById('feedView');
        if (el) el.style.display = 'block';
        const btn = document.getElementById('tabNavFeed');
        if (btn) btn.classList.add('active');
    } else if (view === 'profile' || view === 'my-profile') {
        const el = document.getElementById('profileView');
        if (el) el.style.display = 'block';
        const btn = document.getElementById('tabNavProfile');
        if (btn) btn.classList.add('active');
    } else if (view === 'showcase') {
        const el = document.getElementById('showcaseView');
        if (el) el.style.display = 'block';
        const btn = document.getElementById('tabNavGifts');
        if (btn) btn.classList.add('active');
    } else if (view === 'messages') {
        const el = document.getElementById('messagesView');
        if (el) el.style.display = 'block';
        const btn = document.getElementById('tabNavMessages');
        if (btn) btn.classList.add('active');
    }

    if (view === 'profile') {
        const uid = userId || window.CURRENT_USER_ID;
        currentProfileUserId = uid;
        loadUserProfile(uid);
        window.history.pushState({}, '', `/?view=profile&user=${uid}`);
    } else if (view === 'my-profile') {
        if (!window.IS_AUTHENTICATED || !window.CURRENT_USER_ID) {
            openAuthModal('login');
            showToast('Войдите в аккаунт для доступа к личному профилю 👤', 'error');
            return;
        }
        currentProfileUserId = window.CURRENT_USER_ID;
        loadUserProfile(window.CURRENT_USER_ID);
        window.history.pushState({}, '', `/?view=profile&user=${window.CURRENT_USER_ID}`);
    } else if (view === 'showcase') {
        loadShowcaseGifts();
        window.history.pushState({}, '', '/?view=showcase');
    } else if (view === 'messages') {
        if (!window.IS_AUTHENTICATED && !window.CURRENT_USER_ID) {
            openAuthModal('login');
            showToast('Войдите в аккаунт для доступа к личным сообщениям', 'error');
            return;
        }
        loadConversations();
        window.history.pushState({}, '', '/?view=messages');
    } else {
        window.history.pushState({}, '', '/');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openUserProfile(userId) {
    navigateTo('profile', userId);
}

// ==========================================
// USER PROFILE LOGIC
// ==========================================
async function loadUserProfile(userId) {
    try {
        const res = await fetch(`/api/users/${userId}/profile`);
        if (!res.ok) throw new Error('Не удалось загрузить профиль пользователя');
        const data = await res.json();
        currentProfileUserData = data.user;
        renderUserProfile(data);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderUserProfile(data) {
    const user = data.user;

    document.getElementById('profileBreadcrumbUser').textContent = `@${user.username}`;
    document.getElementById('heroDisplayName').textContent = user.display_name;
    document.getElementById('heroUsername').textContent = `@${user.username}`;
    document.getElementById('heroBio').textContent = user.bio || 'Информация о пользователе пока не заполнена.';
    document.getElementById('heroAvatar').src = user.avatar_url;

    // Применение персональной неоновой ауры профиля
    const heroCard = document.getElementById('profileHeroCard');
    const userAccent = user.accent_color || '#00f0ff';
    if (heroCard) {
        heroCard.style.setProperty('--profile-accent', userAccent);
        heroCard.classList.add('has-custom-accent');
    }

    // Применение голографической рамки аватарки
    const avatarFrameBox = document.getElementById('heroAvatarFrameBox');
    if (avatarFrameBox) {
        applyAvatarFrame(avatarFrameBox, user.avatar_frame || 'default', user.accent_color || '#00f0ff');
    }

    // Применение фоновой текстуры на обложку
    const banner = document.getElementById('heroBanner');
    if (user.banner_url) {
        banner.style.backgroundImage = `url('${user.banner_url}')`;
    } else {
        banner.style.backgroundImage = 'linear-gradient(135deg, #111827 0%, #0b0f19 50%, #1e293b 100%)';
    }
    const bannerOverlay = document.getElementById('heroBannerOverlay');
    if (bannerOverlay) {
        bannerOverlay.className = 'hero-banner-overlay bg-effect-' + (user.profile_bg_effect || 'none');
    }

    // Кибер-Ранг / Титул в профиле
    const rankBadge = document.getElementById('heroRankBadge');
    if (rankBadge) {
        if (user.custom_rank && user.custom_rank.trim()) {
            rankBadge.textContent = user.custom_rank.trim();
            rankBadge.style.display = 'inline-flex';
        } else {
            rankBadge.style.display = 'none';
        }
    }

    // Статус и эмодзи-настроение
    const statusContainer = document.getElementById('heroStatusContainer');
    if (statusContainer) {
        if (user.status_text && user.status_text.trim()) {
            document.getElementById('heroStatusEmoji').textContent = user.status_emoji || '⚡';
            document.getElementById('heroStatusText').textContent = user.status_text.trim();
            statusContainer.style.display = 'block';
        } else {
            statusContainer.style.display = 'none';
        }
    }

    // Главный кибер-экспонат профиля (Pinned Trophy)
    const trophyWrap = document.getElementById('heroPinnedTrophyWrap');
    if (trophyWrap) {
        const pinnedId = user.pinned_gift_id || 0;
        const giftKeys = Object.keys(GIFT_SPECS);
        const pinnedType = (pinnedId > 0 && pinnedId <= giftKeys.length) ? giftKeys[pinnedId - 1] : null;
        if (pinnedType && GIFT_SPECS[pinnedType]) {
            const spec = GIFT_SPECS[pinnedType];
            const imgEl = document.getElementById('heroPinnedTrophyImg');
            const titleEl = document.getElementById('heroPinnedTrophyTitle');
            const rarityEl = document.getElementById('heroPinnedTrophyRarity');
            if (imgEl) imgEl.src = spec.png;
            if (titleEl) titleEl.textContent = spec.title;
            if (rarityEl) {
                rarityEl.textContent = spec.rarity;
                rarityEl.className = 'artifact-rarity-pill ' + (spec.badgeClass || '');
            }
            trophyWrap.style.display = 'inline-flex';
        } else {
            trophyWrap.style.display = 'none';
        }
    }

    // Стек технологий и тегов (Skills Tags)
    const skillsContainer = document.getElementById('heroSkillsContainer');
    if (skillsContainer) {
        skillsContainer.innerHTML = '';
        const tags = (user.skills_tags || '').split(',').map(t => t.trim()).filter(Boolean);
        if (tags.length > 0) {
            tags.forEach(tag => {
                const chip = document.createElement('span');
                chip.className = 'skill-tag-chip';
                chip.innerHTML = `<span>#${escapeHtml(tag)}</span>`;
                chip.onclick = () => {
                    const searchInput = document.getElementById('searchInput');
                    if (searchInput) searchInput.value = `#${tag}`;
                    executeSearch();
                };
                skillsContainer.appendChild(chip);
            });
            skillsContainer.style.display = 'flex';
        } else {
            skillsContainer.style.display = 'none';
        }
    }

    // Контакты и социальные сети (Social Links)
    const socialContainer = document.getElementById('heroSocialContainer');
    if (socialContainer) {
        socialContainer.innerHTML = '';
        let links = {};
        try {
            if (user.social_links) links = JSON.parse(user.social_links);
        } catch (e) {}

        const socialDefs = [
            { key: 'tg', icon: '✈️ Telegram', prefix: 'https://t.me/' },
            { key: 'gh', icon: '🐙 GitHub', prefix: 'https://github.com/' },
            { key: 'discord', icon: '💬 Discord', isCopy: true },
            { key: 'steam', icon: '🎮 Steam', prefix: 'https://steamcommunity.com/id/' },
            { key: 'vk', icon: '🟦 ВКонтакте', prefix: 'https://vk.com/' },
            { key: 'web', icon: '🌐 Вебсайт', prefix: '' }
        ];

        let hasLinks = false;
        socialDefs.forEach(def => {
            const val = links[def.key];
            if (val && val.trim()) {
                hasLinks = true;
                const badge = document.createElement('a');
                badge.className = `social-link-badge ${def.key}`;
                badge.innerHTML = `<span>${def.icon}</span>`;
                if (def.isCopy) {
                    badge.href = '#';
                    badge.onclick = (e) => {
                        e.preventDefault();
                        navigator.clipboard.writeText(val.trim());
                        showToast(`Discord: ${val.trim()} скопирован!`, 'success');
                    };
                } else {
                    let url = val.trim();
                    if (!url.startsWith('http://') && !url.startsWith('https://')) {
                        if (def.key === 'tg' && url.startsWith('@')) {
                            url = def.prefix + url.substring(1);
                        } else if (def.prefix) {
                            url = def.prefix + url;
                        } else {
                            url = 'https://' + url;
                        }
                    }
                    badge.href = url;
                    badge.target = '_blank';
                    badge.rel = 'noopener noreferrer';
                }
                socialContainer.appendChild(badge);
            }
        });
        socialContainer.style.display = hasLinks ? 'flex' : 'none';
    }

    // Адаптация кнопки отправки подарка на вкладке подарков
    const btnHeroSendGift = document.getElementById('btnHeroSendGift');
    if (btnHeroSendGift) {
        if (data.is_owner) {
            btnHeroSendGift.innerHTML = '<span>🎁 Подарить другу</span>';
            btnHeroSendGift.onclick = () => navigateTo('showcase');
        } else {
            btnHeroSendGift.innerHTML = '<span>🎁 Отправить подарок</span>';
            btnHeroSendGift.onclick = () => openCurrentProfileGiftModal();
        }
    }

    document.getElementById('heroStatPosts').textContent = data.posts ? data.posts.length : 0;
    document.getElementById('heroStatGifts').textContent = `🎁 ${data.gifts ? data.gifts.length : 0}`;
    document.getElementById('heroStatFollowers').textContent = data.followers ? data.followers.length : 0;
    document.getElementById('heroStatFollowing').textContent = data.following ? data.following.length : 0;

    document.getElementById('badgeProfPosts').textContent = data.posts ? data.posts.length : 0;
    document.getElementById('badgeProfGifts').textContent = data.gifts ? data.gifts.length : 0;
    document.getElementById('netFollowersCount').textContent = data.followers ? data.followers.length : 0;
    document.getElementById('netFollowingCount').textContent = data.following ? data.following.length : 0;

    const actionsBox = document.getElementById('heroActionsContainer');
    actionsBox.innerHTML = '';

    const profComposer = document.getElementById('profComposerCard');

    if (data.is_owner) {
        if (profComposer) {
            profComposer.style.display = 'block';
            const compAvatar = document.getElementById('profComposerAvatar');
            if (compAvatar && user.avatar_url) compAvatar.src = user.avatar_url;
        }
        actionsBox.innerHTML = `
            <button class="btn btn-primary btn-sm" onclick="openEditProfileModal()">
                <span>Оформление профиля</span>
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openEditProfileModal()">
                <span>Редактировать</span>
            </button>
        `;
    } else {
        if (profComposer) profComposer.style.display = 'none';
        const followText = data.is_following ? 'Отписаться' : 'Подписаться';
        const followClass = data.is_following ? 'btn-following' : 'btn-primary';

        actionsBox.innerHTML = `
            <button class="btn btn-secondary btn-sm" onclick="openChatWithUser(${user.id}, '${escapeHtml(user.display_name)}', '${escapeHtml(user.username)}', '${escapeHtml(user.avatar_url)}')">
                <span>Сообщение</span>
            </button>
            <button class="btn btn-outline btn-sm" onclick="openSendGiftModal(${user.id}, '${escapeHtml(user.display_name)}', '${escapeHtml(user.username)}')">
                <span>Отправить подарок</span>
            </button>
            <button class="btn ${followClass} btn-sm" onclick="toggleProfileFollow(${user.id})">
                <span>${followText}</span>
            </button>
        `;
    }

    renderProfilePosts(data.posts);
    renderProfileGifts(data.gifts);
    renderProfileNetwork(data.followers, data.following);

    switchProfileTab('posts');
}

async function toggleProfileFollow(userId) {
    const heroBtn = document.querySelector('#heroActionsContainer .btn-following, #heroActionsContainer .btn-primary');
    if (heroBtn) {
        const wasFollowing = heroBtn.classList.contains('btn-following');
        heroBtn.innerHTML = `<span>${wasFollowing ? 'Подписаться' : 'Отписаться'}</span>`;
        heroBtn.className = `btn ${wasFollowing ? 'btn-primary' : 'btn-following'} btn-sm`;
    }
    await toggleFollow(userId);
    loadUserProfile(userId);
}

function switchProfileTab(tabName) {
    ['Posts', 'Gifts', 'Network'].forEach(t => {
        const btn = document.getElementById(`profTabBtn${t}`);
        const pane = document.getElementById(`profTabContent${t}`);
        const card = document.getElementById(`statCard${t}`);

        const isCurrent = (t.toLowerCase() === tabName.toLowerCase());
        if (btn) btn.classList.toggle('active', isCurrent);
        if (pane) pane.style.display = isCurrent ? 'block' : 'none';
        if (card) card.classList.toggle('active', isCurrent);
    });
}

function renderProfilePosts(posts) {
    const container = document.getElementById('profPostsContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!posts || posts.length === 0) {
        container.innerHTML = `
            <div class="cyber-empty-card">
                <span class="empty-glyph">📝</span>
                <h3>Пока нет публикаций</h3>
                <p>Этот автор еще не разместил постов.</p>
            </div>
        `;
        return;
    }

    posts.forEach(post => {
        const postEl = createPostElement(post);
        container.appendChild(postEl);
    });
}

function renderProfileGifts(gifts) {
    const grid = document.getElementById('profGiftsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!gifts || gifts.length === 0) {
        grid.innerHTML = `
            <div class="cyber-empty-card" style="grid-column: 1 / -1;">
                <span class="empty-glyph">🎁</span>
                <h3>Коллекция подарков пуста</h3>
                <p>Станьте первым, кто подарит этому пользователю подарок из коллекции «Цветные карандаши»!</p>
                <button class="btn btn-primary btn-sm" style="margin-top: 0.8rem;" onclick="if(currentProfileUserData && currentProfileUserData.id === window.CURRENT_USER_ID){ navigateTo('showcase'); }else{ openCurrentProfileGiftModal(); }">
                    <span>${(currentProfileUserData && currentProfileUserData.id === window.CURRENT_USER_ID) ? '🎁 Выбрать подарок в каталоге' : '🎁 Отправить первый подарок'}</span>
                </button>
            </div>
        `;
        return;
    }

    gifts.forEach(gift => {
        renderGiftCard(gift, grid);
    });
}

function renderProfileNetwork(followers, following) {
    const fList = document.getElementById('profFollowersList');
    const foList = document.getElementById('profFollowingList');

    if (fList) {
        fList.innerHTML = (!followers || followers.length === 0) ? '<p class="text-muted" style="padding: 10px; font-size: 0.85rem;">Пока нет подписчиков</p>' : '';
        (followers || []).forEach(u => fList.appendChild(createRunnerRow(u)));
    }

    if (foList) {
        foList.innerHTML = (!following || following.length === 0) ? '<p class="text-muted" style="padding: 10px; font-size: 0.85rem;">Пока нет подписок</p>' : '';
        (following || []).forEach(u => foList.appendChild(createRunnerRow(u)));
    }
}

function createRunnerRow(u) {
    const row = document.createElement('div');
    row.className = 'runner-row';
    row.id = `user-row-${u.id}`;
    row.innerHTML = `
        <img src="${escapeHtml(u.avatar_url)}" alt="avatar" class="mini-avatar cursor-pointer" onclick="openUserProfile(${u.id})">
        <div class="runner-info cursor-pointer" onclick="openUserProfile(${u.id})">
            <span class="runner-name">${escapeHtml(u.display_name)}</span>
            <span class="runner-handle">@${escapeHtml(u.username)}</span>
        </div>
        <button class="btn btn-outline btn-xs ${u.is_following ? 'btn-following' : ''}" onclick="toggleFollow(${u.id})">
            ${u.is_following ? 'Читаю' : 'Читать'}
        </button>
    `;
    return row;
}

// ==========================================
// DIGITAL GIFTS (CYBERPUNK 2077 GIFTS + СОКРЫТИЕ ПОДАРКОВ)
// ==========================================
const GIFT_SPECS = {
    // 9 официальных 3D-подарков коллекции Cyberpunk 2077 (Desktop\Подарки_для_соцсети)
    cyber_katana: {
        id: 'cyber_katana',
        title: 'Кибер-Катана',
        rarity: 'Реликтовый',
        badgeClass: 'badge-cyber-katana',
        desc: 'Высокотехнологичный клинок с лазерным неоновым лезвием, карбоновой рукоятью и голографическими кольцами энергии.',
        feature: 'Бегущий световой импульс по лезвию, кольца энергии и электрические искры.',
        gif: '/static/gifts/01_Кибер_Катана.gif',
        png: '/static/gifts/01_Кибер_Катана.png',
        webp: '/static/gifts/01_Кибер_Катана.webp'
    },
    neuro_visor: {
        id: 'neuro_visor',
        title: 'Нейро-Визор HUD',
        rarity: 'Тактический',
        badgeClass: 'badge-neuro-visor',
        desc: 'Смарт-очки дополненной реальности из полированного хрома со светящимися линзами и цифровой телеметрией.',
        feature: 'Лазерный луч сканирования данных, пульсирующие прицельные метки и блики.',
        gif: '/static/gifts/02_Нейро_Визор.gif',
        png: '/static/gifts/02_Нейро_Визор.png',
        webp: '/static/gifts/02_Нейро_Визор.webp'
    },
    quantum_heart: {
        id: 'quantum_heart',
        title: 'Квантовое Кибер-Сердце',
        rarity: 'Реликтовый',
        badgeClass: 'badge-quantum-heart',
        desc: 'Термоядерный силовой реактор из тёмного титана с магнитной ловушкой и бушующей внутри плазмой.',
        feature: 'Ритмичная пульсация квантового ядра (двойной такт), вспышки плазмы и искры.',
        gif: '/static/gifts/03_Квантовое_Сердце.gif',
        png: '/static/gifts/03_Квантовое_Сердце.png',
        webp: '/static/gifts/03_Квантовое_Сердце.webp'
    },
    samurai_helmet: {
        id: 'samurai_helmet',
        title: 'Боевой Шлем Самурая Oni',
        rarity: 'Легендарный',
        badgeClass: 'badge-samurai-helmet',
        desc: 'Титановый шлем кибер-самурая с горящими неоновыми рогами-радиаторами и лазерным визором захвата цели.',
        feature: 'Горизонтальное сканирование LED-визора, пульсация рогов и голо-прицел.',
        gif: '/static/gifts/04_Шлем_Самурая.gif',
        png: '/static/gifts/04_Шлем_Самурая.png',
        webp: '/static/gifts/04_Шлем_Самурая.webp'
    },
    synthwave_cassette: {
        id: 'synthwave_cassette',
        title: 'Синтвейв Нейро-Кассета',
        rarity: 'Ретро-Вейв',
        badgeClass: 'badge-synthwave-cassette',
        desc: 'Ретро-футуристичная прозрачная кассета с неоновыми бобинами плёнки, лазерными дорожками и эквалайзером.',
        feature: 'Вращающиеся катушки плёнки, танцующий эквалайзер звука и неоновые дорожки.',
        gif: '/static/gifts/05_Синтвейв_Кассета.gif',
        png: '/static/gifts/05_Синтвейв_Кассета.png',
        webp: '/static/gifts/05_Синтвейв_Кассета.webp'
    },
    mantis_blade: {
        id: 'mantis_blade',
        title: 'Клинок Богомола',
        rarity: 'Военный',
        badgeClass: 'badge-mantis-blade',
        desc: 'Бионическая рука из карбона и титана с выдвинутым термо-клинком богомола, раскалённым до оранжевого свечения.',
        feature: 'Бегущий термо-импульс по лезвию, искры и пульсирующие энергоканалы.',
        gif: '/static/gifts/06_Клинок_Богомола.gif',
        png: '/static/gifts/06_Клинок_Богомола.png',
        webp: '/static/gifts/06_Клинок_Богомола.webp'
    },
    tactical_drone: {
        id: 'tactical_drone',
        title: 'Тактический Кибер-Дрон',
        rarity: 'Тактический',
        badgeClass: 'badge-tactical-drone',
        desc: 'Стелс-дрон разведки с векторными плазменными двигателями, мультиспектральной оптикой и круговым сонаром.',
        feature: 'Парение в воздухе, факелы плазменных двигателей, сенсор и радарные волны.',
        gif: '/static/gifts/07_Кибер_Дрон.gif',
        png: '/static/gifts/07_Кибер_Дрон.png',
        webp: '/static/gifts/07_Кибер_Дрон.webp'
    },
    emp_grenade: {
        id: 'emp_grenade',
        title: 'Плазменная ЭМИ-Граната',
        rarity: 'Спец-Оружие',
        badgeClass: 'badge-emp-grenade',
        desc: 'Тактическая сферическая граната из титана со светящимися силовыми кольцами и таймером детонации.',
        feature: 'Электрические микро-дуги молний по корпусу, мигающий LED и плазменные искры.',
        gif: '/static/gifts/08_ЭМИ_Граната.gif',
        png: '/static/gifts/08_ЭМИ_Граната.png',
        webp: '/static/gifts/08_ЭМИ_Граната.webp'
    },
    combat_stim: {
        id: 'combat_stim',
        title: 'Нейро-Инжектор «MaxDoc»',
        rarity: 'Стимулятор',
        badgeClass: 'badge-combat-stim',
        desc: 'Боевой стимулятор из карбона с прозрачной колбой, наполненной биолюминесцентной восстанавливающей сывороткой.',
        feature: 'Поднимающиеся нанопузырьки в колбе, мягкое сияние исцеляющей ауры и искры.',
        gif: '/static/gifts/09_Нейро_Инжектор.gif',
        png: '/static/gifts/09_Нейро_Инжектор.png',
        webp: '/static/gifts/09_Нейро_Инжектор.webp'
    },

    // Алиасы обратной совместимости
    cyber_heart: { id: 'quantum_heart', title: 'Квантовое Кибер-Сердце', rarity: 'Реликтовый', badgeClass: 'badge-quantum-heart', gif: '/static/gifts/03_Квантовое_Сердце.gif', png: '/static/gifts/03_Квантовое_Сердце.png', webp: '/static/gifts/03_Квантовое_Сердце.webp' },
    cyber_skull: { id: 'samurai_helmet', title: 'Боевой Шлем Самурая Oni', rarity: 'Легендарный', badgeClass: 'badge-samurai-helmet', gif: '/static/gifts/04_Шлем_Самурая.gif', png: '/static/gifts/04_Шлем_Самурая.png', webp: '/static/gifts/04_Шлем_Самурая.webp' },
    black_ice: { id: 'cyber_katana', title: 'Кибер-Катана', rarity: 'Реликтовый', badgeClass: 'badge-cyber-katana', gif: '/static/gifts/01_Кибер_Катана.gif', png: '/static/gifts/01_Кибер_Катана.png', webp: '/static/gifts/01_Кибер_Катана.webp' },
    cyber_drone: { id: 'tactical_drone', title: 'Тактический Кибер-Дрон', rarity: 'Тактический', badgeClass: 'badge-tactical-drone', gif: '/static/gifts/07_Кибер_Дрон.gif', png: '/static/gifts/07_Кибер_Дрон.png', webp: '/static/gifts/07_Кибер_Дрон.webp' },
    neuro_stimulator: { id: 'combat_stim', title: 'Нейро-Инжектор «MaxDoc»', rarity: 'Стимулятор', badgeClass: 'badge-combat-stim', gif: '/static/gifts/09_Нейро_Инжектор.gif', png: '/static/gifts/09_Нейро_Инжектор.png', webp: '/static/gifts/09_Нейро_Инжектор.webp' },
    festive_box: { id: 'quantum_heart', title: 'Квантовое Кибер-Сердце', rarity: 'Реликтовый', badgeClass: 'badge-quantum-heart', gif: '/static/gifts/03_Квантовое_Сердце.gif', png: '/static/gifts/03_Квантовое_Сердце.png', webp: '/static/gifts/03_Квантовое_Сердце.webp' },
    supernova: { id: 'quantum_heart', title: 'Квантовое Кибер-Сердце', rarity: 'Реликтовый', badgeClass: 'badge-quantum-heart', gif: '/static/gifts/03_Квантовое_Сердце.gif', png: '/static/gifts/03_Квантовое_Сердце.png' },
    bear_heart: { id: 'samurai_helmet', title: 'Боевой Шлем Самурая Oni', rarity: 'Легендарный', badgeClass: 'badge-samurai-helmet', gif: '/static/gifts/04_Шлем_Самурая.gif', png: '/static/gifts/04_Шлем_Самурая.png' },
    quantum_crown: { id: 'samurai_helmet', title: 'Боевой Шлем Самурая Oni', rarity: 'Легендарный', badgeClass: 'badge-samurai-helmet', gif: '/static/gifts/04_Шлем_Самурая.gif', png: '/static/gifts/04_Шлем_Самурая.png' },
    cute_kitten: { id: 'synthwave_cassette', title: 'Синтвейв Нейро-Кассета', rarity: 'Ретро-Вейв', badgeClass: 'badge-synthwave-cassette', gif: '/static/gifts/05_Синтвейв_Кассета.gif', png: '/static/gifts/05_Синтвейв_Кассета.png' },
    cyber_unicorn: { id: 'cyber_katana', title: 'Кибер-Катана', rarity: 'Реликтовый', badgeClass: 'badge-cyber-katana', gif: '/static/gifts/01_Кибер_Катана.gif', png: '/static/gifts/01_Кибер_Катана.png' },
    gentle_bouquet: { id: 'mantis_blade', title: 'Клинок Богомола', rarity: 'Военный', badgeClass: 'badge-mantis-blade', gif: '/static/gifts/06_Клинок_Богомола.gif', png: '/static/gifts/06_Клинок_Богомола.png' },
    cozy_cup: { id: 'combat_stim', title: 'Нейро-Инжектор «MaxDoc»', rarity: 'Стимулятор', badgeClass: 'badge-combat-stim', gif: '/static/gifts/09_Нейро_Инжектор.gif', png: '/static/gifts/09_Нейро_Инжектор.png' },
    emp_grenade_legacy: { id: 'emp_grenade', title: 'Плазменная ЭМИ-Граната', rarity: 'Спец-Оружие', badgeClass: 'badge-emp-grenade', gif: '/static/gifts/08_ЭМИ_Граната.gif', png: '/static/gifts/08_ЭМИ_Граната.png' }
};

function getGiftTitle(type) {
    return (GIFT_SPECS[type] && GIFT_SPECS[type].title) || 'Подарок';
}

function renderGiftCard(gift, container, prepend = false) {
    const spec = GIFT_SPECS[gift.gift_type] || GIFT_SPECS.cyber_katana;
    const card = document.createElement('div');
    card.className = 'artifact-card-item' + (gift.is_hidden ? ' is-hidden-gift' : '');
    card.id = `gift-card-${gift.id}`;

    let senderText = '';
    if (gift.is_anonymous || !gift.sender) {
        senderText = 'От: <strong>Анонимный поклонник 🎭</strong>';
    } else {
        senderText = `От: <strong class="cursor-pointer" onclick="event.stopPropagation(); openUserProfile(${gift.sender.id})">@${escapeHtml(gift.sender.username)}</strong>`;
    }

    const noteHtml = gift.message ? `<div class="artifact-card-note" title="${escapeHtml(gift.message)}">«${escapeHtml(gift.message)}»</div>` : '';
    const hiddenBadge = gift.is_hidden ? '<span class="gift-hidden-badge">🔒 Скрыт от других</span>' : '';

    // Возможность скрывать подарки получателю
    let hideBtnHtml = '';
    if (currentProfileUserData && currentProfileUserData.id === window.CURRENT_USER_ID) {
        hideBtnHtml = `
            <button type="button" class="gift-hide-toggle-btn" onclick="toggleGiftHide(${gift.id}, event)">
                ${gift.is_hidden ? '👁️ Показать в профиле' : '🙈 Скрыть от других'}
            </button>
        `;
    }

    card.innerHTML = `
        ${hiddenBadge}
        <span class="artifact-rarity-pill ${spec.badgeClass}">${spec.rarity}</span>
        <div class="artifact-stage">
            <img src="${spec.gif || spec.png}" alt="${escapeHtml(spec.title)}" class="gift-art-img" loading="lazy">
        </div>
        <div class="artifact-card-title">${spec.title}</div>
        <div class="artifact-card-sender">${senderText}</div>
        ${noteHtml}
        ${hideBtnHtml}
    `;

    card.addEventListener('click', () => {
        openGiftDetail(gift);
    });

    if (prepend && container.firstChild) {
        container.insertBefore(card, container.firstChild);
    } else {
        container.appendChild(card);
    }
}

async function toggleGiftHide(giftId, event) {
    if (event) event.stopPropagation();

    try {
        const res = await fetch(`/api/gifts/${giftId}/toggle-hide`, { method: 'POST' });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Ошибка изменения видимости подарка');
        }

        const data = await res.json();
        showToast(data.is_hidden ? 'Подарок скрыт из вашего публичного профиля 🙈' : 'Подарок снова отображается в вашем профиле 👁️', 'success');

        if (currentProfileUserId) {
            loadUserProfile(currentProfileUserId);
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function openCurrentProfileGiftModal() {
    if (currentProfileUserData) {
        openSendGiftModal(currentProfileUserData.id, currentProfileUserData.display_name, currentProfileUserData.username);
    }
}

let giftSearchTimer = null;
function onGiftReceiverSearchInput(rawVal) {
    clearTimeout(giftSearchTimer);
    const receiverIdInput = document.getElementById('giftReceiverId');
    const foundBox = document.getElementById('giftReceiverFoundBox');
    const spinner = document.getElementById('giftReceiverSearchSpinner');

    const val = (rawVal || '').replace(/^@/, '').trim().toLowerCase();
    if (!val) {
        if (receiverIdInput) receiverIdInput.value = '';
        if (foundBox) foundBox.innerHTML = '<span style="color: var(--text-muted); font-size: 0.8rem;">Введите юзернейм пользователя сети</span>';
        return;
    }

    if (spinner) spinner.style.display = 'inline';

    giftSearchTimer = setTimeout(async () => {
        try {
            const res = await fetch(`/api/users?search=${encodeURIComponent(val)}`);
            if (spinner) spinner.style.display = 'none';
            if (!res.ok) throw new Error('Ошибка поиска');
            const users = await res.json();

            const match = users.find(u => u.username.toLowerCase() === val) ||
                          users.find(u => u.username.toLowerCase().startsWith(val)) ||
                          (users.length === 1 ? users[0] : null);

            if (match) {
                if (match.id === window.CURRENT_USER_ID) {
                    if (receiverIdInput) receiverIdInput.value = '';
                    if (foundBox) foundBox.innerHTML = '<span style="color: #ff4d6d; font-size: 0.82rem;">⚠️ Нельзя отправить подарок самому себе</span>';
                    return;
                }
                if (receiverIdInput) receiverIdInput.value = match.id;
                renderFoundRecipientBadge(match);
            } else {
                if (receiverIdInput) receiverIdInput.value = '';
                if (foundBox) foundBox.innerHTML = `<span style="color: #ff6b6b; font-size: 0.82rem;">❌ Пользователь "@${escapeHtml(val)}" не найден</span>`;
            }
        } catch (e) {
            if (spinner) spinner.style.display = 'none';
            if (receiverIdInput) receiverIdInput.value = '';
            if (foundBox) foundBox.innerHTML = '<span style="color: #ff6b6b; font-size: 0.82rem;">Ошибка соединения при поиске</span>';
        }
    }, 250);
}

function renderFoundRecipientBadge(user) {
    const foundBox = document.getElementById('giftReceiverFoundBox');
    if (!foundBox) return;
    const avatar = user.avatar_url || '/static/avatars/default.svg';
    foundBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; padding: 7px 12px; background: rgba(0, 240, 255, 0.08); border: 1px solid var(--accent-neon); border-radius: var(--radius-md);">
            <img src="${escapeHtml(avatar)}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid var(--accent-neon);">
            <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 600; color: #fff; font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${escapeHtml(user.display_name)} <span style="color: var(--accent-neon); font-size: 0.8rem;">(@${escapeHtml(user.username)})</span>
                </div>
                <div style="font-size: 0.73rem; color: var(--text-dim);">${escapeHtml(user.custom_rank || 'Участник сети')}</div>
            </div>
            <span style="color: #00ff88; font-size: 0.95rem; font-weight: bold;" title="Пользователь найден">✓ Найден</span>
        </div>
    `;
}

async function openSendGiftModal(receiverId = null, displayName = null, username = null, preselectedGiftType = 'cyber_katana') {
    if (!window.IS_AUTHENTICATED) {
        showToast('Пожалуйста, войдите в аккаунт для отправки подарка 🎁', 'error');
        openAuthModal('login');
        return;
    }

    const input = document.getElementById('giftReceiverSearchInput');
    const receiverIdInput = document.getElementById('giftReceiverId');
    const foundBox = document.getElementById('giftReceiverFoundBox');

    if (receiverId && username) {
        if (receiverId === window.CURRENT_USER_ID) {
            showToast('Нельзя отправить подарок самому себе 🙂', 'error');
            return;
        }
        if (receiverIdInput) receiverIdInput.value = receiverId;
        if (input) input.value = `@${username}`;
        renderFoundRecipientBadge({
            id: receiverId,
            display_name: displayName || username,
            username: username,
            avatar_url: '/static/avatars/default.svg'
        });
    } else {
        if (receiverIdInput) receiverIdInput.value = '';
        if (input) {
            input.value = '';
            setTimeout(() => input.focus(), 150);
        }
        if (foundBox) {
            foundBox.innerHTML = '<span style="color: var(--text-muted); font-size: 0.8rem;">Введите юзернейм пользователя сети</span>';
        }
    }

    document.getElementById('giftMessage').value = '';
    document.getElementById('giftIsAnonymous').checked = false;
    selectGiftType(preselectedGiftType || 'cyber_katana');

    const modal = document.getElementById('sendGiftModal');
    if (modal) modal.style.display = 'flex';
}

function closeSendGiftModal() {
    const modal = document.getElementById('sendGiftModal');
    if (modal) modal.style.display = 'none';
}

function selectGiftType(type) {
    document.getElementById('selectedGiftType').value = type;
    document.querySelectorAll('.gift-select-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-type') === type);
    });
    const spec = GIFT_SPECS[type] || GIFT_SPECS.cyber_katana;
    const badge = document.getElementById('selectedRarityBadge');
    if (badge) badge.textContent = spec.rarity;
}

function updateGiftCharCount() {
    const textarea = document.getElementById('giftMessage');
    const limitEl = document.getElementById('giftCharLimit');
    if (textarea && limitEl) {
        limitEl.textContent = `${textarea.value.length} / 300`;
    }
}

async function handleSendGiftSubmit(e) {
    e.preventDefault();
    const receiverId = parseInt(document.getElementById('giftReceiverId').value, 10);
    if (!receiverId || isNaN(receiverId)) {
        showToast('Пожалуйста, найдите и выберите получателя подарка 👥', 'error');
        document.getElementById('giftReceiverSearchInput')?.focus();
        return;
    }
    const giftType = document.getElementById('selectedGiftType').value;
    const message = document.getElementById('giftMessage').value.trim();
    const isAnonymous = document.getElementById('giftIsAnonymous').checked;

    const btn = document.getElementById('btnSubmitGift');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>Отправка...</span>';
    }

    try {
        const res = await fetch('/api/gifts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                receiver_id: receiverId,
                gift_type: giftType,
                message: message,
                is_anonymous: isAnonymous
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка отправки подарка');

        closeSendGiftModal();
        showToast(`🎁 Подарок «${getGiftTitle(giftType)}» успешно вручен! ✨`, 'success');

        if (currentProfileUserId === receiverId) {
            loadUserProfile(receiverId);
        }
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>Отправить подарок</span><span class="btn-arrow">🎁</span>';
        }
    }
}

// Unboxing detail modal
async function openGiftDetailById(giftId) {
    try {
        const res = await fetch('/api/gifts/showcase');
        if (!res.ok) return;
        const gifts = await res.json();
        const gift = gifts.find(g => g.id === giftId);
        if (gift) openGiftDetail(gift);
    } catch (e) {}
}

function openGiftDetail(gift) {
    const modal = document.getElementById('giftDetailModal');
    if (!modal) return;

    const spec = GIFT_SPECS[gift.gift_type] || GIFT_SPECS.cyber_katana;

    const img = document.getElementById('unboxingImg');
    if (img) img.src = spec.gif || spec.png;

    document.getElementById('unboxingTitle').textContent = spec.title;
    const rarityEl = document.getElementById('unboxingRarity');
    rarityEl.textContent = spec.rarity;
    rarityEl.className = `artifact-rarity-pill ${spec.badgeClass}`;

    const senderName = document.getElementById('unboxingSenderName');
    if (gift.is_anonymous || !gift.sender) {
        senderName.textContent = 'Анонимный поклонник 🎭';
    } else {
        senderName.textContent = `${gift.sender.display_name} (@${gift.sender.username})`;
    }

    const msgBox = document.getElementById('unboxingMessageBox');
    const msgText = document.getElementById('unboxingMessageText');
    if (gift.message) {
        msgText.textContent = `«${gift.message}»`;
        msgBox.style.display = 'block';
    } else {
        msgBox.style.display = 'none';
    }

    document.getElementById('unboxingDate').textContent = formatFullDate(gift.created_at);
    modal.style.display = 'flex';
}

function closeGiftDetailModal() {
    const modal = document.getElementById('giftDetailModal');
    if (modal) modal.style.display = 'none';
}

// ==========================================
// CYBERPUNK CUSTOM STUDIO & EDIT PROFILE MODAL
// ==========================================
let currentSelectedSkills = [];
let currentPinnedTrophyId = 0;

async function openEditProfileModal() {
    if (!currentProfileUserData) {
        try {
            const uid = window.CURRENT_USER_ID || 1;
            const res = await fetch(`/api/users/${uid}/profile`);
            if (res.ok) {
                const data = await res.json();
                currentProfileUserData = data.user;
            }
        } catch (e) {
            console.error("Failed to load profile for edit modal:", e);
        }
    }
    if (!currentProfileUserData) {
        showToast('Пожалуйста, войдите в профиль', 'error');
        return;
    }
    const u = currentProfileUserData;

    document.getElementById('editDisplayName').value = u.display_name || '';
    document.getElementById('editBio').value = u.bio || '';
    document.getElementById('editAvatar').value = u.avatar_url || '';
    document.getElementById('editBanner').value = u.banner_url || '';
    document.getElementById('editCustomRank').value = u.custom_rank || '';
    document.getElementById('editStatusEmoji').value = u.status_emoji || '⚡';
    document.getElementById('editStatusText').value = u.status_text || '';
    document.getElementById('editAccentColor').value = u.accent_color || '#00f0ff';
    document.getElementById('editAccentColorCustom').value = u.accent_color || '#00f0ff';
    document.getElementById('editAvatarFrame').value = u.avatar_frame || 'default';
    document.getElementById('editProfileBgEffect').value = u.profile_bg_effect || 'none';

    // Подсветка активных чипов
    setAvatarFrame(u.avatar_frame || 'default', false);
    setProfileBgEffect(u.profile_bg_effect || 'none', false);
    setAccentColorPreset(u.accent_color || '#00f0ff', false);

    // Стек и навыки
    currentSelectedSkills = (u.skills_tags || '').split(',').map(s => s.trim()).filter(Boolean);
    updateSkillsUI();

    // Социальные сети
    let social = {};
    try {
        if (u.social_links) social = JSON.parse(u.social_links);
    } catch(e) {}
    document.getElementById('editSocialTg').value = social.tg || '';
    document.getElementById('editSocialGh').value = social.gh || '';
    document.getElementById('editSocialDiscord').value = social.discord || '';
    document.getElementById('editSocialSteam').value = social.steam || '';
    document.getElementById('editSocialVk').value = social.vk || '';
    document.getElementById('editSocialWeb').value = social.web || '';

    // Главный экспонат
    initTrophyGrid(u.pinned_gift_id || 0);

    switchCustomTab('profile');
    updateModalLivePreview();

    const modal = document.getElementById('editProfileModal');
    if (modal) modal.style.display = 'flex';
}

function closeEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    if (modal) modal.style.display = 'none';
}

function switchCustomTab(tabKey) {
    const tabs = ['profile', 'status', 'avatar', 'theme', 'skills', 'social', 'trophy'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tabCustom${capitalize(t)}`);
        const pane = document.getElementById(`customPane${capitalize(t)}`);
        if (btn) btn.classList.toggle('active', t === tabKey);
        if (pane) pane.style.display = (t === tabKey) ? 'block' : 'none';
    });
}

function toggleSkillTag(skill) {
    const idx = currentSelectedSkills.indexOf(skill);
    if (idx >= 0) {
        currentSelectedSkills.splice(idx, 1);
    } else {
        if (currentSelectedSkills.length >= 10) {
            showToast('Максимум 10 навыков в профиле', 'info');
            return;
        }
        currentSelectedSkills.push(skill);
    }
    updateSkillsUI();
    updateModalLivePreview();
}

function addCustomSkillTag() {
    const input = document.getElementById('customSkillInput');
    if (!input) return;
    const val = input.value.trim().replace(/^[#@]/, '');
    if (!val) return;
    if (currentSelectedSkills.includes(val)) {
        showToast('Этот навык уже добавлен', 'info');
        input.value = '';
        return;
    }
    if (currentSelectedSkills.length >= 10) {
        showToast('Максимум 10 навыков в профиле', 'info');
        return;
    }
    currentSelectedSkills.push(val);
    input.value = '';
    updateSkillsUI();
    updateModalLivePreview();
}

function removeSkillTag(skill) {
    const idx = currentSelectedSkills.indexOf(skill);
    if (idx >= 0) {
        currentSelectedSkills.splice(idx, 1);
        updateSkillsUI();
        updateModalLivePreview();
    }
}

function updateSkillsUI() {
    const hidden = document.getElementById('editSkillsTags');
    if (hidden) hidden.value = currentSelectedSkills.join(',');

    document.querySelectorAll('#skillsPresetChips .choice-chip').forEach(chip => {
        const sk = chip.getAttribute('data-skill');
        chip.classList.toggle('selected', currentSelectedSkills.includes(sk));
    });

    const box = document.getElementById('selectedSkillsBadges');
    if (box) {
        if (currentSelectedSkills.length === 0) {
            box.innerHTML = '<span class="text-muted" style="font-size: 0.8rem;">Теги пока не выбраны</span>';
        } else {
            box.innerHTML = '';
            currentSelectedSkills.forEach(sk => {
                const b = document.createElement('span');
                b.className = 'selected-skill-badge';
                b.innerHTML = `<span>#${escapeHtml(sk)}</span> <span class="remove-tag" onclick="removeSkillTag('${escapeHtml(sk)}')">✕</span>`;
                box.appendChild(b);
            });
        }
    }
}

async function initTrophyGrid(selectedId = 0) {
    currentPinnedTrophyId = selectedId;
    const grid = document.getElementById('trophySelectGrid');
    const emptyNotice = document.getElementById('trophyEmptyMessage');
    const hidden = document.getElementById('editPinnedGiftId');
    if (hidden) hidden.value = selectedId;
    if (!grid) return;
    grid.innerHTML = '<div style="color: var(--text-dim); font-size: 0.85rem; padding: 0.5rem;">Загрузка коллекции подарков...</div>';

    let ownedGifts = [];
    try {
        const uid = (currentProfileUserData && currentProfileUserData.id) || window.CURRENT_USER_ID;
        if (uid) {
            const res = await fetch(`/api/users/${uid}/gifts`);
            if (res.ok) {
                ownedGifts = await res.json();
            }
        }
    } catch (e) {
        console.error('Error fetching owned gifts:', e);
    }

    grid.innerHTML = '';

    // Всегда доступен вариант: "Без экспоната"
    const card0 = document.createElement('div');
    card0.className = `trophy-select-card ${selectedId === 0 ? 'active' : ''}`;
    card0.setAttribute('data-gift-id', '0');
    card0.innerHTML = `
        <div style="font-size: 1.8rem; margin-bottom: 0.2rem;">🚫</div>
        <span class="trophy-select-name">Без экспоната</span>
    `;
    card0.onclick = () => selectPinnedTrophy(0);
    grid.appendChild(card0);

    const giftKeys = Object.keys(GIFT_SPECS);
    const ownedCounts = {};
    ownedGifts.forEach(g => {
        if (g.gift_type) {
            ownedCounts[g.gift_type] = (ownedCounts[g.gift_type] || 0) + 1;
        }
    });

    const ownedTypes = Object.keys(ownedCounts);
    if (ownedTypes.length === 0) {
        if (emptyNotice) emptyNotice.style.display = 'block';
        selectPinnedTrophy(0);
    } else {
        if (emptyNotice) emptyNotice.style.display = 'none';

        // Проверяем, есть ли ранее выбранный артефакт в коллекции
        const selectedKey = (selectedId > 0 && selectedId <= giftKeys.length) ? giftKeys[selectedId - 1] : null;
        if (selectedId > 0 && (!selectedKey || !ownedCounts[selectedKey])) {
            selectPinnedTrophy(0);
        }

        // Рендерим ТОЛЬКО те подарки, которые реально есть у пользователя!
        giftKeys.forEach((key, idx) => {
            if (!ownedCounts[key]) return;
            const spec = GIFT_SPECS[key];
            const giftId = idx + 1;
            const count = ownedCounts[key];
            const card = document.createElement('div');
            card.className = `trophy-select-card ${currentPinnedTrophyId === giftId ? 'active' : ''}`;
            card.setAttribute('data-gift-id', giftId.toString());
            card.innerHTML = `
                <div style="position: relative; display: inline-block;">
                    <img src="${spec.png}" alt="${spec.title}" class="trophy-select-img">
                    <span style="position: absolute; bottom: 2px; right: 2px; background: rgba(0,0,0,0.85); border: 1px solid var(--accent-neon); color: var(--accent-neon); font-size: 0.68rem; font-weight: bold; padding: 1px 5px; border-radius: 8px;">x${count}</span>
                </div>
                <span class="trophy-select-name">${spec.title}</span>
                <span style="font-size: 0.68rem; color: var(--text-dim);">${spec.rarity}</span>
            `;
            card.onclick = () => selectPinnedTrophy(giftId);
            grid.appendChild(card);
        });
    }
}

function selectPinnedTrophy(giftId) {
    currentPinnedTrophyId = giftId;
    const hidden = document.getElementById('editPinnedGiftId');
    if (hidden) hidden.value = giftId;

    document.querySelectorAll('#trophySelectGrid .trophy-select-card').forEach(c => {
        const id = parseInt(c.getAttribute('data-gift-id'), 10);
        c.classList.toggle('active', id === giftId);
    });
}

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function setRankPreset(rank) {
    document.getElementById('editCustomRank').value = rank;
    updateModalLivePreview();
}

function setStatusEmojiPreset(emoji) {
    const el = document.getElementById('editStatusEmoji');
    if (el) el.value = emoji;
    updateModalLivePreview();
}

// ==========================================
// КОНСТРУКТОР ГОЛО-РАМКИ АВАТАРКИ
// ==========================================
let customFrameState = {
    shape: 'circle',
    width: '3px',
    glow: 'bright',
    anim: 'none',
    color: 'auto'
};

function parseFrameString(frameVal) {
    if (!frameVal || !frameVal.startsWith('custom:')) return null;
    const parts = frameVal.split(':');
    return {
        shape: parts[1] || 'circle',
        width: parts[2] || '3px',
        glow: parts[3] || 'bright',
        anim: parts[4] || 'none',
        color: parts[5] || 'auto'
    };
}

function setCustomFrameProp(prop, val) {
    customFrameState[prop] = val;
    const frameStr = `custom:${customFrameState.shape}:${customFrameState.width}:${customFrameState.glow}:${customFrameState.anim}:${customFrameState.color}`;
    document.getElementById('editAvatarFrame').value = frameStr;

    ['default', 'pulse', 'hex', 'glitch', 'gold'].forEach(k => {
        const chip = document.getElementById(`chipFrame-${k}`);
        if (chip) chip.classList.remove('active');
    });

    updateCustomFrameBuilderUI();
    updateModalLivePreview();
}

function updateCustomFrameBuilderUI() {
    document.querySelectorAll('#cfShapeRow .choice-chip').forEach(chip => {
        chip.classList.toggle('active', chip.getAttribute('data-cf-shape') === customFrameState.shape);
    });
    document.querySelectorAll('#cfWidthRow .choice-chip').forEach(chip => {
        chip.classList.toggle('active', chip.getAttribute('data-cf-width') === customFrameState.width);
    });
    document.querySelectorAll('#cfGlowRow .choice-chip').forEach(chip => {
        chip.classList.toggle('active', chip.getAttribute('data-cf-glow') === customFrameState.glow);
    });
    document.querySelectorAll('#cfAnimRow .choice-chip').forEach(chip => {
        chip.classList.toggle('active', chip.getAttribute('data-cf-anim') === customFrameState.anim);
    });
    const autoChip = document.querySelector('#customPaneAvatar [data-cf-color="auto"]');
    if (autoChip) autoChip.classList.toggle('active', customFrameState.color === 'auto');
    const colorPicker = document.getElementById('cfCustomColorPicker');
    if (colorPicker && customFrameState.color !== 'auto') {
        colorPicker.value = customFrameState.color;
    }
}

function setAvatarFrame(frameKey, updatePreview = true) {
    document.getElementById('editAvatarFrame').value = frameKey;
    ['default', 'pulse', 'hex', 'glitch', 'gold'].forEach(k => {
        const chip = document.getElementById(`chipFrame-${k}`);
        if (chip) chip.classList.toggle('active', k === frameKey);
    });

    if (frameKey.startsWith('custom:')) {
        const parsed = parseFrameString(frameKey);
        if (parsed) customFrameState = parsed;
        updateCustomFrameBuilderUI();
    } else {
        document.querySelectorAll('.custom-frame-builder-box .choice-chip').forEach(c => c.classList.remove('active'));
    }

    if (updatePreview) updateModalLivePreview();
}

function applyAvatarFrame(frameBox, frameVal, accentColor) {
    if (!frameBox) return;
    const img = frameBox.querySelector('.hero-avatar') || frameBox.querySelector('img');
    if (!frameVal) frameVal = 'default';
    const acc = accentColor || '#00f0ff';
    frameBox.style.setProperty('--profile-accent', acc);

    // Сброс инлайновых оверрайдов
    frameBox.style.borderRadius = '';
    frameBox.style.animation = '';
    frameBox.style.boxShadow = '';
    frameBox.style.outline = '';
    frameBox.style.border = '';
    frameBox.style.background = '';
    if (img) {
        img.style.borderRadius = '';
        img.style.border = '';
        img.style.boxShadow = '';
    }

    if (frameVal.startsWith('custom:')) {
        frameBox.className = 'avatar-frame-box avatar-frame-custom';
        const parts = frameVal.split(':');
        const shape = parts[1] || 'circle';
        const width = parts[2] || '3px';
        const glow = parts[3] || 'bright';
        const anim = parts[4] || 'none';
        const color = (parts[5] && parts[5] !== 'auto') ? parts[5] : acc;

        let radBox = '50%';
        let radImg = '50%';
        if (shape === 'squircle') { radBox = '26px'; radImg = '22px'; }
        else if (shape === 'shield') { radBox = '35% 35% 50% 50%'; radImg = '35% 35% 50% 50%'; }
        else if (shape === 'diamond') { radBox = '40% 10% 40% 10%'; radImg = '40% 10% 40% 10%'; }

        frameBox.style.borderRadius = radBox;
        if (img) {
            img.style.borderRadius = radImg;
            img.style.border = `${width} solid ${color}`;
        }

        if (glow === 'soft') {
            frameBox.style.boxShadow = `0 0 14px ${color}66`;
        } else if (glow === 'bright') {
            frameBox.style.boxShadow = `0 0 24px ${color}, inset 0 0 10px ${color}55`;
        } else if (glow === 'overdrive') {
            frameBox.style.boxShadow = `0 0 35px ${color}, 0 0 55px ${color}88`;
        } else if (glow === 'dual') {
            frameBox.style.boxShadow = `0 0 0 3px rgba(8,11,17,0.9), 0 0 20px ${color}`;
            frameBox.style.outline = `2px dashed ${color}`;
        }

        if (anim === 'pulse') frameBox.style.animation = 'pulseAura 2s infinite ease-in-out';
        else if (anim === 'spin') frameBox.style.animation = 'spinAura 6s infinite linear';
        else if (anim === 'glitch') frameBox.style.animation = 'glitchAura 2.5s infinite steps(2)';
        else if (anim === 'rainbow') frameBox.style.animation = 'rainbowAura 4s infinite linear';
    } else {
        frameBox.className = `avatar-frame-box avatar-frame-${frameVal}`;
    }
}

function setAccentColorPreset(colorHex, updatePreview = true) {
    document.getElementById('editAccentColor').value = colorHex;
    document.getElementById('editAccentColorCustom').value = colorHex;

    document.querySelectorAll('.aura-color-swatch').forEach(sw => {
        const dc = sw.getAttribute('data-color');
        const bg = sw.style.backgroundColor;
        const isMatch = (dc && dc.toLowerCase() === colorHex.toLowerCase()) || 
                        (bg && bg.toLowerCase() === colorHex.toLowerCase()) ||
                        (sw.getAttribute('title') && sw.getAttribute('title').toLowerCase().includes(colorHex.toLowerCase()));
        sw.classList.toggle('active', !!isMatch);
    });

    if (updatePreview) updateModalLivePreview();
}

function setProfileBgEffect(effectKey, updatePreview = true) {
    document.getElementById('editProfileBgEffect').value = effectKey;
    ['none', 'scanlines', 'hex_grid', 'cyber_dots'].forEach(k => {
        const chip = document.getElementById(`chipEffect-${k}`);
        if (chip) chip.classList.toggle('active', k === effectKey);
    });
    if (updatePreview) updateModalLivePreview();
}

function setBannerPreset(url) {
    document.getElementById('editBanner').value = url;
    document.querySelectorAll('.banner-preset-thumb').forEach(thumb => {
        thumb.classList.toggle('active', thumb.style.backgroundImage.includes(url));
    });
    showToast('Обложка выбрана из киберпанк-коллекции! 🌆', 'success');
    updateModalLivePreview();
}

function triggerAvatarUpload() {
    const input = document.getElementById('modalAvatarFileInput');
    if (input) input.click();
}

async function handleModalAvatarFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        showToast('Загрузка аватарки на сервер...', 'info');
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        if (!res.ok) throw new Error('Ошибка загрузки аватарки');
        const data = await res.json();
        document.getElementById('editAvatar').value = data.url;
        updateModalLivePreview();
        showToast('Аватарка успешно загружена с диска! 🖼️✨', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function triggerBannerUpload() {
    const input = document.getElementById('modalBannerFileInput');
    if (input) input.click();
}

async function handleModalBannerFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        showToast('Загрузка обложки на сервер...', 'info');
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        if (!res.ok) throw new Error('Ошибка загрузки обложки');
        const data = await res.json();
        document.getElementById('editBanner').value = data.url;
        updateModalLivePreview();
        showToast('Обложка успешно загружена с диска! 🌌✨', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function updateModalLivePreview() {
    const name = document.getElementById('editDisplayName').value.trim() || 'Пользователь';
    const rank = document.getElementById('editCustomRank').value.trim();
    const avatarUrl = document.getElementById('editAvatar').value.trim() || '/static/avatars/default.svg';
    const frame = document.getElementById('editAvatarFrame').value || 'default';
    const color = document.getElementById('editAccentColor').value || '#00f0ff';
    const emoji = document.getElementById('editStatusEmoji').value || '⚡';
    const statusText = document.getElementById('editStatusText').value.trim();

    document.getElementById('previewDisplayName').textContent = name;
    if (currentProfileUserData) {
        document.getElementById('previewUsername').textContent = `@${currentProfileUserData.username}`;
    }

    const previewAvatar = document.getElementById('previewAvatarImg');
    if (previewAvatar) previewAvatar.src = avatarUrl;

    const previewFrame = document.getElementById('previewAvatarFrameBox');
    if (previewFrame) {
        applyAvatarFrame(previewFrame, frame, color);
    }

    const rankBadge = document.getElementById('previewRankBadge');
    if (rankBadge) {
        if (rank) {
            rankBadge.textContent = rank;
            rankBadge.style.color = color;
            rankBadge.style.borderColor = color;
            rankBadge.style.display = 'inline-flex';
        } else {
            rankBadge.style.display = 'none';
        }
    }

    const previewBox = document.getElementById('modalLivePreviewBox');
    if (previewBox) {
        previewBox.style.borderColor = color;
        previewBox.style.boxShadow = `0 0 20px ${color}25`;
    }

    const statusWrap = document.getElementById('previewStatusCapsuleWrap');
    if (statusWrap) {
        if (statusText) {
            document.getElementById('previewStatusEmoji').textContent = emoji;
            document.getElementById('previewStatusText').textContent = statusText;
            statusWrap.style.display = 'block';
        } else {
            statusWrap.style.display = 'none';
        }
    }

    const prevSkills = document.getElementById('previewSkillsWrap');
    if (prevSkills) {
        if (currentSelectedSkills && currentSelectedSkills.length > 0) {
            prevSkills.innerHTML = currentSelectedSkills.slice(0, 3).map(s => `<span class="skill-tag-chip" style="font-size: 0.68rem; padding: 1px 6px;">#${escapeHtml(s)}</span>`).join(' ');
            prevSkills.style.display = 'flex';
        } else {
            prevSkills.style.display = 'none';
        }
    }
}

async function handleProfileUpdate(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const nameInput = document.getElementById('editDisplayName');
    const displayName = nameInput ? nameInput.value.trim() : '';
    if (!displayName) {
        showToast('Пожалуйста, введите имя профиля', 'error');
        switchCustomTab('profile');
        if (nameInput) nameInput.focus();
        return;
    }

    const bio = (document.getElementById('editBio')?.value || '').trim();
    const avatarUrl = (document.getElementById('editAvatar')?.value || '').trim();
    const bannerUrl = (document.getElementById('editBanner')?.value || '').trim();
    const customRank = (document.getElementById('editCustomRank')?.value || '').trim();
    const statusEmoji = (document.getElementById('editStatusEmoji')?.value || '⚡').trim();
    const statusText = (document.getElementById('editStatusText')?.value || '').trim();
    const accentColor = (document.getElementById('editAccentColor')?.value || '#00f0ff').trim();
    const avatarFrame = (document.getElementById('editAvatarFrame')?.value || 'default').trim();
    const profileBgEffect = (document.getElementById('editProfileBgEffect')?.value || 'none').trim();

    const skillsTags = (currentSelectedSkills || []).join(',');
    const socialLinksObj = {
        tg: (document.getElementById('editSocialTg')?.value || '').trim(),
        gh: (document.getElementById('editSocialGh')?.value || '').trim(),
        discord: (document.getElementById('editSocialDiscord')?.value || '').trim(),
        steam: (document.getElementById('editSocialSteam')?.value || '').trim(),
        vk: (document.getElementById('editSocialVk')?.value || '').trim(),
        web: (document.getElementById('editSocialWeb')?.value || '').trim()
    };
    const pinnedGiftId = parseInt(document.getElementById('editPinnedGiftId')?.value || '0', 10) || 0;

    const saveBtn = document.getElementById('btnSaveProfile');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span>Сохранение...</span>';
    }

    try {
        const res = await fetch('/api/users/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                display_name: displayName,
                bio: bio,
                avatar_url: avatarUrl,
                banner_url: bannerUrl,
                custom_rank: customRank,
                status_emoji: statusEmoji,
                status_text: statusText,
                accent_color: accentColor,
                avatar_frame: avatarFrame,
                profile_bg_effect: profileBgEffect,
                skills_tags: skillsTags,
                social_links: JSON.stringify(socialLinksObj),
                pinned_gift_id: pinnedGiftId
            })
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Ошибка обновления профиля');
        }

        const updated = await res.json();
        currentProfileUserData = updated;
        closeEditProfileModal();
        showToast('Профиль и кибер-стиль успешно сохранены! 🎨⚡', 'success');

        const uid = currentProfileUserId || window.CURRENT_USER_ID || 1;
        loadUserProfile(uid);
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<span>Сохранить в профиль</span><span class="btn-arrow">→</span>';
        }
    }
}

// ==========================================
// СОЗДАНИЕ ПОСТА В ПРОФИЛЕ С ФОТО
// ==========================================
let currentProfUploadedImageUrl = '';

function toggleProfImageBox() {
    const box = document.getElementById('profImageBox');
    if (!box) return;
    box.style.display = (box.style.display === 'none' || !box.style.display) ? 'block' : 'none';
    if (box.style.display === 'block') {
        const inp = document.getElementById('profImageUrl');
        if (inp) inp.focus();
    }
}

function updateProfImagePreview() {
    const urlInput = document.getElementById('profImageUrl');
    const url = urlInput ? urlInput.value.trim() : '';
    const previewBox = document.getElementById('profUploadPreview');
    const previewImg = document.getElementById('profPreviewImg');
    const previewName = document.getElementById('profPreviewName');
    const previewSize = document.getElementById('profPreviewSize');

    if (url) {
        currentProfUploadedImageUrl = url;
        if (previewImg) {
            previewImg.src = url;
            previewImg.style.display = 'block';
        }
        if (previewName) previewName.textContent = 'Изображение по ссылке';
        if (previewSize) previewSize.textContent = 'Внешний URL';
        if (previewBox) previewBox.style.display = 'block';
    } else if (!currentProfUploadedImageUrl || currentProfUploadedImageUrl.startsWith('http')) {
        clearProfComposerFile();
    }
}

async function handleProfComposerFileUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.size > 30 * 1024 * 1024) {
        showToast('Размер файла не должен превышать 30 МБ', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    showToast('Загрузка фото...', 'info');

    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Ошибка загрузки фото');
        }

        const data = await res.json();
        currentProfUploadedImageUrl = data.url;

        const previewBox = document.getElementById('profUploadPreview');
        const previewImg = document.getElementById('profPreviewImg');
        const previewName = document.getElementById('profPreviewName');
        const previewSize = document.getElementById('profPreviewSize');

        if (previewBox && previewName && previewSize) {
            previewName.textContent = data.filename || file.name;
            previewSize.textContent = formatBytes(data.size || file.size);
            if (previewImg) {
                previewImg.src = data.url;
                previewImg.style.display = 'block';
            }
            previewBox.style.display = 'block';
        }

        showToast('Фото успешно прикреплено', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function clearProfComposerFile() {
    currentProfUploadedImageUrl = '';
    const fileInput = document.getElementById('profFileInput');
    if (fileInput) fileInput.value = '';
    const urlInput = document.getElementById('profImageUrl');
    if (urlInput) urlInput.value = '';
    const previewBox = document.getElementById('profUploadPreview');
    if (previewBox) previewBox.style.display = 'none';
    const previewImg = document.getElementById('profPreviewImg');
    if (previewImg) previewImg.src = '';
}

async function createProfilePost() {
    const textarea = document.getElementById('profPostContent');
    let content = textarea ? textarea.value.trim() : '';
    const urlInput = document.getElementById('profImageUrl');
    const imageUrl = currentProfUploadedImageUrl || (urlInput ? urlInput.value.trim() : '');

    if (imageUrl && content === imageUrl) {
        content = '';
    }

    if (!content && !imageUrl) {
        showToast('Введите текст публикации или прикрепите фото', 'error');
        return;
    }

    try {
        const res = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.CURRENT_USER_ID,
                content: content,
                image_url: imageUrl
            })
        });

        const post = await res.json();
        if (!res.ok) throw new Error(post.error || 'Ошибка публикации');

        if (textarea) textarea.value = '';
        clearProfComposerFile();
        showToast('Запись опубликована в ваш профиль', 'success');

        const profPosts = document.getElementById('profPostsContainer');
        if (profPosts) {
            const empty = profPosts.querySelector('.cyber-empty-card');
            if (empty) empty.remove();
            const el = createPostElement(post);
            profPosts.insertBefore(el, profPosts.firstChild);
        }

        const feedPosts = document.getElementById('feedPostsContainer');
        if (feedPosts) {
            const elFeed = createPostElement(post);
            feedPosts.insertBefore(elFeed, feedPosts.firstChild);
        }

        const stat = document.getElementById('heroStatPosts');
        if (stat) stat.textContent = parseInt(stat.textContent || '0') + 1;
        const badge = document.getElementById('badgeProfPosts');
        if (badge) badge.textContent = parseInt(badge.textContent || '0') + 1;
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// Showcase Gifts Gallery & 9 Cyberpunk Artifacts Catalog
function renderVaultCatalog() {
    const grid = document.getElementById('vaultCatalogGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const giftKeys = ['cyber_katana', 'neuro_visor', 'quantum_heart', 'samurai_helmet', 'synthwave_cassette', 'mantis_blade', 'tactical_drone', 'emp_grenade', 'combat_stim'];

    giftKeys.forEach((key, idx) => {
        const spec = GIFT_SPECS[key];
        if (!spec) return;
        const card = document.createElement('div');
        card.className = 'artifact-card-item catalog-gift-card';
        card.innerHTML = `
            <span class="artifact-rarity-pill ${spec.badgeClass}">${spec.rarity}</span>
            <div class="artifact-stage">
                <img src="${spec.gif || spec.png}" alt="${escapeHtml(spec.title)}" class="gift-art-img" loading="lazy">
            </div>
            <div class="artifact-card-title">${spec.title}</div>
            <div class="artifact-catalog-desc" style="font-size: 0.78rem; color: var(--text-dim); line-height: 1.4; margin: 0.4rem 0 0.8rem; min-height: 34px;">${spec.desc || ''}</div>
        `;
        card.addEventListener('click', () => {
            openSendGiftModal(null, null, null, spec.id);
        });
        grid.appendChild(card);
    });
}

function switchVaultTab(tab) {
    const catGrid = document.getElementById('vaultCatalogGrid');
    const histGrid = document.getElementById('globalShowcaseGrid');
    const btnCat = document.getElementById('tabVaultCatalog');
    const btnHist = document.getElementById('tabVaultHistory');

    if (tab === 'catalog') {
        if (catGrid) catGrid.style.display = 'grid';
        if (histGrid) histGrid.style.display = 'none';
        if (btnCat) btnCat.classList.add('active');
        if (btnHist) btnHist.classList.remove('active');
    } else {
        if (catGrid) catGrid.style.display = 'none';
        if (histGrid) histGrid.style.display = 'grid';
        if (btnCat) btnCat.classList.remove('active');
        if (btnHist) btnHist.classList.add('active');
    }
}

async function loadShowcaseGifts() {
    renderVaultCatalog();
    switchVaultTab('catalog');

    const grid = document.getElementById('globalShowcaseGrid');
    if (!grid) return;
    grid.innerHTML = '<p class="text-muted" style="grid-column: 1 / -1; padding: 24px; text-align: center;">Загрузка подарков...</p>';

    try {
        const res = await fetch('/api/gifts/showcase');
        if (!res.ok) throw new Error('Ошибка загрузки подарков');
        const gifts = await res.json();

        grid.innerHTML = '';
        if (!gifts || gifts.length === 0) {
            grid.innerHTML = '<p class="text-muted" style="grid-column: 1 / -1; padding: 24px; text-align: center;">В истории пока нет подарков. Выберите артефакт в каталоге и отправьте первый!</p>';
            return;
        }

        gifts.forEach(gift => {
            renderGiftCard(gift, grid);
        });
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ==========================================
// NOTIFICATIONS SYSTEM WITH SMART GROUPING
// ==========================================
let cachedNotifications = [];
let activeNotifFilter = 'all';
let notifToastQueue = [];
let notifToastTimeout = null;

function toggleNotificationsPanel() {
    const modal = document.getElementById('notificationsModal');
    if (!modal) return;
    if (modal.style.display === 'none' || !modal.style.display) {
        modal.style.display = 'flex';
        loadNotifications();
    } else {
        modal.style.display = 'none';
    }
}

function closeNotificationsPanel() {
    const modal = document.getElementById('notificationsModal');
    if (modal) modal.style.display = 'none';
}

async function loadNotifications() {
    const list = document.getElementById('notificationsList');
    if (!list) return;

    try {
        const res = await fetch('/api/notifications');
        if (!res.ok) throw new Error('Ошибка загрузки уведомлений');
        const data = await res.json();
        cachedNotifications = data || [];
        renderNotificationsList(cachedNotifications, activeNotifFilter);
        updateUnreadNotifsBadges();
    } catch (err) {
        list.innerHTML = `<div class="notif-empty-state"><p>${escapeHtml(err.message)}</p></div>`;
    }
}

function filterNotifications(filterType) {
    activeNotifFilter = filterType;
    document.querySelectorAll('.notif-tab').forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-filter') === filterType);
    });
    renderNotificationsList(cachedNotifications, filterType);
}

function renderNotificationsList(notifs, filter = 'all') {
    const list = document.getElementById('notificationsList');
    if (!list) return;

    let filtered = notifs;
    if (filter !== 'all') {
        filtered = notifs.filter(n => n.action_type === filter);
    }

    if (!filtered || filtered.length === 0) {
        list.innerHTML = `
            <div class="notif-empty-state">
                <span class="notif-empty-glyph">🔕</span>
                <p>Нет уведомлений в этой категории</p>
            </div>
        `;
        return;
    }

    list.innerHTML = '';
    filtered.forEach(n => {
        const card = document.createElement('div');
        card.className = 'notif-item-card' + (!n.is_read ? ' unread' : '');

        let avatarsHtml = '';
        (n.actors || []).forEach(a => {
            avatarsHtml += `<img src="${escapeHtml(a.avatar_url)}" alt="${escapeHtml(a.display_name)}" class="notif-avatar" title="${escapeHtml(a.display_name)}">`;
        });
        if (!avatarsHtml) {
            avatarsHtml = `<div class="notif-avatar" style="background:#e26d5c;display:flex;align-items:center;justify-content:center;color:#fff;font-size:1rem;">🔔</div>`;
        }

        const unreadDot = !n.is_read ? '<span class="notif-unread-dot"></span>' : '';

        card.innerHTML = `
            <div class="notif-avatar-stack">${avatarsHtml}</div>
            <div class="notif-body">
                <div class="notif-title">${escapeHtml(n.title)}</div>
                <div class="notif-snippet">${escapeHtml(n.snippet)}</div>
                <div class="notif-time">${formatTime(n.latest_at)}</div>
            </div>
            ${unreadDot}
        `;

        card.onclick = async () => {
            if (!n.is_read && n.ids && n.ids.length > 0) {
                await fetch('/api/notifications/read', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: n.ids })
                });
                n.is_read = true;
                card.classList.remove('unread');
                updateUnreadNotifsBadges();
            }

            closeNotificationsPanel();

            if (n.action_type === 'like' || n.action_type === 'comment') {
                navigateTo('feed');
                const postEl = document.getElementById(`post-${n.target_id}`);
                if (postEl) {
                    postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    postEl.style.boxShadow = '0 0 0 3px #e26d5c';
                    setTimeout(() => postEl.style.boxShadow = '', 2000);
                }
            } else if (n.action_type === 'follow') {
                if (n.actors && n.actors.length > 0) {
                    navigateTo('profile', n.actors[0].id);
                }
            } else if (n.action_type === 'message') {
                navigateTo('messages');
                if (n.actors && n.actors.length > 0) {
                    openChatWithUser(n.actors[0].id);
                }
            } else if (n.action_type === 'gift') {
                navigateTo('profile', window.CURRENT_USER_ID);
                switchProfileTab('gifts');
            }
        };

        list.appendChild(card);
    });
}

async function markAllNotificationsRead() {
    try {
        await fetch('/api/notifications/read-all', { method: 'POST' });
        cachedNotifications.forEach(n => n.is_read = true);
        renderNotificationsList(cachedNotifications, activeNotifFilter);
        updateUnreadNotifsBadges();
        showToast('Все уведомления прочитаны ✓', 'success');
    } catch (e) {
        showToast('Ошибка обновления статуса', 'error');
    }
}

async function updateUnreadNotifsBadges() {
    try {
        const res = await fetch('/api/notifications/unread');
        if (res.ok) {
            const data = await res.json();
            const count = data.unread_count || 0;
            const badgeNav = document.getElementById('hudNotifNavBadge');
            const badgeHeader = document.getElementById('headerNotifBadge');
            const modalBadge = document.getElementById('notifTotalBadge');

            if (modalBadge) modalBadge.textContent = count;

            [badgeNav, badgeHeader].forEach(b => {
                if (!b) return;
                if (count > 0) {
                    b.textContent = count;
                    b.style.display = 'inline-flex';
                } else {
                    b.style.display = 'none';
                }
            });
        }
    } catch (e) {}
}

function handleIncomingNotification(payload) {
    updateUnreadNotifsBadges();
    playAudioChime(520, 880, 0.15);

    if (payload && payload.title) {
        notifToastQueue.push(payload.title);
    }

    if (notifToastTimeout) clearTimeout(notifToastTimeout);
    notifToastTimeout = setTimeout(() => {
        if (notifToastQueue.length === 1) {
            showToast(`🔔 ${notifToastQueue[0]}`, 'success');
        } else if (notifToastQueue.length > 1) {
            showToast(`🔔 Получено ${notifToastQueue.length} новых уведомлений`, 'success');
        }
        notifToastQueue = [];
    }, 400);
}

// ==========================================
// DIRECT MESSAGES (FIXED DOUBLE-SENDING BUG & ATTACHMENTS)
// ==========================================
let activeChatUserId = null;
let activeInterlocutorData = null;
let cachedConversations = [];

async function loadConversations() {
    const listEl = document.getElementById('conversationsList');
    if (!listEl) return;

    try {
        const res = await fetch('/api/messages/conversations');
        if (!res.ok) {
            if (res.status === 401) return;
            throw new Error('Ошибка загрузки диалогов');
        }

        const convs = await res.json();
        cachedConversations = convs || [];
        renderConversationsList(cachedConversations);
        updateUnreadMessagesCountBadge();
    } catch (err) {
        listEl.innerHTML = `<div class="chat-empty-hint">${escapeHtml(err.message)}</div>`;
    }
}

function renderConversationsList(convs) {
    const listEl = document.getElementById('conversationsList');
    if (!listEl) return;

    if (!convs || convs.length === 0) {
        listEl.innerHTML = `
            <div class="chat-empty-hint" style="padding: 1.5rem 1rem; text-align: center;">
                <div style="font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.7;">💬</div>
                <div style="font-weight: 700; color: #fff; margin-bottom: 0.3rem;">Нет активных диалогов</div>
                <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 1rem;">
                    Диалог появится здесь, как только вы начнете общение с пользователем.
                </div>
                <button class="btn btn-primary btn-sm" onclick="openNewChatModal()">
                    <span>+ Начать диалог</span>
                </button>
            </div>
        `;
        return;
    }

    listEl.innerHTML = '';
    convs.forEach(c => {
        const item = document.createElement('div');
        item.className = 'conversation-item' + (c.user.id === activeChatUserId ? ' active' : '');
        item.dataset.userId = c.user.id;

        const previewText = c.last_message ? escapeHtml(c.last_message.content) : '<span style="opacity: 0.6; font-style: italic;">Нажмите, чтобы открыть чат</span>';
        const timeText = c.last_message ? formatTime(c.last_message.created_at) : '';
        const unreadBadge = c.unread_count > 0 ? `<span class="conv-unread-badge">${c.unread_count}</span>` : '';

        item.innerHTML = `
            <div class="conv-avatar-wrap">
                <img src="${escapeHtml(c.user.avatar_url)}" alt="avatar" class="conv-avatar">
                <span class="chat-online-dot"></span>
            </div>
            <div class="conv-info">
                <div class="conv-top-line">
                    <span class="conv-name">${escapeHtml(c.user.display_name)}</span>
                    <span class="conv-time">${timeText}</span>
                </div>
                <div class="conv-bottom-line">
                    <span class="conv-preview">${previewText}</span>
                    ${unreadBadge}
                </div>
            </div>
        `;

        item.onclick = () => {
            openChatWithUser(c.user.id, c.user.display_name, c.user.username, c.user.avatar_url);
        };

        listEl.appendChild(item);
    });
}

function filterConversations() {
    const q = (document.getElementById('chatSearchInput')?.value || '').toLowerCase().trim();
    if (!q) {
        renderConversationsList(cachedConversations);
        return;
    }

    const filtered = cachedConversations.filter(c => 
        c.user.display_name.toLowerCase().includes(q) || 
        c.user.username.toLowerCase().includes(q) ||
        (c.last_message && c.last_message.content.toLowerCase().includes(q))
    );
    renderConversationsList(filtered);
}

async function openChatWithUser(userId, displayName = null, username = null, avatarUrl = null) {
    if (!window.IS_AUTHENTICATED && !window.CURRENT_USER_ID) {
        openAuthModal('login');
        showToast('Войдите в систему для отправки сообщений', 'error');
        return;
    }

    navigateTo('messages');
    activeChatUserId = userId;

    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.toggle('active', parseInt(item.dataset.userId, 10) === userId);
    });

    const noSel = document.getElementById('chatNoSelection');
    const activeWin = document.getElementById('chatActiveWindow');
    if (noSel) noSel.style.display = 'none';
    if (activeWin) activeWin.style.display = 'flex';

    if (displayName && username && avatarUrl) {
        activeInterlocutorData = { id: userId, display_name: displayName, username: username, avatar_url: avatarUrl };
        updateChatHeader(activeInterlocutorData);
    } else {
        const found = cachedConversations.find(c => c.user.id === userId);
        if (found) {
            activeInterlocutorData = found.user;
            updateChatHeader(found.user);
        } else {
            try {
                const res = await fetch(`/api/users/${userId}/profile`);
                if (res.ok) {
                    const data = await res.json();
                    activeInterlocutorData = data.user;
                    updateChatHeader(data.user);
                }
            } catch (e) {}
        }
    }

    await loadChatMessages(userId);
    const input = document.getElementById('chatMessageInput');
    if (input) input.focus({ preventScroll: true });
}

function updateChatHeader(user) {
    if (!user) return;
    const avatar = document.getElementById('chatInterlocutorAvatar');
    const name = document.getElementById('chatInterlocutorName');
    const handle = document.getElementById('chatInterlocutorHandle');

    if (avatar) avatar.src = user.avatar_url;
    if (name) name.textContent = user.display_name;
    if (handle) handle.textContent = `@${user.username}`;
}

function openInterlocutorProfile() {
    if (activeChatUserId) {
        openUserProfile(activeChatUserId);
    }
}

// ==========================================
// CYBER CHAT ENHANCEMENTS: REFRESH, REACTIONS, LIGHTBOX & CUSTOM AUDIO
// ==========================================
let lastRenderedChatDate = null;
let currentLightboxZoom = 1.0;
let isChatSoundEnabled = localStorage.getItem('cyber_chat_sound') !== '0';
let chatSoundMode = localStorage.getItem('custom_chat_sound_mode') || 'default'; // 'default' or 'custom'

function updateChatSoundIcon() {
    const icon = document.getElementById('chatSoundIcon');
    if (icon) {
        icon.textContent = isChatSoundEnabled ? '🔊' : '🔇';
    }
}

function openChatSoundSettingsModal() {
    const modal = document.getElementById('chatSoundSettingsModal');
    if (!modal) return;
    updateSoundSettingsModalUI();
    modal.style.display = 'flex';
}

function closeChatSoundSettingsModal() {
    const modal = document.getElementById('chatSoundSettingsModal');
    if (modal) modal.style.display = 'none';
}

function toggleChatSoundModal() {
    isChatSoundEnabled = !isChatSoundEnabled;
    localStorage.setItem('cyber_chat_sound', isChatSoundEnabled ? '1' : '0');
    updateChatSoundIcon();
    updateSoundSettingsModalUI();
    showToast(isChatSoundEnabled ? 'Звуковые сигналы чата: Включены 🔊' : 'Звуковые сигналы чата: Выключены 🔇', 'info');
    if (isChatSoundEnabled) {
        playCurrentChatSoundPreview();
    }
}

function setChatSoundMode(mode) {
    chatSoundMode = mode;
    localStorage.setItem('custom_chat_sound_mode', mode);
    updateSoundSettingsModalUI();
    playCurrentChatSoundPreview();
}

function updateSoundSettingsModalUI() {
    const btnToggle = document.getElementById('btnSoundModalToggle');
    if (btnToggle) {
        if (isChatSoundEnabled) {
            btnToggle.className = 'btn btn-primary btn-sm';
            btnToggle.textContent = 'Вкл 🔊';
        } else {
            btnToggle.className = 'btn btn-secondary btn-sm';
            btnToggle.textContent = 'Выкл 🔇';
        }
    }

    const btnDefault = document.getElementById('soundModeBtnDefault');
    const btnCustom = document.getElementById('soundModeBtnCustom');
    const customCard = document.getElementById('customSoundUploadCard');

    if (btnDefault && btnCustom) {
        btnDefault.classList.toggle('active', chatSoundMode === 'default');
        btnCustom.classList.toggle('active', chatSoundMode === 'custom');
    }

    const customName = localStorage.getItem('custom_chat_sound_name');
    const infoText = document.getElementById('customSoundInfoText');
    if (infoText) {
        if (customName) {
            infoText.innerHTML = `<strong>Активный файл:</strong> ${escapeHtml(customName)} <span style="color:var(--accent-neon);">(обрезан до 3 сек)</span>`;
            infoText.style.color = '#fff';
        } else {
            infoText.textContent = 'Файл не загружен (используется стандартный звук)';
            infoText.style.color = 'var(--text-dim)';
        }
    }
}

// Convert AudioBuffer (up to 3s) to 16-bit PCM WAV Blob
function audioBufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const out = new DataView(arrayBuffer);
    const channels = [];
    let sample = 0;
    let offset = 0;
    let pos = 0;

    function setUint16(data) { out.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { out.setUint32(pos, data, true); pos += 4; }

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8);
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt "
    setUint32(16);          // 16 bytes format chunk
    setUint16(1);           // Linear PCM
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);          // 16-bit
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    for (let i = 0; i < numOfChan; i++) {
        channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
        for (let i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            out.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }

    return new Blob([out.buffer], { type: 'audio/wav' });
}

// User selects custom audio file: enforces max 3.0 seconds duration!
async function handleCustomSoundFileUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    try {
        const arrayBuf = await file.arrayBuffer();
        const ctx = window.audioCtx || (window.AudioContext ? new AudioContext() : null);
        if (!ctx) throw new Error('Web Audio API не поддерживается браузером');

        const decoded = await ctx.decodeAudioData(arrayBuf);
        const originalDuration = decoded.duration;
        const maxDuration = 3.0; // STRICT REQUIREMENT: max 3 seconds
        const trimDuration = Math.min(maxDuration, originalDuration);

        const sampleRate = decoded.sampleRate;
        const numberOfChannels = decoded.numberOfChannels;
        const frameCount = Math.floor(sampleRate * trimDuration);

        // Create trimmed audio buffer (strictly <= 3 seconds)
        const trimmedBuffer = ctx.createBuffer(numberOfChannels, frameCount, sampleRate);
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const channelData = decoded.getChannelData(channel);
            trimmedBuffer.copyToChannel(channelData.subarray(0, frameCount), channel);
        }

        const wavBlob = audioBufferToWav(trimmedBuffer);

        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result;
            try {
                localStorage.setItem('custom_chat_sound_wav', dataUrl);
                localStorage.setItem('custom_chat_sound_name', file.name);
                localStorage.setItem('custom_chat_sound_mode', 'custom');
                chatSoundMode = 'custom';
                updateSoundSettingsModalUI();

                if (originalDuration > maxDuration) {
                    showToast(`Файл "${file.name}" обрезан до первых 3.00 секунд!`, 'info');
                } else {
                    showToast(`Звук "${file.name}" успешно установлен!`, 'success');
                }

                playCurrentChatSoundPreview();
            } catch (storageErr) {
                showToast('Ошибка сохранения звука в память браузера', 'error');
            }
        };
        reader.readAsDataURL(wavBlob);
    } catch (err) {
        showToast('Не удалось обработать аудиофайл: ' + err.message, 'error');
    } finally {
        e.target.value = '';
    }
}

function playCurrentChatSoundPreview() {
    if (!isChatSoundEnabled) return;
    const customWav = localStorage.getItem('custom_chat_sound_wav');
    if (chatSoundMode === 'custom' && customWav) {
        const audio = new Audio(customWav);
        audio.volume = 0.9;
        audio.play().catch(() => {});
    } else {
        playSynthChime(660, 990, 0.15);
    }
}

function resetCustomChatSound() {
    localStorage.removeItem('custom_chat_sound_wav');
    localStorage.removeItem('custom_chat_sound_name');
    chatSoundMode = 'default';
    localStorage.setItem('custom_chat_sound_mode', 'default');
    updateSoundSettingsModalUI();
    showToast('Сброшено на стандартный кибер-звук', 'info');
    playSynthChime(540, 880, 0.12);
}

function playSynthChime(f1 = 520, f2 = 880, dur = 0.12) {
    try {
        const ctx = window.audioCtx || (window.AudioContext ? new AudioContext() : null);
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f1, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(f2, ctx.currentTime + dur);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + dur);
    } catch (e) {}
}

function playChatSoundFx(type) {
    if (!isChatSoundEnabled) return;

    const customWav = localStorage.getItem('custom_chat_sound_wav');
    if (chatSoundMode === 'custom' && customWav) {
        try {
            const audio = new Audio(customWav);
            audio.volume = 0.85;
            audio.play().catch(() => {});
            return;
        } catch (e) {}
    }

    // Default Synthesizer Audio
    if (type === 'send') {
        playSynthChime(520, 880, 0.12);
    } else if (type === 'receive') {
        try {
            const ctx = window.audioCtx || (window.AudioContext ? new AudioContext() : null);
            if (!ctx) return;
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();
            osc1.type = 'triangle';
            osc2.type = 'sine';
            osc1.frequency.setValueAtTime(660, ctx.currentTime);
            osc2.frequency.setValueAtTime(990, ctx.currentTime + 0.06);
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);
            osc1.start();
            osc2.start(ctx.currentTime + 0.06);
            osc1.stop(ctx.currentTime + 0.06);
            osc2.stop(ctx.currentTime + 0.16);
        } catch (e) {}
    } else if (type === 'reaction') {
        playSynthChime(750, 1400, 0.08);
    }
}

function formatDateSeparator(dateStr) {
    if (!dateStr) return 'Сегодня';
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) {
        return 'Сегодня';
    } else if (d.toDateString() === yesterday.toDateString()) {
        return 'Вчера';
    } else {
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    }
}

// In-app Lightbox Photo Viewer
function openImageLightbox(src, title) {
    const modal = document.getElementById('imageLightboxModal');
    const img = document.getElementById('lightboxTargetImage');
    const titleEl = document.getElementById('lightboxTitle');
    const dlBtn = document.getElementById('lightboxDownloadBtn');
    if (!modal || !img) return;

    currentLightboxZoom = 1.0;
    img.src = src;
    img.style.transform = 'scale(1.0)';
    if (titleEl) titleEl.textContent = title || 'Просмотр изображения';
    if (dlBtn) dlBtn.href = src;
    modal.style.display = 'flex';
}

function closeImageLightbox() {
    const modal = document.getElementById('imageLightboxModal');
    if (modal) modal.style.display = 'none';
}

function zoomLightboxImage(delta) {
    const img = document.getElementById('lightboxTargetImage');
    if (!img) return;
    currentLightboxZoom = Math.min(3.5, Math.max(0.4, currentLightboxZoom + delta));
    img.style.transform = `scale(${currentLightboxZoom})`;
}

function resetLightboxZoom() {
    const img = document.getElementById('lightboxTargetImage');
    if (!img) return;
    currentLightboxZoom = 1.0;
    img.style.transform = 'scale(1.0)';
}

// Search inside open dialog
function toggleChatSearch() {
    const bar = document.getElementById('chatSearchInDialogBar');
    const input = document.getElementById('chatSearchInDialogInput');
    if (!bar) return;
    if (bar.style.display === 'none' || !bar.style.display) {
        bar.style.display = 'flex';
        if (input) {
            input.value = '';
            input.focus();
        }
    } else {
        bar.style.display = 'none';
        if (input) input.value = '';
        clearChatSearchHighlight();
    }
}

function handleChatSearchInDialog(e) {
    const q = (e.target.value || '').trim().toLowerCase();
    const rows = document.querySelectorAll('.chat-bubble-row');
    if (!q) {
        clearChatSearchHighlight();
        return;
    }
    let firstFound = null;
    rows.forEach(row => {
        const contentEl = row.querySelector('.chat-bubble-content');
        if (!contentEl) return;
        let origText = row.getAttribute('data-orig-text');
        if (!origText) {
            origText = contentEl.innerText;
            row.setAttribute('data-orig-text', origText);
        }
        if (origText.toLowerCase().includes(q)) {
            row.style.opacity = '1';
            row.style.display = 'flex';
            const escQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escQ})`, 'gi');
            contentEl.innerHTML = escapeHtml(origText).replace(regex, '<span class="chat-highlight-match">$1</span>');
            if (!firstFound) firstFound = row;
        } else {
            row.style.opacity = '0.3';
        }
    });
    if (firstFound) {
        firstFound.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function clearChatSearchHighlight() {
    const rows = document.querySelectorAll('.chat-bubble-row');
    rows.forEach(row => {
        row.style.opacity = '1';
        row.style.display = 'flex';
        const origText = row.getAttribute('data-orig-text');
        if (origText) {
            const contentEl = row.querySelector('.chat-bubble-content');
            if (contentEl) contentEl.textContent = origText;
            row.removeAttribute('data-orig-text');
        }
    });
}

// Reactions functions
async function toggleMessageReaction(messageId, emoji) {
    if (!messageId || !emoji) return;
    playChatSoundFx('reaction');

    try {
        const res = await fetch(`/api/messages/${messageId}/reactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emoji: emoji })
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Ошибка установки реакции');
        }
        const data = await res.json();
        if (data.reactions) {
            renderMessageReactions(messageId, data.reactions);
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderMessageReactions(messageId, reactions) {
    const container = document.getElementById(`chat-reactions-${messageId}`);
    if (!container) return;

    if (!reactions || reactions.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = reactions.map(r => {
        const activeClass = r.user_reacted ? ' active' : '';
        const userList = (r.users && r.users.length > 0) ? r.users.join(', ') : '';
        return `
            <div class="chat-reaction-pill${activeClass}" 
                 onclick="toggleMessageReaction(${messageId}, '${escapeHtml(r.emoji)}')" 
                 title="${escapeHtml(userList)}">
                <span>${escapeHtml(r.emoji)}</span>
                <span class="chat-reaction-count">${r.count}</span>
            </div>
        `;
    }).join('');
}

function onContextReaction(emoji) {
    if (activeContextMsgId) {
        toggleMessageReaction(activeContextMsgId, emoji);
        closeChatContextMenu();
    }
}

async function loadChatMessages(userId) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container) return;
    container.innerHTML = '<div class="chat-empty-hint">Загрузка сообщений...</div>';

    try {
        const res = await fetch(`/api/messages/${userId}`);
        if (!res.ok) throw new Error('Ошибка загрузки сообщений');
        const messages = await res.json();

        container.innerHTML = '';
        lastRenderedChatDate = null;
        if (!messages || messages.length === 0) {
            container.innerHTML = `
                <div class="chat-empty-hint">
                    История переписки пуста. Отправьте первое сообщение, чтобы начать диалог.
                </div>
            `;
            return;
        }

        messages.forEach(m => {
            appendChatMessageElement(m);
        });
        scrollChatToBottom();
        updateUnreadMessagesCountBadge();
    } catch (err) {
        container.innerHTML = `<div class="chat-empty-hint">${escapeHtml(err.message)}</div>`;
    }
}


// ==========================================
// ЧАТ / ДИАЛОГИ: СОСТОЯНИЕ ВЫБОРА, РЕДАКТИРОВАНИЯ И УДАЛЕНИЯ
// ==========================================
let isChatSelectionMode = false;
let editingChatMessageId = null;
let pendingDeleteMessageId = null;
let pendingDeleteIsOut = false;
let pendingBatchDelete = false;

function startEditChatMessage(msgId) {
    const msgEl = document.getElementById(`chat-msg-${msgId}`);
    if (!msgEl) return;
    const contentEl = msgEl.querySelector('.chat-bubble-content');
    if (!contentEl) return;
    const text = contentEl.textContent.trim();

    editingChatMessageId = msgId;
    const banner = document.getElementById('chatEditBanner');
    const preview = document.getElementById('chatEditPreviewText');
    const input = document.getElementById('chatMessageInput');

    if (preview) preview.textContent = text;
    if (banner) banner.style.display = 'flex';
    if (input) {
        input.value = text;
        input.focus();
        input.select();
    }
}

function cancelEditChatMessage() {
    editingChatMessageId = null;
    const banner = document.getElementById('chatEditBanner');
    const input = document.getElementById('chatMessageInput');
    if (banner) banner.style.display = 'none';
    if (input) input.value = '';
}

function openDeleteMessageModal(msgId, isOut) {
    pendingDeleteMessageId = msgId;
    pendingDeleteIsOut = isOut;
    pendingBatchDelete = false;

    const modal = document.getElementById('deleteMessageModal');
    const title = document.getElementById('delMsgModalTitle');
    const desc = document.getElementById('delMsgModalDesc');
    const btnForEveryone = document.getElementById('btnDeleteMsgForEveryone');

    if (title) title.textContent = 'Удаление сообщения';
    if (desc) desc.textContent = isOut 
        ? 'Вы можете удалить это сообщение только у себя или для обоих участников переписки.'
        : 'Удалить это сообщение из вашей истории переписки?';

    if (btnForEveryone) {
        btnForEveryone.style.display = isOut ? 'block' : 'none';
    }

    if (modal) modal.style.display = 'flex';
}

function closeDeleteMessageModal() {
    const modal = document.getElementById('deleteMessageModal');
    if (modal) modal.style.display = 'none';
    pendingDeleteMessageId = null;
    pendingBatchDelete = false;
}

async function confirmDeleteMessageAction(forEveryone) {
    if (pendingBatchDelete) {
        await executeBatchDelete(forEveryone);
        return;
    }

    if (!pendingDeleteMessageId) return;
    const msgId = pendingDeleteMessageId;

    try {
        const res = await fetch(`/api/messages/${msgId}?for_everyone=${forEveryone}`, {
            method: 'DELETE'
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Ошибка удаления сообщения');
        }

        const msgEl = document.getElementById(`chat-msg-${msgId}`);
        if (msgEl) msgEl.remove();

        closeDeleteMessageModal();
        showToast(forEveryone ? 'Сообщение удалено для всех' : 'Сообщение удалено', 'success');
        loadConversations();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function toggleChatSelectionMode() {
    isChatSelectionMode = !isChatSelectionMode;
    const cols = document.querySelectorAll('.chat-msg-select-col');
    cols.forEach(col => {
        col.style.display = isChatSelectionMode ? 'flex' : 'none';
    });

    const batchBar = document.getElementById('chatBatchActionsBar');
    const btnToggle = document.getElementById('btnToggleMsgSelect');

    if (isChatSelectionMode) {
        if (batchBar) batchBar.style.display = 'flex';
        if (btnToggle) {
            btnToggle.classList.add('active');
            btnToggle.innerHTML = '<span>Отмена</span>';
        }
        updateSelectedMessagesCount();
    } else {
        exitChatSelectionMode();
    }
}

function exitChatSelectionMode() {
    isChatSelectionMode = false;
    document.querySelectorAll('.chat-msg-select-col').forEach(col => {
        col.style.display = 'none';
    });
    document.querySelectorAll('.chat-msg-checkbox').forEach(cb => {
        cb.checked = false;
    });

    const batchBar = document.getElementById('chatBatchActionsBar');
    if (batchBar) batchBar.style.display = 'none';

    const btnToggle = document.getElementById('btnToggleMsgSelect');
    if (btnToggle) {
        btnToggle.classList.remove('active');
        btnToggle.innerHTML = '<span>Выбрать</span>';
    }
    updateSelectedMessagesCount();
}

function onChatMessageCheckboxChange() {
    updateSelectedMessagesCount();
}

function updateSelectedMessagesCount() {
    const checked = document.querySelectorAll('.chat-msg-checkbox:checked');
    const countEl = document.getElementById('selectedMsgsCount');
    if (countEl) countEl.textContent = checked.length;
}

function promptBatchDeleteMessages() {
    const checked = Array.from(document.querySelectorAll('.chat-msg-checkbox:checked'));
    if (checked.length === 0) {
        showToast('Выберите хотя бы одно сообщение', 'error');
        return;
    }

    pendingBatchDelete = true;
    const allOut = checked.every(cb => cb.getAttribute('data-is-out') === '1');

    const modal = document.getElementById('deleteMessageModal');
    const title = document.getElementById('delMsgModalTitle');
    const desc = document.getElementById('delMsgModalDesc');
    const btnForEveryone = document.getElementById('btnDeleteMsgForEveryone');

    if (title) title.textContent = `Удаление сообщений (${checked.length})`;
    if (desc) desc.textContent = allOut
        ? `Выбрано ${checked.length} ваших сообщений. Удалить их только у себя или для обоих участников?`
        : `Выбрано ${checked.length} сообщений. Среди них есть входящие сообщения, поэтому их можно удалить только у себя.`;

    if (btnForEveryone) {
        btnForEveryone.style.display = allOut ? 'block' : 'none';
    }

    if (modal) modal.style.display = 'flex';
}

async function executeBatchDelete(forEveryone) {
    const checked = Array.from(document.querySelectorAll('.chat-msg-checkbox:checked'));
    if (checked.length === 0) return;

    const ids = checked.map(cb => parseInt(cb.getAttribute('data-msg-id'))).filter(id => !isNaN(id));
    if (ids.length === 0) return;

    try {
        const res = await fetch('/api/messages/batch-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message_ids: ids,
                for_everyone: forEveryone
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Ошибка удаления сообщений');
        }

        ids.forEach(id => {
            const el = document.getElementById(`chat-msg-${id}`);
            if (el) el.remove();
        });

        exitChatSelectionMode();
        closeDeleteMessageModal();
        showToast(forEveryone ? `Удалено сообщений: ${ids.length} (для всех)` : `Удалено сообщений: ${ids.length}`, 'success');
        loadConversations();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function appendChatMessageElement(m) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container) return;

    // Защита от дублирования сообщений в DOM
    if (document.getElementById(`chat-msg-${m.id}`)) {
        return;
    }

    const hint = container.querySelector('.chat-empty-hint');
    if (hint) hint.remove();

    // Разделитель дат в истории чата
    if (m.created_at) {
        const msgDate = new Date(m.created_at).toDateString();
        if (msgDate !== lastRenderedChatDate) {
            lastRenderedChatDate = msgDate;
            const dateSep = document.createElement('div');
            dateSep.className = 'chat-date-separator';
            dateSep.innerHTML = `<span class="chat-date-badge">${formatDateSeparator(m.created_at)}</span>`;
            container.appendChild(dateSep);
        }
    }

    const isOut = (m.sender_id === window.CURRENT_USER_ID);
    const row = document.createElement('div');
    row.id = `chat-msg-${m.id}`;
    row.className = 'chat-bubble-row ' + (isOut ? 'out' : 'in');
    row.setAttribute('data-msg-id', m.id);
    row.setAttribute('data-is-out', isOut ? '1' : '0');

    const statusCheck = isOut ? (m.is_read ? '<span class="chat-bubble-status" title="Прочитано">✓✓</span>' : '<span class="chat-bubble-status" title="Доставлено">✓</span>') : '';
    const editedBadge = m.is_edited ? '<span class="chat-bubble-edited" title="Отредактировано">• (ред.)</span>' : '';

    const trimmed = (m.content || '').trim();
    const isImageFile = /\.(jpeg|jpg|gif|png|webp)($|\?)/i.test(trimmed);
    const isUploadedPath = trimmed.startsWith('/uploads/');
    let contentHtml = '';

    if (isImageFile || (isUploadedPath && /\.(jpeg|jpg|gif|png|webp)$/i.test(trimmed))) {
        // Отображаем изображение полностью, без обрезки и с удобным масштабом
        contentHtml = `<div class="chat-media-preview-box"><img src="${escapeHtml(trimmed)}" alt="Фото" class="chat-sent-image" onclick="openImageLightbox('${escapeHtml(trimmed)}', 'Фото')"></div>`;
    } else if (isUploadedPath) {
        const fileName = trimmed.split('/').pop().replace(/^\d+_/, '');
        contentHtml = `<a href="${escapeHtml(trimmed)}" target="_blank" download class="chat-file-attachment" style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; background: rgba(255,255,255,0.08); border-radius: 10px; color: #fff; text-decoration: none; font-weight: 500;">📎 <span>${escapeHtml(fileName || 'Скачать файл')}</span></a>`;
    } else {
        contentHtml = escapeHtml(m.content);
    }

    const selectCol = `
        <div class="chat-msg-select-col" style="${isChatSelectionMode ? 'display:flex;' : 'display:none;'}">
            <input type="checkbox" class="chat-msg-checkbox" data-msg-id="${m.id}" data-is-out="${isOut ? '1' : '0'}" onchange="onChatMessageCheckboxChange()">
        </div>
    `;

    row.innerHTML = `
        ${selectCol}
        <div class="chat-bubble-wrapper">
            <div class="chat-bubble ${isOut ? 'out' : 'in'}">
                <div class="chat-bubble-content">${contentHtml}</div>
                <div class="chat-bubble-footer">
                    ${editedBadge}
                    <span class="chat-bubble-time">${formatTime(m.created_at)}</span>
                    ${statusCheck}
                </div>
            </div>
            <div class="chat-reactions-row" id="chat-reactions-${m.id}"></div>
        </div>
    `;

    container.appendChild(row);
    if (m.reactions && m.reactions.length > 0) {
        renderMessageReactions(m.id, m.reactions);
    }
    const imgEl = row.querySelector('.chat-sent-image');
    if (imgEl && !imgEl.complete) {
        imgEl.onload = () => scrollChatToBottom();
    }
}

function scrollChatToBottom() {
    const container = document.getElementById('chatMessagesContainer');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

let isSendingMessage = false;

async function handleSendMessage(e) {
    if (e) e.preventDefault();

    if (isSendingMessage) return; // Защита от двойного клика

    if (!activeChatUserId) {
        showToast('Выберите собеседника', 'error');
        return;
    }

    const input = document.getElementById('chatMessageInput');
    if (!input) return;

    let content = input.value.trim();
    if (currentChatAttachmentUrl) {
        content = content ? `${content}\n${currentChatAttachmentUrl}` : currentChatAttachmentUrl;
    }
    if (!content) return;

    const sendBtn = document.getElementById('chatSendBtn');

    // Если сейчас включен режим редактирования сообщения:
    if (editingChatMessageId) {
        if (sendBtn) sendBtn.disabled = true;
        isSendingMessage = true;
        try {
            const res = await fetch(`/api/messages/${editingChatMessageId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: content })
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Ошибка редактирования сообщения');
            }
            const updated = await res.json();
            const msgEl = document.getElementById(`chat-msg-${updated.id}`);
            if (msgEl) {
                const contentEl = msgEl.querySelector('.chat-bubble-content');
                if (contentEl) contentEl.textContent = updated.content;
                const footer = msgEl.querySelector('.chat-bubble-footer');
                if (footer && !footer.querySelector('.chat-bubble-edited')) {
                    const ed = document.createElement('span');
                    ed.className = 'chat-bubble-edited';
                    ed.textContent = ' • (ред.)';
                    footer.insertBefore(ed, footer.firstChild);
                }
            }
            cancelEditChatMessage();
            showToast('Сообщение изменено', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            if (sendBtn) sendBtn.disabled = false;
            isSendingMessage = false;
        }
        return;
    }
    if (sendBtn) sendBtn.disabled = true;
    isSendingMessage = true;

    try {
        const res = await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                receiver_id: activeChatUserId,
                content: content
            })
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Ошибка отправки сообщения');
        }

        const msg = await res.json();
        input.value = '';
        clearChatFile();

        playChatSoundFx('send');

        // Добавляем сообщение в интерфейс отправителя сразу
        appendChatMessageElement(msg);
        scrollChatToBottom();

        loadConversations();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        isSendingMessage = false;
        if (sendBtn) sendBtn.disabled = false;
        input.focus({ preventScroll: true });
    }
}

let currentChatAttachmentUrl = '';

function clearChatFile() {
    currentChatAttachmentUrl = '';
    const fileInput = document.getElementById('chatFileInput');
    if (fileInput) fileInput.value = '';
    const preview = document.getElementById('chatUploadPreview');
    if (preview) preview.style.display = 'none';
}

// Загрузка фото/файла в чат
async function handleChatFileUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file || !activeChatUserId) return;

    const formData = new FormData();
    formData.append('file', file);

    showToast('Загрузка файла...', 'success');

    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) throw new Error('Ошибка при загрузке файла');
        const data = await res.json();

        currentChatAttachmentUrl = data.url;
        const preview = document.getElementById('chatUploadPreview');
        const previewName = document.getElementById('chatPreviewName');
        if (preview && previewName) {
            previewName.textContent = file.name;
            preview.style.display = 'block';
        }
        showToast('Файл прикреплен! Нажмите «Отправить»', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        e.target.value = '';
    }
}

function handleIncomingSSEMessage(msg) {
    // ВАЖНО: Если мы сами являемся отправителем, мы УЖЕ добавили сообщение в handleSendMessage
    if (msg.sender_id === window.CURRENT_USER_ID) {
        return;
    }

    if (activeChatUserId && (msg.sender_id === activeChatUserId || msg.receiver_id === activeChatUserId)) {
        appendChatMessageElement(msg);
        scrollChatToBottom();

        if (msg.sender_id === activeChatUserId) {
            fetch(`/api/messages/${activeChatUserId}`).catch(() => {});
        }
    } else {
        playChatSoundFx('receive');
        const senderName = msg.sender ? msg.sender.display_name : 'Пользователь';
        showToast(`Новое сообщение от ${senderName}: ${msg.content.substring(0, 40)}`, 'success');
    }

    loadConversations();
    updateUnreadMessagesCountBadge();
}

async function updateUnreadMessagesCountBadge() {
    const badge = document.getElementById('hudMessagesBadge');
    const headerBadge = document.getElementById('headerMessagesBadge');

    try {
        const res = await fetch('/api/messages/unread');
        if (res.ok) {
            const data = await res.json();
            const count = data.unread_count || 0;
            [badge, headerBadge].forEach(b => {
                if (!b) return;
                if (count > 0) {
                    b.textContent = count;
                    b.style.display = 'inline-flex';
                } else {
                    b.style.display = 'none';
                }
            });
        }
    } catch (e) {}
}

// ==========================================
// REAL-TIME SSE HUB
// ==========================================
function initSSE() {
    if (!window.EventSource) return;

    try {
        const es = new EventSource('/api/events');

        es.onmessage = (e) => {
            if (!e.data) return;
            try {
                const event = JSON.parse(e.data);
                handleSSEEvent(event);
            } catch (err) {}
        };

        es.onerror = () => {
            // Браузер сам переподключит EventSource
        };
    } catch (e) {}
}

function handleSSEEvent(event) {
    switch (event.type) {
        case 'new_post':
            if (event.post && event.post.user_id !== window.CURRENT_USER_ID) {
                renderPostAtTop(event.post);
                showToast(`Новая запись от ${event.post.user.display_name}`, 'success');
            }
            break;

        case 'like_update':
            const likeCount = document.getElementById(`likes-${event.post_id}`);
            if (likeCount) likeCount.textContent = event.likes_count;
            break;

        case 'new_comment': {
            const countEl = document.getElementById(`comment-count-${event.post_id}`);
            if (countEl) countEl.textContent = event.comments_count;

            const commentsList = document.getElementById(`comments-list-${event.post_id}`);
            if (commentsList && event.comment && event.comment.user_id !== window.CURRENT_USER_ID) {
                const c = event.comment;
                const postCard = document.getElementById(`post-${event.post_id}`);
                const postOwnerId = postCard ? parseInt(postCard.getAttribute('data-owner-id') || '0') : 0;
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = renderCommentItemHtml(c, postOwnerId);
                if (tempDiv.firstElementChild) {
                    commentsList.appendChild(tempDiv.firstElementChild);
                }
            }
            break;
        }

        case 'comment_updated': {
            const comment = event.payload || event.comment;
            if (comment) {
                const textEl = document.getElementById(`comment-text-${comment.id}`);
                if (textEl) textEl.textContent = comment.content;
                const metaEl = document.getElementById(`comment-meta-${comment.id}`);
                if (metaEl && !metaEl.querySelector('.edited-badge')) {
                    const badge = document.createElement('span');
                    badge.className = 'edited-badge';
                    badge.textContent = ' • (ред.)';
                    metaEl.appendChild(badge);
                }
            }
            break;
        }

        case 'comment_deleted': {
            const commentId = event.comment_id;
            const commentEl = document.getElementById(`comment-item-${commentId}`);
            if (commentEl) commentEl.remove();
            if (event.post_id) {
                const countEl = document.getElementById(`comment-count-${event.post_id}`);
                if (countEl && event.comments_count !== undefined) {
                    countEl.textContent = event.comments_count;
                }
            }
            break;
        }

        case 'message_updated': {
            const msg = event.payload || event.message;
            if (msg) {
                const msgEl = document.getElementById(`chat-msg-${msg.id}`);
                if (msgEl) {
                    const contentEl = msgEl.querySelector('.chat-bubble-content');
                    if (contentEl) contentEl.textContent = msg.content;
                    const footer = msgEl.querySelector('.chat-bubble-footer');
                    if (footer && !footer.querySelector('.chat-bubble-edited')) {
                        const ed = document.createElement('span');
                        ed.className = 'chat-bubble-edited';
                        ed.textContent = ' • (ред.)';
                        footer.insertBefore(ed, footer.firstChild);
                    }
                }
            }
            break;
        }

        case 'message_deleted': {
            const msgId = event.payload ? event.payload.message_id : event.message_id;
            if (msgId) {
                const msgEl = document.getElementById(`chat-msg-${msgId}`);
                if (msgEl) msgEl.remove();
            }
            break;
        }

        case 'new_gift':
            if (event.gift) {
                showToast(`🎁 Новый подарок в сети! ✨`, 'success');
                const showcaseGrid = document.getElementById('globalShowcaseGrid');
                if (showcaseGrid) {
                    renderGiftCard(event.gift, showcaseGrid, true);
                }
            }
            break;

                case 'message_reaction': {
            const data = event.payload || event;
            if (data && data.message_id) {
                renderMessageReactions(data.message_id, data.reactions || []);
            }
            break;
        }

case 'new_message': {
            const msg = event.payload || event.message;
            if (msg) handleIncomingSSEMessage(msg);
            break;
        }

        case 'notification': {
            if (event.payload && event.payload.user_id === window.CURRENT_USER_ID) {
                handleIncomingNotification(event.payload);
            }
            break;
        }
    }
}

// Audio chime for notifications
function playAudioChime(freq1 = 520, freq2 = 780, duration = 0.1) {
    try {
        const ctx = window.audioCtx || (window.AudioContext ? new AudioContext() : null);
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq1, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq2, ctx.currentTime + duration);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
    } catch (e) {}
}

// ==========================================
// CYBER AUDIO SUITE: SYNTHWAVE AMBIENT & SOUND FX
// ==========================================
let cyberAudioCtx = null;
let cyberAudioPlaying = false;
let cyberOsc1 = null;
let cyberOsc2 = null;
let cyberGain = null;
let cyberFilter = null;
let cyberInterval = null;

function toggleCyberAudio() {
    const btn = document.getElementById('cyberAudioBtn');
    if (!cyberAudioPlaying) {
        startCyberAudio();
        cyberAudioPlaying = true;
        if (btn) btn.classList.add('playing');
        showToast('Киберпанк радио включено: Synthwave Chill', 'success');
    } else {
        stopCyberAudio();
        cyberAudioPlaying = false;
        if (btn) btn.classList.remove('playing');
        showToast('Радио выключено', 'info');
    }
}

function startCyberAudio() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!cyberAudioCtx) cyberAudioCtx = new AudioCtx();
        if (cyberAudioCtx.state === 'suspended') cyberAudioCtx.resume();

        // Warm analog drone + resonant filter
        const osc1 = cyberAudioCtx.createOscillator();
        const osc2 = cyberAudioCtx.createOscillator();
        const filter = cyberAudioCtx.createBiquadFilter();
        const gain = cyberAudioCtx.createGain();

        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(65.41, cyberAudioCtx.currentTime); // C2
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(98.00, cyberAudioCtx.currentTime); // G2

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(450, cyberAudioCtx.currentTime);
        filter.Q.setValueAtTime(4.0, cyberAudioCtx.currentTime);

        gain.gain.setValueAtTime(0.035, cyberAudioCtx.currentTime);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(cyberAudioCtx.destination);

        osc1.start();
        osc2.start();

        cyberOsc1 = osc1;
        cyberOsc2 = osc2;
        cyberFilter = filter;
        cyberGain = gain;

        // Subtle ambient chord pulse
        const notes = [130.81, 164.81, 196.00, 246.94];
        let noteIdx = 0;
        cyberInterval = setInterval(() => {
            if (!cyberAudioPlaying || !cyberAudioCtx) return;
            try {
                const arpOsc = cyberAudioCtx.createOscillator();
                const arpGain = cyberAudioCtx.createGain();
                arpOsc.type = 'sine';
                arpOsc.frequency.setValueAtTime(notes[noteIdx % notes.length], cyberAudioCtx.currentTime);
                arpGain.gain.setValueAtTime(0.025, cyberAudioCtx.currentTime);
                arpGain.gain.exponentialRampToValueAtTime(0.0001, cyberAudioCtx.currentTime + 1.2);
                arpOsc.connect(arpGain);
                arpGain.connect(cyberAudioCtx.destination);
                arpOsc.start();
                arpOsc.stop(cyberAudioCtx.currentTime + 1.2);
                noteIdx++;
            } catch (e) {}
        }, 1600);

    } catch (e) {
        console.warn('Web Audio error:', e);
    }
}

function stopCyberAudio() {
    if (cyberInterval) {
        clearInterval(cyberInterval);
        cyberInterval = null;
    }
    if (cyberOsc1) {
        try { cyberOsc1.stop(); cyberOsc1.disconnect(); } catch (e) {}
        cyberOsc1 = null;
    }
    if (cyberOsc2) {
        try { cyberOsc2.stop(); cyberOsc2.disconnect(); } catch (e) {}
        cyberOsc2 = null;
    }
}


// ==========================================
// NEW CHAT MODAL LOGIC
// ==========================================
window.allUsersForChat = [];

async function openNewChatModal() {
    const modal = document.getElementById('newChatModal');
    if (!modal) return;
    modal.style.display = 'flex';
    const list = document.getElementById('newChatUsersList');
    if (list) list.innerHTML = '<div class="chat-empty-hint">Загрузка пользователей...</div>';
    try {
        const res = await fetch('/api/users');
        if (!res.ok) throw new Error('Ошибка загрузки пользователей');
        const users = await res.json();
        window.allUsersForChat = users || [];
        renderNewChatUsersList(window.allUsersForChat);
    } catch (e) {
        if (list) list.innerHTML = `<div class="chat-empty-hint">${escapeHtml(e.message)}</div>`;
    }
}

function closeNewChatModal() {
    const modal = document.getElementById('newChatModal');
    if (modal) modal.style.display = 'none';
}

function filterNewChatUsers() {
    const q = (document.getElementById('newChatSearchInput')?.value || '').toLowerCase().trim();
    if (!q) {
        renderNewChatUsersList(window.allUsersForChat);
        return;
    }
    const filtered = (window.allUsersForChat || []).filter(u => 
        (u.display_name && u.display_name.toLowerCase().includes(q)) || 
        (u.username && u.username.toLowerCase().includes(q)) ||
        (u.custom_rank && u.custom_rank.toLowerCase().includes(q))
    );
    renderNewChatUsersList(filtered);
}

function renderNewChatUsersList(users) {
    const list = document.getElementById('newChatUsersList');
    if (!list) return;
    const others = (users || []).filter(u => u.id !== window.CURRENT_USER_ID);
    if (others.length === 0) {
        list.innerHTML = '<div class="chat-empty-hint">Пользователи не найдены</div>';
        return;
    }
    list.innerHTML = '';
    others.forEach(u => {
        const item = document.createElement('div');
        item.className = 'new-chat-user-row';
        item.innerHTML = `
            <div style="position: relative; width: 40px; height: 40px; flex-shrink: 0;">
                <img src="${escapeHtml(u.avatar_url || '/static/avatars/default.svg')}" alt="avatar" class="conv-avatar" style="width: 40px; height: 40px; border-radius: 50%;">
            </div>
            <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 700; color: #fff; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(u.display_name)}</div>
                <div style="font-size: 0.78rem; color: var(--accent-primary);">@${escapeHtml(u.username)} ${u.custom_rank ? '• ' + escapeHtml(u.custom_rank) : ''}</div>
            </div>
            <button type="button" class="btn btn-primary btn-xs" onclick="closeNewChatModal(); openChatWithUser(${u.id}, '${escapeHtml(u.display_name)}', '${escapeHtml(u.username)}', '${escapeHtml(u.avatar_url || '')}');" style="padding: 4px 10px; font-size: 0.75rem;">
                <span>Написать 💬</span>
            </button>
        `;
        list.appendChild(item);
    });
}


// Initialize chat context menu
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initChatContextMenu);
} else {
    initChatContextMenu();
}
