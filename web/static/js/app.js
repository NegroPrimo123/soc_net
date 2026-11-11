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
    const postParam = urlParams.get('post');
    if (postParam) {
        setTimeout(() => navigateToPost(parseInt(postParam, 10)), 350);
    }

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
    } else if (viewParam === 'my-profile') {
        navigateTo('my-profile');
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
    const pwd = (username === 'itakwa') ? '123123' : 'password123';
    await fillAndLogin(username, pwd);
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

        showToast(`Добро пожаловать, ${data.user.display_name}! 🚀`, 'success');
        closeAuthModal();
        setTimeout(() => {
            window.location.href = '/?view=my-profile';
        }, 200);
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
                    const profView = document.getElementById('profileView');
                    const isProfileActive = profView && profView.style.display !== 'none' && document.activeElement && (document.activeElement.id === 'profPostContent' || document.activeElement.closest('#profComposerCard'));
                    if (isProfileActive) {
                        uploadProfSingleImage(blob);
                    } else {
                        expandComposer();
                        uploadSingleFile(blob);
                    }
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
    let content = textarea ? textarea.value.trim() : '';
    const urlInput = document.getElementById('postImageUrl');
    const imageUrl = currentUploadedFileUrl || (urlInput ? urlInput.value.trim() : '');

    const musicUrlInput = document.getElementById('composerMusicUrl');
    const musicTitleInput = document.getElementById('composerMusicTitle');
    const musicArtistInput = document.getElementById('composerMusicArtist');

    const musicUrl = musicUrlInput ? musicUrlInput.value.trim() : '';
    const musicTitle = musicTitleInput ? musicTitleInput.value.trim() : '';
    const musicArtist = musicArtistInput ? musicArtistInput.value.trim() : '';

    // Если в тексте поста указан только URL изображения, очищаем текст, чтобы не дублировать
    if (imageUrl && content === imageUrl) {
        content = '';
    }

    let pollData = collectPollData('composerPollQuestion', 'composerPollOptionsInputs', 'composerPollIsMultiple', 'composerPollIsAnonymous');
    let pollId = null;
    if (pollData && (pollData.question || pollData.options.length > 0)) {
        if (!pollData.question || pollData.options.length < 2) {
            showToast('Для создания опроса заполните вопрос и минимум 2 варианта ответа', 'warning');
            return;
        }
        try {
            const pRes = await fetch('/api/polls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pollData)
            });
            if (!pRes.ok) {
                const pErr = await pRes.json();
                throw new Error(pErr.error || 'Ошибка создания опроса');
            }
            const pollObj = await pRes.json();
            pollId = pollObj.id;
        } catch (e) {
            showToast(e.message, 'error');
            return;
        }
    }

    if (!content && !imageUrl && !musicUrl && !pollId) {
        showToast('Введите текст публикации, прикрепите файл или опрос', 'error');
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
                image_url: imageUrl,
                music_url: musicUrl,
                music_title: musicTitle,
                music_artist: musicArtist,
                poll_id: pollId
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
        clearComposerMusic();
        clearComposerPoll();
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
    closeAllMusicMenus();

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

    // Заполняем секцию прикрепленного аудиофайла
    const mUrlInput = document.getElementById('editPostMusicUrl');
    const mTitleInput = document.getElementById('editPostMusicTitle');
    const mArtistInput = document.getElementById('editPostMusicArtist');
    const mTitlePreview = document.getElementById('editPostMusicTitlePreview');
    const mArtistPreview = document.getElementById('editPostMusicArtistPreview');
    const mPreviewCard = document.getElementById('editPostMusicPreviewCard');
    const mAddBox = document.getElementById('editPostMusicAddBtnBox');

    const musicCard = postEl.querySelector('.post-music-card');
    if (musicCard) {
        const mUrl = musicCard.getAttribute('data-music-url') || '';
        const mTitle = musicCard.getAttribute('data-music-title') || 'Аудиозапись';
        const mArtist = musicCard.getAttribute('data-music-artist') || '';

        if (mUrlInput) mUrlInput.value = mUrl;
        if (mTitleInput) mTitleInput.value = mTitle;
        if (mArtistInput) mArtistInput.value = mArtist;

        if (mTitlePreview) mTitlePreview.textContent = mTitle;
        if (mArtistPreview) mArtistPreview.textContent = mArtist;
        if (mPreviewCard) mPreviewCard.style.display = 'flex';
        if (mAddBox) mAddBox.style.display = 'none';
    } else {
        if (mUrlInput) mUrlInput.value = '';
        if (mTitleInput) mTitleInput.value = '';
        if (mArtistInput) mArtistInput.value = '';

        if (mPreviewCard) mPreviewCard.style.display = 'none';
        if (mAddBox) mAddBox.style.display = 'block';
    }

    // Заполняем секцию опроса
    const pollCard = postEl.querySelector('.poll-card');
    const editPollSection = document.getElementById('editPostPollSection');
    const editPollAddBox = document.getElementById('editPostPollAddBtnBox');
    const editPollId = document.getElementById('editPostPollId');
    const editPollQuestion = document.getElementById('editPostPollQuestion');
    const editPollContainer = document.getElementById('editPostPollOptionsContainer');

    if (pollCard) {
        const pollId = pollCard.getAttribute('data-poll-id') || '';
        const qEl = pollCard.querySelector('.poll-question');
        const qText = qEl ? qEl.innerText.trim() : '';

        if (editPollId) editPollId.value = pollId;
        if (editPollQuestion) editPollQuestion.value = qText;
        if (editPollContainer) {
            editPollContainer.innerHTML = '';
            pollCard.querySelectorAll('.poll-option-text').forEach(tEl => {
                addEditPostPollOptionRow(tEl.innerText.trim());
            });
        }
        if (editPollSection) editPollSection.style.display = 'block';
        if (editPollAddBox) editPollAddBox.style.display = 'none';
    } else {
        if (editPollId) editPollId.value = '';
        if (editPollQuestion) editPollQuestion.value = '';
        if (editPollContainer) editPollContainer.innerHTML = '';
        if (editPollSection) editPollSection.style.display = 'none';
        if (editPollAddBox) editPollAddBox.style.display = 'block';
    }

    if (modal) modal.style.display = 'flex';
}

function removeEditPostPoll() {
    const editPollId = document.getElementById('editPostPollId');
    const editPollSection = document.getElementById('editPostPollSection');
    const editPollAddBox = document.getElementById('editPostPollAddBtnBox');
    if (editPollId) editPollId.value = '0';
    if (editPollSection) editPollSection.style.display = 'none';
    if (editPollAddBox) editPollAddBox.style.display = 'block';
}

function enableEditPostPoll() {
    const editPollId = document.getElementById('editPostPollId');
    const editPollSection = document.getElementById('editPostPollSection');
    const editPollAddBox = document.getElementById('editPostPollAddBtnBox');
    const editPollContainer = document.getElementById('editPostPollOptionsContainer');
    if (editPollId) editPollId.value = '-1';
    if (editPollContainer && editPollContainer.children.length === 0) {
        addEditPostPollOptionRow('');
        addEditPostPollOptionRow('');
    }
    if (editPollSection) editPollSection.style.display = 'block';
    if (editPollAddBox) editPollAddBox.style.display = 'none';
}

function addEditPostPollOptionRow(initialText = '') {
    const container = document.getElementById('editPostPollOptionsContainer');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'edit-post-poll-row';
    row.style.cssText = 'display: flex; gap: 6px; align-items: center;';
    row.innerHTML = `
        <input type="text" class="form-control edit-post-poll-opt-input" placeholder="Вариант ответа..." value="${escapeHtml(initialText)}" style="flex: 1; padding: 6px 10px; border-radius: var(--radius-sm); background: rgba(0,0,0,0.5); border: 1px solid var(--border-subtle); color: var(--text-pure); font-size: 0.85rem;">
        <button type="button" class="btn btn-outline btn-xs" onclick="this.closest('.edit-post-poll-row').remove()" title="Удалить вариант" style="color: #f43f5e; border-color: rgba(244,63,94,0.3); padding: 3px 6px;">✕</button>
    `;
    container.appendChild(row);
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


// Управление аудиозаписью при редактировании поста
async function handleEditPostAudioUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    showToast('Загрузка аудио для публикации... 🎵', 'info');
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        if (!res.ok) throw new Error('Ошибка при загрузке аудиофайла');
        const data = await res.json();

        const cleanTitle = (data.filename || file.name).replace(/\.[^/.]+$/, '').replace(/^[\d_]+/, '');
        const artist = window.CURRENT_USER_DISPLAY_NAME || 'Автор';

        const mUrlInput = document.getElementById('editPostMusicUrl');
        const mTitleInput = document.getElementById('editPostMusicTitle');
        const mArtistInput = document.getElementById('editPostMusicArtist');
        const mTitlePreview = document.getElementById('editPostMusicTitlePreview');
        const mArtistPreview = document.getElementById('editPostMusicArtistPreview');
        const mPreviewCard = document.getElementById('editPostMusicPreviewCard');
        const mAddBox = document.getElementById('editPostMusicAddBtnBox');

        if (mUrlInput) mUrlInput.value = data.url;
        if (mTitleInput) mTitleInput.value = cleanTitle || 'Аудиозапись';
        if (mArtistInput) mArtistInput.value = artist;

        if (mTitlePreview) mTitlePreview.textContent = cleanTitle || 'Аудиозапись';
        if (mArtistPreview) mArtistPreview.textContent = artist;
        if (mPreviewCard) mPreviewCard.style.display = 'flex';
        if (mAddBox) mAddBox.style.display = 'none';

        showToast('Новый аудиофайл прикреплен! Нажмите «Сохранить изменения» 🎵', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        e.target.value = '';
    }
}

function removeEditPostAudio() {
    const mUrlInput = document.getElementById('editPostMusicUrl');
    const mTitleInput = document.getElementById('editPostMusicTitle');
    const mArtistInput = document.getElementById('editPostMusicArtist');
    const mPreviewCard = document.getElementById('editPostMusicPreviewCard');
    const mAddBox = document.getElementById('editPostMusicAddBtnBox');

    if (mUrlInput) mUrlInput.value = '';
    if (mTitleInput) mTitleInput.value = '';
    if (mArtistInput) mArtistInput.value = '';

    if (mPreviewCard) mPreviewCard.style.display = 'none';
    if (mAddBox) mAddBox.style.display = 'block';

    showToast('Аудиофайл откреплен от публикации. Нажмите «Сохранить изменения»', 'info');
}

async function quickRemovePostMusic(postId, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    closeAllMusicMenus();

    if (!confirm('Удалить аудиозапись из этой публикации?')) return;

    try {
        const card = document.querySelector(`[id="post-${postId}"]`);
        const contentEl = card ? card.querySelector('.post-content') : null;
        const content = contentEl ? contentEl.innerText.trim() : '';
        const imgEl = card ? card.querySelector('.post-media img') : null;
        const imageUrl = imgEl ? (imgEl.getAttribute('src') || '') : '';

        const res = await fetch(`/api/posts/${postId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: content,
                image_url: imageUrl,
                music_url: '',
                music_title: '',
                music_artist: ''
            })
        });

        if (!res.ok) throw new Error('Ошибка при удалении аудиозаписи');
        
        document.querySelectorAll(`[id="post-${postId}"]`).forEach(postCard => {
            const m = postCard.querySelector('.post-music-card');
            if (m) m.remove();
        });

        showToast('Аудиозапись удалена из публикации', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function saveEditedPostModal() {
    const idInput = document.getElementById('editPostId');
    const contentInput = document.getElementById('editPostContentInput');
    const imgUrlInput = document.getElementById('editPostImageUrl');
    const musicUrlInput = document.getElementById('editPostMusicUrl');
    const musicTitleInput = document.getElementById('editPostMusicTitle');
    const musicArtistInput = document.getElementById('editPostMusicArtist');
    const pollIdInput = document.getElementById('editPostPollId');
    const pollQuestionInput = document.getElementById('editPostPollQuestion');
    const pollContainer = document.getElementById('editPostPollOptionsContainer');
    const saveBtn = document.getElementById('btnSaveEditedPost');

    if (!idInput || !idInput.value) return;
    const postId = parseInt(idInput.value);
    const content = contentInput ? contentInput.value.trim() : '';
    const imageUrl = imgUrlInput ? imgUrlInput.value.trim() : '';
    const musicUrl = musicUrlInput ? musicUrlInput.value.trim() : '';
    const musicTitle = musicTitleInput ? musicTitleInput.value.trim() : '';
    const musicArtist = musicArtistInput ? musicArtistInput.value.trim() : '';

    let pollIdVal = null;
    if (pollIdInput && pollIdInput.value !== '') {
        const pid = parseInt(pollIdInput.value);
        if (pid === 0) {
            pollIdVal = 0;
        } else if (pid > 0) {
            pollIdVal = pid;
            const q = pollQuestionInput ? pollQuestionInput.value.trim() : '';
            const opts = [];
            if (pollContainer) {
                pollContainer.querySelectorAll('.edit-post-poll-opt-input').forEach(inp => {
                    const v = inp.value.trim();
                    if (v) opts.push(v);
                });
            }
            if (q && opts.length >= 2) {
                try {
                    await fetch(`/api/polls/${pid}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ question: q, options: opts })
                    });
                } catch (e) {
                    console.error('Error saving edited poll in post:', e);
                }
            }
        }
    }

    if (!content && !imageUrl && !musicUrl && !pollIdVal) {
        showToast('Публикация не может быть полностью пустой', 'error');
        return;
    }

    if (saveBtn) saveBtn.disabled = true;

    try {
        const payload = {
            content: content,
            image_url: imageUrl,
            music_url: musicUrl,
            music_title: musicTitle,
            music_artist: musicArtist
        };
        if (pollIdVal !== null) {
            payload.poll_id = pollIdVal;
        }

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

        // Обновляем текст, медиа и музыку во ВСЕХ карточках этого поста на странице
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

            // Обновляем музыкальную карточку
            let musicCard = postCard.querySelector('.post-music-card');
            if (post.music_url) {
                const pTitle = post.music_title || 'Аудиозапись';
                const pArtist = post.music_artist || 'Исполнитель';
                const newMusicHtml = `
                    <div class="post-music-card" id="post-music-${post.id}" data-music-url="${escapeHtml(post.music_url)}" data-music-title="${escapeHtml(pTitle)}" data-music-artist="${escapeHtml(pArtist)}">
                        <button type="button" class="post-music-play-btn" onclick="window.musicPlayer.playTrack({url: '${escapeHtml(post.music_url)}', title: '${escapeHtml(pTitle)}', artist: '${escapeHtml(pArtist)}', elementId: 'post-music-${post.id}'}, event)" title="Воспроизвести">
                            <span class="music-play-icon">▶️</span>
                        </button>
                        <div class="post-music-info">
                            <div class="post-music-title">${escapeHtml(pTitle)}</div>
                            <div class="post-music-artist">${escapeHtml(pArtist)}</div>
                        </div>
                        <div class="post-music-actions-wrap">
                            <button type="button" class="post-music-menu-btn" onclick="togglePostMusicMenu(event, ${post.id})" title="Опции (скачать / отправить)">
                                <span class="music-dots-icon">⋮</span>
                            </button>
                            <div class="post-music-dropdown" id="postMusicMenu-${post.id}" style="display: none;">
                                <button type="button" class="post-music-action-item" onclick="openEditPostModal(${post.id}, this)">
                                    <span class="action-icon">🔄</span>
                                    <span>Заменить / изменить трек</span>
                                </button>
                                <button type="button" class="post-music-action-item text-danger" onclick="quickRemovePostMusic(${post.id}, event)">
                                    <span class="action-icon">🗑️</span>
                                    <span>Удалить трек из поста</span>
                                </button>
                                <div class="post-dropdown-divider" style="margin: 4px 0; border-top: 1px solid rgba(255,255,255,0.1);"></div>
                                <button type="button" class="post-music-action-item" onclick="downloadAudioTrack('${escapeHtml(post.music_url)}', '${escapeHtml(pTitle)}', event)">
                                    <span class="action-icon">📥</span>
                                    <span>Скачать файл</span>
                                </button>
                                <button type="button" class="post-music-action-item" onclick="openShareAudioModal('${escapeHtml(post.music_url)}', '${escapeHtml(pTitle)}', '${escapeHtml(pArtist)}', event)">
                                    <span class="action-icon">💬</span>
                                    <span>Отправить в сообщения</span>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                if (musicCard) {
                    musicCard.outerHTML = newMusicHtml;
                } else {
                    const temp = document.createElement('div');
                    temp.innerHTML = newMusicHtml;
                    const cardEl = temp.firstElementChild;
                    if (mediaBox) {
                        postCard.insertBefore(cardEl, mediaBox);
                    } else {
                        const actionsBar = postCard.querySelector('.post-actions-bar');
                        if (actionsBar) {
                            postCard.insertBefore(cardEl, actionsBar);
                        } else {
                            postCard.appendChild(cardEl);
                        }
                    }
                }
            } else if (musicCard) {
                musicCard.remove();
            }

            // Обновляем опрос
            if (payload.poll_id === 0) {
                const pCard = postCard.querySelector('.poll-card');
                if (pCard) pCard.remove();
            }

            const metaLine = postCard.querySelector('.meta-line');
            if (metaLine && !metaLine.querySelector('.edited-badge')) {
                const badge = document.createElement('span');
                badge.className = 'edited-badge';
                badge.textContent = '• (ред.)';
                metaLine.appendChild(badge);
            }
        });

        if (post.poll) {
            updatePollDOM(post.poll);
        }

        closeEditPostModal();
        showToast('Публикация успешно обновлена!', 'success');
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
    closeAllMusicMenus();
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
    closeAllMusicMenus();
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
    closeAllMusicMenus();
    }
});

function downloadPostImage(imageUrl) {
    closeAllPostDropdowns();
    closeAllMusicMenus();
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
    closeAllMusicMenus();
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

    const isOwner = (window.IS_AUTHENTICATED && (window.CURRENT_USER_ID == post.user_id || (post.user && window.CURRENT_USER_ID == post.user.id)));
    let postMusicHtml = '';
    let postPollHtml = (post.poll ? renderPollWidget(post.poll) : '');
    if (post.music_url) {
        const pTitle = post.music_title || 'Аудиозапись';
        const pArtist = post.music_artist || (post.user ? post.user.display_name : 'Исполнитель');
        postMusicHtml = `
            <div class="post-music-card" id="post-music-${post.id}" data-music-url="${escapeHtml(post.music_url)}" data-music-title="${escapeHtml(pTitle)}" data-music-artist="${escapeHtml(pArtist)}">
                <button type="button" class="post-music-play-btn" onclick="window.musicPlayer.playTrack({url: '${escapeHtml(post.music_url)}', title: '${escapeHtml(pTitle)}', artist: '${escapeHtml(pArtist)}', elementId: 'post-music-${post.id}'}, event)" title="Воспроизвести">
                    <span class="music-play-icon">▶️</span>
                </button>
                <div class="post-music-info">
                    <div class="post-music-title">${escapeHtml(pTitle)}</div>
                    <div class="post-music-artist">${escapeHtml(pArtist)}</div>
                </div>
                <div class="post-music-actions-wrap">
                    <button type="button" class="post-music-menu-btn" onclick="togglePostMusicMenu(event, ${post.id})" title="Опции (скачать / отправить)">
                        <span class="music-dots-icon">⋮</span>
                    </button>
                    <div class="post-music-dropdown" id="postMusicMenu-${post.id}" style="display: none;">
                        ${isOwner ? `
                            <button type="button" class="post-music-action-item" onclick="openEditPostModal(${post.id}, this)">
                                <span class="action-icon">🔄</span>
                                <span>Заменить / изменить трек</span>
                            </button>
                            <button type="button" class="post-music-action-item text-danger" onclick="quickRemovePostMusic(${post.id}, event)">
                                <span class="action-icon">🗑️</span>
                                <span>Удалить трек из поста</span>
                            </button>
                            <div class="post-dropdown-divider" style="margin: 4px 0; border-top: 1px solid rgba(255,255,255,0.1);"></div>
                        ` : ''}
                        <button type="button" class="post-music-action-item" onclick="downloadAudioTrack('${escapeHtml(post.music_url)}', '${escapeHtml(pTitle)}', event)">
                            <span class="action-icon">📥</span>
                            <span>Скачать файл</span>
                        </button>
                        <button type="button" class="post-music-action-item" onclick="openShareAudioModal('${escapeHtml(post.music_url)}', '${escapeHtml(pTitle)}', '${escapeHtml(pArtist)}', event)">
                            <span class="action-icon">💬</span>
                            <span>Отправить в сообщения</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
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

    let authorAvatarUrl = (post.user && post.user.avatar_url) ? post.user.avatar_url : '/static/avatars/default.png';
    let authorDisplayName = (post.user && post.user.display_name) ? post.user.display_name : 'Пользователь';
    let authorHandle = (post.user && post.user.username) ? `@${post.user.username}` : '';
    let authorClickAction = (post.user && post.user.id) ? `openUserProfile(${post.user.id})` : '';
    let channelBadgeHtml = '';

    if (post.channel && post.channel.id) {
        authorAvatarUrl = post.channel.avatar_url || '/static/avatars/default_channel.svg';
        authorDisplayName = post.channel.name || 'Канал';
        authorHandle = post.channel.handle ? `@${post.channel.handle}` : '';
        authorClickAction = `openChannelPage(${post.channel.id})`;
        channelBadgeHtml = `
            <span class="channel-post-badge cursor-pointer" onclick="openChannelPage(${post.channel.id})" title="Официальный пост канала">
                📢 Канал
            </span>
        `;
    }

    article.innerHTML = `
        <div class="post-header">
            <div class="author-block">
                <img src="${escapeHtml(authorAvatarUrl)}" alt="avatar" class="author-avatar cursor-pointer" onclick="${authorClickAction}">
                <div class="author-meta">
                    <div class="author-name-row">
                        <span class="author-name cursor-pointer" onclick="${authorClickAction}">${escapeHtml(authorDisplayName)}</span>
                        ${authorHandle ? `<span class="author-handle cursor-pointer" onclick="${authorClickAction}">${escapeHtml(authorHandle)}</span>` : ''}
                        ${channelBadgeHtml}
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

        ${postPollHtml}
        ${postMusicHtml}
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
    const b = document.getElementById('feedSearchChannelsBlock');
    if (b) b.style.display = 'none';
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

        // Глобальный поиск каналов по запросу q
        const searchQuery = url.searchParams.get('q');
        const searchChBlock = document.getElementById('feedSearchChannelsBlock');
        const searchChGrid = document.getElementById('feedSearchChannelsGrid');
        const searchChCount = document.getElementById('feedSearchChannelsCount');
        if (searchQuery && searchChBlock && searchChGrid) {
            try {
                const cRes = await fetch(`/api/channels?q=${encodeURIComponent(searchQuery)}`);
                if (cRes.ok) {
                    const matchedChannels = await cRes.json();
                    if (matchedChannels && matchedChannels.length > 0) {
                        searchChBlock.style.display = 'block';
                        if (searchChCount) searchChCount.textContent = `${matchedChannels.length}`;
                        searchChGrid.innerHTML = matchedChannels.map(ch => `
                            <div class="feed-channel-card" onclick="openChannelDetail(${ch.id})">
                                <img src="${escapeHtml(ch.avatar_url || '/static/avatars/default_channel.svg')}" class="feed-channel-avatar" alt="Avatar">
                                <div class="feed-channel-info">
                                    <div class="feed-channel-name-row">
                                        <span class="feed-channel-name">${escapeHtml(ch.name)}</span>
                                        <span class="channel-badge">📢</span>
                                    </div>
                                    <span class="feed-channel-handle">${escapeHtml(ch.handle)}</span>
                                    <span class="feed-channel-subscribers">👥 ${ch.subscribers_count || 0} ${pluralizeMembers(ch.subscribers_count || 0)}</span>
                                </div>
                                <button type="button" class="btn btn-primary btn-xs" onclick="event.stopPropagation(); openChannelDetail(${ch.id})">
                                    Перейти →
                                </button>
                            </div>
                        `).join('');
                    } else {
                        searchChBlock.style.display = 'none';
                    }
                }
            } catch (_) {
                if (searchChBlock) searchChBlock.style.display = 'none';
            }
        } else if (searchChBlock) {
            searchChBlock.style.display = 'none';
        }

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
    ['feed', 'profile', 'showcase', 'messages', 'channels', 'channelMessages', 'achievements'].forEach(v => {
        const el = document.getElementById(`${v}View`);
        if (el) {
            el.style.display = 'none';
            el.classList.remove('active');
        }
    });

    ['Feed', 'Profile', 'Gifts', 'Messages', 'Channels', 'Achievements'].forEach(t => {
        const btn = document.getElementById(`tabNav${t}`);
        if (btn) btn.classList.remove('active');
    });

    const vp = document.querySelector('.content-viewport');
    if (vp) {
        if (view === 'messages' || view === 'channel-messages') {
            vp.classList.add('viewport-workspace-mode');
        } else {
            vp.classList.remove('viewport-workspace-mode');
        }
        if (view === 'channels') {
            vp.classList.add('viewport-channels-mode');
        } else {
            vp.classList.remove('viewport-channels-mode');
        }
    }

    if (view === 'feed') {
        const el = document.getElementById('feedView');
        if (el) { el.style.display = 'block'; el.classList.add('active'); }
        const btn = document.getElementById('tabNavFeed');
        if (btn) btn.classList.add('active');
    } else if (view === 'profile' || view === 'my-profile') {
        const el = document.getElementById('profileView');
        if (el) { el.style.display = 'block'; el.classList.add('active'); }
        const btn = document.getElementById('tabNavProfile');
        if (btn) btn.classList.add('active');
    } else if (view === 'showcase') {
        const el = document.getElementById('showcaseView');
        if (el) { el.style.display = 'block'; el.classList.add('active'); }
        const btn = document.getElementById('tabNavGifts');
        if (btn) btn.classList.add('active');
    } else if (view === 'messages') {
        const el = document.getElementById('messagesView');
        if (el) { el.style.display = 'block'; el.classList.add('active'); }
        const btn = document.getElementById('tabNavMessages');
        if (btn) btn.classList.add('active');
    } else if (view === 'channels') {
        const el = document.getElementById('channelsView');
        if (el) { el.style.display = 'block'; el.classList.add('active'); }
        const btn = document.getElementById('tabNavChannels');
        if (btn) btn.classList.add('active');
        loadChannels();
    } else if (view === 'achievements') {
        const el = document.getElementById('achievementsView');
        if (el) { el.style.display = 'block'; el.classList.add('active'); }
        const btn = document.getElementById('tabNavAchievements');
        if (btn) btn.classList.add('active');
        loadAchievements(userId);
        try { window.history.pushState({}, '', `/?view=achievements`); } catch (_) {}
    } else if (view === 'channel-messages') {
        const el = document.getElementById('channelMessagesView');
        if (el) { el.style.display = 'block'; el.classList.add('active'); }
        const btn = document.getElementById('tabNavChannels');
        if (btn) btn.classList.add('active');
        if (userId) {
            initChannelMessagesView(userId);
        }
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
        // Синхронизируем вкладку "Личные" и загрузку диалогов
        switchChatScope('direct');
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

    // Экспонат удален из профиля по запросу пользователя
    const trophyWrap = document.getElementById('heroPinnedTrophyWrap');
    if (trophyWrap) trophyWrap.remove();

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
    // Музыкальный плеер профиля (мультитрековый плейлист с лицевым треком)
    const musicWrap = document.getElementById('heroMusicPlayerWrap');
    if (musicWrap) {
        loadUserProfileMusic(user.id, user);
    }

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

    // Обновление бейджа уровня аккаунта и опыта
    const heroLevelBadge = document.getElementById('heroLevelBadge');
    if (heroLevelBadge) {
        const lvl = user.account_level || 1;
        const title = user.level_title || 'Новичок';
        heroLevelBadge.innerHTML = `⚡ Ур. ${lvl} · ${escapeHtml(title)}`;
        heroLevelBadge.style.display = 'inline-flex';
    }
    const statLevel = document.getElementById('heroStatLevel');
    if (statLevel) statLevel.textContent = `🏆 ${user.account_level || 1} ур.`;
    const statXP = document.getElementById('heroStatXP');
    if (statXP) statXP.textContent = `${user.experience_points || 0} XP`;

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
            <div class="profile-options-dropdown-wrap">
                <button type="button" class="btn btn-secondary btn-icon-only profile-dots-btn" id="btnProfileOptionsDots" onclick="toggleProfileOptionsMenu(event)" title="Опции профиля">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2.2"></circle>
                        <circle cx="12" cy="12" r="2.2"></circle>
                        <circle cx="12" cy="19" r="2.2"></circle>
                    </svg>
                </button>
                <div class="profile-options-dropdown-menu" id="profileOptionsMenu" style="display: none;">
                    <button type="button" class="profile-dropdown-item" onclick="openProfileCustomization(); closeProfileOptionsMenu();">
                        <span>🎨 Оформление профиля</span>
                    </button>
                    <button type="button" class="profile-dropdown-item" onclick="openProfileEdit(); closeProfileOptionsMenu();">
                        <span>✏️ Редактировать</span>
                    </button>
                    <button type="button" class="profile-dropdown-item" onclick="openUserAchievements(${user.id}); closeProfileOptionsMenu();">
                        <span>🏆 Мои достижения</span>
                    </button>
                    <div class="profile-dropdown-divider"></div>
                    <button type="button" class="profile-dropdown-item text-danger" onclick="handleLogout(); closeProfileOptionsMenu();">
                        <span>🚪 Выйти</span>
                    </button>
                </div>
            </div>
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
            <button class="btn btn-secondary btn-sm" onclick="openUserAchievements(${user.id})" title="Посмотреть достижения и прогресс пользователя">
                <span>🏆 Достижения</span>
            </button>
            <button class="btn ${followClass} btn-sm" onclick="toggleProfileFollow(${user.id})">
                <span>${followText}</span>
            </button>
            <div class="profile-options-dropdown-wrap">
                <button type="button" class="btn btn-secondary btn-icon-only profile-dots-btn" onclick="toggleProfileOptionsMenu(event)" title="Опции профиля">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2.2"></circle>
                        <circle cx="12" cy="12" r="2.2"></circle>
                        <circle cx="12" cy="19" r="2.2"></circle>
                    </svg>
                </button>
                <div class="profile-options-dropdown-menu" id="profileOptionsMenu" style="display: none;">
                    <button type="button" class="profile-dropdown-item" onclick="openUserAchievements(${user.id}); closeProfileOptionsMenu();">
                        <span>🏆 Достижения пользователя</span>
                    </button>
                    <button type="button" class="profile-dropdown-item" onclick="copyProfileLink(${user.id}); closeProfileOptionsMenu();">
                        <span>📋 Скопировать ссылку</span>
                    </button>
                </div>
            </div>
        `;
    }

    handleIthaquaProfileSetup(user, data.is_owner);

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

// ==========================================
// PROFILE & CHANNEL 3-DOTS OPTIONS DROPDOWNS
// ==========================================
function toggleProfileOptionsMenu(event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const menu = document.getElementById('profileOptionsMenu');
    if (!menu) return;
    const isVisible = (menu.style.display === 'flex');
    closeAllOptionsMenus();
    menu.style.display = isVisible ? 'none' : 'flex';
}

function closeProfileOptionsMenu() {
    const menu = document.getElementById('profileOptionsMenu');
    if (menu) menu.style.display = 'none';
}

function openProfileCustomization() {
    openEditProfileModal();
    if (typeof switchCustomTab === 'function') {
        switchCustomTab('theme');
    }
}

function openProfileEdit() {
    openEditProfileModal();
    if (typeof switchCustomTab === 'function') {
        switchCustomTab('profile');
    }
}

function copyProfileLink(userId) {
    const url = `${window.location.origin}/?view=profile&user=${userId || window.CURRENT_USER_ID}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Ссылка на профиль скопирована в буфер обмена 📋', 'success');
    }).catch(() => {
        showToast('Не удалось скопировать ссылку', 'error');
    });
}

function toggleChannelOptionsMenu(event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const menu = document.getElementById('channelOptionsMenu');
    if (!menu) return;
    const isVisible = (menu.style.display === 'flex');
    closeAllOptionsMenus();
    menu.style.display = isVisible ? 'none' : 'flex';
}

function closeChannelOptionsMenu() {
    const menu = document.getElementById('channelOptionsMenu');
    if (menu) menu.style.display = 'none';
}

function closeAllOptionsMenus() {
    closeProfileOptionsMenu();
    closeChannelOptionsMenu();
}

function copyChannelLink() {
    if (!currentChannelData) return;
    const url = `${window.location.origin}/?view=channel&id=${currentChannelData.id}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Ссылка на канал скопирована в буфер обмена 📢', 'success');
    }).catch(() => {
        showToast('Не удалось скопировать ссылку', 'error');
    });
}

function refreshCurrentChatConversations() {
    if (typeof currentChatScope !== 'undefined' && currentChatScope === 'channels') {
        loadUserChannelConversations();
    } else {
        loadConversations();
    }
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.profile-options-dropdown-wrap')) {
        closeProfileOptionsMenu();
    }
    if (!e.target.closest('.channel-options-dropdown-wrap')) {
        closeChannelOptionsMenu();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAllOptionsMenus();
    }
});

function switchProfileTab(tabName) {
    ['Posts', 'Gifts', 'Network', 'IdentityV'].forEach(t => {
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
    if (!window.IS_AUTHENTICATED || !window.CURRENT_USER_ID) {
        showToast('Пожалуйста, войдите в аккаунт для настройки профиля', 'info');
        openAuthModal('login');
        return;
    }

    // Всегда загружаем профиль ТЕКУЩЕГО авторизованного пользователя, а не того, чью страницу мы смотрим!
    let myUser = null;
    try {
        const res = await fetch(`/api/users/${window.CURRENT_USER_ID}/profile`);
        if (res.ok) {
            const data = await res.json();
            myUser = data.user;
        }
    } catch (e) {
        console.error("Failed to load user profile for edit modal:", e);
    }

    if (!myUser) {
        showToast('Не удалось загрузить данные вашего профиля', 'error');
        return;
    }
    const u = myUser;

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

    // Музыка профиля
    const musicUrlInput = document.getElementById('editMusicUrl');
    const musicTitleInput = document.getElementById('editMusicTitle');
    const musicArtistInput = document.getElementById('editMusicArtist');
    if (musicUrlInput) musicUrlInput.value = u.music_url || '';
    if (musicTitleInput) musicTitleInput.value = u.music_title || '';
    if (musicArtistInput) musicArtistInput.value = u.music_artist || '';
    updateModalMusicPreviewState();

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
    const tabs = ['profile', 'status', 'avatar', 'theme', 'skills', 'social', 'trophy', 'music'];
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
    const previewHandle = window.CURRENT_USER_USERNAME || (currentProfileUserData ? currentProfileUserData.username : 'username');
    document.getElementById('previewUsername').textContent = `@${previewHandle}`;

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
    const musicUrl = (document.getElementById('editMusicUrl')?.value || '').trim();
    const musicTitle = (document.getElementById('editMusicTitle')?.value || '').trim();
    const musicArtist = (document.getElementById('editMusicArtist')?.value || '').trim();

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
                pinned_gift_id: pinnedGiftId,
                music_url: musicUrl,
                music_title: musicTitle,
                music_artist: musicArtist,
                poll_id: pollId
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
let currentProfAudioUrl = '';
let currentProfAudioTitle = '';
let currentProfAudioArtist = '';

function toggleProfImageBox() {
    const box = document.getElementById('profImageBox');
    if (!box) return;
    box.style.display = (box.style.display === 'none' || !box.style.display) ? 'block' : 'none';
    if (box.style.display === 'block') {
        const inp = document.getElementById('profImageUrl');
        if (inp) inp.focus();
    }
}

function toggleProfMusicBox() {
    const box = document.getElementById('profMusicBox');
    if (!box) return;
    box.style.display = (box.style.display === 'none' || !box.style.display) ? 'block' : 'none';
    if (box.style.display === 'block') {
        const inp = document.getElementById('profMusicTitle');
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

async function uploadProfSingleImage(file) {
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

    showToast('Загрузка фото в профиль...', 'info');

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

async function handleProfComposerFileUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
        await uploadProfSingleImage(file);
    } finally {
        e.target.value = '';
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

async function handleProfComposerAudioUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    showToast('Загрузка аудиофайла на сервер...', 'info');
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Ошибка загрузки аудио');
        }
        const data = await res.json();
        const cleanName = (data.filename || file.name).replace(/\.[^/.]+$/, '').replace(/^[\d_]+/, '');
        setProfComposerMusicPreset(data.url, cleanName, window.CURRENT_USER_DISPLAY_NAME || 'Автор');
        showToast('Аудиофайл успешно прикреплен! 🎵', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        e.target.value = '';
    }
}

function setProfComposerMusicPreset(url, title, artist) {
    currentProfAudioUrl = url;
    currentProfAudioTitle = title;
    currentProfAudioArtist = artist;

    const urlInput = document.getElementById('profMusicUrl');
    const titleInput = document.getElementById('profMusicTitle');
    const artistInput = document.getElementById('profMusicArtist');
    if (urlInput) urlInput.value = url;
    if (titleInput) titleInput.value = title;
    if (artistInput) artistInput.value = artist;

    const preview = document.getElementById('profMusicPreview');
    const pTitle = document.getElementById('profPreviewTitle');
    const pArtist = document.getElementById('profPreviewArtist');
    if (pTitle) pTitle.textContent = title;
    if (pArtist) pArtist.textContent = artist;
    if (preview) preview.style.display = 'block';

    const box = document.getElementById('profMusicBox');
    if (box) box.style.display = 'none';
}

function updateProfMusicState() {
    const url = document.getElementById('profMusicUrl')?.value.trim();
    const title = document.getElementById('profMusicTitle')?.value.trim() || 'Аудиозапись';
    const artist = document.getElementById('profMusicArtist')?.value.trim() || 'Исполнитель';

    if (url) {
        setProfComposerMusicPreset(url, title, artist);
    } else {
        clearProfComposerMusic();
    }
}

function clearProfComposerMusic() {
    currentProfAudioUrl = '';
    currentProfAudioTitle = '';
    currentProfAudioArtist = '';

    const urlInput = document.getElementById('profMusicUrl');
    const titleInput = document.getElementById('profMusicTitle');
    const artistInput = document.getElementById('profMusicArtist');
    if (urlInput) urlInput.value = '';
    if (titleInput) titleInput.value = '';
    if (artistInput) artistInput.value = '';

    const preview = document.getElementById('profMusicPreview');
    if (preview) preview.style.display = 'none';
}

function previewProfComposerAudio(e) {
    if (e) e.stopPropagation();
    if (!currentProfAudioUrl) return;
    window.musicPlayer.playTrack({
        url: currentProfAudioUrl,
        title: currentProfAudioTitle || 'Аудиозапись',
        artist: currentProfAudioArtist || 'Предпросмотр',
        source: 'prof-composer'
    });
}

async function createProfilePost() {
    const textarea = document.getElementById('profPostContent');
    let content = textarea ? textarea.value.trim() : '';
    const urlInput = document.getElementById('profImageUrl');
    let imageUrl = currentProfUploadedImageUrl || (urlInput ? urlInput.value.trim() : '');

    const profMusicUrlEl = document.getElementById('profMusicUrl');
    const profMusicTitleEl = document.getElementById('profMusicTitle');
    const profMusicArtistEl = document.getElementById('profMusicArtist');

    let musicUrl = currentProfAudioUrl || (profMusicUrlEl ? profMusicUrlEl.value.trim() : '');
    let musicTitle = currentProfAudioTitle || (profMusicTitleEl ? profMusicTitleEl.value.trim() : '') || (musicUrl ? 'Аудиозапись' : '');
    let musicArtist = currentProfAudioArtist || (profMusicArtistEl ? profMusicArtistEl.value.trim() : '') || (musicUrl ? (window.CURRENT_USER_DISPLAY_NAME || 'Автор') : '');

    // Авто-детекция ссылки на картинку из текста
    const imagePattern = /^https?:\/\/[^\s]+\.(jpeg|jpg|gif|png|webp)(\?[^\s]*)?$/i;
    if (!imageUrl && imagePattern.test(content)) {
        imageUrl = content;
        content = '';
    } else if (imageUrl && content === imageUrl) {
        content = '';
    }

    // Авто-детекция ссылки на аудио из текста
    const audioPattern = /^https?:\/\/[^\s]+\.(mp3|wav|ogg|m4a)(\?[^\s]*)?$/i;
    if (!musicUrl && audioPattern.test(content)) {
        musicUrl = content;
        musicTitle = 'Аудиозапись';
        musicArtist = window.CURRENT_USER_DISPLAY_NAME || 'Автор';
        content = '';
    }

    // Опрос в посте профиля
    let pollData = collectPollData('profPollQuestion', 'profPollOptionsInputs', 'profPollIsMultiple', 'profPollIsAnonymous');
    let pollId = null;
    if (pollData && (pollData.question || pollData.options.length > 0)) {
        if (!pollData.question || pollData.options.length < 2) {
            showToast('Для создания опроса заполните вопрос и минимум 2 варианта ответа', 'warning');
            return;
        }
        try {
            const pRes = await fetch('/api/polls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pollData)
            });
            if (!pRes.ok) {
                const pErr = await pRes.json();
                throw new Error(pErr.error || 'Ошибка создания опроса');
            }
            const pollObj = await pRes.json();
            pollId = pollObj.id;
        } catch (e) {
            showToast(e.message, 'error');
            return;
        }
    }

    if (!content && !imageUrl && !musicUrl && !pollId) {
        showToast('Введите текст публикации, прикрепите фото, музыку или опрос', 'error');
        return;
    }

    try {
        const res = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.CURRENT_USER_ID,
                content: content,
                image_url: imageUrl,
                music_url: musicUrl,
                music_title: musicTitle,
                music_artist: musicArtist,
                poll_id: pollId
            })
        });

        const post = await res.json();
        if (!res.ok) throw new Error(post.error || 'Ошибка публикации');

        if (textarea) textarea.value = '';
        clearProfComposerFile();
        clearProfComposerMusic();
        clearProfComposerPoll();
        const pPollBox = document.getElementById('profPollBox');
        if (pPollBox) pPollBox.style.display = 'none';
        const pBox = document.getElementById('profMusicBox');
        if (pBox) pBox.style.display = 'none';
        const imgBox = document.getElementById('profImageBox');
        if (imgBox) imgBox.style.display = 'none';

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

    editingChatMessageId = msgId;

    const rawText = msgEl.getAttribute('data-raw-content') ?? '';
    const audioUrl = msgEl.getAttribute('data-audio-url') || '';
    const audioTitle = msgEl.getAttribute('data-audio-title') || 'Аудиозапись';
    const audioArtist = msgEl.getAttribute('data-audio-artist') || '';

    const banner = document.getElementById('chatEditBanner');
    const preview = document.getElementById('chatEditPreviewText');
    const input = document.getElementById('chatMessageInput');

    if (preview) {
        let previewDesc = rawText;
        if (audioUrl) {
            previewDesc = (rawText ? (rawText + ' ') : '') + `🎵 [${audioTitle}]`;
        }
        preview.textContent = previewDesc || 'Редактирование аудио';
    }
    if (banner) banner.style.display = 'flex';

    if (input) {
        input.value = rawText;
        input.focus();
        input.select();
    }

    // Обработка аудиофайла в режиме редактирования:
    if (audioUrl) {
        attachChatMusicPreset(audioUrl, audioTitle, audioArtist);
    } else {
        clearChatAudioAttachment();
    }
}

function cancelEditChatMessage() {
    editingChatMessageId = null;
    const banner = document.getElementById('chatEditBanner');
    const input = document.getElementById('chatMessageInput');
    if (banner) banner.style.display = 'none';
    if (input) input.value = '';
    clearChatFile();
    clearChatAudioAttachment();
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


function formatChatMessageText(text) {
    if (!text) return '';

    // Проверяем наличие ссылки на публикацию: ?post=123 или /?post=123
    const postMatch = text.match(/(?:https?:\/\/[^\s<]+)?\/?\?post=(\d+)/i);
    let repostCardHtml = '';
    let sharedPostId = null;

    if (postMatch) {
        sharedPostId = parseInt(postMatch[1], 10);
        let snippet = '';
        const snippetMatch = text.match(/Поделился публикацией:\s*(?:"([^"]+)"|'([^']+)'|([^?\n\r]+))/i);
        if (snippetMatch) {
            snippet = (snippetMatch[1] || snippetMatch[2] || snippetMatch[3] || '').trim();
        }

        repostCardHtml = `
            <div class="chat-repost-card" onclick="navigateToPost(${sharedPostId}, event)" title="Нажмите, чтобы открыть публикацию">
                <div class="chat-repost-header">
                    <span style="display: inline-flex; align-items: center; gap: 6px;">
                        <span>📌</span> <span>Публикация #${sharedPostId}</span>
                    </span>
                    <span class="chat-repost-arrow">Перейти ↗</span>
                </div>
                ${snippet ? `<div class="chat-repost-snippet">${escapeHtml(snippet)}</div>` : ''}
            </div>
        `;
    }

    let escaped = escapeHtml(text);

    // Превращаем внутренние ссылки на публикации в кликабельные кнопки перехода
    escaped = escaped.replace(/(https?:\/\/[^\s<]+|\/)\?post=(\d+)/gi, (match, prefix, pid) => {
        return `<a href="/?post=${pid}" class="chat-post-link" onclick="event.preventDefault(); event.stopPropagation(); navigateToPost(${pid}, event);" title="Перейти к публикации #${pid}">${match}</a>`;
    });

    // Обычные внешние ссылки
    escaped = escaped.replace(/(https?:\/\/[^\s<]+)/gi, (match) => {
        if (match.includes('chat-post-link') || match.includes('navigateToPost')) return match;
        return `<a href="${match}" target="_blank" rel="noopener noreferrer" class="chat-external-link" onclick="event.stopPropagation()">${match}</a>`;
    });

    escaped = escaped.replace(/\n/g, '<br>');
    return escaped + repostCardHtml;
}

async function navigateToPost(postId, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!postId) return;

    navigateTo('feed');

    try {
        history.pushState(null, '', `/?post=${postId}`);
    } catch (_) {}

    let postEl = document.getElementById(`post-${postId}`);

    if (!postEl) {
        try {
            const res = await fetch(`/api/posts/${postId}`);
            if (res.ok) {
                const post = await res.json();
                const container = document.getElementById('postsContainer');
                if (container) {
                    postEl = createPostElement(post);
                    container.insertBefore(postEl, container.firstChild);
                }
            }
        } catch (e) {
            console.error('Error fetching post:', e);
        }
    }

    if (postEl) {
        setTimeout(() => {
            postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            postEl.classList.remove('post-card-highlighted');
            void postEl.offsetWidth;
            postEl.classList.add('post-card-highlighted');
            setTimeout(() => {
                postEl.classList.remove('post-card-highlighted');
            }, 3500);
        }, 180);
    } else {
        showToast('Публикация не найдена или была удалена', 'error');
    }
}

function buildChatMessageBubbleHtml(m, isOut) {
    const trimmed = (m.content || '').trim();
    const isImageFile = /\.(jpeg|jpg|gif|png|webp)($|\?)/i.test(trimmed);
    const isUploadedPath = trimmed.startsWith('/uploads/');
    const isAudioFile = /\.(mp3|wav|ogg|m4a|aac|flac)($|\?)/i.test(trimmed);
    const audioUrl = m.audio_url || (isAudioFile ? trimmed : '');

    let audioHtml = '';
    if (audioUrl) {
        const audioTitle = m.audio_title || (isAudioFile ? trimmed.split('/').pop().replace(/^\d+_/, '') : 'Аудиозапись');
        const audioArtist = m.audio_artist || (isOut ? (window.CURRENT_USER_DISPLAY_NAME || 'Вы') : (activeInterlocutorData ? activeInterlocutorData.display_name : 'Собеседник'));
        audioHtml = `
            <div class="chat-audio-card" id="chat-audio-${m.id}" data-audio-url="${escapeHtml(audioUrl)}" data-audio-title="${escapeHtml(audioTitle)}" data-audio-artist="${escapeHtml(audioArtist)}">
                <button type="button" class="chat-audio-play-btn" onclick="window.musicPlayer.playTrack({url: '${escapeHtml(audioUrl)}', title: '${escapeHtml(audioTitle)}', artist: '${escapeHtml(audioArtist)}', elementId: 'chat-audio-${m.id}'}, event)" title="Слушать аудио">
                    <span class="chat-audio-icon">▶️</span>
                </button>
                <div class="chat-audio-info">
                    <div class="chat-audio-title">${escapeHtml(audioTitle)}</div>
                    <div class="chat-audio-artist">${escapeHtml(audioArtist)}</div>
                </div>
                <div class="chat-audio-wave">
                    <span></span><span></span><span></span><span></span>
                </div>
            </div>
        `;
    }

    let contentHtml = '';
    if (audioHtml) {
        if (trimmed && trimmed !== audioUrl) {
            contentHtml = audioHtml + `<div class="chat-text-after-audio" style="margin-top: 4px;">${formatChatMessageText(trimmed)}</div>`;
        } else {
            contentHtml = audioHtml;
        }
    } else if (isImageFile || (isUploadedPath && /\.(jpeg|jpg|gif|png|webp)$/i.test(trimmed))) {
        contentHtml = `<div class="chat-media-preview-box"><img src="${escapeHtml(trimmed)}" alt="Фото" class="chat-sent-image" onclick="openImageLightbox('${escapeHtml(trimmed)}', 'Фото')"></div>`;
    } else if (isUploadedPath) {
        const fileName = trimmed.split('/').pop().replace(/^\d+_/, '');
        contentHtml = `<a href="${escapeHtml(trimmed)}" target="_blank" download class="chat-file-attachment" style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; background: rgba(255,255,255,0.08); border-radius: 10px; color: #fff; text-decoration: none; font-weight: 500;">📎 <span>${escapeHtml(fileName || 'Скачать файл')}</span></a>`;
    } else {
        contentHtml = formatChatMessageText(m.content || '');
    }
    if (m.poll) {
        const pollWidgetHtml = renderPollWidget(m.poll);
        contentHtml = (contentHtml ? contentHtml + '<div style="margin-top: 6px;"></div>' : '') + pollWidgetHtml;
    }
    return contentHtml;
}

function setChatMessageRowData(row, m, isOut) {
    const trimmed = (m.content || '').trim();
    const isAudioFile = /\.(mp3|wav|ogg|m4a|aac|flac)($|\?)/i.test(trimmed);
    const audioUrl = m.audio_url || (isAudioFile ? trimmed : '');
    const audioTitle = m.audio_title || (isAudioFile ? trimmed.split('/').pop().replace(/^\d+_/, '') : '');
    const audioArtist = m.audio_artist || '';
    const rawText = (trimmed === audioUrl) ? '' : (m.content || '');

    row.setAttribute('data-msg-id', m.id);
    row.setAttribute('data-is-out', isOut ? '1' : '0');
    row.setAttribute('data-raw-content', rawText);
    row.setAttribute('data-audio-url', audioUrl);
    row.setAttribute('data-audio-title', audioTitle);
    row.setAttribute('data-audio-artist', audioArtist);
}

function updateChatMessageDOM(m) {
    const row = document.getElementById(`chat-msg-${m.id}`);
    if (!row) return;

    const isOut = (row.getAttribute('data-is-out') === '1') || (m.sender_id === window.CURRENT_USER_ID);
    setChatMessageRowData(row, m, isOut);

    const contentEl = row.querySelector('.chat-bubble-content');
    if (contentEl) {
        contentEl.innerHTML = buildChatMessageBubbleHtml(m, isOut);
    }

    const footer = row.querySelector('.chat-bubble-footer');
    if (footer && !footer.querySelector('.chat-bubble-edited')) {
        const ed = document.createElement('span');
        ed.className = 'chat-bubble-edited';
        ed.textContent = ' • (ред.)';
        footer.insertBefore(ed, footer.firstChild);
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

    setChatMessageRowData(row, m, isOut);

    const statusCheck = isOut ? (m.is_read ? '<span class="chat-bubble-status" title="Прочитано">✓✓</span>' : '<span class="chat-bubble-status" title="Доставлено">✓</span>') : '';
    const editedBadge = m.is_edited ? '<span class="chat-bubble-edited" title="Отредактировано">• (ред.)</span>' : '';

    const contentHtml = buildChatMessageBubbleHtml(m, isOut);

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

    let audioUrl = pendingChatAudio ? pendingChatAudio.url : '';
    let audioTitle = pendingChatAudio ? pendingChatAudio.title : '';
    let audioArtist = pendingChatAudio ? pendingChatAudio.artist : '';

    if (!content && !audioUrl) return;

    const sendBtn = document.getElementById('chatSendBtn');

    // Если сейчас включен режим редактирования сообщения:
    if (editingChatMessageId) {
        const msgIdToEdit = editingChatMessageId;
        if (sendBtn) sendBtn.disabled = true;
        isSendingMessage = true;
        try {
            const res = await fetch(`/api/messages/${msgIdToEdit}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: content,
                    audio_url: audioUrl,
                    audio_title: audioTitle,
                    audio_artist: audioArtist
                })
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Ошибка редактирования сообщения');
            }
            const updated = await res.json();
            updateChatMessageDOM(updated);
            cancelEditChatMessage();
            showToast('Сообщение изменено ✨', 'success');
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
                content: content,
                audio_url: audioUrl,
                audio_title: audioTitle,
                audio_artist: audioArtist
            })
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Ошибка отправки сообщения');
        }

        const msg = await res.json();
        input.value = '';
        clearChatFile();
        clearChatAudioAttachment();

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

// Загрузка фото/файла/аудио в чат через единую скрепку 📎
async function handleChatFileUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file || !activeChatUserId) return;

    const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aac|webm)$/i.test(file.name);
    const formData = new FormData();
    formData.append('file', file);

    showToast(isAudio ? 'Загрузка аудио...' : 'Загрузка файла...', 'info');

    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) throw new Error('Ошибка при загрузке файла');
        const data = await res.json();

        if (isAudio || data.is_audio) {
            // Аудиофайл: название автоматически из имени файла, никаких запросов названия/исполнителя!
            const cleanTitle = (data.filename || file.name).replace(/\.[^/.]+$/, '').replace(/^[\d_]+/, '');
            pendingChatAudio = {
                url: data.url,
                title: cleanTitle || 'Аудиозапись',
                artist: ''
            };
            const preview = document.getElementById('chatAudioPreview');
            const pTitle = document.getElementById('chatAudioPreviewTitle');
            const pArtist = document.getElementById('chatAudioPreviewArtist');
            if (pTitle) pTitle.textContent = pendingChatAudio.title;
            if (pArtist) pArtist.textContent = '🎵 Аудиофайл';
            if (preview) preview.style.display = 'block';

            clearChatFile();
            showToast('Аудиозапись прикреплена! Нажмите «Отправить»', 'success');
        } else {
            currentChatAttachmentUrl = data.url;
            const preview = document.getElementById('chatUploadPreview');
            const previewName = document.getElementById('chatPreviewName');
            if (preview && previewName) {
                previewName.textContent = file.name;
                preview.style.display = 'block';
            }
            clearChatAudioAttachment();
            showToast('Файл прикреплен! Нажмите «Отправить»', 'success');
        }
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

    refreshCurrentChatConversations();
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
                updateChatMessageDOM(msg);
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



// ==========================================
// IDENTITY V & ITHAQUA (NIGHT WATCH) PROFILE LOGIC
// ==========================================

let ithaquaAudioCtx = null;
let ithaquaWindNoiseNode = null;
let ithaquaWindGainNode = null;
let ithaquaWindFilterNode = null;
let ithaquaWindLfo = null;
let isIthaquaWindPlaying = false;

let blizzardCanvasAnimId = null;

function isIthaquaUser(user) {
    if (!user) return false;
    return user.username === 'itakwa' || user.id === 9 || (user.display_name && user.display_name.includes('Итаква'));
}

function handleIthaquaProfileSetup(user, isOwner) {
    const isIth = isIthaquaUser(user);
    const profileView = document.getElementById('profileView');
    const tabBtn = document.getElementById('profTabBtnIdentityV');
    const tabPane = document.getElementById('profTabContentIdentityV');

    if (isIth) {
        if (profileView) profileView.classList.add('ithaqua-theme-active');
        if (tabBtn) tabBtn.style.display = 'inline-flex';
        renderIthaquaDossier(user, isOwner);
        startIthaquaBlizzard();
    } else {
        if (profileView) profileView.classList.remove('ithaqua-theme-active');
        if (tabBtn) tabBtn.style.display = 'none';
        if (tabPane) tabPane.style.display = 'none';
        stopIthaquaBlizzard();
        stopIthaquaWindSound();
    }
}

function startIthaquaBlizzard() {
    const banner = document.getElementById('heroBanner');
    if (!banner) return;
    stopIthaquaBlizzard();

    let canvas = document.getElementById('blizzardCanvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'blizzardCanvas';
        canvas.className = 'blizzard-canvas-overlay';
        banner.style.position = 'relative';
        banner.appendChild(canvas);
    }

    const ctx = canvas.getContext('2d');
    let width = (canvas.width = banner.offsetWidth || 800);
    let height = (canvas.height = banner.offsetHeight || 220);

    const onResize = () => {
        if (canvas && banner) {
            width = canvas.width = banner.offsetWidth || 800;
            height = canvas.height = banner.offsetHeight || 220;
        }
    };
    window.addEventListener('resize', onResize);

    const flakes = [];
    const FLAKE_COUNT = 55;
    for (let i = 0; i < FLAKE_COUNT; i++) {
        flakes.push({
            x: Math.random() * width,
            y: Math.random() * height,
            r: Math.random() * 2.2 + 0.8,
            speedY: Math.random() * 1.8 + 1.0,
            speedX: Math.random() * 2.2 + 1.2,
            alpha: Math.random() * 0.7 + 0.3,
            isGlacial: Math.random() > 0.4
        });
    }

    function renderBlizzard() {
        ctx.clearRect(0, 0, width, height);
        for (let i = 0; i < FLAKE_COUNT; i++) {
            const f = flakes[i];
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
            ctx.fillStyle = f.isGlacial ? `rgba(56, 189, 248, ${f.alpha})` : `rgba(240, 249, 255, ${f.alpha})`;
            ctx.shadowBlur = f.r > 1.8 ? 6 : 0;
            ctx.shadowColor = '#38bdf8';
            ctx.fill();

            f.y += f.speedY;
            f.x += f.speedX;

            if (f.y > height) {
                f.y = -5;
                f.x = Math.random() * width;
            }
            if (f.x > width) {
                f.x = -5;
            }
        }
        blizzardCanvasAnimId = requestAnimationFrame(renderBlizzard);
    }
    renderBlizzard();
}

function stopIthaquaBlizzard() {
    if (blizzardCanvasAnimId) {
        cancelAnimationFrame(blizzardCanvasAnimId);
        blizzardCanvasAnimId = null;
    }
    const canvas = document.getElementById('blizzardCanvas');
    if (canvas) canvas.remove();
}

// Generative Arctic Wind Audio Synthesizer
function toggleIthaquaWindSound() {
    if (isIthaquaWindPlaying) {
        stopIthaquaWindSound();
    } else {
        startIthaquaWindSound();
    }
}

function startIthaquaWindSound() {
    try {
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtxClass) return;
        if (!ithaquaAudioCtx) ithaquaAudioCtx = new AudioCtxClass();
        if (ithaquaAudioCtx.state === 'suspended') ithaquaAudioCtx.resume();

        const bufferSize = ithaquaAudioCtx.sampleRate * 3;
        const noiseBuffer = ithaquaAudioCtx.createBuffer(1, bufferSize, ithaquaAudioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + 0.02 * white) / 1.02;
            lastOut = output[i];
            output[i] *= 3.5;
        }

        ithaquaWindNoiseNode = ithaquaAudioCtx.createBufferSource();
        ithaquaWindNoiseNode.buffer = noiseBuffer;
        ithaquaWindNoiseNode.loop = true;

        ithaquaWindFilterNode = ithaquaAudioCtx.createBiquadFilter();
        ithaquaWindFilterNode.type = 'bandpass';
        ithaquaWindFilterNode.frequency.value = 520;
        ithaquaWindFilterNode.Q.value = 3.8;

        ithaquaWindLfo = ithaquaAudioCtx.createOscillator();
        ithaquaWindLfo.frequency.value = 0.22;
        const lfoGain = ithaquaAudioCtx.createGain();
        lfoGain.gain.value = 320;
        ithaquaWindLfo.connect(lfoGain);
        lfoGain.connect(ithaquaWindFilterNode.frequency);

        ithaquaWindGainNode = ithaquaAudioCtx.createGain();
        ithaquaWindGainNode.gain.setValueAtTime(0.001, ithaquaAudioCtx.currentTime);
        ithaquaWindGainNode.gain.exponentialRampToValueAtTime(0.35, ithaquaAudioCtx.currentTime + 1.2);

        ithaquaWindNoiseNode.connect(ithaquaWindFilterNode);
        ithaquaWindFilterNode.connect(ithaquaWindGainNode);
        ithaquaWindGainNode.connect(ithaquaAudioCtx.destination);

        ithaquaWindLfo.start();
        ithaquaWindNoiseNode.start();
        isIthaquaWindPlaying = true;

        updateAmbienceBtnState(true);
        showToast('❄️ Звук северного ветра включен', 'info');
    } catch (e) {
        console.error('Wind audio error:', e);
    }
}

function stopIthaquaWindSound() {
    if (!isIthaquaWindPlaying) return;
    try {
        if (ithaquaWindGainNode && ithaquaAudioCtx) {
            ithaquaWindGainNode.gain.setValueAtTime(ithaquaWindGainNode.gain.value, ithaquaAudioCtx.currentTime);
            ithaquaWindGainNode.gain.exponentialRampToValueAtTime(0.0001, ithaquaAudioCtx.currentTime + 0.6);
            setTimeout(() => {
                if (ithaquaWindNoiseNode) {
                    try { ithaquaWindNoiseNode.stop(); } catch(e){}
                    ithaquaWindNoiseNode.disconnect();
                    ithaquaWindNoiseNode = null;
                }
                if (ithaquaWindLfo) {
                    try { ithaquaWindLfo.stop(); } catch(e){}
                    ithaquaWindLfo.disconnect();
                    ithaquaWindLfo = null;
                }
            }, 650);
        }
    } catch(e) {}
    isIthaquaWindPlaying = false;
    updateAmbienceBtnState(false);
}

function updateAmbienceBtnState(playing) {
    const btn = document.getElementById('idvAmbienceBtn');
    if (btn) {
        btn.classList.toggle('playing', playing);
        btn.innerHTML = playing ? '<span>🔊 Завывание Метели (Играет)</span>' : '<span>❄️ Зов Метели (Звуковой эффект)</span>';
    }
}

// Renders the exclusive Identity V Hunter Dossier & Artwork Gallery
function renderIthaquaDossier(user, isOwner) {
    const container = document.getElementById('idvDossierContainer');
    if (!container) return;

    const arts = [
        {
            key: 'canon',
            title: 'Шёпот Метели',
            sub: 'Каноничный облик: меховой капюшон, сокрытое лицо и предостерегающий жест',
            url: '/uploads/ithaqua_1fb3a18e3859fc2e3465550920a07806.jpg',
            badge: 'Канон • Охотник',
            rank: 'Ледяной Страж • Ночной Дозорный (Identity V)',
            frame: 'night-watch',
            effect: 'arctic-blizzard',
            accent: '#38bdf8'
        },
        {
            key: 'unmasked',
            title: 'Безмолвие Короны',
            sub: 'Истинный лик: обнажённый взгляд, серебряные волосы и морозный венец',
            url: '/uploads/ithaqua_6388aa602b3b6e36c0ccba4e32cd82dd.jpg',
            badge: 'Истинный лик • Без маски',
            rank: 'Владыка Метели Особняка Олетис',
            frame: 'blizzard-aura',
            effect: 'frozen-fog',
            accent: '#7dd3fc'
        },
        {
            key: 'combat',
            title: 'Поступь Охотника',
            sub: 'Боевая готовность: стремительный полёт на ходулях-серпах с ледяной косой',
            url: '/uploads/ithaqua_f292c2602f0f8c85327e7e458b25d116.jpg',
            badge: 'Боевая стойка • Ходули',
            rank: 'Охотник ранга Тень Ветра • Identity V',
            frame: 'ice-spikes',
            effect: 'arctic-blizzard',
            accent: '#0284c7'
        },
        {
            key: 'gold',
            title: 'Золотой Солнцеворот',
            sub: 'Церемониальное одеяние с золотой маской солнца посреди вечной мерзлоты',
            url: '/uploads/ithaqua_ff8cc7d545cedab20da705892775673c.jpg',
            badge: 'Золотой облик • Реликт',
            rank: 'Золотой Солнцеворот • Ночной Дозорный',
            frame: 'gold-frost',
            effect: 'aurora-borealis',
            accent: '#f59e0b'
        }
    ];

    let quickSwitcherHtml = '';
    const isCurrentUserIthaqua = (window.CURRENT_USER_USERNAME === 'itakwa' || (window.CURRENT_USER_DISPLAY_NAME && window.CURRENT_USER_DISPLAY_NAME.includes('Итаква')));
    if (isOwner || isCurrentUserIthaqua) {
        quickSwitcherHtml = `
        <div style="margin-top: 1.25rem; padding: 1rem; background: rgba(56, 189, 248, 0.08); border: 1px dashed rgba(56, 189, 248, 0.35); border-radius: var(--radius-md);">
            <div style="font-size: 0.82rem; font-weight: 700; color: #7dd3fc; margin-bottom: 0.6rem; text-transform: uppercase; letter-spacing: 0.5px;">
                ⚙️ Быстрое переключение стиля профиля Итаквы (в 1 клик):
            </div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                ${arts.map(a => `
                    <button type="button" class="idv-preset-btn" onclick="applyIthaquaSkinPreset('${a.key}')">
                        <span>${a.title}</span>
                    </button>
                `).join('')}
            </div>
        </div>
        `;
    }

    container.innerHTML = `
        <div class="idv-dossier-wrap">
            <!-- Главная плашка досье -->
            <div class="idv-hero-header-card">
                <div class="idv-dossier-header-top">
                    <div>
                        <div class="idv-badge-pill">
                            <span>❄️</span>
                            <span>IDENTITY V • HUNTER CLASS</span>
                        </div>
                        <h2 style="color: #f0f9ff; font-size: 1.5rem; font-weight: 800; margin: 0.5rem 0 0.2rem 0; letter-spacing: 0.5px;">
                            Итаква (Ithaqua / The Night Watch)
                        </h2>
                        <div style="color: #7dd3fc; font-size: 0.88rem; font-weight: 600;">
                            Ночной Дозорный • Владыка Полярных Ветров и Ледяных Ходулей
                        </div>
                    </div>
                    <div>
                        <button type="button" id="idvAmbienceBtn" class="idv-ambience-btn ${isIthaquaWindPlaying ? 'playing' : ''}" onclick="toggleIthaquaWindSound()">
                            <span>${isIthaquaWindPlaying ? '🔊 Завывание Метели (Играет)' : '❄️ Зов Метели (Звуковой эффект)'}</span>
                        </button>
                    </div>
                </div>

                <div class="idv-story-quote">
                    «Когда деревня изгнала нас в ледяную пустошь, холод забрал мою мать. С тех пор я слышу её голос в каждом порыве бурана. Мои ходули не знают усталости, а коса не знает пощады к тем, кто тревожит наш вечный покой...»
                </div>

                ${quickSwitcherHtml}
            </div>

            <!-- Сетка характеристик и способностей -->
            <div class="idv-stats-grid">
                <!-- Карточка Досье -->
                <div class="idv-stat-card">
                    <div class="idv-stat-card-title">
                        <span>📜</span>
                        <span>Досье Персонажа</span>
                    </div>
                    <div class="idv-spec-row">
                        <span class="idv-spec-label">Класс</span>
                        <span class="idv-spec-value">Охотник (Hunter)</span>
                    </div>
                    <div class="idv-spec-row">
                        <span class="idv-spec-label">Кодовое имя</span>
                        <span class="idv-spec-value">Night Watch (Ночной Дозорный)</span>
                    </div>
                    <div class="idv-spec-row">
                        <span class="idv-spec-label">Оружие</span>
                        <span class="idv-spec-value">Ледяная Коса & Клинки Ходулей</span>
                    </div>
                    <div class="idv-spec-row">
                        <span class="idv-spec-label">Локация</span>
                        <span class="idv-spec-value">Полярные леса Поместья Олетис</span>
                    </div>
                    <div class="idv-spec-row">
                        <span class="idv-spec-label">Характер</span>
                        <span class="idv-spec-value">Холодный, молчаливый, неумолимый</span>
                    </div>
                </div>

                <!-- Карточка Боевых Показателей -->
                <div class="idv-stat-card">
                    <div class="idv-stat-card-title">
                        <span>⚡</span>
                        <span>Боевые Показатели Охотника</span>
                    </div>
                    <div class="idv-spec-row">
                        <span class="idv-spec-label">Скорость погони (По ветру)</span>
                        <span class="idv-spec-value" style="color: #38bdf8;">S+ (Сверхбыстрая)</span>
                    </div>
                    <div class="idv-spec-row">
                        <span class="idv-spec-label">Контроль дистанции</span>
                        <span class="idv-spec-value" style="color: #38bdf8;">A+ (Притягивание)</span>
                    </div>
                    <div class="idv-spec-row">
                        <span class="idv-spec-label">Радиус атаки косой</span>
                        <span class="idv-spec-value">Высокий (Широкий замах)</span>
                    </div>
                    <div class="idv-spec-row">
                        <span class="idv-spec-label">Преодоление препятствий</span>
                        <span class="idv-spec-value">Прыжки на ходулях через паллеты</span>
                    </div>
                    <div class="idv-spec-row">
                        <span class="idv-spec-label">Сложность освоения</span>
                        <span class="idv-spec-value" style="color: #fbbf24;">★★★★☆ (Мастер)</span>
                    </div>
                </div>

                <!-- Карточка Способностей -->
                <div class="idv-stat-card">
                    <div class="idv-stat-card-title">
                        <span>🌪️</span>
                        <span>Особые Навыки Охотника</span>
                    </div>
                    <div class="idv-skills-list">
                        <div class="idv-skill-item">
                            <div class="idv-skill-title">
                                <span>🌪️</span>
                                <span>Поступь Ветра (Wind Walker)</span>
                            </div>
                            <div class="idv-skill-desc">
                                Встаёт на попутный вихрь метели, многократно ускоряя шаг на ходулях и мгновенно перемахивая через доски и окна.
                            </div>
                        </div>
                        <div class="idv-skill-item">
                            <div class="idv-skill-title">
                                <span>❄️</span>
                                <span>Ледяной Циклон (Glacial Tempest)</span>
                            </div>
                            <div class="idv-skill-desc">
                                Призывает локальный морозный вихрь, поглощающий воздух и притягивающий убегающую жертву прямо под замах косы.
                            </div>
                        </div>
                        <div class="idv-skill-item">
                            <div class="idv-skill-title">
                                <span>🏮</span>
                                <span>Фонарь Скорби (Lantern of Lament)</span>
                            </div>
                            <div class="idv-skill-desc">
                                Освещает морозную мглу, раскрывая замерзшие следы и силуэты выживших на снегу сквозь стены и препятствия.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Галерея всех 4 образов из Desktop\Ита -->
            <div class="idv-gallery-section">
                <div class="idv-gallery-header">
                    <div>
                        <div class="idv-gallery-title">
                            <span>🖼️</span>
                            <span>Галерея Обликов и Артов (High Definition)</span>
                        </div>
                        <p style="color: var(--text-dim); font-size: 0.82rem; margin: 0.3rem 0 0 0;">
                            Нажмите на любой арт, чтобы детально рассмотреть его в полноэкранном режиме с функцией масштабирования (Lightbox).
                        </p>
                    </div>
                </div>

                <div class="idv-gallery-grid">
                    ${arts.map(art => `
                        <div class="idv-art-card">
                            <div class="idv-art-thumb-wrap" onclick="openImageLightbox('${art.url}', 'Итаква • ${escapeHtml(art.title)}')">
                                <img src="${art.url}" alt="${escapeHtml(art.title)}" class="idv-art-thumb" loading="lazy">
                                <div class="idv-art-zoom-overlay">
                                    <span class="idv-zoom-badge">🔍 Рассмотреть</span>
                                </div>
                            </div>
                            <div class="idv-art-details">
                                <div>
                                    <div class="idv-art-name">${escapeHtml(art.title)}</div>
                                    <div class="idv-art-sub">${escapeHtml(art.sub)}</div>
                                </div>
                                <div class="idv-art-actions">
                                    <button type="button" class="btn btn-secondary btn-sm" style="flex: 1;" onclick="openImageLightbox('${art.url}', 'Итаква • ${escapeHtml(art.title)}')">
                                        <span>🔍 Увеличить</span>
                                    </button>
                                    ${(isOwner || isCurrentUserIthaqua) ? `
                                        <button type="button" class="btn btn-outline btn-sm" onclick="applyIthaquaSkinPreset('${art.key}')" title="Установить этот облик основным в профиле">
                                            <span>Одеть</span>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

// Applies skin preset for Ithaqua
async function applyIthaquaSkinPreset(presetKey) {
    const presets = {
        canon: {
            avatar: '/uploads/ithaqua_1fb3a18e3859fc2e3465550920a07806.jpg',
            banner: '/uploads/ithaqua_6388aa602b3b6e36c0ccba4e32cd82dd.jpg',
            rank: 'Ледяной Страж • Ночной Дозорный (Identity V)',
            frame: 'night-watch',
            effect: 'arctic-blizzard',
            accent: '#38bdf8',
            emoji: '❄️',
            status: '❄️ Метель уже близко... Я слышу твой шаг.'
        },
        unmasked: {
            avatar: '/uploads/ithaqua_6388aa602b3b6e36c0ccba4e32cd82dd.jpg',
            banner: '/uploads/ithaqua_f292c2602f0f8c85327e7e458b25d116.jpg',
            rank: 'Владыка Метели Особняка Олетис',
            frame: 'blizzard-aura',
            effect: 'frozen-fog',
            accent: '#7dd3fc',
            emoji: '👑',
            status: '👑 Без маски холод ощущается иначе.'
        },
        combat: {
            avatar: '/uploads/ithaqua_f292c2602f0f8c85327e7e458b25d116.jpg',
            banner: '/uploads/ithaqua_6388aa602b3b6e36c0ccba4e32cd82dd.jpg',
            rank: 'Охотник ранга Тень Ветра • Identity V',
            frame: 'ice-spikes',
            effect: 'arctic-blizzard',
            accent: '#0284c7',
            emoji: '🌪️',
            status: '🌪️ Скольжу по льду на острых ходулях.'
        },
        gold: {
            avatar: '/uploads/ithaqua_ff8cc7d545cedab20da705892775673c.jpg',
            banner: '/uploads/ithaqua_1fb3a18e3859fc2e3465550920a07806.jpg',
            rank: 'Золотой Солнцеворот • Ночной Дозорный',
            frame: 'gold-frost',
            effect: 'aurora-borealis',
            accent: '#f59e0b',
            emoji: '✨',
            status: '✨ Солнечный диск обманчив среди вечных снегов.'
        }
    };

    const p = presets[presetKey];
    if (!p) return;

    try {
        const res = await fetch('/api/users/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                display_name: 'Итаква • Night Watch',
                bio: 'Ночной Дозорный (Night Watch) • Охотник Поместья Олетис (Identity V). Владыка ледяных ветров и безжалостных метелей. Тот, кто бесшумно шагает сквозь свирепую зимнюю бурю на острых ходулях, ведомый плачем замерзшей матери. «Тише... слышишь, как завывает северный ветер?»',
                avatar_url: p.avatar,
                banner_url: p.banner,
                custom_rank: p.rank,
                status_emoji: p.emoji,
                status_text: p.status,
                accent_color: p.accent,
                avatar_frame: p.frame,
                profile_bg_effect: p.effect,
                skills_tags: 'Identity V, Охотник, Ночной Дозорный, Поступь Ветра, Циклон, Метель, Олетис',
                social_links: '{"web":"https://idv.163.com","discord":"Ithaqua#0001"}',
                pinned_gift_id: 1
            })
        });

        if (res.ok) {
            showToast('❄️ Облик Итаквы успешно обновлен!', 'success');
            if (window.CURRENT_USER_ID) {
                loadUserProfile(window.CURRENT_USER_ID);
            }
        } else {
            showToast('Ошибка смены облика', 'error');
        }
    } catch (e) {
        console.error('Error applying skin:', e);
    }
}


// ============================================================================
// GLOBAL CYBERPUNK MUSIC SYSTEM & AUDIO ENGINE
// ============================================================================

let currentComposerAudioUrl = '';
let currentComposerAudioTitle = '';
let currentComposerAudioArtist = '';

let pendingChatAudio = null;

const HEADER_PLAY_SVG = '<svg viewBox="0 0 24 24" class="header-ctrl-icon" style="margin-left: 2px;"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
const HEADER_PAUSE_SVG = '<svg viewBox="0 0 24 24" class="header-ctrl-icon"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/></svg>';

class GlobalMusicPlayer {
    constructor() {
        this.audio = new Audio();
        this.isPlaying = false;
        this.currentTrack = null;
        this.playlist = [];
        this.currentIndex = 0;
    }

    init() {
        const playerHeader = document.getElementById('headerMusicPlayer');
        const topBar = document.querySelector('.top-sensor-bar');
        const searchInput = document.getElementById('searchInput');
        if (playerHeader) {
            playerHeader.style.display = 'none';
            playerHeader.classList.remove('is-active', 'is-playing');
        }
        if (topBar) {
            topBar.classList.remove('player-active');
        }
        if (searchInput) {
            searchInput.placeholder = 'Поиск записей, каналов, авторов, #тегов...';
        }

        this.audio.addEventListener('timeupdate', () => {
            if (this.audio.duration && !isNaN(this.audio.duration)) {
                const percent = (this.audio.currentTime / this.audio.duration) * 100;
                const bar = document.getElementById('headerMusicProgressBar');
                if (bar) bar.style.width = `${percent}%`;
            }
            const curTimeEl = document.getElementById('headerMusicCurrentTime');
            const durTimeEl = document.getElementById('headerMusicDuration');
            if (curTimeEl) {
                curTimeEl.textContent = this.formatTime(this.audio.currentTime);
            }
            if (durTimeEl && this.audio.duration && !isNaN(this.audio.duration)) {
                durTimeEl.textContent = this.formatTime(this.audio.duration);
            }
        });

        this.audio.addEventListener('loadedmetadata', () => {
            const durTimeEl = document.getElementById('headerMusicDuration');
            if (durTimeEl && this.audio.duration && !isNaN(this.audio.duration)) {
                durTimeEl.textContent = this.formatTime(this.audio.duration);
            }
        });

        this.audio.addEventListener('play', () => {
            this.isPlaying = true;
            this.updateUIState();
        });

        this.audio.addEventListener('pause', () => {
            this.isPlaying = false;
            this.updateUIState();
        });

        this.audio.addEventListener('ended', () => {
            this.nextTrack();
        });

        this.audio.addEventListener('error', (e) => {
            console.error('Audio playback error:', e);
            this.isPlaying = false;
            this.updateUIState();
        });
    }

    formatTime(sec) {
        if (!sec || isNaN(sec) || !isFinite(sec) || sec < 0) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    toggleMute() {
        this.audio.muted = !this.audio.muted;
        const btn = document.getElementById('headerVolBtn');
        const icon = document.getElementById('headerVolIcon');
        if (btn) btn.classList.toggle('is-muted', this.audio.muted);
        if (icon) {
            icon.innerHTML = this.audio.muted
                ? '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" fill="currentColor"/>'
                : '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="currentColor"/>';
        }
    }

    collectPageTracks() {
        const tracks = [];

        // Треки из ленты постов
        document.querySelectorAll('.post-music-card').forEach(card => {
            const url = card.getAttribute('data-music-url');
            const title = card.getAttribute('data-music-title') || 'Аудиозапись';
            const artist = card.getAttribute('data-music-artist') || 'Исполнитель';
            if (url && !tracks.some(t => t.url === url)) {
                tracks.push({ url, title, artist, elementId: card.id, source: 'post' });
            }
        });

        // Трек из открытого профиля
        const profileCard = document.getElementById('heroMusicCard');
        if (profileCard) {
            const url = profileCard.getAttribute('data-music-url');
            const title = profileCard.getAttribute('data-music-title') || 'Музыка профиля';
            const artist = profileCard.getAttribute('data-music-artist') || 'Профиль';
            if (url && !tracks.some(t => t.url === url)) {
                tracks.unshift({ url, title, artist, elementId: 'heroMusicCard', source: 'profile' });
            }
        }

        // Треки из сообщений чата
        document.querySelectorAll('.chat-audio-card').forEach(card => {
            const url = card.getAttribute('data-audio-url');
            const title = card.getAttribute('data-audio-title') || 'Аудиосообщение';
            const artist = card.getAttribute('data-audio-artist') || 'Чат';
            if (url && !tracks.some(t => t.url === url)) {
                tracks.push({ url, title, artist, source: 'chat' });
            }
        });

        this.playlist = tracks;
    }

    playTrack(trackData, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        if (!trackData || !trackData.url) return;

        // Если кликнули на уже загруженный трек: переключаем play/pause
        if (this.currentTrack && this.currentTrack.url === trackData.url) {
            this.togglePlay();
            return;
        }

        this.collectPageTracks();
        let existingIdx = this.playlist.findIndex(t => t.url === trackData.url);
        if (existingIdx === -1) {
            this.playlist.push(trackData);
            this.currentIndex = this.playlist.length - 1;
        } else {
            this.currentIndex = existingIdx;
        }

        this.currentTrack = trackData;
        this.audio.src = trackData.url;
        this.audio.currentTime = 0;
        
        // Показываем плеер в верхней панели, когда пользователь запустил музыку
        const playerHeader = document.getElementById('headerMusicPlayer');
        const topBar = document.querySelector('.top-sensor-bar');
        const searchInput = document.getElementById('searchInput');
        if (playerHeader) {
            playerHeader.style.display = 'flex';
            playerHeader.classList.add('is-active');
        }
        if (topBar) {
            topBar.classList.add('player-active');
        }
        if (searchInput) {
            searchInput.placeholder = 'Поиск...';
        }

        const playPromise = this.audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(err => {
                console.warn('Autoplay prevented or audio load failed:', err);
            });
        }

        this.updateHeaderTrackInfo(trackData);
        this.updateUIState();
    }

    closePlayer(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        this.audio.pause();
        this.audio.currentTime = 0;
        this.isPlaying = false;
        this.currentTrack = null;
        const playerHeader = document.getElementById('headerMusicPlayer');
        const topBar = document.querySelector('.top-sensor-bar');
        const searchInput = document.getElementById('searchInput');
        if (playerHeader) {
            playerHeader.style.display = 'none';
            playerHeader.classList.remove('is-active', 'is-playing');
        }
        if (topBar) {
            topBar.classList.remove('player-active');
        }
        if (searchInput) {
            searchInput.placeholder = 'Поиск записей, каналов, авторов, #тегов...';
        }
        const vinyl = document.getElementById('headerMusicVinyl');
        if (vinyl) {
            vinyl.style.animationPlayState = 'paused';
        }
        this.updateUIState();
    }

    togglePlay() {
        if (!this.currentTrack) {
            this.collectPageTracks();
            if (this.playlist.length > 0) {
                this.playTrack(this.playlist[0]);
            }
            return;
        }

        if (this.audio.paused) {
            this.audio.play().catch(e => console.warn(e));
        } else {
            this.audio.pause();
        }
    }

    nextTrack() {
        this.collectPageTracks();
        if (this.playlist.length === 0) return;
        this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
        const next = this.playlist[this.currentIndex];
        this.playTrack(next);
        showToast(`Следующий трек: ${next.title}`, 'info');
    }

    prevTrack() {
        if (this.audio.currentTime > 3.0) {
            this.audio.currentTime = 0;
            return;
        }
        this.collectPageTracks();
        if (this.playlist.length === 0) return;
        this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
        const prev = this.playlist[this.currentIndex];
        this.playTrack(prev);
        showToast(`Предыдущий трек: ${prev.title}`, 'info');
    }

    handleProgressClick(event) {
        const container = document.getElementById('headerMusicProgressContainer');
        if (!container || !this.audio.duration) return;
        const rect = container.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, clickX / rect.width));
        this.audio.currentTime = ratio * this.audio.duration;
    }

    updateHeaderTrackInfo(track) {
        const titleEl = document.getElementById('headerMusicTitle');
        const artistEl = document.getElementById('headerMusicArtist');
        const curTimeEl = document.getElementById('headerMusicCurrentTime');
        const durTimeEl = document.getElementById('headerMusicDuration');
        const titleText = track.title || 'Аудиозапись';
        const artistText = track.artist || 'GoSocial Player';

        if (titleEl) {
            titleEl.textContent = titleText;
            titleEl.title = `${titleText} — ${artistText}`;
        }
        if (artistEl) {
            artistEl.textContent = artistText;
            artistEl.title = artistText;
        }
        if (curTimeEl) curTimeEl.textContent = '0:00';
        if (durTimeEl) durTimeEl.textContent = '0:00';
    }

    updateUIState() {
        const playerHeader = document.getElementById('headerMusicPlayer');
        const topBar = document.querySelector('.top-sensor-bar');
        const playIcon = document.getElementById('headerPlayIcon');

        if (playerHeader) {
            playerHeader.classList.toggle('is-playing', this.isPlaying);
            if (this.currentTrack) {
                playerHeader.style.display = 'flex';
                playerHeader.classList.add('is-active');
                if (topBar) topBar.classList.add('player-active');
            } else {
                playerHeader.style.display = 'none';
                playerHeader.classList.remove('is-active');
                if (topBar) topBar.classList.remove('player-active');
            }
        }
        if (playIcon) {
            playIcon.innerHTML = this.isPlaying ? HEADER_PAUSE_SVG : HEADER_PLAY_SVG;
        }
        const vinyl = document.getElementById('headerMusicVinyl');
        if (vinyl) {
            vinyl.style.animationPlayState = this.isPlaying ? 'running' : 'paused';
        }

        // Синхронизация кнопки в профиле
        const heroPlayIcon = document.getElementById('heroProfilePlayIcon');
        const heroCard = document.getElementById('heroMusicCard');
        if (heroPlayIcon && heroCard) {
            const heroUrl = heroCard.getAttribute('data-music-url');
            const isThisPlaying = (this.isPlaying && this.currentTrack && this.currentTrack.url === heroUrl);
            heroPlayIcon.textContent = isThisPlaying ? '⏸️' : '▶️';
            heroCard.classList.toggle('is-active-playing', isThisPlaying);
        }

        // Синхронизация постов
        document.querySelectorAll('.post-music-card').forEach(card => {
            const url = card.getAttribute('data-music-url');
            const isThisPlaying = (this.isPlaying && this.currentTrack && this.currentTrack.url === url);
            const icon = card.querySelector('.music-play-icon');
            if (icon) icon.textContent = isThisPlaying ? '⏸️' : '▶️';
            card.classList.toggle('is-active-playing', isThisPlaying);
        });

        // Синхронизация чата
        document.querySelectorAll('.chat-audio-card').forEach(card => {
            const url = card.getAttribute('data-audio-url');
            const isThisPlaying = (this.isPlaying && this.currentTrack && this.currentTrack.url === url);
            const icon = card.querySelector('.chat-audio-icon');
            if (icon) icon.textContent = isThisPlaying ? '⏸️' : '▶️';
            card.classList.toggle('is-active-playing', isThisPlaying);
        });
    }
}

window.musicPlayer = new GlobalMusicPlayer();
document.addEventListener('DOMContentLoaded', () => {
    window.musicPlayer.init();
});

// ==========================================
// COMPOSER MUSIC LOGIC
// ==========================================
function toggleComposerMusicBox() {
    const box = document.getElementById('composerMusicBox');
    if (!box) return;
    const isHidden = (box.style.display === 'none' || !box.style.display);
    box.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
        expandComposer();
    }
}

async function handleComposerAudioUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    showToast('Загрузка аудиофайла на сервер...', 'info');
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Ошибка загрузки аудио');
        }
        const data = await res.json();
        const cleanName = (data.filename || file.name).replace(/\.[^/.]+$/, '').replace(/^[\d_]+/, '');
        setComposerMusicPreset(data.url, cleanName, window.CURRENT_USER_DISPLAY_NAME || 'Автор');
        showToast('Аудиофайл успешно прикреплен! 🎵', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        e.target.value = '';
    }
}

function setComposerMusicPreset(url, title, artist) {
    currentComposerAudioUrl = url;
    currentComposerAudioTitle = title;
    currentComposerAudioArtist = artist;

    const urlInput = document.getElementById('composerMusicUrl');
    const titleInput = document.getElementById('composerMusicTitle');
    const artistInput = document.getElementById('composerMusicArtist');
    if (urlInput) urlInput.value = url;
    if (titleInput) titleInput.value = title;
    if (artistInput) artistInput.value = artist;

    const preview = document.getElementById('composerMusicPreview');
    const pTitle = document.getElementById('composerPreviewTitle');
    const pArtist = document.getElementById('composerPreviewArtist');
    if (pTitle) pTitle.textContent = title;
    if (pArtist) pArtist.textContent = artist;
    if (preview) preview.style.display = 'block';

    const box = document.getElementById('composerMusicBox');
    if (box) box.style.display = 'none';
}

function updateComposerMusicState() {
    const url = document.getElementById('composerMusicUrl')?.value.trim();
    const title = document.getElementById('composerMusicTitle')?.value.trim() || 'Аудиозапись';
    const artist = document.getElementById('composerMusicArtist')?.value.trim() || 'Исполнитель';

    if (url) {
        setComposerMusicPreset(url, title, artist);
    } else {
        clearComposerMusic();
    }
}

function clearComposerMusic() {
    currentComposerAudioUrl = '';
    currentComposerAudioTitle = '';
    currentComposerAudioArtist = '';

    const urlInput = document.getElementById('composerMusicUrl');
    const titleInput = document.getElementById('composerMusicTitle');
    const artistInput = document.getElementById('composerMusicArtist');
    if (urlInput) urlInput.value = '';
    if (titleInput) titleInput.value = '';
    if (artistInput) artistInput.value = '';

    const preview = document.getElementById('composerMusicPreview');
    if (preview) preview.style.display = 'none';
}

function previewComposerAudio(e) {
    if (e) e.stopPropagation();
    if (!currentComposerAudioUrl) return;
    window.musicPlayer.playTrack({
        url: currentComposerAudioUrl,
        title: currentComposerAudioTitle || 'Аудиозапись',
        artist: currentComposerAudioArtist || 'Предпросмотр',
        source: 'composer'
    });
}

// ==========================================
// PROFILE MUSIC LOGIC
// ==========================================
async function handleProfileMusicUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    showToast('Загрузка музыки профиля...', 'info');
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Ошибка загрузки аудио');
        }
        const data = await res.json();
        const cleanName = (data.filename || file.name).replace(/\.[^/.]+$/, '').replace(/^[\d_]+/, '');
        setProfileMusicPreset(data.url, cleanName, window.CURRENT_USER_DISPLAY_NAME || 'Профиль');
        showToast('Музыка профиля прикреплена! 🎵', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        e.target.value = '';
    }
}

function setProfileMusicPreset(url, title, artist) {
    const urlInput = document.getElementById('editMusicUrl');
    const titleInput = document.getElementById('editMusicTitle');
    const artistInput = document.getElementById('editMusicArtist');
    if (urlInput) urlInput.value = url;
    if (titleInput) titleInput.value = title;
    if (artistInput) artistInput.value = artist;
    updateModalMusicPreviewState();
}

function clearProfileMusicPreset() {
    const urlInput = document.getElementById('editMusicUrl');
    const titleInput = document.getElementById('editMusicTitle');
    const artistInput = document.getElementById('editMusicArtist');
    if (urlInput) urlInput.value = '';
    if (titleInput) titleInput.value = '';
    if (artistInput) artistInput.value = '';
    updateModalMusicPreviewState();
}

function updateModalMusicPreviewState() {
    const url = document.getElementById('editMusicUrl')?.value.trim();
    const title = document.getElementById('editMusicTitle')?.value.trim() || 'Аудиозапись';
    const artist = document.getElementById('editMusicArtist')?.value.trim() || 'Исполнитель';
    const wrap = document.getElementById('modalMusicPreviewWrap');
    const pTitle = document.getElementById('modalPreviewTitle');
    const pArtist = document.getElementById('modalPreviewArtist');

    if (url && wrap) {
        wrap.style.display = 'block';
        if (pTitle) pTitle.textContent = title;
        if (pArtist) pArtist.textContent = artist;
    } else if (wrap) {
        wrap.style.display = 'none';
    }
}

function previewModalAudio(e) {
    if (e) e.stopPropagation();
    const url = document.getElementById('editMusicUrl')?.value.trim();
    const title = document.getElementById('editMusicTitle')?.value.trim() || 'Музыка профиля';
    const artist = document.getElementById('editMusicArtist')?.value.trim() || 'Предпросмотр';
    if (!url) return;
    window.musicPlayer.playTrack({ url, title, artist, source: 'modal' });
}

function toggleHeroProfileMusic(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const card = document.getElementById('heroMusicCard');
    if (!card) return;
    const url = card.getAttribute('data-music-url');
    const title = card.getAttribute('data-music-title') || 'Трек профиля';
    const artist = card.getAttribute('data-music-artist') || 'Профиль';
    if (!url) return;
    window.musicPlayer.playTrack({ url, title, artist, elementId: 'heroMusicCard', source: 'profile' });
}

// ==========================================
// CHAT AUDIO MESSAGES LOGIC
// ==========================================
function toggleChatMusicDrawer() {
    const drawer = document.getElementById('chatMusicDrawer');
    if (!drawer) return;
    const isHidden = (drawer.style.display === 'none' || !drawer.style.display);
    drawer.style.display = isHidden ? 'flex' : 'none';
}

async function handleChatAudioUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    showToast('Загрузка аудио в чат...', 'info');
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Ошибка загрузки аудио');
        }
        const data = await res.json();
        const cleanName = (data.filename || file.name).replace(/\.[^/.]+$/, '').replace(/^[\d_]+/, '');
        attachChatMusicPreset(data.url, cleanName, window.CURRENT_USER_DISPLAY_NAME || 'Вы');
        showToast('Аудио прикреплено к сообщению! 🎵', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        e.target.value = '';
    }
}

function attachChatMusicPreset(url, title, artist) {
    pendingChatAudio = { url, title, artist };
    const preview = document.getElementById('chatAudioPreview');
    const pTitle = document.getElementById('chatAudioPreviewTitle');
    const pArtist = document.getElementById('chatAudioPreviewArtist');
    if (pTitle) pTitle.textContent = title;
    if (pArtist) pArtist.textContent = artist;
    if (preview) preview.style.display = 'block';

    const drawer = document.getElementById('chatMusicDrawer');
    if (drawer) drawer.style.display = 'none';

    const input = document.getElementById('chatMessageInput');
    if (input) input.focus();
}

function clearChatAudioAttachment() {
    pendingChatAudio = null;
    const preview = document.getElementById('chatAudioPreview');
    if (preview) preview.style.display = 'none';
}

function previewChatAudio(e) {
    if (e) e.stopPropagation();
    if (!pendingChatAudio) return;
    window.musicPlayer.playTrack({
        url: pendingChatAudio.url,
        title: pendingChatAudio.title || 'Аудиосообщение',
        artist: pendingChatAudio.artist || 'Чат',
        source: 'chat-preview'
    });
}


// ==========================================
// 3-DOTS MENU & ACTIONS FOR POST MUSIC CARD
// ==========================================
function togglePostMusicMenu(event, postId) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    let menu = null;
    if (event) {
        const target = event.currentTarget || event.target;
        const wrap = target ? target.closest('.post-music-actions-wrap') : null;
        if (wrap) {
            menu = wrap.querySelector('.post-music-dropdown');
        }
    }
    if (!menu) {
        const allMenus = document.querySelectorAll(`[id="postMusicMenu-${postId}"]`);
        for (const m of allMenus) {
            const vp = m.closest('.view-panel');
            if (!vp || vp.style.display !== 'none') {
                menu = m;
                break;
            }
        }
        if (!menu && allMenus.length > 0) menu = allMenus[0];
    }
    if (!menu) return;
    const isShown = (menu.style.display === 'block');
    closeAllMusicMenus();
    if (!isShown) {
        menu.style.display = 'block';
    }
}

function closeAllMusicMenus() {
    document.querySelectorAll('.post-music-dropdown').forEach(m => {
        m.style.display = 'none';
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.post-music-actions-wrap')) {
        closeAllMusicMenus();
    }
});

function downloadAudioTrack(url, title, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    closeAllMusicMenus();

    if (!url) {
        showToast('Ссылка на аудиофайл недоступна', 'error');
        return;
    }

    showToast(`Загрузка аудио: ${title || 'файл'}... 📥`, 'info');

    let ext = '.mp3';
    const match = url.match(/\.(mp3|wav|ogg|m4a|flac|aac|webm)($|\?)/i);
    if (match) ext = '.' + match[1];

    let safeName = (title || 'audio_track').replace(/[\/\\:*?"<>|]/g, '_');
    if (!safeName.toLowerCase().endsWith(ext)) {
        safeName += ext;
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

let pendingShareAudio = null;

async function openShareAudioModal(url, title, artist, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    closeAllMusicMenus();

    pendingShareAudio = {
        url,
        title: title || 'Аудиозапись',
        artist: artist || ''
    };

    const modal = document.getElementById('shareAudioModal');
    if (!modal) return;

    const trackPreview = document.getElementById('shareAudioTrackName');
    if (trackPreview) {
        trackPreview.textContent = `${title || 'Аудиозапись'} ${artist ? '• ' + artist : ''}`;
    }

    const listContainer = document.getElementById('shareAudioConversationsList');
    if (listContainer) {
        listContainer.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--text-dim);">Загрузка ваших диалогов...</div>';
    }

    modal.style.display = 'flex';

    try {
        const res = await fetch('/api/messages/conversations');
        if (!res.ok) throw new Error('Не удалось загрузить список диалогов');
        const convs = await res.json();
        renderShareAudioConversations(convs);
    } catch (err) {
        if (listContainer) {
            listContainer.innerHTML = `<div style="padding: 1rem; color: #f43f5e; text-align: center;">${err.message}</div>`;
        }
    }
}

function closeShareAudioModal() {
    const modal = document.getElementById('shareAudioModal');
    if (modal) modal.style.display = 'none';
    pendingShareAudio = null;
}

function renderShareAudioConversations(convs) {
    const listContainer = document.getElementById('shareAudioConversationsList');
    if (!listContainer) return;

    if (!convs || convs.length === 0) {
        listContainer.innerHTML = `
            <div style="padding: 1.5rem; text-align: center; color: var(--text-dim); font-size: 0.88rem;">
                У вас пока нет активных диалогов.<br>Начните переписку на странице профиля любого пользователя!
            </div>
        `;
        return;
    }

    listContainer.innerHTML = convs.map(c => `
        <div class="share-conversation-item" onclick="sendSharedAudioToUser(${c.user.id}, '${escapeHtml(c.user.display_name)}')">
            <div style="display: flex; align-items: center; gap: 10px;">
                <img src="${escapeHtml(c.user.avatar_url || '/static/avatars/default.svg')}" class="share-conv-avatar" alt="avatar">
                <div>
                    <strong style="color: #fff; font-size: 0.88rem; display: block;">${escapeHtml(c.user.display_name)}</strong>
                    <span style="color: rgba(255,255,255,0.5); font-size: 0.75rem;">@${escapeHtml(c.user.username)}</span>
                </div>
            </div>
            <button type="button" class="btn btn-primary btn-xs">Отправить 💬</button>
        </div>
    `).join('');
}

async function sendSharedAudioToUser(partnerId, partnerName) {
    if (!pendingShareAudio) return;

    try {
        const res = await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                receiver_id: partnerId,
                content: '',
                audio_url: pendingShareAudio.url,
                audio_title: pendingShareAudio.title,
                audio_artist: pendingShareAudio.artist
            })
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Ошибка при отправке');
        }

        showToast(`Аудиозапись отправлена пользователю ${partnerName}! 💬`, 'success');
        closeShareAudioModal();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function copyAudioLink() {
    if (!pendingShareAudio || !pendingShareAudio.url) return;
    const fullUrl = pendingShareAudio.url.startsWith('http') ? pendingShareAudio.url : (window.location.origin + pendingShareAudio.url);
    navigator.clipboard.writeText(fullUrl).then(() => {
        showToast('Ссылка на трек скопирована в буфер обмена! 🔗', 'success');
    }).catch(() => {
        showToast('Не удалось скопировать ссылку', 'error');
    });
}

// ==========================================
// MULTI-TRACK PROFILE MUSIC & PLAYLIST MODAL
// ==========================================
let currentViewedUserMusic = [];
let currentViewedProfileUser = null;

async function loadUserProfileMusic(userId, user) {
    currentViewedProfileUser = user;
    const musicWrap = document.getElementById('heroMusicPlayerWrap');
    if (!musicWrap) return;

    // Сразу показываем текущую музыку пользователя если есть, чтобы не моргало
    if (user && user.music_url) {
        musicWrap.style.display = 'block';
        const mTitle = document.getElementById('heroMusicTitle');
        const mArtist = document.getElementById('heroMusicArtist');
        const mCard = document.getElementById('heroMusicCard');
        if (mTitle) mTitle.textContent = user.music_title || 'Аудиозапись';
        if (mArtist) mArtist.textContent = user.music_artist || (user ? user.display_name : '');
        if (mCard) {
            mCard.setAttribute('data-music-url', user.music_url);
            mCard.setAttribute('data-music-title', user.music_title || 'Аудиозапись');
            mCard.setAttribute('data-music-artist', user.music_artist || (user ? user.display_name : ''));
        }
    }

    try {
        const res = await fetch(`/api/users/${userId}/music`);
        let tracks = [];
        if (res.ok) {
            tracks = await res.json();
        }

        // Если в таблице user_music еще нет записей, но у пользователя есть music_url
        if ((!tracks || tracks.length === 0) && user && user.music_url) {
            tracks = [{
                id: 0,
                user_id: user.id,
                url: user.music_url,
                title: user.music_title || 'Аудиозапись',
                artist: user.music_artist || user.display_name
            }];
        }

        currentViewedUserMusic = tracks || [];

        if (currentViewedUserMusic.length > 0) {
            // Самый последний добавленный трек является лицевым (tracks[0])
            const frontTrack = currentViewedUserMusic[0];
            musicWrap.style.display = 'block';

            const mTitle = document.getElementById('heroMusicTitle');
            const mArtist = document.getElementById('heroMusicArtist');
            const mCard = document.getElementById('heroMusicCard');
            const mCount = document.getElementById('heroMusicCountBadge');

            if (mTitle) mTitle.textContent = frontTrack.title || 'Аудиозапись';
            if (mArtist) mArtist.textContent = frontTrack.artist || (user ? user.display_name : '');
            if (mCard) {
                mCard.setAttribute('data-music-url', frontTrack.url);
                mCard.setAttribute('data-music-title', frontTrack.title || 'Аудиозапись');
                mCard.setAttribute('data-music-artist', frontTrack.artist || (user ? user.display_name : ''));
            }
            if (mCount) {
                const count = currentViewedUserMusic.length;
                mCount.textContent = `🎵 ${count} ${count === 1 ? 'трек' : (count < 5 ? 'трека' : 'треков')}`;
            }
        } else {
            musicWrap.style.display = 'none';
        }
    } catch (err) {
        console.warn('Error loading user music:', err);
    }
}

async function openProfileMusicModal(event) {
    if (event) {
        if (event.target.closest('#heroProfilePlayBtn')) return;
        event.preventDefault();
        event.stopPropagation();
    }

    const modal = document.getElementById('profileMusicListModal');
    if (!modal) return;

    const user = currentProfileUserData || currentViewedProfileUser;
    const isOwner = window.IS_AUTHENTICATED && user && (window.CURRENT_USER_ID === user.id);

    const titleEl = document.getElementById('profileMusicModalTitle');
    const subtextEl = document.getElementById('profileMusicModalSubtext');
    const addBox = document.getElementById('profileMusicOwnerAddBox');

    if (titleEl) titleEl.textContent = `Музыка профиля @${user ? user.username : ''}`;
    if (addBox) {
        addBox.style.display = isOwner ? 'block' : 'none';
    }

    if (user && (!currentViewedUserMusic || currentViewedUserMusic.length === 0)) {
        try {
            const res = await fetch(`/api/users/${user.id}/music`);
            if (res.ok) {
                currentViewedUserMusic = await res.json();
            }
        } catch (e) {}
    }

    if (subtextEl) {
        const count = currentViewedUserMusic ? currentViewedUserMusic.length : 0;
        subtextEl.textContent = `Всего треков: ${count}. Самый последний трек является лицевым на странице профиля.`;
    }

    renderProfileMusicList(currentViewedUserMusic, isOwner);
    modal.style.display = 'flex';
}

function closeProfileMusicModal() {
    const modal = document.getElementById('profileMusicListModal');
    if (modal) modal.style.display = 'none';
}

function renderProfileMusicList(tracks, isOwner) {
    const container = document.getElementById('profileMusicListContainer');
    if (!container) return;

    if (!tracks || tracks.length === 0) {
        container.innerHTML = `
            <div style="padding: 2.5rem; text-align: center; color: var(--text-dim); font-size: 0.9rem;">
                В профиле пока нет добавленных музыкальных треков.
                ${isOwner ? '<br><span style="color: #00f0ff; margin-top: 8px; display: inline-block;">Добавьте свой первый трек кнопкой выше! 🎵</span>' : ''}
            </div>
        `;
        return;
    }

    container.innerHTML = tracks.map((track, idx) => {
        const isFront = (idx === 0);
        return `
            <div class="profile-music-item ${isFront ? 'is-front-track' : ''} ${isOwner ? 'is-draggable' : ''}" 
                 data-music-id="${track.id}" 
                 data-music-url="${escapeHtml(track.url)}" 
                 data-music-title="${escapeHtml(track.title)}" 
                 data-music-artist="${escapeHtml(track.artist || '')}" 
                 ${isOwner ? 'draggable="true"' : ''}>
                ${isOwner ? `
                <div class="profile-item-drag-handle" title="Зажмите и перетащите, чтобы изменить порядок треков (первый станет лицевым)">
                    ⠿
                </div>` : ''}
                <button type="button" class="profile-item-play-btn" onclick="window.musicPlayer.playTrack({url: '${escapeHtml(track.url)}', title: '${escapeHtml(track.title)}', artist: '${escapeHtml(track.artist)}', source: 'profile-modal'}, event)" title="Воспроизвести">
                    <span>▶️</span>
                </button>
                <div class="profile-item-info">
                    <div class="profile-item-title-row">
                        <strong class="profile-item-title">${escapeHtml(track.title)}</strong>
                        <span class="chip-front-track" style="${isFront ? '' : 'display: none;'}">⭐ Лицевой</span>
                    </div>
                    <span class="profile-item-artist">${escapeHtml(track.artist || 'Аудиозапись')}</span>
                </div>
                <div class="profile-item-actions">
                    <button type="button" class="profile-item-dl-btn" onclick="downloadAudioTrack('${escapeHtml(track.url)}', '${escapeHtml(track.title)}', event)" title="Скачать файл">
                        📥
                    </button>
                    ${isOwner ? `
                    <button type="button" class="profile-item-del-btn" onclick="handleDeleteProfileMusic(${track.id}, event)" title="Удалить из профиля">
                        ✕
                    </button>` : ''}
                </div>
            </div>
        `;
    }).join('');

    if (isOwner) {
        initProfileMusicDragAndDrop(container);
    }
}

let draggedMusicItem = null;

function initProfileMusicDragAndDrop(container) {
    const items = container.querySelectorAll('.profile-music-item.is-draggable');
    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedMusicItem = item;
            item.classList.add('is-dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.dataset.musicId);
        });

        item.addEventListener('dragend', () => {
            draggedMusicItem = null;
            item.classList.remove('is-dragging');
            container.querySelectorAll('.profile-music-item').forEach(el => el.classList.remove('drag-over'));
            updateProfileMusicOrderAfterDrag(container);
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (!draggedMusicItem || draggedMusicItem === item) return;

            const rect = item.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            if (e.clientY < midpoint) {
                container.insertBefore(draggedMusicItem, item);
            } else {
                container.insertBefore(draggedMusicItem, item.nextSibling);
            }
        });

        item.addEventListener('dragenter', (e) => {
            e.preventDefault();
            if (draggedMusicItem && draggedMusicItem !== item) {
                item.classList.add('drag-over');
            }
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');
        });
    });
}

async function updateProfileMusicOrderAfterDrag(container) {
    const allItems = Array.from(container.querySelectorAll('.profile-music-item'));
    if (allItems.length === 0) return;

    // Обновляем визуальный бейдж лицевого трека на первом элементе
    allItems.forEach((el, idx) => {
        const isFront = (idx === 0);
        el.classList.toggle('is-front-track', isFront);
        const badge = el.querySelector('.chip-front-track');
        if (badge) badge.style.display = isFront ? 'inline-block' : 'none';
    });

    const trackIDs = allItems.map(el => parseInt(el.dataset.musicId)).filter(id => !isNaN(id) && id > 0);
    if (trackIDs.length === 0) return;

    // Мгновенно обновляем лицевой трек на странице профиля в hero-карточке
    const frontEl = allItems[0];
    const frontUrl = frontEl.dataset.musicUrl;
    const frontTitle = frontEl.dataset.musicTitle;
    const frontArtist = frontEl.dataset.musicArtist;

    const mTitle = document.getElementById('heroMusicTitle');
    const mArtist = document.getElementById('heroMusicArtist');
    const mCard = document.getElementById('heroMusicCard');
    if (mTitle) mTitle.textContent = frontTitle || 'Аудиозапись';
    if (mArtist) mArtist.textContent = frontArtist || '';
    if (mCard) {
        mCard.setAttribute('data-music-url', frontUrl);
        mCard.setAttribute('data-music-title', frontTitle || 'Аудиозапись');
        mCard.setAttribute('data-music-artist', frontArtist || '');
    }

    try {
        const res = await fetch('/api/users/music/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ track_ids: trackIDs })
        });
        if (res.ok) {
            const data = await res.json();
            currentViewedUserMusic = data.playlist || [];
            showToast(`Порядок обновлен! Лицевой трек: ${frontTitle} ⭐`, 'success');
        }
    } catch (err) {
        console.error('Error reordering music:', err);
    }
}

async function handleQuickUploadMusicToProfile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    showToast('Загрузка аудио в профиль... 🎵', 'info');
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        if (!res.ok) throw new Error('Ошибка загрузки файла');
        const data = await res.json();

        const cleanTitle = (data.filename || file.name).replace(/\.[^/.]+$/, '').replace(/^[\d_]+/, '');
        const artist = (currentProfileUserData && currentProfileUserData.display_name) || window.CURRENT_USER_DISPLAY_NAME || '';

        // Добавляем трек в профиль
        const addRes = await fetch('/api/users/music', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: data.url,
                title: cleanTitle || 'Аудиозапись',
                artist: artist
            })
        });

        if (!addRes.ok) {
            const errData = await addRes.json();
            throw new Error(errData.error || 'Ошибка добавления трека в профиль');
        }

        const addData = await addRes.json();
        currentViewedUserMusic = addData.playlist || [];

        renderProfileMusicList(currentViewedUserMusic, true);
        const user = currentProfileUserData || currentViewedProfileUser;
        if (user && user.id) {
            loadUserProfileMusic(user.id, user);
        }

        showToast('Новый лицевой трек успешно добавлен в профиль! ⭐🎵', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        e.target.value = '';
    }
}

async function handleDeleteProfileMusic(musicId, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!confirm('Удалить этот трек из профиля?')) return;

    try {
        const res = await fetch(`/api/users/music/${musicId}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Ошибка удаления трека');
        const data = await res.json();
        currentViewedUserMusic = data.playlist || [];
        renderProfileMusicList(currentViewedUserMusic, true);

        const user = currentProfileUserData || currentViewedProfileUser;
        if (user && user.id) {
            loadUserProfileMusic(user.id, user);
        }
        showToast('Трек удален из профиля', 'info');
    } catch (err) {
        showToast(err.message, 'error');
    }
}


// =========================================================
// CHANNELS & POLLS SYSTEM CLIENT SUITE
// =========================================================

// --- POLLS LOGIC ---
function pluralizeVotes(n) {
    n = Math.abs(n) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return 'голосов';
    if (n1 > 1 && n1 < 5) return 'голоса';
    if (n1 === 1) return 'голос';
    return 'голосов';
}

function renderPollWidget(poll) {
    if (!poll) return '';
    const totalVotes = poll.total_votes || 0;
    const isMultiple = !!poll.is_multiple;
    const isAnonymous = !!poll.is_anonymous;

    let optionsHtml = (poll.options || []).map(opt => {
        const percent = Math.round(opt.percentage || 0);
        const isSelected = !!opt.is_voted;
        const selectedClass = isSelected ? ' selected' : '';

        // Высокотехнологичные SVG индикаторы вместо архаичных unicode символов
        const radioSvg = isSelected 
            ? `<span class="poll-custom-indicator poll-radio active" aria-hidden="true"><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8.5" fill="none" stroke="#00f0ff" stroke-width="2.2"/><circle cx="10" cy="10" r="4.5" fill="#00f0ff"/></svg></span>`
            : `<span class="poll-custom-indicator poll-radio" aria-hidden="true"><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8.5" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2"/></svg></span>`;

        const checkSvg = isSelected
            ? `<span class="poll-custom-indicator poll-checkbox active" aria-hidden="true"><svg viewBox="0 0 20 20"><rect x="1.5" y="1.5" width="17" height="17" rx="4.5" fill="rgba(0, 240, 255, 0.22)" stroke="#00f0ff" stroke-width="2.2"/><path d="M5 10l3.5 3.5L15 6.5" fill="none" stroke="#00f0ff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`
            : `<span class="poll-custom-indicator poll-checkbox" aria-hidden="true"><svg viewBox="0 0 20 20"><rect x="1.5" y="1.5" width="17" height="17" rx="4.5" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2"/></svg></span>`;

        const indicator = isMultiple ? checkSvg : radioSvg;

        return `
            <div class="poll-option-row${selectedClass}" 
                 onclick="voteInPoll(${poll.id}, ${opt.id}, event)" 
                 title="${isSelected ? 'Вы проголосовали за этот вариант (нажмите для отмены)' : 'Нажмите, чтобы проголосовать'}"
                 data-poll-id="${poll.id}" 
                 data-option-id="${opt.id}">
                <div class="poll-bar-fill" style="width: ${percent}%;"></div>
                <div class="poll-option-inner">
                    <div class="poll-option-left">
                        ${indicator}
                        <span class="poll-option-text">${escapeHtml(opt.text)}</span>
                    </div>
                    <div class="poll-option-meta">
                        ${isSelected ? '<span class="poll-selected-pill">✓ ВЫБРАНО</span>' : ''}
                        <span class="poll-option-percent">${percent}%</span>
                        <span class="poll-option-count">(${opt.votes_count || 0})</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    const canEdit = (window.CURRENT_USER_ID && poll.creator_id === window.CURRENT_USER_ID);
    const editBtn = canEdit 
        ? `<button type="button" class="poll-edit-btn" onclick="openEditPollModal(${poll.id}, event)" title="Редактировать опрос">✏️ Редактировать</button>` 
        : '';

    return `
        <div class="poll-card" id="poll-card-${poll.id}" data-poll-id="${poll.id}">
            <div class="poll-header">
                <span class="poll-type-badge">📊 ОПРОС</span>
                ${isMultiple ? '<span class="poll-type-subbadge">⚡ Несколько вариантов</span>' : '<span class="poll-type-subbadge-single">🎯 Один вариант</span>'}
                ${isAnonymous ? '<span class="poll-type-subbadge-anon">🔒 Анонимно</span>' : ''}
                <span class="poll-total-votes" id="poll-total-${poll.id}">👥 ${totalVotes} ${pluralizeVotes(totalVotes)}</span>
                ${editBtn}
            </div>
            <div class="poll-question-wrap">
                <div class="poll-question-accent"></div>
                <div class="poll-question">${escapeHtml(poll.question)}</div>
            </div>
            <div class="poll-options-list">
                ${optionsHtml}
            </div>
        </div>
    `;
}

async function voteInPoll(pollId, optionId, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите, чтобы участвовать в голосовании', 'warning');
        openAuthModal('login');
        return;
    }
    try {
        const res = await fetch('/api/polls/vote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ poll_id: pollId, option_id: optionId })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Ошибка при голосовании');
        }
        const updatedPoll = await res.json();
        updatePollDOM(updatedPoll);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function updatePollDOM(poll) {
    if (!poll) return;
    const cards = document.querySelectorAll(`.poll-card[data-poll-id="${poll.id}"]`);
    cards.forEach(card => {
        const temp = document.createElement('div');
        temp.innerHTML = renderPollWidget(poll);
        const newCard = temp.firstElementChild;
        if (newCard) {
            card.parentNode.replaceChild(newCard, card);
        }
    });
}

async function openEditPollModal(pollId, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const modal = document.getElementById('editPollModal');
    const idInput = document.getElementById('modalEditPollId');
    const qInput = document.getElementById('modalEditPollQuestion');
    const container = document.getElementById('modalEditPollOptionsContainer');
    if (!modal || !idInput || !qInput || !container) return;

    idInput.value = pollId;
    qInput.value = '';
    container.innerHTML = '<div class="chat-empty-hint">Загрузка опроса...</div>';
    modal.style.display = 'flex';

    try {
        const res = await fetch(`/api/polls/${pollId}`);
        if (!res.ok) throw new Error('Не удалось загрузить данные опроса');
        const poll = await res.json();
        qInput.value = poll.question || '';
        container.innerHTML = '';
        (poll.options || []).forEach(opt => {
            addModalEditPollOptionRow(opt.text || '');
        });
        if (!poll.options || poll.options.length < 2) {
            addModalEditPollOptionRow('');
            addModalEditPollOptionRow('');
        }
    } catch (err) {
        // Запасной вариант: извлекаем текущее состояние из карточки в DOM
        const card = document.getElementById(`poll-card-${pollId}`);
        if (card) {
            const qEl = card.querySelector('.poll-question');
            if (qEl) qInput.value = qEl.textContent.trim();
            container.innerHTML = '';
            card.querySelectorAll('.poll-option-text').forEach(tEl => {
                addModalEditPollOptionRow(tEl.textContent.trim());
            });
        } else {
            showToast(err.message, 'error');
        }
    }
}

function closeEditPollModal() {
    const modal = document.getElementById('editPollModal');
    if (modal) modal.style.display = 'none';
}

function addModalEditPollOptionRow(initialText = '') {
    const container = document.getElementById('modalEditPollOptionsContainer');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'modal-poll-option-row';
    row.style.cssText = 'display: flex; gap: 8px; align-items: center;';
    row.innerHTML = `
        <input type="text" class="form-control modal-poll-opt-input" placeholder="Вариант ответа..." value="${escapeHtml(initialText)}" style="flex: 1; padding: 8px 12px; border-radius: var(--radius-sm); background: rgba(0,0,0,0.5); border: 1px solid var(--border-subtle); color: var(--text-pure);">
        <button type="button" class="btn btn-outline btn-xs" onclick="this.closest('.modal-poll-option-row').remove()" title="Удалить вариант" style="color: #f43f5e; border-color: rgba(244,63,94,0.3); padding: 4px 8px;">✕</button>
    `;
    container.appendChild(row);
}

async function saveEditedPoll() {
    const idInput = document.getElementById('modalEditPollId');
    const qInput = document.getElementById('modalEditPollQuestion');
    const container = document.getElementById('modalEditPollOptionsContainer');
    const saveBtn = document.getElementById('btnSaveEditedPoll');
    if (!idInput || !idInput.value) return;

    const pollId = parseInt(idInput.value);
    const question = qInput ? qInput.value.trim() : '';
    if (!question) {
        showToast('Введите вопрос опроса', 'warning');
        return;
    }
    const optInputs = container.querySelectorAll('.modal-poll-opt-input');
    const options = [];
    optInputs.forEach(inp => {
        const val = inp.value.trim();
        if (val) options.push(val);
    });
    if (options.length < 2) {
        showToast('Опрос должен содержать минимум 2 варианта ответа', 'warning');
        return;
    }

    if (saveBtn) saveBtn.disabled = true;
    try {
        const res = await fetch(`/api/polls/${pollId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, options })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Ошибка при сохранении опроса');
        }
        const updatedPoll = await res.json();
        updatePollDOM(updatedPoll);
        closeEditPollModal();
        showToast('Опрос успешно обновлен! 📊', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function addPollOptionField(containerId, callback) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const count = container.querySelectorAll('.poll-opt-input').length + 1;
    if (count > 10) {
        showToast('Максимум 10 вариантов ответа', 'warning');
        return;
    }
    const row = document.createElement('div');
    row.className = 'poll-opt-input-row';
    row.innerHTML = `
        <input type="text" class="poll-opt-input" placeholder="Вариант ${count}">
        <button type="button" class="btn btn-secondary btn-xs" style="padding: 2px 8px;">✕</button>
    `;
    const btn = row.querySelector('button');
    btn.onclick = () => {
        row.remove();
        if (typeof callback === 'function') callback();
    };
    const input = row.querySelector('input');
    if (typeof callback === 'function') {
        input.oninput = callback;
    }
    container.appendChild(row);
    input.focus();
}

function collectPollData(qId, optsContainerId, isMultipleId, isAnonId) {
    const qEl = document.getElementById(qId);
    const question = qEl ? qEl.value.trim() : '';
    const container = document.getElementById(optsContainerId);
    if (!container) return null;
    const inputs = container.querySelectorAll('.poll-opt-input');
    const options = [];
    inputs.forEach(inp => {
        const val = inp.value.trim();
        if (val) options.push(val);
    });
    if (!question && options.length === 0) return null;
    const isMultiple = document.getElementById(isMultipleId)?.checked || false;
    const isAnonymous = document.getElementById(isAnonId)?.checked || false;
    return { question, options, is_multiple: isMultiple, is_anonymous: isAnonymous };
}

// Feed Composer Poll Controls
function toggleComposerPollBox() {
    const box = document.getElementById('composerPollBox');
    if (!box) return;
    const drawer = document.getElementById('composerDrawer');
    if (drawer && drawer.style.display === 'none') drawer.style.display = 'block';
    box.style.display = (box.style.display === 'none' ? 'block' : 'none');
}
function clearComposerPoll() {
    const qEl = document.getElementById('composerPollQuestion');
    if (qEl) qEl.value = '';
    const cEl = document.getElementById('composerPollOptionsInputs');
    if (cEl) {
        cEl.innerHTML = `
            <div class="poll-opt-input-row"><input type="text" class="poll-opt-input" placeholder="Вариант 1" oninput="updateComposerPollState()"></div>
            <div class="poll-opt-input-row"><input type="text" class="poll-opt-input" placeholder="Вариант 2" oninput="updateComposerPollState()"></div>
        `;
    }
    const multEl = document.getElementById('composerPollIsMultiple');
    if (multEl) multEl.checked = false;
    const anonEl = document.getElementById('composerPollIsAnonymous');
    if (anonEl) anonEl.checked = false;
    const prev = document.getElementById('composerPollPreview');
    if (prev) prev.style.display = 'none';
    const box = document.getElementById('composerPollBox');
    if (box) box.style.display = 'none';
}
function updateComposerPollState() {
    const data = collectPollData('composerPollQuestion', 'composerPollOptionsInputs', 'composerPollIsMultiple', 'composerPollIsAnonymous');
    const prev = document.getElementById('composerPollPreview');
    const qPrev = document.getElementById('composerPollPreviewQuestion');
    const oPrev = document.getElementById('composerPollPreviewOpts');
    if (!data || (!data.question && data.options.length === 0)) {
        if (prev) prev.style.display = 'none';
        return;
    }
    if (prev) prev.style.display = 'block';
    if (qPrev) qPrev.textContent = data.question || 'Новый опрос';
    if (oPrev) oPrev.textContent = `${data.options.length} варианта(-ов)`;
}

// Profile Composer Poll Controls
function toggleProfPollBox() {
    const box = document.getElementById('profPollBox');
    if (!box) return;
    box.style.display = (box.style.display === 'none' ? 'block' : 'none');
}
function clearProfComposerPoll() {
    const qEl = document.getElementById('profPollQuestion');
    if (qEl) qEl.value = '';
    const cEl = document.getElementById('profPollOptionsInputs');
    if (cEl) {
        cEl.innerHTML = `
            <div class="poll-opt-input-row"><input type="text" class="poll-opt-input" placeholder="Вариант 1" oninput="updateProfPollState()"></div>
            <div class="poll-opt-input-row"><input type="text" class="poll-opt-input" placeholder="Вариант 2" oninput="updateProfPollState()"></div>
        `;
    }
    const multEl = document.getElementById('profPollIsMultiple');
    if (multEl) multEl.checked = false;
    const anonEl = document.getElementById('profPollIsAnonymous');
    if (anonEl) anonEl.checked = false;
    const prev = document.getElementById('profPollPreview');
    if (prev) prev.style.display = 'none';
    const box = document.getElementById('profPollBox');
    if (box) box.style.display = 'none';
}
function updateProfPollState() {
    const data = collectPollData('profPollQuestion', 'profPollOptionsInputs', 'profPollIsMultiple', 'profPollIsAnonymous');
    const prev = document.getElementById('profPollPreview');
    const qPrev = document.getElementById('profPollPreviewQuestion');
    const oPrev = document.getElementById('profPollPreviewOpts');
    if (!data || (!data.question && data.options.length === 0)) {
        if (prev) prev.style.display = 'none';
        return;
    }
    if (prev) prev.style.display = 'block';
    if (qPrev) qPrev.textContent = data.question || 'Новый опрос';
    if (oPrev) oPrev.textContent = `${data.options.length} варианта(-ов)`;
}

// Chat Poll Modal Controls
function openChatPollModal() {
    if (!activeChatUserId) {
        showToast('Выберите диалог для отправки опроса', 'warning');
        return;
    }
    const modal = document.getElementById('chatPollModal');
    if (modal) modal.style.display = 'flex';
}
function closeChatPollModal() {
    const modal = document.getElementById('chatPollModal');
    if (modal) modal.style.display = 'none';
}
async function handleSendChatPollSubmit(e) {
    if (e) e.preventDefault();
    const data = collectPollData('chatPollQuestion', 'chatPollModalOptionsInputs', 'chatPollIsMultiple', 'chatPollIsAnonymous');
    if (!data || !data.question) {
        showToast('Введите вопрос опроса', 'warning');
        return;
    }
    if (data.options.length < 2) {
        showToast('Добавьте минимум 2 варианта ответа', 'warning');
        return;
    }
    try {
        const res = await fetch('/api/polls', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Ошибка при создании опроса');
        }
        const createdPoll = await res.json();
        closeChatPollModal();

        if (activeChatUserId) {
            const sendRes = await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    receiver_id: activeChatUserId,
                    content: '',
                    poll_id: createdPoll.id
                })
            });
            if (sendRes.ok) {
                const msg = await sendRes.json();
                appendChatMessageElement(msg);
                scrollChatToBottom();
                showToast('Опрос успешно отправлен в диалог 📊', 'success');
            }
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// --- CHANNELS SYSTEM CORE ---
let currentChannelId = null;
let currentChannelData = null;
let channelsListCache = [];
let activeChannelsTab = 'subscribed';

let channelComposerImage = '';
let channelComposerAudioUrl = '';
let channelComposerAudioTitle = '';
let channelComposerAudioArtist = '';

let currentChannelAudioUrl = '';
let currentChannelAudioTitle = '';
let currentChannelAudioArtist = '';

let currentActiveInboxSubscriberId = null;

function pluralizeMembers(n) {
    n = Math.abs(n) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return 'участников';
    if (n1 > 1 && n1 < 5) return 'участника';
    if (n1 === 1) return 'участник';
    return 'участников';
}

async function loadChannels(filter = activeChannelsTab) {
    const grid = document.getElementById('channelsCardsGrid');
    if (!grid) return;
    grid.innerHTML = '<div class="channels-loading">Загрузка каталога каналов...</div>';

    try {
        const res = await fetch(`/api/channels?filter=${filter}`);
        if (!res.ok) throw new Error('Ошибка загрузки каналов');
        const channels = await res.json();
        channelsListCache = channels || [];
        renderChannelsGrid(channelsListCache);
    } catch (err) {
        grid.innerHTML = `<div class="channels-loading" style="color: #f43f5e;">${escapeHtml(err.message)}</div>`;
    }
}

function switchChannelsTab(tab) {
    activeChannelsTab = tab;
    ['tabChannelsSubscribed', 'tabChannelsMy'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.remove('active');
    });
    if (tab === 'subscribed') document.getElementById('tabChannelsSubscribed')?.classList.add('active');
    else if (tab === 'my') document.getElementById('tabChannelsMy')?.classList.add('active');
    loadChannels(tab);
}

async function handleChannelsSearch(e) {
    const q = (e.target.value || '').trim();
    if (!q) {
        renderChannelsGrid(channelsListCache);
        return;
    }
    const grid = document.getElementById('channelsCardsGrid');
    if (grid) grid.innerHTML = '<div class="channels-loading">🔍 Поиск каналов...</div>';
    try {
        const res = await fetch(`/api/channels?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error('Ошибка поиска каналов');
        const channels = await res.json();
        renderChannelsGrid(channels || []);
    } catch (_) {
        const filtered = channelsListCache.filter(ch =>
            (ch.name || '').toLowerCase().includes(q.toLowerCase()) ||
            (ch.handle || '').toLowerCase().includes(q.toLowerCase()) ||
            (ch.description || '').toLowerCase().includes(q.toLowerCase())
        );
        renderChannelsGrid(filtered);
    }
}

function renderChannelsGrid(channels) {
    const grid = document.getElementById('channelsCardsGrid');
    if (!grid) return;
    if (!channels || channels.length === 0) {
        grid.innerHTML = `
            <div class="channels-loading" style="grid-column: 1 / -1;">
                <span style="font-size: 2rem; display: block; margin-bottom: 8px;">📢</span>
                Пока нет каналов в этом разделе.<br>
                <button class="btn btn-outline btn-xs" style="margin-top: 10px;" onclick="openCreateChannelModal()">Создать первый канал</button>
            </div>
        `;
        return;
    }

    grid.innerHTML = channels.map(ch => {
        const bannerStyle = ch.banner_url ? `style="background-image: url('${escapeHtml(ch.banner_url)}');"` : '';
        const isSub = !!ch.is_subscribed;
        const subBtnText = isSub ? '✓ Подписан' : '+ Подписаться';
        const subBtnClass = isSub ? 'btn-secondary' : 'btn-primary';

        return `
            <div class="channel-grid-card" onclick="openChannelDetail(${ch.id})">
                <div class="channel-card-banner" ${bannerStyle}>
                    <div class="channel-card-avatar-wrap">
                        <img src="${escapeHtml(ch.avatar_url || '/static/avatars/default_channel.svg')}" alt="Канал" class="channel-card-avatar">
                    </div>
                </div>
                <div class="channel-card-body">
                    <div class="channel-card-name-row">
                        <span class="channel-card-name" title="${escapeHtml(ch.name)}">${escapeHtml(ch.name)}</span>
                        <span class="channel-badge">📢</span>
                    </div>
                    <span class="channel-card-handle">${escapeHtml(ch.handle)}</span>
                    <span class="channel-card-subscribers">👥 ${ch.subscribers_count || 0} ${pluralizeMembers(ch.subscribers_count || 0)}</span>
                    <p class="channel-card-desc">${escapeHtml(ch.description || 'Нет описания канала')}</p>
                    <div class="channel-card-footer" onclick="event.stopPropagation()">
                        <button class="btn ${subBtnClass} btn-xs" onclick="quickToggleChannelSub(${ch.id}, this, event)">
                            ${subBtnText}
                        </button>
                        <button class="btn btn-outline btn-xs" onclick="openChannelDetail(${ch.id})">
                            Открыть →
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function quickToggleChannelSub(channelId, btn, event) {
    if (event) event.stopPropagation();
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите для подписки на канал', 'warning');
        openAuthModal('login');
        return;
    }
    const isSub = btn.textContent.includes('✓');
    const endpoint = isSub ? `/api/channels/${channelId}/unsubscribe` : `/api/channels/${channelId}/subscribe`;
    try {
        const res = await fetch(endpoint, { method: 'POST' });
        if (res.ok) {
            const data = await res.json();
            btn.textContent = data.is_subscribed ? '✓ Подписан' : '+ Подписаться';
            btn.className = data.is_subscribed ? 'btn btn-secondary btn-xs' : 'btn btn-primary btn-xs';
            showToast(data.is_subscribed ? 'Подписка оформлена' : 'Подписка отменена', 'success');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function openChannelDetail(channelIdOrHandle) {
    navigateTo('channels');
    const catalogSec = document.getElementById('channelsCatalogSection');
    const detailSec = document.getElementById('channelDetailSection');
    if (catalogSec) catalogSec.style.display = 'none';
    if (detailSec) detailSec.style.display = 'block';

    try {
        const res = await fetch(`/api/channels/${channelIdOrHandle}`);
        if (!res.ok) throw new Error('Канал не найден');
        const ch = await res.json();
        currentChannelId = ch.id;
        currentChannelData = ch;
        renderChannelDetailPage(ch);
        loadChannelPosts(ch.id);
    } catch (err) {
        showToast(err.message, 'error');
        closeChannelDetail();
    }
}

function closeChannelDetail() {
    const catalogSec = document.getElementById('channelsCatalogSection');
    const detailSec = document.getElementById('channelDetailSection');
    if (catalogSec) catalogSec.style.display = 'block';
    if (detailSec) detailSec.style.display = 'none';
    currentChannelId = null;
    currentChannelData = null;
    loadChannels();
}

function renderChannelDetailPage(ch) {
    document.getElementById('channelHeroName').textContent = ch.name;
    document.getElementById('channelHeroHandle').textContent = ch.handle;
    document.getElementById('channelHeroSubscribers').textContent = `👥 ${ch.subscribers_count || 0} ${pluralizeMembers(ch.subscribers_count || 0)}`;
    document.getElementById('channelHeroDesc').textContent = ch.description || 'У канала пока нет описания';

    const avatarImg = document.getElementById('channelHeroAvatar');
    if (avatarImg) avatarImg.src = ch.avatar_url || '/static/avatars/default_channel.svg';

    const bannerEl = document.getElementById('channelHeroBanner');
    if (bannerEl) {
        if (ch.banner_url) bannerEl.style.backgroundImage = `url('${ch.banner_url}')`;
        else bannerEl.style.backgroundImage = '';
    }

    const subBtn = document.getElementById('btnChannelSubscribe');
    if (subBtn) {
        if (ch.is_subscribed) {
            subBtn.textContent = '✓ Вы подписаны';
            subBtn.className = 'btn btn-secondary btn-sm';
        } else {
            subBtn.textContent = '+ Подписаться';
            subBtn.className = 'btn btn-primary btn-sm';
        }
    }

    const isManager = (ch.is_creator || ch.role === 'creator' || ch.role === 'admin');
    const composerCard = document.getElementById('channelPostComposerCard');
    if (composerCard) composerCard.style.display = isManager ? 'block' : 'none';

    // Настройка пунктов 3 точек в шапке канала
    const itemEdit = document.getElementById('channelDropdownItemEdit');
    const itemChats = document.getElementById('channelDropdownItemChats');
    const itemDivider = document.getElementById('channelDropdownDivider');
    if (itemEdit) itemEdit.style.display = isManager ? 'flex' : 'none';
    if (itemChats) itemChats.style.display = isManager ? 'flex' : 'none';
    if (itemDivider) itemDivider.style.display = isManager ? 'block' : 'none';

    // Прячем старые широкие кнопки (они теперь внутри меню 3 точек)
    const editBtn = document.getElementById('btnChannelEdit');
    const manageChatsBtn = document.getElementById('btnChannelManageChats');
    if (editBtn) editBtn.style.display = 'none';
    if (manageChatsBtn) manageChatsBtn.style.display = 'none';

    // Кнопка "Написать каналу" для подписчиков
    const msgBtn = document.getElementById('btnChannelMessage');
    if (msgBtn) msgBtn.style.display = isManager ? 'none' : 'inline-flex';

    const compAvatar = document.getElementById('channelComposerAvatar');
    if (compAvatar) compAvatar.src = ch.avatar_url || '/static/avatars/default_channel.svg';
}

async function toggleChannelSubscription() {
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите, чтобы подписаться на канал', 'warning');
        openAuthModal('login');
        return;
    }
    if (!currentChannelId) return;
    const isSub = currentChannelData && currentChannelData.is_subscribed;
    const endpoint = isSub ? `/api/channels/${currentChannelId}/unsubscribe` : `/api/channels/${currentChannelId}/subscribe`;

    try {
        const res = await fetch(endpoint, { method: 'POST' });
        if (!res.ok) throw new Error('Ошибка обновления подписки');
        const data = await res.json();
        currentChannelData.is_subscribed = data.is_subscribed;
        currentChannelData.subscribers_count = data.subscribers_count;
        renderChannelDetailPage(currentChannelData);
        showToast(data.is_subscribed ? 'Вы успешно подписались на канал! 📢' : 'Вы отписались от канала', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// Channel Posts Loading
async function loadChannelPosts(channelId) {
    const stream = document.getElementById('channelPostsStream');
    if (!stream) return;
    stream.innerHTML = '<div class="channels-loading">Загрузка постов канала...</div>';

    try {
        const res = await fetch(`/api/channels/${channelId}/posts`);
        if (!res.ok) throw new Error('Ошибка загрузки постов канала');
        const posts = await res.json();

        stream.innerHTML = '';
        if (!posts || posts.length === 0) {
            stream.innerHTML = `
                <div class="cyber-empty-card" style="margin-top: 1rem;">
                    <h3>В канале пока нет постов</h3>
                    <p>Новые публикации автора появятся здесь.</p>
                </div>
            `;
            return;
        }

        posts.forEach(p => {
            const postEl = createPostElement(p);
            stream.appendChild(postEl);
        });
    } catch (err) {
        stream.innerHTML = `<div class="channels-loading" style="color: #f43f5e;">${escapeHtml(err.message)}</div>`;
    }
}

// Channel Composer Actions
function expandChannelComposer() {
    const drawer = document.getElementById('channelComposerDrawer');
    if (drawer) drawer.style.display = 'block';
}
function toggleChannelComposerMusicBox() {
    const box = document.getElementById('channelComposerMusicBox');
    if (box) box.style.display = (box.style.display === 'none' ? 'block' : 'none');
}
function toggleChannelComposerPollBox() {
    const box = document.getElementById('channelComposerPollBox');
    if (box) box.style.display = (box.style.display === 'none' ? 'block' : 'none');
}
function updateChannelComposerPollState() {
    const data = collectPollData('channelPollQuestion', 'channelPollOptionsInputs', 'channelPollIsMultiple', 'channelPollIsAnonymous');
    const prev = document.getElementById('channelComposerPollPreview');
    const qPrev = document.getElementById('channelComposerPollPreviewQuestion');
    const oPrev = document.getElementById('channelComposerPollPreviewOpts');
    if (!data || (!data.question && data.options.length === 0)) {
        if (prev) prev.style.display = 'none';
        return;
    }
    if (prev) prev.style.display = 'block';
    if (qPrev) qPrev.textContent = data.question || 'Новый опрос';
    if (oPrev) oPrev.textContent = `${data.options.length} варианта(-ов)`;
}
function clearChannelComposerPoll() {
    const qEl = document.getElementById('channelPollQuestion');
    if (qEl) qEl.value = '';
    const cEl = document.getElementById('channelPollOptionsInputs');
    if (cEl) {
        cEl.innerHTML = `
            <div class="poll-opt-input-row"><input type="text" class="poll-opt-input" placeholder="Вариант 1" oninput="updateChannelComposerPollState()"></div>
            <div class="poll-opt-input-row"><input type="text" class="poll-opt-input" placeholder="Вариант 2" oninput="updateChannelComposerPollState()"></div>
        `;
    }
    const multEl = document.getElementById('channelPollIsMultiple');
    if (multEl) multEl.checked = false;
    const anonEl = document.getElementById('channelPollIsAnonymous');
    if (anonEl) anonEl.checked = false;
    const prev = document.getElementById('channelComposerPollPreview');
    if (prev) prev.style.display = 'none';
    const box = document.getElementById('channelPollBox');
    if (box) box.style.display = 'none';
}
function clearChannelComposerFile() {
    channelComposerImage = '';
    const prev = document.getElementById('channelComposerUploadPreview');
    if (prev) prev.style.display = 'none';
}
function clearChannelComposerMusic() {
    channelComposerAudioUrl = '';
    channelComposerAudioTitle = '';
    channelComposerAudioArtist = '';
    const prev = document.getElementById('channelComposerMusicPreview');
    if (prev) prev.style.display = 'none';
}

async function handleChannelComposerFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Ошибка загрузки файла');
        const data = await res.json();
        channelComposerImage = data.url;
        const prev = document.getElementById('channelComposerUploadPreview');
        const img = document.getElementById('channelComposerPreviewImg');
        const name = document.getElementById('channelComposerPreviewName');
        if (img) img.src = data.url;
        if (name) name.textContent = file.name;
        if (prev) prev.style.display = 'block';
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleChannelComposerAudioUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Ошибка загрузки аудио');
        const data = await res.json();
        channelComposerAudioUrl = data.url;
        channelComposerAudioTitle = file.name.replace(/\.[^/.]+$/, "");
        channelComposerAudioArtist = currentChannelData ? currentChannelData.name : 'Канал';

        const prev = document.getElementById('channelComposerMusicPreview');
        const t = document.getElementById('channelComposerPreviewTitle');
        const a = document.getElementById('channelComposerPreviewArtist');
        if (t) t.textContent = channelComposerAudioTitle;
        if (a) a.textContent = channelComposerAudioArtist;
        if (prev) prev.style.display = 'block';
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function submitChannelPost() {
    if (!currentChannelId) return;
    const textarea = document.getElementById('channelPostContent');
    let content = textarea ? textarea.value.trim() : '';

    // Авто-детекция картинок и аудио из текста поста
    const imagePattern = /^https?:\/\/[^\s]+\.(jpeg|jpg|gif|png|webp)(\?[^\s]*)?$/i;
    if (!channelComposerImage && imagePattern.test(content)) {
        channelComposerImage = content;
        content = '';
    }
    const audioPattern = /^https?:\/\/[^\s]+\.(mp3|wav|ogg|m4a)(\?[^\s]*)?$/i;
    if (!channelComposerAudioUrl && audioPattern.test(content)) {
        channelComposerAudioUrl = content;
        channelComposerAudioTitle = 'Аудиозапись';
        channelComposerAudioArtist = currentChannelData ? currentChannelData.name : 'Канал';
        content = '';
    }

    // Опрос
    let pollData = collectPollData('channelPollQuestion', 'channelPollOptionsInputs', 'channelPollIsMultiple', 'channelPollIsAnonymous');
    let pollId = null;
    if (pollData && (pollData.question || pollData.options.length > 0)) {
        if (!pollData.question || pollData.options.length < 2) {
            showToast('Для создания опроса в канале введите вопрос и минимум 2 варианта ответа', 'warning');
            return;
        }
        try {
            const pRes = await fetch('/api/polls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pollData)
            });
            if (!pRes.ok) {
                const errObj = await pRes.json();
                throw new Error(errObj.error || 'Ошибка при создании опроса');
            }
            const pollObj = await pRes.json();
            pollId = pollObj.id;
        } catch (e) {
            showToast(e.message, 'error');
            return;
        }
    }

    const musicUrlInp = document.getElementById('channelComposerMusicUrl');
    const musicTitleInp = document.getElementById('channelComposerMusicTitle');
    const musicArtistInp = document.getElementById('channelComposerMusicArtist');
    const audioUrl = channelComposerAudioUrl || (musicUrlInp ? musicUrlInp.value.trim() : '');
    const audioTitle = channelComposerAudioTitle || (musicTitleInp ? musicTitleInp.value.trim() : '') || (audioUrl ? 'Аудиозапись' : '');
    const audioArtist = channelComposerAudioArtist || (musicArtistInp ? musicArtistInp.value.trim() : '') || (audioUrl ? (currentChannelData ? currentChannelData.name : 'Канал') : '');

    if (!content && !channelComposerImage && !audioUrl && !pollId) {
        showToast('Введите текст публикации, прикрепите фото, музыку или опрос', 'warning');
        return;
    }

    try {
        const res = await fetch(`/api/channels/${currentChannelId}/posts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: content,
                image_url: channelComposerImage,
                music_url: audioUrl,
                music_title: audioTitle,
                music_artist: audioArtist,
                poll_id: pollId
            })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Ошибка публикации поста');
        }
        if (textarea) textarea.value = '';
        clearChannelComposerFile();
        clearChannelComposerMusic();
        clearChannelComposerPoll();
        showToast('Пост успешно опубликован в канале! 📢', 'success');
        loadChannelPosts(currentChannelId);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// Channel CRUD Modals
function openCreateChannelModal() {
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите, чтобы создать канал', 'warning');
        openAuthModal('login');
        return;
    }
    const modal = document.getElementById('createChannelModal');
    if (modal) modal.style.display = 'flex';
}
function closeCreateChannelModal() {
    const modal = document.getElementById('createChannelModal');
    if (modal) modal.style.display = 'none';
}
function selectChannelAvatarPreset(el, url, mode) {
    const parent = el.parentElement;
    parent.querySelectorAll('.preset-avatar-thumb').forEach(t => t.classList.remove('selected'));
    el.classList.add('selected');
    if (mode === 'create') {
        const inp = document.getElementById('createChannelAvatarUrl');
        if (inp) inp.value = url;
    } else {
        const inp = document.getElementById('editChannelAvatarUrl');
        if (inp) inp.value = url;
    }
}
async function handleUploadChannelAvatar(e, mode) {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Ошибка загрузки аватарки');
        const data = await res.json();
        if (mode === 'create') {
            document.getElementById('createChannelAvatarUrl').value = data.url;
            showToast('Аватарка загружена', 'success');
        } else {
            document.getElementById('editChannelAvatarUrl').value = data.url;
            const prev = document.getElementById('editChannelAvatarPreview');
            if (prev) prev.src = data.url;
            showToast('Аватарка загружена', 'success');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}
async function handleUploadChannelBanner(e, mode) {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Ошибка загрузки баннера');
        const data = await res.json();
        if (mode === 'create') {
            document.getElementById('createChannelBannerUrl').value = data.url;
            showToast('Баннер загружен', 'success');
        } else {
            document.getElementById('editChannelBannerUrl').value = data.url;
            showToast('Баннер загружен', 'success');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleCreateChannelSubmit(e) {
    if (e) e.preventDefault();
    const name = document.getElementById('createChannelName')?.value.trim();
    let handle = document.getElementById('createChannelHandle')?.value.trim();
    const desc = document.getElementById('createChannelDesc')?.value.trim();
    const avatar = document.getElementById('createChannelAvatarUrl')?.value.trim() || '/static/avatars/default_channel.svg';
    const banner = document.getElementById('createChannelBannerUrl')?.value.trim();

    if (!name || !handle) {
        showToast('Заполните название и юзернейм канала', 'warning');
        return;
    }
    if (!handle.startsWith('@')) handle = '@' + handle;

    try {
        const res = await fetch('/api/channels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                handle: handle,
                description: desc,
                avatar_url: avatar,
                banner_url: banner
            })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Ошибка при создании канала');
        }
        const created = await res.json();
        closeCreateChannelModal();
        showToast(`Канал ${created.name} успешно создан! 📢`, 'success');
        openChannelDetail(created.id);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// Edit Channel Modal
function openEditChannelModal() {
    if (!currentChannelData) return;
    const modal = document.getElementById('editChannelModal');
    if (!modal) return;
    modal.style.display = 'flex';

    document.getElementById('editChannelId').value = currentChannelData.id;
    document.getElementById('editChannelName').value = currentChannelData.name;
    document.getElementById('editChannelDesc').value = currentChannelData.description || '';
    document.getElementById('editChannelAvatarUrl').value = currentChannelData.avatar_url || '';
    document.getElementById('editChannelBannerUrl').value = currentChannelData.banner_url || '';

    const prev = document.getElementById('editChannelAvatarPreview');
    if (prev) prev.src = currentChannelData.avatar_url || '/static/avatars/default_channel.svg';
}

function closeEditChannelModal() {
    const modal = document.getElementById('editChannelModal');
    if (modal) modal.style.display = 'none';
}

async function handleEditChannelSubmit(e) {
    if (e) e.preventDefault();
    if (!currentChannelId) return;

    const name = document.getElementById('editChannelName')?.value.trim();
    const desc = document.getElementById('editChannelDesc')?.value.trim();
    const avatar = document.getElementById('editChannelAvatarUrl')?.value.trim();
    const banner = document.getElementById('editChannelBannerUrl')?.value.trim();

    try {
        const res = await fetch(`/api/channels/${currentChannelId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                description: desc,
                avatar_url: avatar,
                banner_url: banner
            })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Ошибка сохранения канала');
        }
        const updated = await res.json();
        currentChannelData = updated;
        renderChannelDetailPage(updated);
        closeEditChannelModal();
        showToast('Оформление канала сохранено! ✨', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteCurrentChannel() {
    if (!currentChannelId) return;
    if (!confirm('Вы уверены, что хотите удалить этот канал со всеми постами?')) return;

    try {
        const res = await fetch(`/api/channels/${currentChannelId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Ошибка при удалении канала');
        closeEditChannelModal();
        showToast('Канал удален', 'success');
        closeChannelDetail();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// =========================================================
// DEDICATED CHANNEL MESSAGES VIEW & WORKSPACE SUITE
// =========================================================

let currentChannelMessagesChannelId = null;
let currentChannelMessagesChannelData = null;
let currentChannelChatAudioUrl = '';
let currentChannelChatAudioTitle = '';
let currentChannelChatAudioArtist = '';
let currentChannelChatPollId = null;
let currentChatScope = 'direct';

function openChannelMessagesView(channelId) {
    if (!channelId) channelId = currentChannelId;
    if (!channelId) return;
    if (!window.IS_AUTHENTICATED) {
        showToast('Войдите, чтобы просматривать сообщения канала', 'warning');
        openAuthModal('login');
        return;
    }
    currentChannelMessagesChannelId = channelId;
    navigateTo('channel-messages', channelId);
}

function openChannelChatView() {
    if (!currentChannelId) return;
    openChannelMessagesView(currentChannelId);
}

function backFromChannelMessages() {
    if (currentChannelMessagesChannelId) {
        navigateTo('channels');
        openChannelDetail(currentChannelMessagesChannelId);
    } else {
        navigateTo('channels');
    }
}

async function initChannelMessagesView(channelId) {
    currentChannelMessagesChannelId = channelId;
    currentActiveInboxSubscriberId = null;

    try {
        const res = await fetch(`/api/channels/${channelId}`);
        if (!res.ok) throw new Error('Канал не найден');
        const ch = await res.json();
        currentChannelMessagesChannelData = ch;

        // Заполнение шапки страницы сообщений канала
        const av = document.getElementById('channelMessagesHeaderAvatar');
        if (av) av.src = ch.avatar_url || '/static/avatars/default_channel.svg';
        const nameEl = document.getElementById('channelMessagesHeaderName');
        if (nameEl) nameEl.textContent = ch.name;
        const backLbl = document.getElementById('channelMessagesBackLabel');
        if (backLbl) backLbl.textContent = `Назад к "${ch.name}"`;

        const isManager = (ch.role === 'creator' || ch.role === 'admin' || ch.creator_id === window.CURRENT_USER_ID);
        const sidebar = document.getElementById('channelChatSidebar');
        const placeholder = document.getElementById('channelChatPlaceholder');
        const activePane = document.getElementById('channelChatActivePane');
        const subTitle = document.getElementById('channelMessagesHeaderSubtitle');
        const dHeader = document.getElementById('channelDialogHeader');

        if (isManager) {
            // Режим создателя/администратора канала
            if (sidebar) sidebar.style.display = 'flex';
            if (subTitle) subTitle.textContent = '📬 Входящие сообщения подписчиков канала';
            if (placeholder) placeholder.style.display = 'flex';
            if (activePane) activePane.style.display = 'none';
            if (dHeader) dHeader.style.display = 'flex';

            loadChannelSubscriberConversations(channelId);
        } else {
            // Режим подписчика канала
            if (sidebar) sidebar.style.display = 'none';
            if (subTitle) subTitle.textContent = '📢 Официальный анонимный диалог с администрацией канала';
            if (placeholder) placeholder.style.display = 'none';
            if (activePane) activePane.style.display = 'flex';
            if (dHeader) dHeader.style.display = 'none';

            const dAvatar = document.getElementById('channelDialogUserAvatar');
            if (dAvatar) dAvatar.src = ch.avatar_url || '/static/avatars/default_channel.svg';
            const dName = document.getElementById('channelDialogUserName');
            if (dName) dName.textContent = ch.name;
            const dBadge = document.getElementById('channelDialogUserBadge');
            if (dBadge) dBadge.textContent = '📢 Официальный анонимный диалог с каналом';

            const input = document.getElementById('channelChatMessageInput');
            if (input) input.placeholder = `Напишите анонимное сообщение каналу "${ch.name}"...`;
            const btnLabel = document.getElementById('channelSendBtnLabel');
            if (btnLabel) btnLabel.textContent = 'Отправить';

            loadSubscriberChannelChatMessages(channelId);
        }
    } catch (err) {
        showToast(err.message, 'error');
        backFromChannelMessages();
    }
}

async function loadChannelSubscriberConversations(channelId) {
    const listEl = document.getElementById('channelSubscribersList');
    if (!listEl) return;
    listEl.innerHTML = '<div class="chat-empty-hint">Загрузка диалогов...</div>';

    try {
        const res = await fetch(`/api/channels/${channelId}/conversations`);
        if (!res.ok) throw new Error('Ошибка загрузки сообщений');
        const convs = await res.json();

        if (!convs || convs.length === 0) {
            listEl.innerHTML = '<div class="chat-empty-hint">Пока нет входящих сообщений от подписчиков</div>';
            return;
        }

        listEl.innerHTML = convs.map(c => {
            const sub = c.subscriber || c.user || {};
            const subId = c.user_id || sub.id;
            const subName = sub.display_name || sub.username || 'Подписчик';
            const subAvatar = sub.avatar_url || '/static/avatars/default_avatar.svg';
            const lastText = c.last_text || (c.last_message ? (c.last_message.content || 'Вложение') : 'Вложение');
            const isActive = (currentActiveInboxSubscriberId === subId);

            return `
                <div class="channel-subscriber-item ${isActive ? 'active' : ''}" onclick="selectChannelSubscriberChat(${subId}, '${escapeHtml(subName)}', '${escapeHtml(subAvatar)}')">
                    <img src="${escapeHtml(subAvatar)}" alt="Аватар" class="channel-subscriber-avatar">
                    <div class="channel-subscriber-meta">
                        <div class="channel-subscriber-name">${escapeHtml(subName)}</div>
                        <div class="channel-subscriber-lastmsg">${escapeHtml(lastText)}</div>
                    </div>
                    ${c.unread_count > 0 ? `<span class="channel-subscriber-badge">${c.unread_count}</span>` : ''}
                </div>
            `;
        }).join('');

        // Авто-выбор первого диалога
        if (convs.length > 0 && !currentActiveInboxSubscriberId) {
            const first = convs[0];
            const firstSub = first.subscriber || first.user || {};
            const firstId = first.user_id || firstSub.id;
            const firstName = firstSub.display_name || firstSub.username || 'Подписчик';
            const firstAvatar = firstSub.avatar_url || '/static/avatars/default_avatar.svg';
            selectChannelSubscriberChat(firstId, firstName, firstAvatar);
        }
    } catch (err) {
        listEl.innerHTML = `<div class="chat-empty-hint">${escapeHtml(err.message)}</div>`;
    }
}

function filterChannelSubscribers() {
    const q = (document.getElementById('channelSubscribersSearch')?.value || '').toLowerCase().trim();
    document.querySelectorAll('.channel-subscriber-item').forEach(item => {
        const name = (item.querySelector('.channel-subscriber-name')?.textContent || '').toLowerCase();
        const msg = (item.querySelector('.channel-subscriber-lastmsg')?.textContent || '').toLowerCase();
        item.style.display = (!q || name.includes(q) || msg.includes(q)) ? 'flex' : 'none';
    });
}

async function selectChannelSubscriberChat(subscriberId, name, avatar) {
    if (!subscriberId) return;
    currentActiveInboxSubscriberId = subscriberId;

    const placeholder = document.getElementById('channelChatPlaceholder');
    const activePane = document.getElementById('channelChatActivePane');
    const dHeader = document.getElementById('channelDialogHeader');
    if (placeholder) placeholder.style.display = 'none';
    if (activePane) activePane.style.display = 'flex';
    if (dHeader) dHeader.style.display = 'flex';

    const dAvatar = document.getElementById('channelDialogUserAvatar');
    if (dAvatar && avatar) dAvatar.src = avatar;
    const dName = document.getElementById('channelDialogUserName');
    if (dName && name) dName.textContent = name;
    const dBadge = document.getElementById('channelDialogUserBadge');
    if (dBadge) dBadge.textContent = `👤 Подписчик канала • ID: #${subscriberId}`;

    const input = document.getElementById('channelChatMessageInput');
    if (input) input.placeholder = `Ответить ${name} от имени канала...`;
    const btnLabel = document.getElementById('channelSendBtnLabel');
    if (btnLabel) btnLabel.textContent = `📢 Ответить от имени ${currentChannelMessagesChannelData?.name || 'канала'}`;

    // Подсветка в сайдбаре
    document.querySelectorAll('.channel-subscriber-item').forEach(el => el.classList.remove('active'));
    const activeSubItem = document.querySelector(`.channel-subscriber-item[onclick*="selectChannelSubscriberChat(${subscriberId},"]`);
    if (activeSubItem) {
        activeSubItem.classList.add('active');
        const badgeEl = activeSubItem.querySelector('.channel-subscriber-badge');
        if (badgeEl) badgeEl.remove();
    }

    loadChannelMessagesForSubscriber(currentChannelMessagesChannelId, subscriberId);
}

async function loadChannelMessagesForSubscriber(channelId, subscriberId) {
    const stream = document.getElementById('channelMessagesStream');
    if (!stream || !channelId) return;
    stream.innerHTML = '<div class="chat-empty-hint">Загрузка переписки...</div>';

    try {
        const res = await fetch(`/api/channels/${channelId}/messages?subscriber_id=${subscriberId}`);
        if (!res.ok) throw new Error('Ошибка загрузки сообщений');
        let msgs = await res.json();
        if (!Array.isArray(msgs)) msgs = [];
        renderChannelStreamMessages(msgs, true);
        if (typeof updateUnreadMessagesCountBadge === 'function') {
            updateUnreadMessagesCountBadge();
        }
    } catch (err) {
        stream.innerHTML = `<div class="chat-empty-hint">${escapeHtml(err.message)}</div>`;
    }
}

async function loadSubscriberChannelChatMessages(channelId) {
    const stream = document.getElementById('channelMessagesStream');
    if (!stream || !channelId) return;
    stream.innerHTML = '<div class="chat-empty-hint">Загрузка диалога с каналом...</div>';

    try {
        const res = await fetch(`/api/channels/${channelId}/messages`);
        if (!res.ok) throw new Error('Ошибка загрузки сообщений');
        let msgs = await res.json();
        if (!Array.isArray(msgs)) msgs = [];
        renderChannelStreamMessages(msgs, false);
        if (typeof updateUnreadMessagesCountBadge === 'function') {
            updateUnreadMessagesCountBadge();
        }
    } catch (err) {
        stream.innerHTML = `<div class="chat-empty-hint">${escapeHtml(err.message)}</div>`;
    }
}

function renderChannelStreamMessages(messages, isManagerView) {
    const stream = document.getElementById('channelMessagesStream');
    if (!stream) return;

    if (!messages || messages.length === 0) {
        stream.innerHTML = `
            <div class="chat-empty-hint">
                ${isManagerView ? 'Нет сообщений в этом диалоге с подписчиком' : '🔒 Здесь вы можете написать каналу анонимно.<br>Создатель канала получит ваше сообщение и сможет ответить.'}
            </div>
        `;
        return;
    }

    const channelName = currentChannelMessagesChannelData ? currentChannelMessagesChannelData.name : 'Канал';

    stream.innerHTML = messages.map(m => {
        let isOut = false;
        let authorLabel = '';

        if (isManagerView) {
            // Для создателя канала:
            // исходящие — это ответы от имени канала (is_from_channel = true)
            isOut = !!m.is_from_channel;
            authorLabel = isOut ? `📢 ${channelName} (Вы)` : (m.sender ? m.sender.display_name : 'Подписчик');
        } else {
            // Для подписчика:
            // исходящие — это его собственные сообщения (sender_id = currentUser && !is_from_channel)
            isOut = (m.sender_id === window.CURRENT_USER_ID && !m.is_from_channel);
            authorLabel = m.is_from_channel ? `📢 ${channelName}` : (m.sender ? m.sender.display_name : 'Вы');
        }

        let audioHtml = '';
        if (m.audio_url) {
            audioHtml = `
                <div class="chat-audio-bubble" style="display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: rgba(0, 240, 255, 0.08); border: 1px solid rgba(0, 240, 255, 0.3); border-radius: 8px; margin-bottom: 4px;">
                    <button type="button" class="post-music-play-btn" onclick="window.musicPlayer.playTrack({url: '${escapeHtml(m.audio_url)}', title: '${escapeHtml(m.audio_title || 'Аудио')}', artist: '${escapeHtml(m.audio_artist || '')}'}, event)" title="Слушать">▶️</button>
                    <div><strong>${escapeHtml(m.audio_title || 'Аудио')}</strong><div style="font-size: 0.72rem; color: var(--text-dim);">${escapeHtml(m.audio_artist || '')}</div></div>
                </div>
            `;
        }
        let pollHtml = m.poll ? renderPollWidget(m.poll) : '';

        return `
            <div class="chat-bubble-row ${isOut ? 'out' : 'in'}">
                <div class="chat-bubble ${isOut ? 'out' : 'in'}">
                    <div style="font-size: 0.72rem; color: #00f0ff; margin-bottom: 3px; font-weight: 700;">${escapeHtml(authorLabel)}</div>
                    ${audioHtml}
                    ${m.content ? `<div class="chat-bubble-content">${escapeHtml(m.content)}</div>` : ''}
                    ${pollHtml}
                    <div class="chat-bubble-footer">
                        <time class="chat-bubble-time">${m.created_at ? new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}</time>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    stream.scrollTop = stream.scrollHeight;
}

function handleChannelChatKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChannelChatMessage();
    }
}

async function sendChannelChatMessage() {
    if (!currentChannelMessagesChannelId) return;
    const input = document.getElementById('channelChatMessageInput');
    const content = input ? input.value.trim() : '';

    if (!content && !currentChannelChatAudioUrl && !currentChannelChatPollId) {
        showToast('Введите сообщение или прикрепите аудио/опрос', 'warning');
        return;
    }

    const isManager = (currentChannelMessagesChannelData &&
        (currentChannelMessagesChannelData.role === 'creator' ||
         currentChannelMessagesChannelData.role === 'admin' ||
         currentChannelMessagesChannelData.creator_id === window.CURRENT_USER_ID));

    let receiverId = 0;
    if (isManager) {
        if (!currentActiveInboxSubscriberId) {
            showToast('Выберите подписчика для ответа', 'warning');
            return;
        }
        receiverId = currentActiveInboxSubscriberId;
    } else {
        receiverId = currentChannelMessagesChannelData ? currentChannelMessagesChannelData.creator_id : 0;
    }

    try {
        const res = await fetch(`/api/channels/${currentChannelMessagesChannelId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                receiver_id: receiverId,
                content: content,
                audio_url: currentChannelChatAudioUrl || '',
                audio_title: currentChannelChatAudioTitle || '',
                audio_artist: currentChannelChatAudioArtist || '',
                poll_id: currentChannelChatPollId
            })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Ошибка отправки сообщения');
        }

        if (input) input.value = '';
        clearChannelChatAudio();
        clearChannelChatPoll();

        if (isManager) {
            loadChannelMessagesForSubscriber(currentChannelMessagesChannelId, currentActiveInboxSubscriberId);
            loadChannelSubscriberConversations(currentChannelMessagesChannelId);
        } else {
            loadSubscriberChannelChatMessages(currentChannelMessagesChannelId);
        }

        if (typeof playChatSoundFx === 'function') playChatSoundFx('send');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function openChannelChatAudioPrompt() {
    const url = prompt('Введите прямой URL аудиофайла (.mp3, .wav):');
    if (!url) return;
    currentChannelChatAudioUrl = url.trim();
    currentChannelChatAudioTitle = prompt('Название трека:') || 'Аудиозапись';
    currentChannelChatAudioArtist = currentChannelMessagesChannelData ? currentChannelMessagesChannelData.name : 'Канал';

    const prev = document.getElementById('channelChatAudioPreview');
    const t = document.getElementById('channelChatAudioPreviewTitle');
    const a = document.getElementById('channelChatAudioPreviewArtist');
    if (t) t.textContent = currentChannelChatAudioTitle;
    if (a) a.textContent = currentChannelChatAudioArtist;
    if (prev) prev.style.display = 'block';
}

function clearChannelChatAudio() {
    currentChannelChatAudioUrl = '';
    currentChannelChatAudioTitle = '';
    currentChannelChatAudioArtist = '';
    const prev = document.getElementById('channelChatAudioPreview');
    if (prev) prev.style.display = 'none';
}

function openChannelChatPollModal() {
    openChatPollModal();
}

function clearChannelChatPoll() {
    currentChannelChatPollId = null;
    const prev = document.getElementById('channelChatPollPreview');
    if (prev) prev.style.display = 'none';
}

// =========================================================
// CHAT SCOPE TOGGLE IN MAIN MESSAGES VIEW (ЛИЧНЫЕ / КАНАЛЫ)
// =========================================================

function switchChatScope(scope) {
    currentChatScope = scope;
    const dBtn = document.getElementById('chatScopeDirect');
    const cBtn = document.getElementById('chatScopeChannels');
    if (dBtn) dBtn.classList.toggle('active', scope === 'direct');
    if (cBtn) cBtn.classList.toggle('active', scope === 'channels');

    if (scope === 'direct') {
        loadConversations();
    } else {
        loadUserChannelConversations();
    }
}

async function loadUserChannelConversations() {
    const listEl = document.getElementById('conversationsList');
    if (!listEl) return;
    listEl.innerHTML = '<div class="chat-empty-hint">Загрузка диалогов каналов...</div>';

    try {
        const res = await fetch('/api/user/channel-conversations');
        if (!res.ok) throw new Error('Ошибка загрузки сообщений каналов');
        const convs = await res.json();

        if (!convs || convs.length === 0) {
            listEl.innerHTML = `
                <div class="chat-empty-hint">
                    📢 Пока нет сообщений с каналами.<br>
                    <small>Вы можете написать любому каналу или отвечать своим подписчикам.</small>
                </div>
            `;
            return;
        }

        listEl.innerHTML = convs.map(c => {
            const ch = c.channel || {};
            const sub = c.subscriber || c.user || {};
            const isCreator = !!c.is_creator;
            const title = isCreator ? `${ch.name} (От: ${sub.display_name || sub.username})` : ch.name;
            const subtitle = isCreator ? `Подписчик: @${sub.username}` : `Канал ${ch.handle || ''}`;
            const avatar = isCreator ? (sub.avatar_url || '/static/avatars/default_avatar.svg') : (ch.avatar_url || '/static/avatars/default_channel.svg');
            const lastText = c.last_text || (c.last_message ? (c.last_message.content || 'Вложение') : 'Вложение');
            const timeText = c.last_message ? formatTime(c.last_message.created_at) : '';

            return `
                <div class="conversation-item" onclick="openChannelMessagesView(${ch.id})">
                    <div class="conv-avatar-wrap">
                        <img src="${escapeHtml(avatar)}" alt="Avatar" class="conv-avatar">
                    </div>
                    <div class="conv-info">
                        <div class="conv-top-line">
                            <span class="conv-name" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
                            <span class="conv-time">${timeText}</span>
                        </div>
                        <div class="conv-bottom-line">
                            <span class="conv-preview">${escapeHtml(lastText)}</span>
                            ${c.unread_count > 0 ? `<span class="conv-unread-badge">${c.unread_count}</span>` : ''}
                        </div>
                        <div style="font-size: 0.72rem; color: #38bdf8; margin-top: 2px;">${escapeHtml(subtitle)}</div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        listEl.innerHTML = `<div class="chat-empty-hint">${escapeHtml(err.message)}</div>`;
    }
}

// ==========================================
// ACHIEVEMENTS & GAMIFICATION SYSTEM
// ==========================================
let currentAchievementsFilter = 'all';
let cachedAchievementsData = null;
let currentAchievementsTargetUserId = null;

function openUserAchievements(userId) {
    currentAchievementsTargetUserId = userId;
    navigateTo('achievements', userId);
}

function backFromAchievements() {
    if (currentAchievementsTargetUserId) {
        navigateTo('profile', currentAchievementsTargetUserId);
    } else {
        navigateTo('feed');
    }
}

async function loadAchievements(targetUserId = null) {
    currentAchievementsTargetUserId = targetUserId;
    const grid = document.getElementById('achieveCardsGrid');
    if (!cachedAchievementsData && grid) {
        grid.innerHTML = `
            <div class="achieve-loading-state">
                <span class="pulse-dot"></span> Синхронизация данных нейросети и достижений...
            </div>
        `;
    }

    try {
        let isForeignUser = false;
        let url = '/api/achievements';
        if (targetUserId && Number(targetUserId) !== Number(window.CURRENT_USER_ID)) {
            url = `/api/users/${targetUserId}/achievements`;
            isForeignUser = true;
        }

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error('Не удалось загрузить данные достижений');
        }

        const data = await res.json();
        cachedAchievementsData = data;

        // 1. Верхний бар возврата к профилю
        const headerBar = document.getElementById('achieveUserHeaderBar');
        if (headerBar) {
            if (isForeignUser && data.user) {
                headerBar.style.display = 'flex';
                const nameEl = document.getElementById('achieveViewingUserName');
                if (nameEl) nameEl.textContent = data.user.display_name;
                const handleEl = document.getElementById('achieveViewingUserHandle');
                if (handleEl) handleEl.textContent = `@${data.user.username}`;
                const avatarEl = document.getElementById('achieveViewingUserAvatar');
                if (avatarEl) avatarEl.src = data.user.avatar_url || '/static/avatars/default.svg';
                const backLabel = document.getElementById('achieveBackBtnLabel');
                if (backLabel) backLabel.textContent = `← Назад к профилю ${data.user.display_name}`;
            } else if (targetUserId && Number(targetUserId) === Number(window.CURRENT_USER_ID)) {
                headerBar.style.display = 'flex';
                const backLabel = document.getElementById('achieveBackBtnLabel');
                if (backLabel) backLabel.textContent = '← Назад в мой профиль';
                const nameEl = document.getElementById('achieveViewingUserName');
                if (nameEl) nameEl.textContent = 'Мои награды';
                const handleEl = document.getElementById('achieveViewingUserHandle');
                if (handleEl) handleEl.textContent = `@${window.CURRENT_USER_USERNAME || 'me'}`;
                const avatarEl = document.getElementById('achieveViewingUserAvatar');
                if (avatarEl && data.user) avatarEl.src = data.user.avatar_url || '/static/avatars/default.svg';
            } else {
                headerBar.style.display = 'none';
            }
        }

        // 2. Обновляем Hero HUD карточку уровня
        const lvl = data.user_level || { level: 1, title: 'Новичок', current_xp: 0, next_level_xp: 70, progress_perc: 0, total_xp: 0 };
        const lvlNum = document.getElementById('achieveHeroLevelNum');
        if (lvlNum) lvlNum.textContent = lvl.level;

        const lvlTitle = document.getElementById('achieveHeroLevelTitle');
        if (lvlTitle) lvlTitle.textContent = lvl.title;

        const rankPill = document.getElementById('achieveHeroRankPill');
        if (rankPill) rankPill.textContent = `Уровень ${lvl.level}`;

        const currXp = document.getElementById('achieveHeroCurrentXp');
        if (currXp) currXp.textContent = lvl.current_xp;

        const nextXp = document.getElementById('achieveHeroNextXp');
        if (nextXp) nextXp.textContent = lvl.next_level_xp;

        const percEl = document.getElementById('achieveHeroPercent');
        if (percEl) percEl.textContent = `${lvl.progress_perc}%`;

        const fillEl = document.getElementById('achieveHeroProgressFill');
        if (fillEl) fillEl.style.width = `${lvl.progress_perc}%`;

        const mUnlocked = document.getElementById('metricUnlockedCount');
        if (mUnlocked) mUnlocked.textContent = `${data.unlocked_count} / ${data.total_achievements}`;

        const mPoints = document.getElementById('metricTotalPoints');
        if (mPoints) mPoints.textContent = `${data.total_points_earned} XP`;

        // 3. Обновляем бейдж уровня в левой колонке навигации и в футере (только если свои данные)
        if (!isForeignUser) {
            const hudNavLvl = document.getElementById('hudNavLevelBadge');
            if (hudNavLvl) {
                hudNavLvl.textContent = `${lvl.level} ур.`;
                hudNavLvl.style.display = 'inline-flex';
            }
            const sidebarLvl = document.getElementById('sidebarUserLvlBadge');
            if (sidebarLvl) {
                sidebarLvl.textContent = `${lvl.level} ур.`;
            }
        }

        // 4. Обновляем счетчики в кнопках фильтров
        updateAchievementFilterCounts(data.achievements);

        // 5. Рендерим сетку карточек по текущему фильтру
        renderAchievementsList(currentAchievementsFilter);

    } catch (err) {
        console.error('Achievements load error:', err);
        if (grid) {
            grid.innerHTML = `
                <div class="achieve-loading-state" style="color: #ef4444;">
                    ✕ ${escapeHtml(err.message)}
                </div>
            `;
        }
    }
}

function updateAchievementFilterCounts(achievements) {
    if (!achievements) return;

    let commonCount = 0;
    let rareCount = 0;
    let unlockedCount = 0;
    let inProgressCount = 0;

    achievements.forEach(a => {
        if (a.rarity === 'common') commonCount++;
        else rareCount++;

        if (a.is_unlocked) unlockedCount++;
        else inProgressCount++;
    });

    const cAll = document.getElementById('countFilterAll');
    if (cAll) cAll.textContent = achievements.length;

    const cCommon = document.getElementById('countFilterCommon');
    if (cCommon) cCommon.textContent = commonCount;

    const cRare = document.getElementById('countFilterRare');
    if (cRare) cRare.textContent = rareCount;

    const cUnlocked = document.getElementById('countFilterUnlocked');
    if (cUnlocked) cUnlocked.textContent = unlockedCount;

    const cInProgress = document.getElementById('countFilterInProgress');
    if (cInProgress) cInProgress.textContent = inProgressCount;
}

function filterAchievements(filter) {
    currentAchievementsFilter = filter;

    document.querySelectorAll('.achieve-filter-btn').forEach(btn => {
        if (btn.getAttribute('data-filter') === filter) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    renderAchievementsList(filter);
}

function renderAchievementsList(filter) {
    const grid = document.getElementById('achieveCardsGrid');
    if (!grid || !cachedAchievementsData) return;

    const list = cachedAchievementsData.achievements || [];
    let filtered = list;

    if (filter === 'common') {
        filtered = list.filter(a => a.rarity === 'common');
    } else if (filter === 'rare') {
        filtered = list.filter(a => a.rarity === 'rare' || a.rarity === 'legendary');
    } else if (filter === 'unlocked') {
        filtered = list.filter(a => a.is_unlocked);
    } else if (filter === 'in_progress') {
        filtered = list.filter(a => !a.is_unlocked);
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="achieve-loading-state">
                В этой категории пока нет заданий.
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(a => {
        const rarityClass = a.rarity === 'legendary' ? 'rarity-legendary' : (a.rarity === 'rare' ? 'rarity-rare' : 'rarity-common');
        const rarityLabel = a.rarity === 'legendary' ? 'Легендарное' : (a.rarity === 'rare' ? 'Редкое' : 'Обычное');
        const pillClass = a.rarity === 'legendary' ? 'pill-legendary' : (a.rarity === 'rare' ? 'pill-rare' : 'pill-common');
        const statusClass = a.is_unlocked ? 'is-unlocked' : 'is-locked';

        const progressPerc = a.target_count > 0 ? Math.min(100, Math.floor((a.progress * 100) / a.target_count)) : 0;
        
        let statusBadgeText = '';
        if (a.is_unlocked) {
            statusBadgeText = `<span class="achieve-status-text unlocked-label">✓ Выполнено</span>`;
        } else {
            statusBadgeText = `<span class="achieve-status-text locked-label">В процессе</span>`;
        }

        return `
            <div class="achieve-card ${rarityClass} ${statusClass}">
                <div class="achieve-card-header">
                    <div class="achieve-card-icon-wrap" title="${escapeHtml(a.title)}">
                        <span>${a.icon || '🏆'}</span>
                    </div>
                    <div class="achieve-card-badges-row">
                        <span class="achieve-rarity-pill ${pillClass}">${rarityLabel}</span>
                        <span class="achieve-points-badge">+${a.points} XP</span>
                    </div>
                </div>

                <div class="achieve-card-body">
                    <h3 class="achieve-card-title">${escapeHtml(a.title)}</h3>
                    <p class="achieve-card-desc">${escapeHtml(a.description)}</p>
                </div>

                <div class="achieve-card-footer">
                    <div class="achieve-card-prog-info">
                        ${statusBadgeText}
                        <span class="achieve-prog-ratio">${a.progress} / ${a.target_count}</span>
                    </div>
                    <div class="achieve-card-bar-track">
                        <div class="achieve-card-bar-fill" style="width: ${progressPerc}%;"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Фоновая инициализация уровня при старте приложения
document.addEventListener('DOMContentLoaded', () => {
    if (window.IS_AUTHENTICATED && window.CURRENT_USER_ID) {
        // Фоновая проверка ачивок и уровня
        fetch('/api/achievements')
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && data.user_level) {
                    const hudNavLvl = document.getElementById('hudNavLevelBadge');
                    if (hudNavLvl) {
                        hudNavLvl.textContent = `${data.user_level.level} ур.`;
                        hudNavLvl.style.display = 'inline-flex';
                    }
                    const sidebarLvl = document.getElementById('sidebarUserLvlBadge');
                    if (sidebarLvl) {
                        sidebarLvl.textContent = `${data.user_level.level} ур.`;
                    }
                }
            })
            .catch(() => {});
    }
});
